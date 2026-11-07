# Capacitor iOS — build and sync

This app uses **Create React App** with **`BUILD_PATH=dist`** (see `package.json` and `.env.production`). Production files go to **`dist/`** only. Root `capacitor.config.ts` sets **`webDir: "dist"`** — it must stay aligned.

## Recommended order

1. **`npm run build`** — creates `dist/index.html`. It does **not** run `cap sync` (the `postbuild` hook syncs only with `CAP_SYNC=1`), so `ios/` stays untouched.
2. **`npx cap sync ios`** — copy `dist/` into the native project
3. **`npx cap open ios`** — open Xcode

Prefer npm scripts so the guard runs automatically:

| Script       | Behavior |
|-------------|----------|
| `npm run cap:sync` | `build` → `cap sync ios` → verify `webDir/index.html` |
| `npm run cap:ios` | `build` → `cap sync ios` → verify → `cap open ios` |
| `npm run ios:prod` | Clean rebuild + `cap sync ios` + verify (`build:ios-safe`) → open Xcode |
| `npm run build:verify` | `build` + assert `dist/index.html` exists |
| `npm run verify:cap-web` | Fails fast if `webDir/index.html` is missing |

**Do not run `cap sync` before a successful web build.** If you see *index.html file missing in web assets directory*, run `npm run build` (writes `dist/`), then `npx cap sync ios`, or fix `webDir` / `BUILD_PATH` mismatch.

## webDir mismatch

If `capacitor.config.ts` and `ios/App/App/capacitor.config.json` disagree, `npm run verify:cap-web` will error. Fix by running **`npx cap sync`** from the **repository root** so the CLI regenerates native config.
