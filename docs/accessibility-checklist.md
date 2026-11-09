# Accessibility checklist

Manual pass for screen readers and native platform features. **Status of every item below is Not tested.** The browser suite records DOM, keyboard and computed-colour evidence separately.

## How to run

Use a release or debug build with a fresh settings folder. Repeat in the light and dark themes and at the minimum window (820×580).

| Platform | Tool                                      | Result     |
| -------- | ----------------------------------------- | ---------- |
| Windows  | NVDA (current release)                    | Not tested |
| Windows  | Narrator                                  | Not tested |
| Windows  | High Contrast themes (Aquatic, Desert, …) | Not tested |
| Windows  | Physical display at 125% and 150%         | Not tested |
| macOS    | VoiceOver in WKWebView                    | Not tested |
| macOS    | Increase Contrast, Reduce Motion          | Not tested |

## Checks

1. **Landmarks.** The screen reader lists one navigation ("Main navigation"), one main region and, on New Project, a "Project setup" navigation. The skip link ("Skip to content") is first and moves focus to the content.
2. **Headings.** Each page starts with one heading that receives focus after navigation; the heading list has no skipped levels.
3. **Tabs.** Settings, workspace and file tabs announce as "tab, selected, N of M"; Arrow, Home and End move between tabs; Tab leaves the strip.
4. **Forms.** Every field announces its label, required or optional state and, when invalid, its error text (via `aria-describedby`).
5. **Create button.** When requirements are unmet it announces as dimmed or unavailable, remains focusable, and activating it reads the blocker list.
6. **Status and errors.** Progress, "Git ready", copy confirmations and update progress are announced politely; blocking errors are announced once as alerts.
7. **Dialogs and menus.** Opening moves focus inside a dialog. Tab and Shift+Tab stay inside, and Escape closes it and returns focus to the trigger. Cancel or Back receives the initial focus on confirmation sheets. For command menus and Open in…, Tab dismisses the popup and moves onward, and Escape returns to the trigger.
8. **Preview.** The file list and the previewed file content can be reached and read line by line; copy buttons announce their result.
9. **Selected state.** Selected items announce as selected or current (not only a colour or tint).
10. **High contrast.** In Windows High Contrast, selected items have an outline, every control has an edge, and the focus ring is visible. (`forced-colors` CSS exists and is asserted by a computed-style test in Chromium only; WebView2 and WKWebView behaviour has not been verified.)
11. **Reduced motion.** With the OS setting on, no transition or animation runs.
12. **Text size.** At 125% and 150% display scaling and with enlarged text, nothing is clipped and every region scrolls by keyboard and wheel.

Record the date, build, platform, tool and version next to each result when a person performs the pass.

## Start a Windows test session

Use an interactive Windows desktop and a local debug build from the commit under review. Run these commands in PowerShell from the checkout root.

```powershell
git rev-parse --short HEAD
npm run desktop:build -- --ci --debug --no-bundle
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) ('repo-creator-accessibility-' + [guid]::NewGuid())
$qaProjects = Join-Path $qaRoot 'projects'
New-Item -ItemType Directory -Path $qaProjects | Out-Null
$env:REPO_CREATOR_DATA_DIR = Join-Path $qaRoot 'app-data'
$env:WEBVIEW2_USER_DATA_FOLDER = Join-Path $qaRoot 'webview'
$exe = (Resolve-Path 'src-tauri/target/debug/repo-creator.exe').Path
$app = Start-Process -FilePath $exe -PassThru
```

Use `$qaProjects` as the save location and a fictional commit identity. Select **Use only for Repo Creator projects** if the checklist needs an identity. Use a fresh `$qaRoot` for each screen reader's first-run pass.

## Screen readers

- **NVDA — Not tested.** Close Narrator, then launch your installed NVDA. The commands below cover the default install locations. Use the checklist above, including the skip link, arrow keys in tabs, preview, error and copy announcements, and focus return. Record the NVDA version and the exact spoken text and focus order for any issue.

  ```powershell
  $nvda = Join-Path ${env:ProgramFiles(x86)} 'NVDA/nvda.exe'
  if (!(Test-Path -LiteralPath $nvda)) { $nvda = Join-Path $env:ProgramFiles 'NVDA/nvda.exe' }
  Start-Process -FilePath $nvda
  ```

- **Narrator — Not tested.** Exit NVDA, run `Start-Process narrator.exe` and repeat the same checklist in the native app. Record the Windows build, Narrator scan-mode setting, announcement and focus order.
- **VoiceOver — Not tested.** Launch the installed build using the [physical Mac runbook](redesign-release-checklist.md#physical-mac-install-and-launch). Press **Command–F5**, then use **Control–Option–Right Arrow** to read through the window and **Tab** and **Shift–Tab** to verify focus order. Repeat the checklist in light and dark. Record the macOS version, app build, spoken text and where focus landed. [Apple VoiceOver commands](https://support.apple.com/guide/voiceover/general-commands-cpvokys01/mac)

## Windows High Contrast

**Not tested.** Run `Start-Process 'ms-settings:easeofaccess-highcontrast'`. Apply a dark and a light Windows contrast theme, such as Aquatic and Desert. In the native app, Tab through New Project, a dialog, the file tree, the sidebar and Settings. Check visible control borders, selected-state outlines and focus against the expectations in [`forced-colors.css`](../src/forced-colors.css). Record the Windows and WebView2 versions, both theme names and any missing focus or selection indicators. Restore the previous contrast setting. [Windows Settings shortcuts](https://learn.microsoft.com/windows/uwp/launch-resume/launch-settings-app)

## Physical display scaling

**Not tested.** Run `Start-Process 'ms-settings:display'` on a physical Windows device. Select the actual monitor and set **Scale** to **125%**, then repeat at **150%**. Relaunch the app after each change. In the same PowerShell session, use the window resizer if you need to set the minimum logical client size exactly.

```powershell
$app = Start-Process -FilePath $exe -PassThru
powershell.exe -NoProfile -File tests/resize-window.ps1 -ProcessId $app.Id -Width 820 -Height 580
```

Check the Create footer, focused editors, result drawer, dialogs and workspace output by keyboard and wheel. Record monitor resolution, actual OS scale and text size, logical window size, clipping and any horizontal scrolling outside the output viewer. Restore the original display setting after the pass.
