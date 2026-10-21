param(
    [Parameter(Mandatory)][int]$ProcessId,
    [Parameter(Mandatory)][int]$Width,
    [Parameter(Mandatory)][int]$Height
)
$ErrorActionPreference = 'Stop'
# Resize only the smoke test's owned window, using client dimensions in logical pixels.
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class SmokeWindow {
    [StructLayout(LayoutKind.Sequential)]
    public struct Rect { public int Left, Top, Right, Bottom; }
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr window);
    [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr window, int index);
    [DllImport("user32.dll")] public static extern bool AdjustWindowRectExForDpi(ref Rect rect, uint style, bool menu, uint extendedStyle, uint dpi);
    [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr window, IntPtr after, int x, int y, int width, int height, uint flags);
}
'@
[void][SmokeWindow]::SetThreadDpiAwarenessContext([IntPtr]::new(-4))
$appProcess = Get-Process -Id $ProcessId
$window = $appProcess.MainWindowHandle
if ($appProcess.ProcessName -ne 'repo-creator' -or $window -eq [IntPtr]::Zero) {
    throw 'The owned Repo Creator test window was not found.'
}
$dpi = [SmokeWindow]::GetDpiForWindow($window)
$rect = [SmokeWindow+Rect]::new()
$rect.Right = [int][Math]::Round($Width * $dpi / 96)
$rect.Bottom = [int][Math]::Round($Height * $dpi / 96)
$style = [uint32][SmokeWindow]::GetWindowLong($window, -16)
$extendedStyle = [uint32][SmokeWindow]::GetWindowLong($window, -20)
if (-not [SmokeWindow]::AdjustWindowRectExForDpi([ref]$rect, $style, $false, $extendedStyle, $dpi)) {
    throw 'Could not calculate the native window frame.'
}
# Preserve position, activation and Z order.
if (-not [SmokeWindow]::SetWindowPos($window, [IntPtr]::Zero, 0, 0, ($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top), 0x16)) {
    throw 'Could not resize the native test window.'
}
