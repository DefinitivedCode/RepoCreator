import type { AIStudio, SavedInstructions, Specialist, StudioCatalog } from './aiTypes';
export type Destination = 'local' | 'github';
export type Readme = 'general' | 'minimal' | 'none' | 'custom';
export type Visibility = 'private' | 'public';
export type Appearance = 'system' | 'light' | 'dark';
export type Accent = 'slate' | 'teal' | 'gold' | 'copper' | 'monochrome' | 'custom';
export type ExperienceMode = 'simple' | 'advanced';
export interface ProjectBrief {
  idea: string;
  audience: string;
  firstVersion: string;
  technologies: string;
  context: string;
}
export type License = 'none' | 'MIT' | 'Apache-2.0' | 'GPL-3.0' | 'BSD-3-Clause' | 'Unlicense';
export const readmeSections = [
  'overview',
  'technologies',
  'features',
  'installation',
  'usage',
  'development',
  'contributing',
  'license',
] as const;
export type ReadmeSection = (typeof readmeSections)[number];
export interface ProjectTechnologies {
  ids: string[];
  custom: string[];
  /** Only selections contributed by the current preset; other selections are manual. */
  presetIds?: string[];
}
export interface ProjectOptions {
  technologies?: ProjectTechnologies;
  commands?: import('./workspaceTypes').ProjectCommand[];
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  ai: AIStudio;
  readmeSections: ReadmeSection[];
  sectionContent: Partial<Record<ReadmeSection, string>>;
  readmeFooter?: boolean;
  ignorePresets: string[];
  customPatterns: string[];
  license: License;
  copyrightName: string;
  copyrightYear: string;
  initialBranch: string;
  commitMessage: string;
  editorconfig: boolean;
  gitattributes: boolean;
  postActions: { folder: boolean; vscode: boolean; github: boolean };
}
export interface Configuration {
  brief?: ProjectBrief;
  handoffTemplate?: string;
  destination?: Destination;
  visibility?: Visibility;
  readme: Readme;
  options: ProjectOptions;
}
export interface RepositoryForm {
  brief?: ProjectBrief;
  handoffTemplate?: string;
  name: string;
  description: string;
  destination: Destination;
  visibility: Visibility;
  readme: Readme;
  options: ProjectOptions;
  githubOwner: string;
  topics: string[];
  homepage: string;
}
export interface ProjectPreset {
  id: string;
  name: string;
  description?: string;
  configuration: Configuration;
}
export interface IgnorePreset {
  id: string;
  name: string;
  group: string;
  patterns: string[];
}
export interface Catalog {
  studio: StudioCatalog;
  ignorePresets: IgnorePreset[];
  builtInPresets: ProjectPreset[];
  defaultConfiguration: Configuration;
}
export interface GeneratedFile {
  path: string;
  content: string;
}
export interface Preferences {
  updates?: import('./useUpdates').UpdatePreferences;
  experienceMode?: ExperienceMode;
  /** Commit author applied only inside new Repo Creator projects. Never global Git config. */
  identityOverride?: IdentityOverride | null;
  instructionPresets: SavedInstructions[];
  specialistLibrary: Specialist[];
  recoveryNotice: string | null;
  schemaVersion: number;
  parentPath: string;
  destination: Destination;
  appearance: Appearance;
  accent?: Accent;
  customAccent?: string;
  recentLocations: string[];
  defaults: Configuration;
  customPresets: ProjectPreset[];
}
export interface IdentityOverride {
  name: string;
  email: string;
}
export type GitState = 'ok' | 'missing' | 'too-old';
export type GithubState = 'signed-in' | 'signed-out' | 'unverified' | 'not-checked' | 'cli-missing';
export interface IdentityReport {
  name: string | null;
  email: string | null;
  nameScope: string | null;
  emailScope: string | null;
  /** `git var GIT_AUTHOR_IDENT` succeeds in the save location. */
  resolves: boolean;
  emailValid: boolean;
  globalConfigPath: string | null;
}
export interface GlobalIdentityResult {
  previousName: string | null;
  previousEmail: string | null;
  configPath: string | null;
  resolvedIdentity: string;
}
export interface Environment {
  platform?: 'windows' | 'macos' | 'other';
  optionalTools?: {
    id: string;
    name: string;
    status: 'available' | 'unavailable' | 'not-checked';
  }[];
  gitInstalled: boolean;
  identityReady: boolean;
  ghInstalled: boolean;
  githubUser: string | null;
  githubOwners: string[];
  identityName: string | null;
  vscodeAvailable: boolean;
  // Additive detail from the native check. Older reports and fixtures omit these.
  gitVersion?: string | null;
  gitState?: GitState;
  identity?: IdentityReport;
  githubState?: GithubState;
}
export interface CreatedRepo {
  name: string;
  path: string;
  githubUrl: string | null;
  commit: string;
  branch: string;
  commitMessage: string;
  files: string[];
  warnings: string[];
}
export interface AppError {
  message: string;
  guidance: string;
  localPath: string | null;
  localReady: boolean;
  canRetry: boolean;
  githubUrl: string | null;
}
export const stages = [
  ['folder', 'Preparing project directory'],
  ['readme', 'Generating files'],
  ['git', 'Initialising Git'],
  ['commit', 'Creating initial commit'],
  ['github', 'Creating GitHub repository'],
  ['metadata', 'Configuring GitHub repository'],
  ['push', 'Pushing to GitHub'],
  ['verify', 'Verifying remote commit'],
] as const;
export type Stage = (typeof stages)[number][0] | 'complete';
export type CreationState =
  | { kind: 'form' }
  | { kind: 'creating'; stage: Stage }
  | { kind: 'success'; result: CreatedRepo }
  | { kind: 'failure'; error: AppError };
