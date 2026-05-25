import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const outDir = join(root, 'dist-linux');
const stageDir = join(outDir, `modelmule-${version}`);

const build = spawnSync('pnpm', ['build'], {
  cwd: root,
  stdio: 'inherit'
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(stageDir, { recursive: true });

for (const entry of ['apps', 'packages', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.base.json']) {
  cpSync(join(root, entry), join(stageDir, entry), { recursive: true });
}

mkdirSync(join(stageDir, 'bin'), { recursive: true });
copyFileSync(join(root, 'packaging/linux/modelmule'), join(stageDir, 'bin/modelmule'));
chmodSync(join(stageDir, 'bin/modelmule'), 0o755);
mkdirSync(join(stageDir, 'share/applications'), { recursive: true });
copyFileSync(join(root, 'packaging/linux/modelmule.desktop'), join(stageDir, 'share/applications/modelmule.desktop'));

writeFileSync(
  join(stageDir, 'README.txt'),
  [
    `ModelMule ${version}`,
    '',
    'Install dependencies inside this directory:',
    '  pnpm install --prod --no-frozen-lockfile',
    '',
    'Run:',
    '  ./bin/modelmule serve',
    ''
  ].join('\n'),
  'utf8'
);

const tarball = join(outDir, `modelmule-${version}-linux.tar.gz`);
const tar = spawnSync('tar', ['-czf', tarball, '-C', outDir, `modelmule-${version}`], {
  stdio: 'inherit'
});

if (tar.status !== 0) {
  process.exit(tar.status ?? 1);
}

if (!existsSync(tarball)) {
  throw new Error(`Expected tarball was not created: ${tarball}`);
}

console.log(`Created ${tarball}`);
