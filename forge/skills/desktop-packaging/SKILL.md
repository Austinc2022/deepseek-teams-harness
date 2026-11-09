---
name: desktop-packaging
description: Package, sign, notarize and auto-update desktop apps (Tauri 2 or Electron) for macOS, Windows and Linux, with CI release workflows. Never publishes or uses signing identities without explicit approval.
---
# Desktop packaging playbook

## Choose the stack
- **Tauri 2** (Rust core + web UI): small binaries (≈ 3-10 MB), low memory, strong
  capability-based security. Default for new apps.
- **Electron**: pick it when the app needs Node APIs or Chromium-specific features, or the team is JS-only. Use
  electron-builder or Electron Forge.

## Build matrix
| OS | Artifacts | Notes |
|---|---|---|
| macOS | `.dmg`, `.app` (universal: `--target universal-apple-darwin`) | must be signed + notarized or Gatekeeper blocks it |
| Windows | `.msi` / NSIS `.exe` | sign with an Authenticode cert (EV or Azure Trusted Signing) to avoid SmartScreen warnings |
| Linux | `.AppImage`, `.deb`, `.rpm` | optional GPG signing |

Tauri: `npm run tauri build` (config in `src-tauri/tauri.conf.json` → `bundle`).
Electron: `npx electron-builder --mac --win --linux` (config in `electron-builder.yml`).

## macOS signing + notarization (prepare, do not execute without approval)
1. Needs: an Apple Developer ID Application certificate, plus an App Store Connect API key or app-specific password.
2. Tauri env: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
   `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_PATH` → `tauri build` signs and notarizes.
3. Electron: `electron-builder` with `mac.hardenedRuntime: true`, an entitlements plist, and
   `notarize: true` plus the same API key env vars.
4. Verify: `codesign --verify --deep --strict --verbose=2 App.app` and `spctl -a -vv App.app`,
   then `xcrun stapler validate App.dmg`.

## Windows signing
Azure Trusted Signing (`trusted-signing-cli`) or `signtool sign /fd sha256 /tr <timestamp-url> /td sha256`.
Reference secrets only through CI secrets, never inline.

## Auto-update
- Tauri: `tauri-plugin-updater`. Generate a key pair (`tauri signer generate`), publish `latest.json`
  next to the artifacts (GitHub Releases works), and put the public key in the config.
- Electron: `electron-updater` with GitHub Releases or S3 as the provider.

## CI release workflow (GitHub Actions)
Use `tauri-apps/tauri-action` (or electron-builder) in a matrix `[macos-latest, windows-latest,
ubuntu-22.04]`, triggered on `v*` tags. Signing secrets go in repository secrets. Create
**draft** releases when `publish: false`; with `publish: true` the workflow publishes the release.

## Store distribution (optional)
Mac App Store needs sandbox entitlements and a different certificate. Microsoft Store takes MSIX. Prepare the
configs and checklists only.

## Guardrails
- Never export certificates or private keys. Sign or notarize only with identities that are already
  configured (keychain identity or CI secrets); otherwise ship unsigned builds labelled as such.
- `publish: false`: local builds, CI configs and `RELEASE-CHECKLIST.md` only.
- `publish: true` (autonomous go-live): publish installers to the GitHub release and the landing
  site's downloads. Do not submit to paid stores, and never pay for certificates or accounts.
- Always write `RELEASE-CHECKLIST.md` listing the secrets that are still missing (for example Apple Developer ID).
