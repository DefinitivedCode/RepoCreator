import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const noticeName = 'THIRD_PARTY_NOTICES.txt';
const sourceName = 'scripts/third-party-license-sources.json';
const normalize = (text) => text.replace(/\r\n/g, '\n');
export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const read = async (name) => normalize(await readFile(path.join(root, name), 'utf8'));

export function cargoPackages(lock) {
  return lock
    .split(/^\[\[package\]\]$/m)
    .slice(1)
    .flatMap((entry) => {
      const field = (name) => entry.match(new RegExp(`^${name} = "([^"\\n]+)"`, 'm'))?.[1];
      return field('source') ? [{ name: field('name'), version: field('version') }] : [];
    });
}

export function npmPackages(lock) {
  return Object.entries(lock.packages)
    .filter(([name, value]) => name && !value.dev)
    .map(([directory, value]) => ({
      name: value.name || directory.slice(directory.lastIndexOf('node_modules/') + 13),
      version: value.version,
      license: value.license,
      directory,
    }));
}

export function snapshotFingerprint(inputs) {
  return sha256(inputs.map(([name, text]) => `${name}\0${normalize(text)}\0`).join(''));
}

async function inputs() {
  const templates = (await readdir(path.join(root, 'src-tauri/resources/licenses')))
    .sort()
    .map((name) => `src-tauri/resources/licenses/${name}`);
  const names = [
    'package-lock.json',
    'src-tauri/Cargo.lock',
    sourceName,
    'src/icons.tsx',
    ...templates,
  ];
  return Promise.all(names.map(async (name) => [name, await read(name)]));
}

export function verifyNotices(text, fingerprint, expected) {
  const normalized = normalize(text);
  const start = normalized.indexOf('\n--- NOTICE BODY ---\n');
  if (start < 0) throw new Error('Notice body is missing.');
  const body = normalized.slice(start + '\n--- NOTICE BODY ---\n'.length);
  if (!normalized.startsWith('Repo Creator - Third-party notices\n'))
    throw new Error('Notice header is missing.');
  if (!normalized.includes(`Dependency snapshot SHA-256: ${fingerprint}\n`))
    throw new Error(
      'Third-party notices are stale; regenerate after dependency, icon or template changes.',
    );
  if (!normalized.includes(`Notice body SHA-256: ${sha256(body)}\n`))
    throw new Error('Third-party notice content digest does not match.');
  const actual = [...body.matchAll(/^(NPM|Cargo) package: (.+)$/gm)]
    .map((match) => `${match[1]}:${match[2]}`)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort()))
    throw new Error('Third-party notice package coverage does not match the lockfiles.');
  const definitions = new Set(
    [...body.matchAll(/^LICENSE TEXT SHA256: ([a-f0-9]{64})$/gm)].map((match) => match[1]),
  );
  const references = [...body.matchAll(/^License text: ([a-f0-9]{64}) /gm)].map(
    (match) => match[1],
  );
  if (!references.length || references.some((id) => !definitions.has(id)))
    throw new Error('A referenced third-party license text is missing.');
  if (!body.includes('Feather icons') || !body.includes('SPDX License List Data v3.29.0'))
    throw new Error('Bundled asset/template attribution is missing.');
  if (/(?:[A-Za-z]:[\\/]Users[\\/]|\/(?:Users|home)\/)/.test(body))
    throw new Error('Machine-specific source paths must not be published in notices.');
  return { packages: actual.length, licenseTexts: definitions.size };
}

async function licenseFiles(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.isFile() &&
      /^(?:licen[cs]e|copying|notice|copyright|authors)(?:[._-]|$)/i.test(entry.name)
    )
      result.push(entry.name);
    if (entry.isDirectory() && /^(?:licenses?|copying)$/i.test(entry.name)) {
      for (const name of await readdir(path.join(directory, entry.name), { recursive: true })) {
        const full = path.join(directory, entry.name, name);
        const { stat } = await import('node:fs/promises');
        if ((await stat(full)).isFile()) result.push(path.join(entry.name, name));
      }
    }
  }
  return result.sort().map((file) => file.replaceAll('\\', '/'));
}

