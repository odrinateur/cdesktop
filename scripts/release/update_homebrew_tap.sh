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
curl -fL "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}.tgz"             -o "$work/cli.tgz" || \
  curl -fL "${ASSET_BASE}/cdesktop-v${RELEASE_VERSION}.tgz"          -o "$work/cli.tgz"

SHA_ARM=$(shasum -a 256 "$work/arm64.dmg" | awk '{print $1}')
SHA_X64=$(shasum -a 256 "$work/x64.dmg"   | awk '{print $1}')
SHA_TGZ=$(shasum -a 256 "$work/cli.tgz"   | awk '{print $1}')

echo "arm64 dmg sha: $SHA_ARM"
echo "x64   dmg sha: $SHA_X64"
echo "cli   tgz sha: $SHA_TGZ"

git clone --depth 1 \
  "https://x-access-token:${HOMEBREW_TAP_GITHUB_TOKEN}@github.com/${TAP_REPO}.git" \
  "$work/tap"

mkdir -p "$work/tap/Casks" "$work/tap/Formula"

cat > "$work/tap/Casks/cdesktop.rb" <<RUBY
cask "cdesktop" do
  version "${RELEASE_VERSION}"

  on_arm do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-arm64.dmg"
    sha256 "${SHA_ARM}"
  end
  on_intel do
    url "${ASSET_BASE}/cdesktop-#{version}-macos-x64.dmg"
    sha256 "${SHA_X64}"
  end

  name "cdesktop"
  desc "Coding-session desktop environment"
  homepage "https://github.com/${OWNER_REPO}"

  app "cdesktop.app"

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
  url "${ASSET_BASE}/cdesktop-${RELEASE_VERSION}.tgz"
  sha256 "${SHA_TGZ}"
  license "MIT"
  version "${RELEASE_VERSION}"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"npx-cli/bin/cli.js" => "cdesktop"
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
