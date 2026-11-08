/**
 * Install commands people can copy. They are shown as text and never run by the app.
 *
 * Sources (checked when written):
 * - Git for Windows: https://git-scm.com/install/windows lists the winget command and
 *   warns that the winget package is not the official build, so the official download
 *   is offered first.
 * - GitHub CLI: https://github.com/cli/cli/blob/trunk/docs/install_windows.md
 *   (winget) and https://cli.github.com/ (Homebrew).
 * - macOS Git: running `git` in Terminal offers Apple's Command Line Tools installer;
 *   `xcode-select --install` starts the same installer. This wording was not
 *   re-verified against Apple's documentation.
 */
export type InstallPlatform = 'windows' | 'macos' | 'other';

export interface InstallHelp {
  command: string;
  note: string;
}

export function gitInstallHelp(platform: InstallPlatform): InstallHelp | null {
  if (platform === 'windows')
    return {
      command: 'winget install --id Git.Git -e',
      note: 'The winget package is not the official Git for Windows build; the official download is safest.',
    };
  if (platform === 'macos')
    return {
      command: 'xcode-select --install',
      note: 'This starts Apple’s Command Line Tools installer, which includes Git.',
    };
  return null;
}

export function githubCliInstallHelp(platform: InstallPlatform): InstallHelp | null {
  if (platform === 'windows')
    return {
      command: 'winget install --id GitHub.cli --source winget',
      note: 'Open a new terminal window afterwards so the change takes effect.',
    };
  if (platform === 'macos')
    return { command: 'brew install gh', note: 'This needs Homebrew (brew.sh).' };
  return null;
}
