# Security reporting

Do not publish credentials, exploitable vulnerability details, private project files or complete application settings in an issue, pull request or screenshot.

If this repository's **Security** tab offers **Report a vulnerability**, use that private GitHub form. See [GitHub's reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

If private reporting is unavailable, open an ordinary issue requesting a private reporting channel **without vulnerability details**. Wait for a private channel before sending a proof of concept, affected data or sensitive reproduction steps. No private reporting availability or response time is guaranteed by this document.

Report the affected version, platform, impact and minimal reproduction through the agreed private channel. Use test data and remove secrets. If a credential may have been exposed, revoke or rotate it through its provider; deleting a file does not remove it from Git history or downloaded artifacts.

Repo Creator's GitHub authentication is managed by GitHub CLI. The application generates coding-agent configuration and handoff prompts locally; sharing those files or prompts with another service remains a separate user action.
