#!/usr/bin/env node
// Apply the next release version across all version-stamped files.
// Invoked by semantic-release prepareCmd.
//
// Usage: node scripts/release/apply-version.js <version>

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/.test(version)) {
  console.error(`apply-version: invalid version "${version}"`);
  process.exit(1);
}

const repoRoot = path.resolve(__dirname, '..', '..');

function setJsonVersion(relPath) {
  const abs = path.join(repoRoot, relPath);
  if (!fs.existsSync(abs)) return;
  const json = JSON.parse(fs.readFileSync(abs, 'utf8'));
  json.version = version;
  fs.writeFileSync(abs, JSON.stringify(json, null, 2) + '\n');
  console.log(`updated ${relPath} -> ${version}`);
}

setJsonVersion('package.json');
setJsonVersion('npx-cli/package.json');
setJsonVersion('packages/local-web/package.json');
setJsonVersion('crates/tauri-app/tauri.conf.json');

// Cargo workspace bump. Requires cargo-edit (`cargo install cargo-edit`).
function cargoSetVersion(args) {
  try {
    execFileSync('cargo', ['set-version', ...args, version], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('cargo set-version failed:', err.message);
    process.exit(1);
  }
}

cargoSetVersion(['--workspace']);

// crates/remote is the cloud service workspace and pulls a private git dep
// (BloopAI/vibe-kanban-private) that CI can't authenticate against on forks.
// Skip it unless the caller explicitly opts in via BUMP_REMOTE_WORKSPACE=1.
if (
  process.env.BUMP_REMOTE_WORKSPACE === '1' &&
  fs.existsSync(path.join(repoRoot, 'crates/remote/Cargo.toml'))
) {
  cargoSetVersion(['--manifest-path', 'crates/remote/Cargo.toml', '--workspace']);
}
