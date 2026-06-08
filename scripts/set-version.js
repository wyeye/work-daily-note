'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rawVersion = String(process.argv[2] || '').trim();
const version = rawVersion.replace(/^v/i, '');
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!semverPattern.test(version)) {
  console.error('Invalid version. Use a semantic version like 0.1.1');
  process.exit(1);
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8'));
}

function writeJson(relative, data) {
  fs.writeFileSync(path.join(root, relative), `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function updatePackageJson() {
  const data = readJson('package.json');
  data.version = version;
  writeJson('package.json', data);
}

function updatePackageLock() {
  const data = readJson('package-lock.json');
  data.version = version;
  if (data.packages && data.packages['']) {
    data.packages[''].version = version;
  }
  writeJson('package-lock.json', data);
}

function updateCargoToml() {
  const filePath = path.join(root, 'src-tauri/Cargo.toml');
  const text = fs.readFileSync(filePath, 'utf-8');
  const versionPattern = /^(version\s*=\s*")[^"]+(")/m;
  if (!versionPattern.test(text)) {
    throw new Error('src-tauri/Cargo.toml version field not found');
  }
  const nextText = text.replace(versionPattern, `$1${version}$2`);
  fs.writeFileSync(filePath, nextText, 'utf-8');
}

function updateTauriConfig() {
  const data = readJson('src-tauri/tauri.conf.json');
  data.version = version;
  writeJson('src-tauri/tauri.conf.json', data);
}

updatePackageJson();
updatePackageLock();
updateCargoToml();
updateTauriConfig();

console.log(`Version updated to ${version}`);
