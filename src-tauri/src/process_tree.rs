//! Process ownership for captured commands. Interactive terminals are explicitly
//! detached; captured commands and all descendants belong to the application.
use std::process::{Child, Command};

#[cfg(windows)]
mod platform {
    use std::{
        io,
        mem::{size_of, zeroed},
        os::windows::{io::AsRawHandle, process::CommandExt},
        process::{Child, Command},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
        System::{
            Diagnostics::ToolHelp::{
                CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD,
                THREADENTRY32,
            },
            JobObjects::{
                AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
                SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
                JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
            },
            Threading::{
                OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
            },
        },
    };
    pub struct Tree(HANDLE);
    // The owned kernel handle is used only by the worker that owns the child.
    unsafe impl Send for Tree {}
    impl Drop for Tree {
        fn drop(&mut self) {
            unsafe {
                CloseHandle(self.0);
            }
        }
    }
    impl Tree {
        pub fn spawn(command: &mut Command) -> io::Result<(Child, Self)> {
            // Start suspended: no package script can spawn an unowned child in
            // the interval between CreateProcess and job assignment.
            command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
            let mut child = command.spawn()?;
            let result = unsafe { Self::assign(&child) };
            match result {
                Ok(tree) => Ok((child, tree)),
                Err(error) => {
                    let _ = child.kill();
                    let _ = child.wait();
                    Err(error)
                }
            }
        }
        unsafe fn assign(child: &Child) -> io::Result<Self> {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err(io::Error::last_os_error());
            }
            let tree = Self(handle);
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as _) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Err(io::Error::last_os_error());
            }
            let mut entry: THREADENTRY32 = zeroed();
            entry.dwSize = size_of::<THREADENTRY32>() as u32;
            let mut found = Thread32First(snapshot, &mut entry) != 0;
            let mut resumed = false;
            while found {
                if entry.th32OwnerProcessID == child.id() {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if !thread.is_null() {
                        resumed = ResumeThread(thread) != u32::MAX;
                        CloseHandle(thread);
                    }
                    break;
                }
                found = Thread32Next(snapshot, &mut entry) != 0;
            }
            CloseHandle(snapshot);
            if resumed {
                Ok(tree)
            } else {
                Err(io::Error::other(
                    "Could not resume the owned command process.",
                ))
            }
        }
        pub fn terminate(&self) {
            unsafe {
                windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
            }
        }
    }
}
#[cfg(unix)]
mod platform {
    use std::{
        io,
        os::unix::process::CommandExt,
        process::{Child, Command},
    };
    unsafe extern "C" {
        fn kill(pid: i32, signal: i32) -> i32;
    }
    pub struct Tree(i32);
    impl Tree {
        pub fn spawn(command: &mut Command) -> io::Result<(Child, Self)> {
            command.process_group(0);
            let child = command.spawn()?;
            let group = Self(child.id() as i32);
            Ok((child, group))
        }
        pub fn terminate(&self) {
            unsafe {
                kill(-self.0, 9);
            }
        }
    }
    impl Drop for Tree {
        fn drop(&mut self) {
            self.terminate();
        }
    }
}
#[cfg(not(any(windows, unix)))]
compile_error!("Captured commands require native process-tree management.");

pub(crate) use platform::Tree;
pub(crate) fn spawn(command: &mut Command) -> std::io::Result<(Child, Tree)> {
    Tree::spawn(command)
}
