module.exports = {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'angular',
        releaseRules: [
          { type: 'perf', release: 'patch' },
          { type: 'docs', release: 'patch' },
          { type: 'style', release: 'patch' },
          { type: 'refactor', release: 'patch' },
          { type: 'test', release: 'patch' },
          { type: 'chore', release: 'patch' },
          { type: 'ci', release: 'patch' },
        ],
      },
    ],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      { changelogFile: 'CHANGELOG.md' },
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd: 'node scripts/release/apply-version.js ${nextRelease.version}',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: [
          'CHANGELOG.md',
          'package.json',
          'pnpm-lock.yaml',
          'npx-cli/package.json',
          'npx-cli/package-lock.json',
          'packages/local-web/package.json',
          'crates/tauri-app/tauri.conf.json',
          'Cargo.toml',
          'Cargo.lock',
          'crates/**/Cargo.toml',
        ],
        message:
          'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    [
      '@semantic-release/github',
      {
        assets: [
          { path: 'release-artifacts/*.dmg', label: 'macOS Disk Image' },
          { path: 'release-artifacts/*.tgz', label: 'cdesktop npm CLI tarball' },
          { path: 'release-artifacts/cdesktop-frontend-*.zip', label: 'Frontend bundle' },
        ],
      },
    ],
  ],
};
