// Style audit for the redesign. Read-only: scans src/ and prints counts.
//   node scripts/audit-styles.mjs            print the audit
//   node scripts/audit-styles.mjs --lint     print violations (report-only: always exits 0)
//   node scripts/audit-styles.mjs --json     machine-readable
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)), 'src');

export function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    if (statSync(file).isDirectory()) return walk(file);
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

const tally = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const sorted = (map) =>
  [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));

/** Pixel value of a font-size/radius declaration; rem and em assume a 16px root. */
export function pixels(value) {
  const match = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  return match[2] === 'rem' || match[2] === 'em' ? number * 16 : number;
}

export function audit(files = walk(root)) {
  const fontSizes = new Map();
  const radii = new Map();
  const colours = new Map();
  const small = [];
  const violations = [];
  let ariaPressed = 0;
  let roleTab = 0;
  let pressedNavigation = 0;
  for (const file of files) {
    const relative = path.relative(path.dirname(root), file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');
    if (file.endsWith('.css')) {
      const lines = text.split(/\r?\n/);
      lines.forEach((line, index) => {
        for (const [, value] of line.matchAll(/(?<![\w-])font-size\s*:\s*([^;}]+)/g)) {
          const px = pixels(value);
          const key = px === null ? value.trim() : `${px}px`;
          tally(fontSizes, key);
          if (px !== null && px < 12) {
            small.push(`${relative}:${index + 1}`);
            violations.push(`${relative}:${index + 1} font-size ${key} is below 12px`);
          }
        }
        for (const [, value] of line.matchAll(/(?<![\w-])border-radius\s*:\s*([^;}]+)/g)) {
          for (const part of value.trim().split(/\s+/)) {
            const px = pixels(part);
            if (px !== null) tally(radii, `${px}px`);
          }
        }
        for (const [colour] of line.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g))
          tally(colours, colour.toLowerCase().replaceAll(/\s+/g, ''));
      });
    } else {
      ariaPressed += (text.match(/aria-pressed/g) ?? []).length;
      roleTab += (text.match(/role="tab"|role='tab'/g) ?? []).length;
      // Navigation built from pressed-state buttons (aria-pressed inside a *tabs/nav* group).
      pressedNavigation += (text.match(/className="[^"]*(workspace-tabs|subnav)[^"]*"/g) ?? [])
        .length;
    }
  }
  return {
    files: files.length,
    fontSizes: sorted(fontSizes),
    distinctFontSizes: fontSizes.size,
    declarationsBelow12px: small.length,
    radii: sorted(radii),
    distinctColours: colours.size,
    ariaPressed,
    roleTab,
    pressedStyleNavigationGroups: pressedNavigation,
    violations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = audit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (process.argv.includes('--lint')) {
    for (const line of result.violations) console.log(line);
    console.log(
      `\n${result.violations.length} style violation(s) (report-only: this check does not fail the build yet).`,
    );
  } else {
    console.log(`Scanned ${result.files} source files under src/`);
    console.log(`Distinct font sizes: ${result.distinctFontSizes}`);
    console.log(`Declarations below 12px: ${result.declarationsBelow12px}`);
    console.log(`Radii: ${result.radii.map(([k, n]) => `${k}×${n}`).join(', ')}`);
    console.log(`Distinct colour literals: ${result.distinctColours}`);
    console.log(`aria-pressed: ${result.ariaPressed}; role="tab": ${result.roleTab}`);
    console.log(`Font sizes: ${result.fontSizes.map(([k, n]) => `${k}×${n}`).join(', ')}`);
  }
}
