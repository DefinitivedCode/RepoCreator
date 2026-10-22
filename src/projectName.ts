/** Keep invalid characters visible to validation rather than silently removing them. */
export function normalizeProjectName(value: string): string {
  return value
    .replace(/^ +| +$/g, '')
    .replace(/[A-Z]/g, (letter) => letter.toLowerCase())
    .replace(/[ _-]+/g, '-');
}

export function projectTitle(value: string): string {
  return value.replace(/^ +| +$/g, '').replace(/ +/g, ' ');
}