async function generate(cargo, npm, fingerprint, snapshots) {
  const texts = new Map();
  const sections = [];
  function add(text, label, source) {
    text = normalize(text);
    if (!text.trim() || text.includes('\0')) throw new Error(`Invalid license text: ${label}`);
    const id = sha256(text);
    const entry = texts.get(id) || { text, sources: new Set() };
    entry.sources.add(`${label}: ${source}`);
    texts.set(id, entry);
    return `License text: ${id} (${label})`;
  }
  function snapshotLicense(source, license) {
    if (
      !/^[a-f0-9]{40}$/.test(source.revision) ||
      !license.source.includes(`/${source.revision}/`) ||
      sha256(license.text) !== license.sha256
    )
      throw new Error('Pinned upstream license snapshot failed integrity checks.');
    return add(license.text, license.label, license.source);
  }
  const supplemental = snapshots.sources.find((source) =>
    source.packages.includes('asset:spdx-license-list-data'),
  );
  const mit = supplemental.licenses.find((license) => license.label === 'text/MIT.txt');
  const mpl = supplemental.licenses.find((license) => license.label === 'text/MPL-2.0.txt');
  for (const item of npm.sort((a, b) => a.name.localeCompare(b.name))) {
    const directory = path.join(root, item.directory);
    const refs = [];
    for (const file of await licenseFiles(directory))
      refs.push(
        add(
          await readFile(path.join(directory, file), 'utf8'),
          file,
          `https://www.npmjs.com/package/${item.name}/v/${item.version}`,
        ),
      );
    if (!refs.length)
      throw new Error(`No published license notice for ${item.name}@${item.version}`);
    sections.push(
      [
        `NPM package: ${item.name}@${item.version}`,
        `Declared license: ${item.license}`,
        `Source: https://www.npmjs.com/package/${item.name}/v/${item.version}`,
        ...refs,
      ].join('\n'),
    );
  }
  const locked = cargoPackages(await read('src-tauri/Cargo.lock'));
  const actual = cargo.packages.filter((item) => item.source);
  const key = (item) => `${item.name}@${item.version}`;
  if (JSON.stringify(actual.map(key).sort()) !== JSON.stringify(locked.map(key).sort()))
    throw new Error(
      'Cargo metadata does not match the locked dependency set. Use cargo metadata --locked.',
    );
  for (const item of actual.sort((a, b) => key(a).localeCompare(key(b)))) {
    if (!item.license) throw new Error(`Missing declared license for ${key(item)}`);
    const directory = path.dirname(item.manifest_path);
    const refs = [];
    const files = await licenseFiles(directory);
    if (item.license_file && !files.includes(item.license_file)) files.push(item.license_file);
    for (const file of files)
      refs.push(
        add(
          await readFile(path.join(directory, file), 'utf8'),
          file,
          `https://crates.io/crates/${item.name}/${item.version}`,
        ),
      );
    if (!refs.length) {
      const source = snapshots.sources.find((entry) => entry.packages.includes(key(item)));
      if (!source)
        throw new Error(
          `No original license notice for ${key(item)}; obtain a pinned upstream source snapshot.`,
        );
      for (const license of source.licenses) refs.push(snapshotLicense(source, license));
    }
    // Upstream objc2 provides a declaration and original licensing explanation,
    // but links to the MIT grant. Preserve that notice and supply its full form.
    if (
      item.license.includes('MIT') &&
      !refs.some((ref) =>
        texts.get(ref.split(' ')[2])?.text.includes('Permission is hereby granted'),
      )
    )
      refs.push(snapshotLicense(supplemental, mit));
    if (item.license.includes('MPL-2.0')) refs.push(snapshotLicense(supplemental, mpl));
    sections.push(
      [
        `Cargo package: ${key(item)}`,
        `Declared license: ${item.license}`,
        `Source: https://crates.io/crates/${item.name}/${item.version}`,
        `Source archive: https://crates.io/api/v1/crates/${item.name}/${item.version}/download`,
        ...(item.repository ? [`Repository: ${item.repository}`] : []),
        ...(item.authors.length ? [`Published package authors: ${item.authors.join('; ')}`] : []),
        ...(item.license.includes('MPL-2.0')
          ? [
              'MPL source availability: the exact unmodified source is available at the source archive URL above.',
            ]
          : []),
        ...new Set(refs),
      ].join('\n'),
    );
  }
  const feather = snapshots.sources.find((source) => source.packages.includes('asset:feather'));
  sections.push(
    [
      'Feather icons',
      'Repo Creator uses adapted Feather path data in src/icons.tsx.',
      `Source snapshot: ${feather.repository}/tree/${feather.revision}`,
      'Declared license: MIT',
      ...feather.licenses.map((license) => snapshotLicense(feather, license)),
    ].join('\n'),
  );
  sections.push(
    [
      'SPDX License List Data v3.29.0',
      'Bundled offline project-license templates: src-tauri/resources/licenses/.',
      'Source: https://github.com/spdx/license-list-data/tree/v3.29.0/text',
      'MIT and BSD copyright fields are substituted for generated projects. Apache/GPL full forms and appendices are retained; Unlicense is unchanged.',
      'These are user-selectable project license forms, not licenses applied to Repo Creator or all its dependencies.',
      'Supplemental MIT/MPL forms below come from the pinned SPDX data snapshot. Placeholder copyright fields in canonical forms are not new copyright claims; package notices and published authors above supply upstream attribution.',
    ].join('\n'),
  );
  const body =
    [
      'Scope: five shipped npm runtime packages and all locked Cargo dependencies, including platform-specific and build-time dependencies conservatively.',
      'License expressions are the upstream declarations. For OR alternatives Repo Creator uses MIT where offered, otherwise an offered permissive alternative; AND requirements remain combined. MPL-2.0 dependencies remain MPL-2.0.',
      'Original notices, copyright statements and license texts are reproduced below, deduplicated by SHA-256. Inclusion of alternative license texts does not require selecting every OR alternative.',
      'The Rust dependencies are unmodified upstream package sources. MPL source archive URLs listed below are public and require no account. Native operating-system runtimes and separately installed Git/GitHub CLI/coding tools are not bundled as application dependencies.',
      ...sections,
      'FULL LICENSE AND NOTICE TEXTS',
      ...[...texts]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, entry]) =>
          [
            `LICENSE TEXT SHA256: ${id}`,
            ...[...entry.sources].sort(),
            '',
            entry.text,
            'END LICENSE TEXT',
          ].join('\n'),
        ),
    ].join('\n\n') + '\n';
  return [
    'Repo Creator - Third-party notices',
    'Generated by: node scripts/third-party-notices.mjs --generate',
    `Dependency snapshot SHA-256: ${fingerprint}`,
    `Notice body SHA-256: ${sha256(body)}`,
    '',
    '--- NOTICE BODY ---',
    body,
  ].join('\n');
}

