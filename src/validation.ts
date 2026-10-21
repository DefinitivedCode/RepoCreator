import type { AppError, Configuration, ProjectOptions, RepositoryForm } from './types';

const byteLength = (value: string) => new TextEncoder().encode(value).length;

// File generation does not use publishing, handoff or local Git operation settings.
// Normalise those fields so editing them does not regenerate otherwise identical files.
export function previewRequestOf(form: RepositoryForm): RepositoryForm {
  const { brief: _brief, handoffTemplate: _template, ...request } = form;
  return {
    ...request,
    name: form.name || 'project-name',
    destination: 'local',
    visibility: 'private',
    githubOwner: '',
    topics: [],
    homepage: '',
    options: {
      ...form.options,
      initialBranch: 'main',
      commitMessage: 'Initial commit',
      commitAuthorName: '',
      commitAuthorEmail: '',
      postActions: { folder: false, vscode: false, github: false },
    },
  };
}

export function configurationForPreset(
  current: RepositoryForm,
  configuration: Configuration,
  identityName?: string | null,
): Configuration {
  const copy = structuredClone(configuration);
  if (current.brief) {
    copy.brief = { ...current.brief, ...copy.brief };
    for (const key of Object.keys(current.brief) as (keyof typeof current.brief)[]) {
      if (!copy.brief[key]?.trim()) copy.brief[key] = current.brief[key];
    }
  }
  if (!copy.options.copyrightName)
    copy.options.copyrightName = current.options.copyrightName || identityName || '';
  if (!copy.options.commitAuthorName && !copy.options.commitAuthorEmail) {
    copy.options.commitAuthorName = current.options.commitAuthorName;
    copy.options.commitAuthorEmail = current.options.commitAuthorEmail;
  }
  return copy;
}

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
    ...structuredClone(configuration),
    destination,
    visibility: configuration.visibility ?? 'private',
    githubOwner: '',
    topics: [],
    homepage: '',
  };
}

export function branchError(branch: string): string | null {
  return !branch ||
    byteLength(branch) > 200 ||
    ['@', 'HEAD'].includes(branch) ||
    /^[-/]|[/.]$/.test(branch) ||
    /[\p{Cc}\x20~^:?*\[\\]/u.test(branch) ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.split('/').some((part) => part.startsWith('.') || part.toLowerCase().endsWith('.lock'))
    ? 'Use a valid Git branch, for example main or feature/start.'
    : null;
}

export function optionsError(options: ProjectOptions): string | null {
  const authorName = options.commitAuthorName ?? '';
  const authorEmail = options.commitAuthorEmail ?? '';
  if (
    ((authorName || authorEmail) && (!authorName.trim() || !authorEmail.trim())) ||
    (authorName && (byteLength(authorName) > 100 || /[\p{Cc}<>]/u.test(authorName))) ||
    (authorEmail &&
      (!/^[^\s<>@]+@[^\s<>@]+$/.test(authorEmail) ||
        /\p{Cc}/u.test(authorEmail) ||
        byteLength(authorEmail) > 254))
  )
    return 'Enter both a name and valid email for this project’s commit identity.';
  if (options.ai?.enabled && !options.ai.agents.length)
    return 'Select at least one coding agent, or disable AI Agents.';
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
      /\p{Cc}/u.test(options.copyrightName) ||
      byteLength(options.copyrightName) > 160 ||
      !/^\d{4}$/.test(options.copyrightYear) ||
      +options.copyrightYear < 1900)
  )
    return 'Enter a copyright holder and a four-digit year from 1900 onward.';
  return null;
}

export function configurationOf(form: RepositoryForm): Configuration {
  return {
    brief: form.brief,
    handoffTemplate: form.handoffTemplate,
    readme: form.readme,
    options: form.options,
    destination: form.destination,
    visibility: form.visibility,
  };
}

export function formError(form: RepositoryForm): string | null {
  const configuration = configurationError(configurationOf(form));
  if (configuration) return configuration;
  if (nameError(form.name)) return nameError(form.name);
  if (Array.from(form.description).length > 350 || form.description.includes('\0'))
    return 'Use a description of 350 characters or fewer.';
  if (form.destination === 'local') return null;
  if (form.topics.length > 20 || form.topics.some((t) => !/^[a-z0-9][a-z0-9-]{0,49}$/.test(t)))
    return 'Use up to 20 lowercase GitHub topics, each 1–50 characters.';
  if (form.homepage) {
    try {
      const url = new URL(form.homepage);
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        byteLength(form.homepage) > 2000
      )
        return 'Enter an http:// or https:// homepage URL.';
    } catch {
      return 'Enter a valid homepage URL.';
    }
  }
  return null;
}

export function configurationError(configuration: Configuration): string | null {
  if (
    configuration.brief &&
    Object.values(configuration.brief).some((s) => byteLength(s) > 4096 || s.includes('\0'))
  )
    return 'Keep each project brief field within 4096 bytes.';
  if (
    configuration.handoffTemplate !== undefined &&
    !/^[a-zA-Z0-9_-]{1,80}$/.test(configuration.handoffTemplate)
  )
    return 'Choose a valid AI handoff template.';
  return optionsError(configuration.options);
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
