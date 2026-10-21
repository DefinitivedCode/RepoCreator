import type { AIStudio, SavedInstructions, Specialist, StudioCatalog } from './aiTypes';
export type Destination = 'local' | 'github';
export type Readme = 'general' | 'minimal' | 'none' | 'custom';
export type Visibility = 'private' | 'public';
export type Appearance = 'system' | 'light' | 'dark';
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
  'features',
  'installation',
  'usage',
  'development',
  'contributing',
  'license',
] as const;
export type ReadmeSection = (typeof readmeSections)[number];
export interface ProjectOptions {
  commitAuthorName?: string;
  commitAuthorEmail?: string;
  ai: AIStudio;
  readmeSections: ReadmeSection[];
  sectionContent: Partial<Record<ReadmeSection, string>>;
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
  experienceMode?: ExperienceMode;
  instructionPresets: SavedInstructions[];
  specialistLibrary: Specialist[];
  recoveryNotice: string | null;
  schemaVersion: number;
  parentPath: string;
  destination: Destination;
  appearance: Appearance;
  recentLocations: string[];
  defaults: Configuration;
  customPresets: ProjectPreset[];
}
export interface Environment {
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
