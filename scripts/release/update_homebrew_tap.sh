#!/usr/bin/env bash
# Push a fresh cdesktop cask + CLI formula to the Homebrew tap.
#
# Required env:
#   HOMEBREW_TAP_GITHUB_TOKEN  PAT with `repo` scope on $TAP_REPO
#   TAP_REPO                   e.g. Odrinateur/homebrew-tap
#   RELEASE_TAG                e.g. v0.3.0
#   RELEASE_VERSION            e.g. 0.3.0
set -euo pipefail

: "${HOMEBREW_TAP_GITHUB_TOKEN:?missing}"
: "${TAP_REPO:?missing}"
: "${RELEASE_TAG:?missing}"
: "${RELEASE_VERSION:?missing}"

OWNER_REPO="${GITHUB_REPOSITORY:-Odrinateur/cdesktop}"
ASSET_BASE="https://github.com/${OWNER_REPO}/releases/download/${RELEASE_TAG}"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

echo "Downloading release assets for ${RELEASE_TAG}..."
curl -fL "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}-macos-arm64.dmg" -o "$work/arm64.dmg"
curl -fL "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}-macos-x64.dmg"   -o "$work/x64.dmg"
curl -fL "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}-macos-arm64.tgz" -o "$work/cli-arm64.tgz"
curl -fL "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}-macos-x64.tgz"   -o "$work/cli-x64.tgz"

SHA_DMG_ARM=$(shasum -a 256 "$work/arm64.dmg"     | awk '{print $1}')
SHA_DMG_X64=$(shasum -a 256 "$work/x64.dmg"       | awk '{print $1}')
SHA_CLI_ARM=$(shasum -a 256 "$work/cli-arm64.tgz" | awk '{print $1}')
SHA_CLI_X64=$(shasum -a 256 "$work/cli-x64.tgz"   | awk '{print $1}')

echo "arm64 dmg sha: $SHA_DMG_ARM"
echo "x64   dmg sha: $SHA_DMG_X64"
echo "arm64 cli sha: $SHA_CLI_ARM"
echo "x64   cli sha: $SHA_CLI_X64"

git clone --depth 1 \
  "https://x-access-token:${HOMEBREW_TAP_GITHUB_TOKEN}@github.com/${TAP_REPO}.git" \
  "$work/tap"

mkdir -p "$work/tap/Casks" "$work/tap/Formula"

cat > "$work/tap/Casks/cdesktop.rb" <<RUBY
cask "cdesktop" do
  version "${RELEASE_VERSION}"

  on_arm do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-arm64.dmg"
    sha256 "${SHA_DMG_ARM}"
  end
  on_intel do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-x64.dmg"
    sha256 "${SHA_DMG_X64}"
  end

  name "cdesktop"
  desc "Coding-session desktop environment"
  homepage "https://github.com/${OWNER_REPO}"

  app "cdesktop.app"

  # The app is ad-hoc signed but not notarized (no Apple Developer ID).
  # Strip the quarantine flag Homebrew adds on download so Gatekeeper does
  # not reject it with "cdesktop.app is damaged and can't be opened".
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/cdesktop.app"]
  end

  zap trash: [
    "~/Library/Application Support/cdesktop",
    "~/Library/Preferences/cdesktop.plist",
    "~/Library/Caches/cdesktop",
  ]
end
RUBY

cat > "$work/tap/Formula/cdesktop.rb" <<RUBY
class Cdesktop < Formula
  desc "Coding-session desktop CLI"
  homepage "https://github.com/${OWNER_REPO}"
  license "Apache-2.0"
  version "${RELEASE_VERSION}"

  on_arm do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-arm64.tgz"
    sha256 "${SHA_CLI_ARM}"
  end
  on_intel do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-x64.tgz"
    sha256 "${SHA_CLI_X64}"
  end

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"cdesktop").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/bin/cli.js" "\$@"
    EOS
    (bin/"cdesktop").chmod 0755
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/cdesktop --version")
  end
end
RUBY

cd "$work/tap"
git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add Casks/cdesktop.rb Formula/cdesktop.rb
if git diff --cached --quiet; then
  echo "Tap already up to date for ${RELEASE_TAG}; nothing to push."
  exit 0
fi
git commit -m "cdesktop ${RELEASE_VERSION}"
git push origin HEAD
echo "Tap updated: ${TAP_REPO}@${RELEASE_VERSION}"
