# Vendored Capacitor plugins — do not delete

These packages are **vendored copies** of the `@capacitor/*` iOS plugins,
committed to the repo so Xcode Cloud can build the app.

## Why they are here

Xcode Cloud resolves Swift packages **before** any `ci_post_clone.sh`
script runs: its pre-flight steps ("Check project configuration",
`xcodebuild -describeSchemes`, `-resolvePackageDependencies`) load the
package graph from the bare clone. `CapApp-SPM/Package.swift` originally
pointed each plugin at `../../../node_modules/@capacitor/<name>` — and
`node_modules` is never committed, so every cloud build failed in about a
minute with "the package at '…/node_modules/@capacitor/…' cannot be
accessed", no matter what the post-clone script did.

`CapApp-SPM/Package.swift` now points at these vendored copies instead:

| Folder | npm package | Version |
|---|---|---|
| `keyboard/` | `@capacitor/keyboard` | 8.0.5 |
| `local-notifications/` | `@capacitor/local-notifications` | 8.3.0 |
| `push-notifications/` | `@capacitor/push-notifications` | 8.1.3 |
| `splash-screen/` | `@capacitor/splash-screen` | 8.0.2 |
| `status-bar/` | `@capacitor/status-bar` | 8.0.3 |

Each folder is the npm tarball's `Package.swift` plus its `ios/Sources`
and `ios/Tests` trees, unmodified. (Capacitor and Cordova themselves still
come from the remote `capacitor-swift-pm` package — that one was never
the problem.)

## ⚠️ The `cap sync` trap

**Running `npx cap sync ios` regenerates `CapApp-SPM/Package.swift` and
points the plugins back at `node_modules`.** If that regenerated file is
committed, Xcode Cloud builds break again with the same error.

- The Xcode Cloud scripts (`ci_scripts/ci_post_clone.sh` and
  `ios/App/ci_scripts/ci_post_clone.sh`) deliberately use
  `npx cap copy ios` — it syncs the web assets without regenerating the
  manifest.
- If you run `cap sync` locally (e.g. after adding/removing a plugin),
  afterwards re-apply the vendoring by editing
  `ios/App/CapApp-SPM/Package.swift`: change each
  `../../../node_modules/@capacitor/<name>` path back to
  `../../capacitor-plugins/<name>` before committing.
- When a plugin version is bumped in `package.json`, re-vendor it:
  `npm pack @capacitor/<name>@<new-version>`, then replace the folder's
  `Package.swift` + `ios/Sources` + `ios/Tests` with the tarball's, and
  update the table above.
