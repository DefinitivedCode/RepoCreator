import { describe, expect, it } from 'vitest';
import { blankForm, displayPath, nameError } from './validation';

describe('repository names', () => {
  it.each(['my-project', 'Repo_2.0', 'a', 'contribution', 'com10', 'a'.repeat(100)])('accepts %s', name => {
    expect(nameError(name)).toBeNull();
  });
  it.each(['', '../escape', 'a/b', 'a\\b', '-flag', '.hidden', 'trailing.', 'repo.GIT', 'CON', 'nul.txt', 'LPT9.data', 'name with spaces', 'x;echo', 'é', 'a'.repeat(101)])('rejects unsafe or incompatible name %s', name => {
    expect(nameError(name)).toBeTruthy();
  });
});

it('keeps the destination but resets project-specific fields', () => {
  expect(blankForm('github')).toEqual({ name: '', description: '', destination: 'github', visibility: 'private', readme: 'general' });
});

it('renders canonical Windows and UNC paths without internal prefixes', () => {
  expect(displayPath('\\\\?\\C:\\Projects')).toBe('C:\\Projects');
  expect(displayPath('\\\\?\\UNC\\server\\share')).toBe('\\\\server\\share');
});
