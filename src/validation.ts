import type { AppError, Configuration, ProjectOptions, RepositoryForm } from './types';

export function nameError(name: string): string | null {
  if (!name) return 'Enter a project name.';
  if (name.length > 100) return 'Keep the name to 100 characters or fewer.';
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name))
    return 'Start with a letter or number. Use letters, numbers, . _ or -.';
  if (name.endsWith('.') || name.toLowerCase().endsWith('.git'))
    return 'Names cannot end in a dot or .git.';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))
    return 'This name is reserved by Windows.';
  return null;
}

export function blankForm(
  configuration: Configuration,
  destination: RepositoryForm['destination'] = 'local',
): RepositoryForm {
  return {
    name: '',
    description: '',
    destination,
    visibility: 'private',
    ...structuredClone(configuration),
    githubOwner: '',
    topics: [],
    homepage: '',
  };
}

export function branchError(branch: string): string | null {
  return !branch ||
    branch.length > 200 ||
    ['@', 'HEAD'].includes(branch) ||
    /^[-/]|[/.]$/.test(branch) ||
    /[\x00-\x20\x7f~^:?*\[\\]/.test(branch) ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.split('/').some((part) => part.startsWith('.') || part.toLowerCase().endsWith('.lock'))
    ? 'Use a valid Git branch, for example main or feature/start.'
    : null;
}

export function optionsError(options: ProjectOptions): string | null {
  const branch = branchError(options.initialBranch);
  if (branch) return branch;
  if (
    !options.commitMessage.trim() ||
    new TextEncoder().encode(options.commitMessage).length > 2000 ||
    options.commitMessage.includes('\0')
  )
    return 'Enter an initial commit message of 1–2000 bytes.';
  if (
    options.customPatterns.length > 100 ||
    options.customPatterns.some(
      (p) => !p.trim() || new TextEncoder().encode(p).length > 500 || /[\r\n\0]/.test(p),
    )
  )
    return 'Use up to 100 custom patterns, each on one line and at most 500 bytes.';
  if (
    Object.values(options.sectionContent).some(
      (s) => s && (new TextEncoder().encode(s).length > 20000 || s.includes('\0')),
    )
  )
    return 'README section content must be at most 20,000 bytes per section.';
  if (
    !['none', 'Unlicense'].includes(options.license) &&
    (!options.copyrightName.trim() ||
      /[\x00-\x1f\x7f]/.test(options.copyrightName) ||
      options.copyrightName.length > 160 ||
      !/^\d{4}$/.test(options.copyrightYear) ||
      +options.copyrightYear < 1900)
  )
    return 'Enter a copyright holder and a four-digit year from 1900 onward.';
  return null;
}

export function formError(form: RepositoryForm): string | null {
  if (nameError(form.name)) return nameError(form.name);
  if (Array.from(form.description).length > 350 || form.description.includes('\0'))
    return 'Use a description of 350 characters or fewer.';
  if (form.destination === 'local') return optionsError(form.options);
  if (form.topics.length > 20 || form.topics.some((t) => !/^[a-z0-9][a-z0-9-]{0,49}$/.test(t)))
    return 'Use up to 20 lowercase GitHub topics, each 1–50 characters.';
  if (form.homepage) {
    try {
      const url = new URL(form.homepage);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        form.homepage.length > 2000
      )
        return 'Enter an http:// or https:// homepage URL.';
    } catch {
      return 'Enter a valid homepage URL.';
    }
  }
  return optionsError(form.options);
}

export function displayPath(path: string): string {
  if (path.startsWith('\\\\?\\UNC\\')) return `\\\\${path.slice(8)}`;
  return path.replace(/^\\\\\?\\/, '');
}

export function appError(value: unknown): AppError {
  if (typeof value === 'object' && value !== null && 'message' in value && 'guidance' in value)
    return value as AppError;
  return {
    message: 'Something interrupted this operation.',
    guidance: 'Try again. Any files already created are preserved.',
    localPath: null,
    localReady: false,
    canRetry: false,
    githubUrl: null,
  };
}
