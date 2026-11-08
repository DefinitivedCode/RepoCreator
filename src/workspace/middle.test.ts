import { describe, expect, it } from 'vitest';
import { middleTruncate } from './shared';

describe('middleTruncate', () => {
  it('leaves short paths alone', () => {
    expect(middleTruncate('C:\\Projects\\River Workbench')).toBe('C:\\Projects\\River Workbench');
  });
  it('keeps both ends of a long path within the limit', () => {
    const long =
      'C:\\Users\\someone\\Documents\\Clients\\Acme\\Repositories\\web\\river-workbench-final';
    const short = middleTruncate(long, 40);
    expect(short.length).toBe(40);
    expect(short.startsWith('C:\\Users')).toBe(true);
    expect(short.endsWith('workbench-final')).toBe(true);
    expect(short).toContain('…');
  });
  it('handles a limit of one without throwing', () => {
    expect(() => middleTruncate('abcdef', 1)).not.toThrow();
  });
});
