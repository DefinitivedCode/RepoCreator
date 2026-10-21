export type Destination = 'local' | 'github';
export type Readme = 'general' | 'minimal' | 'none';
export type Visibility = 'private' | 'public';
export interface RepositoryForm {
  name: string;
  description: string;
  destination: Destination;
  visibility: Visibility;
  readme: Readme;
}
export interface Preferences { parentPath: string; destination: Destination }
export interface Environment {
  gitInstalled: boolean;
  identityReady: boolean;
  ghInstalled: boolean;
  githubUser: string | null;
}
export interface CreatedRepo { name: string; path: string; githubUrl: string | null; commit: string }
export interface AppError {
  message: string;
  guidance: string;
  localPath: string | null;
  localReady: boolean;
  canRetry: boolean;
  githubUrl: string | null;
}
export const stages = [
  ['folder', 'Creating folder'],
  ['readme', 'Preparing project files'],
  ['git', 'Initialising Git'],
  ['commit', 'Creating initial commit'],
  ['github', 'Creating GitHub repository'],
  ['push', 'Pushing to GitHub'],
  ['verify', 'Verifying remote commit'],
] as const;
export type Stage = typeof stages[number][0] | 'complete';
