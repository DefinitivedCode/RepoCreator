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

/**
 * The font-size, radius, selection-stripe, all-caps, pressed-navigation and colour rules hold for
 * every stylesheet and component. Colour literals may only appear as custom-property values
 * (for example `--thumb-dark: #292b2c`), never inside an ordinary declaration.
 */
export const gated = (relative) => /^src\/(ui\/|tokens\.css$)/.test(relative);
const SELECTED_SELECTOR =
  /(\.active|\.selected|aria-current|aria-selected|aria-pressed|data-selected|data-active|\.is-selected)/;
const TOKEN_RADII = new Set([6, 8, 999]);

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const NO_STRIPE = /^(0|none|transparent|initial|unset|inherit)?$/;

/** Rules a selected item must not use (maintainer decision 8) plus the no-all-caps copy rule. */
export function ruleViolations(relative, source) {
  const text = source.replaceAll(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replaceAll(/[^\n]/g, ' '),
  );
  const found = [];
  for (const block of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = block[1].trim();
    const body = block[2];
    const line = lineOf(text, block.index + block[0].indexOf('{'));
    for (const [, value] of body.matchAll(/(?<![\w-])text-transform\s*:\s*([^;}]+)/g))
      if (value.trim() === 'uppercase')
        found.push(`${relative}:${line} all-caps text (sentence case only)`);
    if (!SELECTED_SELECTOR.test(selector)) continue;
    for (const [, value] of body.matchAll(/(?<![\w-])box-shadow\s*:\s*([^;}]+)/g))
      for (const shadow of value.split(/,(?![^(]*\))/)) {
        const offset = /\binset\s+(-?\d*\.?\d+)(?:px)?\s/.exec(shadow);
        if (offset && Number(offset[1]) !== 0 && /var\(--|#|rgb/.test(shadow))
          found.push(
            `${relative}:${line} side stripe (inset box-shadow) on a selected item: ${selector}`,
          );
      }
    for (const [, name, value] of body.matchAll(
      /(?<![\w-])(border-(?:left|inline-start)(?:-width|-color)?)\s*:\s*([^;}]+)/g,
    ))
      if (!NO_STRIPE.test(value.trim()))
        found.push(`${relative}:${line} ${name} on a selected item: ${selector}`);
  }
  return found;
}

/** aria-pressed on the markup of a navigation group (tabs, sidebar, sub-navigation). */
export function pressedNavigation(relative, text) {
  return [
    ...text.matchAll(
      /className=\{?[`"'][^`"'\n]*(workspace-tabs|subnavigation|sidebar|nav-item|app-navigation)[^\n]*[\s\S]{0,400}?aria-pressed/g,
    ),
  ].map((m) => `${relative}:${lineOf(text, m.index)} aria-pressed used for navigation`);
}

export function audit(files = walk(root)) {
  const gateViolations = [];
  const fontSizes = new Map();
  const radii = new Map();
  const colours = new Map();
  const small = [];
  const violations = [];
  let ariaPressed = 0;
  let roleTab = 0;
  let pressedGroups = 0;
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
            const message = `${relative}:${index + 1} font-size ${key} is below 12px`;
            violations.push(message);
            gateViolations.push(message);
          }
        }
        for (const [, value] of line.matchAll(/(?<![\w-])border-radius\s*:\s*([^;}]+)/g)) {
          for (const part of value.trim().split(/\s+/)) {
            const px = pixels(part);
            if (px !== null) tally(radii, `${px}px`);
            if (px !== null && px !== 0 && !TOKEN_RADII.has(px))
              gateViolations.push(
                `${relative}:${index + 1} border-radius ${px}px is outside 6/8/999`,
              );
          }
        }
        for (const [colour] of line.matchAll(
          /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g,
        )) {
          tally(colours, colour.toLowerCase().replaceAll(/\s+/g, ''));
          if (!relative.endsWith('tokens.css') && !/^\s*--[\w-]+\s*:/.test(line))
            gateViolations.push(
              `${relative}:${index + 1} raw colour ${colour} outside a custom property`,
            );
        }
      });
      gateViolations.push(...ruleViolations(relative, text));
    } else {
      gateViolations.push(...pressedNavigation(relative, text));
      ariaPressed += (text.match(/aria-pressed/g) ?? []).length;
      roleTab += (text.match(/role="tab"|role='tab'/g) ?? []).length;
      // Navigation built from pressed-state buttons (aria-pressed inside a *tabs/nav* group).
      pressedGroups += (text.match(/className="[^"]*(workspace-tabs|subnav)[^"]*"/g) ?? []).length;
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
    pressedStyleNavigationGroups: pressedGroups,
    violations,
    gateViolations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = audit();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else if (process.argv.includes('--lint')) {
    if (process.argv.includes('--verbose')) for (const line of result.violations) console.log(line);
    console.log(`\n${result.violations.length} style violation(s) across src/ .`);
    if (result.gateViolations.length) {
      console.error(
        `\n${result.gateViolations.length} violation(s) fail the repo-wide style gate:`,
      );
      for (const line of result.gateViolations) console.error(`  ${line}`);
      process.exitCode = 1;
    } else console.log('Repo-wide style gate: clean.');
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
