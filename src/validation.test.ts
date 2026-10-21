import { describe, expect, it } from 'vitest';
import {
  blankForm,
  branchError,
  configurationError,
  configurationForPreset,
  displayPath,
  nameError,
  optionsError,
  previewRequestOf,
} from './validation';
import type { Configuration, ProjectOptions } from './types';

const options: ProjectOptions = {
  ai: {
    schemaVersion: 1,
    enabled: false,
    agents: [],
    instructions: {
      preset: 'practical',
      workflow: 'balanced',
      rules: [],
      wording: {},
      customText: '',
      technologies: [],
      technologyWording: {},
      stack: '',
      architecture: '',
      conventions: '',
      verification: '',
    },
    specialists: [],
    customSpecialists: [],
    scopedRules: [],
    skills: [],
    optionalConfig: {
      codex: false,
      codexSandbox: 'workspace-write',
      claude: false,
      claudeMode: 'default',
      gemini: false,
      opencode: false,
    },
  },
  readmeSections: ['overview'],
  sectionContent: {},
  ignorePresets: ['os', 'secrets'],
  customPatterns: [],
  license: 'none',
  copyrightName: '',
  copyrightYear: '2026',
  initialBranch: 'main',
  commitMessage: 'Initial commit',
  editorconfig: false,
  gitattributes: false,
  postActions: { folder: false, vscode: false, github: false },
};
function configuration(): Configuration {
  return {
    readme: 'general',
    options: structuredClone(options),
    brief: { idea: '', audience: '', firstVersion: '', technologies: '', context: '' },
    handoffTemplate: 'discovery',
  };
}

describe('repository names', () => {
  it.each(['my-project', 'Repo_2.0', 'a', 'contribution', 'com10', 'a'.repeat(100)])(
    'accepts %s',
    (name) => {
      expect(nameError(name)).toBeNull();
    },
  );
  it.each([
    '',
    '../escape',
    'a/b',
    'a\\b',
    '-flag',
    '.hidden',
    'trailing.',
    'repo.GIT',
    'CON',
    'nul.txt',
    'LPT9.data',
    'name with spaces',
    'x;echo',
    'é',
    'a'.repeat(101),
  ])('rejects unsafe or incompatible name %s', (name) => {
    expect(nameError(name)).toBeTruthy();
  });
});

it('accepts custom branches and rejects unsafe Git references', () => {
  expect(branchError('feature/start')).toBeNull();
  for (const name of [
    '-flag',
    'HEAD',
    '../escape',
    'a..b',
    'a b',
    'refs/.hidden',
    'main.lock',
    'a@{b',
  ])
    expect(branchError(name)).toBeTruthy();
});

it('renders canonical Windows and UNC paths without internal prefixes', () => {
  expect(displayPath('\\\\?\\C:\\Projects')).toBe('C:\\Projects');
  expect(displayPath('\\\\?\\UNC\\server\\share')).toBe('\\\\server\\share');
});

it('applies preset settings without clearing authored project context or local identity', () => {
  const form = blankForm(configuration());
  form.brief = {
    idea: 'A useful tool',
    audience: 'My team',
    firstVersion: 'One workflow',
    technologies: 'Python',
    context: 'Works offline',
  };
  form.options.copyrightName = 'Project author';
  form.options.commitAuthorName = 'Local author';
  form.options.commitAuthorEmail = 'author@example.test';
  const preset = configuration();
  preset.options.ignorePresets = ['python'];
  preset.brief!.firstVersion = 'A supplied preset milestone';
  const applied = configurationForPreset(form, preset, 'Different Git identity');
  expect(applied.brief).toEqual({ ...form.brief, firstVersion: 'A supplied preset milestone' });
  expect(applied.options).toMatchObject({
    copyrightName: 'Project author',
    commitAuthorName: 'Local author',
    commitAuthorEmail: 'author@example.test',
    ignorePresets: ['python'],
  });
  expect(preset.brief!.idea).toBe('');
  expect(form.options.ignorePresets).toEqual(['os', 'secrets']);
});

it('reuses file previews for operational metadata while tracking actual generated content', () => {
  const form = { ...blankForm(configuration()), name: 'project' };
  const changed = structuredClone(form);
  changed.destination = 'github';
  changed.visibility = 'public';
  changed.githubOwner = 'my-org';
  changed.homepage = 'https://example.test';
  changed.topics = ['tools'];
  changed.options.initialBranch = 'feature/start';
  changed.options.commitMessage = 'Start';
  changed.options.commitAuthorName = 'Author';
  changed.options.commitAuthorEmail = 'author@example.test';
  changed.options.postActions.folder = true;
  changed.brief!.idea = 'A new plan';
  changed.handoffTemplate = 'architecture';
  expect(previewRequestOf(changed)).toEqual(previewRequestOf(form));
  changed.options.sectionContent.overview = 'Authored README';
  expect(previewRequestOf(changed)).not.toEqual(previewRequestOf(form));
  expect(changed.options.postActions.folder).toBe(true);
});

it('validates saved brief metadata and Git identity using native UTF-8 limits', () => {
  const saved = configuration();
  saved.brief!.idea = 'é'.repeat(2049);
  expect(configurationError(saved)).toMatch(/brief/);
  saved.brief!.idea = 'A valid idea';
  expect(configurationError(saved)).toBeNull();
  saved.options.commitAuthorName = 'é'.repeat(51);
  saved.options.commitAuthorEmail = 'author@example.test';
  expect(optionsError(saved.options)).toMatch(/identity/);
  saved.options.commitAuthorName = 'é'.repeat(50);
  expect(optionsError(saved.options)).toBeNull();
  saved.options.commitAuthorEmail = 'bad\u0085@example.test';
  expect(optionsError(saved.options)).toMatch(/identity/);
  saved.options.commitAuthorName = ' ';
  saved.options.commitAuthorEmail = '';
  expect(optionsError(saved.options)).toMatch(/identity/);
  saved.options.commitAuthorName = '';
  saved.options.license = 'MIT';
  saved.options.copyrightName = 'é'.repeat(81);
  expect(optionsError(saved.options)).toMatch(/copyright/);
  expect(branchError('é'.repeat(101))).toBeTruthy();
  expect(branchError('branch\u0085name')).toBeTruthy();
});
