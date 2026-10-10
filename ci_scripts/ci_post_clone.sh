#!/bin/sh
# Xcode Cloud post-clone: the iOS project resolves Capacitor plugins from
# node_modules (not committed), so dependencies must be installed and the
# web app built + synced before Xcode archives.
set -e
export HOMEBREW_NO_AUTO_UPDATE=1
if ! command -v npm >/dev/null 2>&1; then
  brew install node
fi
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npx cap sync ios
