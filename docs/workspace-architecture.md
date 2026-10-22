# Project workspace contracts

Version 1.4 extends the existing generator, preferences and history. It does not
write source files when opening a project.

- `ProjectOptions.technologies`: `{ ids: string[], custom: string[] }`; known
  catalogue IDs are stable. Missing legacy values migrate from the project brief.
- `RecentProject` retains `id`, `createdAt`, `context`, and `handoffTemplate` and
  adds `lastOpenedAt`, `pinned`, `technologies`, `commands`, and `launcher`.
- `launcher`: `{ terminal: 'auto' | 'windows-terminal' | 'powershell' | 'terminal', executables: Record<string,string> }`.
- A `ProjectCommand` has `id`, `name`, `category` (`setup`, `development`, `build`,
  `test`, `lint`, `deploy`, `custom`), `mode` (`executable`, `shell`), `executable`,
  `args: string[]`, `shellCommand`, `workingDirectory` (relative to project or an
  absolute directory), `environment: Record<string,string>`, `description`,
  `enabled`, and `imported`. No command runs during discovery or import.
- `CommandRun`: `id`, `projectId`, `commandId`, `name`, `status` (`running`,
  `succeeded`, `failed`, `stopped`), `startedAt` (epoch milliseconds), `finishedAt`
  (nullable milliseconds), `exitCode` (nullable number), `output` (bounded text).

Native commands:

| Command                    | Arguments                                  | Result                                                            |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| `list_recent_projects`     | none                                       | RecentProject[]                                                   |
| `add_existing_project`     | optional `path` (otherwise native picker)  | RecentProject or null                                             |
| `get_project_workspace`    | `id`                                       | `{ platform, project, exists, gitStatus, branch }`                |
| `save_project_settings`    | `id`, `pinned`, `technologies`, `launcher` | RecentProject                                                     |
| `relocate_project`         | `id` (native picker)                       | RecentProject or null                                             |
| `save_project_commands`    | `id`, `commands`                           | RecentProject                                                     |
| `suggest_project_commands` | `id`                                       | ProjectCommand[]                                                  |
| `get_project_tools`        | `id`, optional `refresh`                   | `{id,name,available,path,documentation,status,detail,platform}[]` |
| `launch_project_tool`      | `id`, `tool`                               | void                                                              |
| `run_project_command`      | `projectId`, `commandId`, `confirmed`      | CommandRun                                                        |
| `list_command_runs`        | `projectId`                                | CommandRun[]                                                      |
| `stop_project_command`     | `runId`                                    | void                                                              |

The frontend polls bounded run snapshots while the commands view is open. Native
reader threads collect stdout and stderr without blocking the UI. Imported
commands require an explicit command-and-directory review before execution.
Project command templates also travel in `ProjectOptions.commands`; portable
exports omit environment values and importing marks every command untrusted.

Tool discovery returns `available`, `missing`, `invalid` or `unknown` status and
performs filesystem inspection only. A three-second cache retains at most 16
preference/PATH combinations. Explicit refresh bypasses the cache. Platform fields
are additive; stored project preferences retain their existing representation.

Creation file editors and shared instruction previews consume `creator.files`
from the existing Rust preview command. Layout changes do not introduce another
file generator. Path presentation uses the shared `displayPath` helper.
