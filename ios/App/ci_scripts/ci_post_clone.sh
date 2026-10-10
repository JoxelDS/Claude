#!/bin/sh
# Xcode Cloud post-clone (beside the Xcode project).
# Why this copy exists: the Xcode project lives in ios/App, and Xcode Cloud
# discovers ci_scripts next to the .xcodeproj for subfolder projects. A copy
# also sits at the repo root; whichever location the workflow reads, the
# logic is the same.
# Capacitor CLI 8 requires Node >= 22 and exits fatally on older Node. The
# cloud image can ship Node 20 WITH npm present, so check the Node version
# itself, not whether npm exists.
# The Capacitor SPM plugins are vendored in ios/capacitor-plugins (Xcode
# Cloud resolves packages before this script can run). Use `cap copy`, NOT
# `cap sync`: sync regenerates CapApp-SPM/Package.swift and would point it
# back at node_modules, un-vendoring the plugins.
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
