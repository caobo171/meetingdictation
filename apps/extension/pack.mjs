// Builds the extension for the live site and zips it for the website's download button:
// apps/web/public/downloads/meetingdictation-extension.zip, holding one folder to "Load unpacked".
// Python's zipfile does the zipping because the server has no `zip` binary.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appUrl = process.env.MD_APP_URL ?? 'https://meetingdictation.com';
const out = path.resolve(here, '../web/public/downloads/meetingdictation-extension.zip');

execFileSync(process.execPath, ['build.mjs'], { cwd: here, stdio: 'inherit', env: { ...process.env, MD_APP_URL: appUrl } });

const staging = mkdtempSync(path.join(tmpdir(), 'md-ext-'));
const folder = path.join(staging, 'meetingdictation-extension');
try {
  for (const p of ['manifest.json', 'dist', 'icons']) cpSync(path.join(here, p), path.join(folder, p), { recursive: true });
  mkdirSync(path.dirname(out), { recursive: true });
  rmSync(out, { force: true });
  execFileSync('python3', ['-m', 'zipfile', '-c', out, 'meetingdictation-extension'], { cwd: staging, stdio: 'inherit' });
} finally {
  rmSync(staging, { recursive: true, force: true });
}
const { version } = JSON.parse(readFileSync(path.join(here, 'manifest.json'), 'utf8'));
console.log(`Packed MeetingDictation ${version} for ${appUrl} -> ${path.relative(process.cwd(), out)}`);
