import { describe, expect, it } from 'vitest';
import { branchError, displayPath, nameError } from './validation';

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
