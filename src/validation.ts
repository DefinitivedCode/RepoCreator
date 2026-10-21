import type { AppError, RepositoryForm } from './types';

export function nameError(name: string): string | null {
  if (!name) return 'Enter a project name.';
  if (name.length > 100) return 'Keep the name to 100 characters or fewer.';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) return 'Start with a letter or number. Use letters, numbers, . _ or -.';
  if (name.endsWith('.') || name.toLowerCase().endsWith('.git')) return 'Names cannot end in a dot or .git.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) return 'This name is reserved by Windows.';
  return null;
}

export function blankForm(destination: RepositoryForm['destination'] = 'local'): RepositoryForm {
  return { name: '', description: '', destination, visibility: 'private', readme: 'general' };
}

export function displayPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  return path.replace(/^\\\\\?\\/, '');
}

export function appError(value: unknown): AppError {
  if (typeof value === 'object' && value !== null && 'message' in value && 'guidance' in value) return value as AppError;
  return { message: 'Something interrupted this operation.', guidance: 'Try again. Any files already created are preserved.',
    localPath: null, localReady: false, canRetry: false, githubUrl: null };
}