export async function main(args = process.argv.slice(2)) {
  const data = await inputs();
  const fingerprint = snapshotFingerprint(data);
  const npm = npmPackages(JSON.parse(data.find(([name]) => name === 'package-lock.json')[1]));
  const cargo = cargoPackages(data.find(([name]) => name === 'src-tauri/Cargo.lock')[1]);
  const expected = [
    ...npm.map((item) => `NPM:${item.name}@${item.version}`),
    ...cargo.map((item) => `Cargo:${item.name}@${item.version}`),
  ];
  if (args.includes('--generate')) {
    const index = args.indexOf('--metadata');
    const metadata =
      index >= 0
        ? JSON.parse(await readFile(args[index + 1], 'utf8'))
        : JSON.parse(
            execFileSync(
              'cargo',
              [
                'metadata',
                '--manifest-path',
                'src-tauri/Cargo.toml',
                '--locked',
                '--offline',
                '--format-version',
                '1',
              ],
              { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
            ),
          );
    const snapshots = JSON.parse(data.find(([name]) => name === sourceName)[1]);
    const text = await generate(metadata, npm, fingerprint, snapshots);
    verifyNotices(text, fingerprint, expected);
    await writeFile(path.join(root, noticeName), text, 'utf8');
  }
  const result = verifyNotices(await read(noticeName), fingerprint, expected);
  console.log(
    `Third-party notices verified: ${result.packages} locked packages, ${result.licenseTexts} full license/notice texts.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
