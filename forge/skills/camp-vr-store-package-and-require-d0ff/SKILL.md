---
name: camp-vr-store-package-and-require-d0ff
description: When packaging a built WebXR/VR game for a specific store and checking its submission requirements (id, version code, icons, screenshots, metadata, age rating, privacy, VR comfort disclosures).
---

When: packaging a built WebXR/VR game for a target store (Meta Horizon Store / App Lab, SideQuest, itch.io, or PWA install) and proving it meets that store's requirements.

1. **Name the target store first.** The package format differs: Meta Horizon Store wants an APK/AAB (or PWA listing) with a fixed application id; itch.io wants a zip of the web build plus a correct `webctl`/embed config; a PWA needs `manifest.json`, icons and a service worker. Do not produce a generic zip and call it 'packaged'.
2. **Collect the store's actual requirements before building.** Use websearch if the requirement is not in the repo; record each requirement with its source and date (store docs change). Minimum set: application/bundle id, monotonic version code tied to `version.json`, icon sizes (at least 512×512 and store-specific), screenshots and aspect ratios, store listing metadata (title ≤ limits, short + full description), age rating questionnaire inputs, privacy policy URL, and content/comfort disclosures for VR (comfort rating, motion, photosensitivity).
3. **Build the store package from `build/out/`**, never the source tree. For APK targets use the project's existing wrapper/pipeline; if none exists, say so and ship the web artifact plus a written gap list rather than improvising a signing setup.
4. **Verify each requirement with evidence in a `build/store-requirements.md` table:** requirement | source (URL/date) | where satisfied in package | evidence (file path, screenshot, command output). A row with no evidence is an open item, not a pass.
5. **Version-code discipline:** store version codes must increase monotonically across submissions and must match `version.json`. Check the previous release's code before setting this one.
6. **VR-specific sanity on the packaged artifact:** boots to the first interactive frame in a headless browser smoke run (reuse the headless smoke skill), `manifest.json`/XR session flags intact after packaging, no absolute `http://` asset URLs.
7. **Handover checklist:** package + checksum paths; `store-requirements.md` complete with open items marked; screenshots/metadata drafts in `build/`; `release-checklist.md` cross-links to it; anything only the owner can do (store account, signing keys, payment setup) listed explicitly as owner-only.

**Common mistakes:** reusing desktop-store steps (signing/notarisation) for a VR store target; a version code lower than the last submission; screenshots taken from the dev build rather than the packaged one; requirements cited from memory instead of the store's current docs.
