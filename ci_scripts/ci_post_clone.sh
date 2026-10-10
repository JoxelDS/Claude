#!/bin/sh
# Xcode Cloud post-clone: dependencies must be installed and the web app
# built + copied before Xcode archives. The Capacitor SPM plugins are
# vendored in ios/capacitor-plugins (Xcode Cloud resolves packages before
# this script can run), so this script only prepares the web assets.
# Use `cap copy`, NOT `cap sync`: sync regenerates CapApp-SPM/Package.swift
# and would point it back at node_modules, un-vendoring the plugins.
set -e
export HOMEBREW_NO_AUTO_UPDATE=1
NODE_MAJOR=$(node -v 2>/dev/null | sed -e 's/^v//' -e 's/\..*//')
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ]; then
  brew install node
fi
cd "$CI_PRIMARY_REPOSITORY_PATH"
npm ci
npm run build
npx cap copy ios
