'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const bundleDir = path.resolve(root, process.argv[2] || 'src-tauri/target/release/bundle/nsis');
const outputPath = path.resolve(root, process.argv[3] || 'updater-release/latest.json');
const releaseAssetDir = path.dirname(outputPath);

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf-8'));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function releaseAssetName(fileName) {
  return fileName.replace(/\s+/g, '.');
}

function copyReleaseAsset(sourcePath, assetName) {
  fs.mkdirSync(releaseAssetDir, { recursive: true });
  const targetPath = path.join(releaseAssetDir, assetName);
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function findInstaller(dir) {
  if (!fs.existsSync(dir)) {
    fail(`Bundle directory not found: ${dir}`);
  }
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.exe')).sort();
  if (files.length === 0) {
    fail(`No NSIS installer .exe found in ${dir}`);
  }
  const preferred = files.find((file) => /setup/i.test(file)) || files[0];
  const installerPath = path.join(dir, preferred);
  const signaturePath = `${installerPath}.sig`;
  if (!fs.existsSync(signaturePath)) {
    fail(`Missing updater signature: ${signaturePath}`);
  }
  return { installerName: preferred, installerPath, signaturePath };
}

const packageJson = readJson('package.json');
const repository = process.env.GITHUB_REPOSITORY || 'wyeye/work-daily-note';
const tagName = process.env.GITHUB_REF_NAME || `v${packageJson.version}`;
const { installerName, installerPath, signaturePath } = findInstaller(bundleDir);
const releaseInstallerName = releaseAssetName(installerName);
const releaseSignatureName = releaseAssetName(`${installerName}.sig`);
const releaseInstallerPath = copyReleaseAsset(installerPath, releaseInstallerName);
const releaseSignaturePath = copyReleaseAsset(signaturePath, releaseSignatureName);
const signature = fs.readFileSync(releaseSignaturePath, 'utf-8').trim();
const browser_download_url = `https://github.com/${repository}/releases/download/${tagName}/${encodeURIComponent(releaseInstallerName)}`;

const latest = {
  version: packageJson.version,
  notes: `Work Daily Note ${tagName}`,
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': {
      signature,
      url: browser_download_url
    }
  }
};

fs.writeFileSync(outputPath, `${JSON.stringify(latest, null, 2)}\n`, 'utf-8');
console.log(`Prepared updater assets: ${releaseInstallerPath}, ${releaseSignaturePath}`);
console.log(`Generated updater latest.json: ${outputPath}`);
