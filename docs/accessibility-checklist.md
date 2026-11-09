# Accessibility checklist

Manual pass for screen readers and platform features that automated tests cannot cover. **Status of every item below: not tested by a human.** Automated DOM checks (`tests/accessibility.spec.ts`) cover structure only; they are not a substitute.

## How to run

Use a release or debug build with a fresh settings folder. Repeat in the light and dark themes and at the minimum window (820×580).

| Platform | Tool                                      | Result     |
| -------- | ----------------------------------------- | ---------- |
| Windows  | NVDA (current release)                    | Not tested |
| Windows  | Narrator                                  | Not tested |
| Windows  | High Contrast themes (Aquatic, Desert, …) | Not tested |
| macOS    | VoiceOver in WKWebView                    | Not tested |
| macOS    | Increase Contrast, Reduce Motion          | Not tested |

## Checks

1. **Landmarks.** The screen reader lists one navigation ("Main navigation"), one main region and, on New Project, a "Project setup" navigation. The skip link ("Skip to content") is first and moves focus to the content.
2. **Headings.** Each page starts with one heading that receives focus after navigation; the heading list has no skipped levels.
3. **Tabs.** Settings, workspace and file tabs announce as "tab, selected, N of M"; Arrow, Home and End move between tabs; Tab leaves the strip.
4. **Forms.** Every field announces its label, required or optional state and, when invalid, its error text (via `aria-describedby`).
5. **Create button.** When requirements are unmet it announces as dimmed or unavailable, remains focusable, and activating it reads the blocker list.
6. **Status and errors.** Progress, "Git ready", copy confirmations and update progress are announced politely; blocking errors are announced once as alerts.
7. **Dialogs.** Opening moves focus inside, Tab stays inside, Escape closes, and focus returns to the trigger. Cancel is the first focus in confirmations.
8. **Preview.** The file list and the previewed file content can be reached and read line by line; copy buttons announce their result.
9. **Selected state.** Selected items announce as selected or current (not only a colour or tint).
10. **High contrast.** In Windows High Contrast, selected items have an outline, every control has an edge, and the focus ring is visible. (`forced-colors` CSS exists and is asserted by a computed-style test in Chromium only; WebView2 and WKWebView behaviour has not been verified.)
11. **Reduced motion.** With the OS setting on, no transition or animation runs.
12. **Text size.** At 125% and 150% display scaling and with enlarged text, nothing is clipped and every region scrolls by keyboard and wheel.

Record the date, build, platform, tool and version next to each result when a person performs the pass.
