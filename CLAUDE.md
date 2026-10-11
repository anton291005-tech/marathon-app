# CLAUDE.md
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start              # frontend only (CRA dev server)
npm run start:api      # local AI API server (Express) on :8787 (POST /api/ai)
npm run start:full     # frontend + API concurrently — needed to exercise the real AI path locally
npm test               # jest (react-scripts test), interactive watch mode
CI=true npm test       # single non-interactive run (use this, not plain `npm test`, for one-shot verification)
npm test -- MyFile     # run a single test file/pattern (react-scripts test filters by path/name)
npm run build          # production build → dist/ (BUILD_PATH=dist, required for Vercel + Capacitor)
```

iOS (Capacitor — native shell loads bundled `dist/`, never a remote URL):
```bash
npm run deploy:ios     # cap sync ios + open Xcode workspace
npm run ios            # CI build + cap sync + open Xcode (skips ESLint)
npm run build:ios-safe # clean rebuild + verify-web-build guard
```
After any `npm run build`, `npx cap sync ios` must run before the Xcode rebuild — the WebView reads only the bundled assets.

### Change-discipline scripts (`scripts/`)

An optional stricter-than-default commit pipeline exists but is not git-hook-enforced (recent commit history doesn't follow it) — use it when you want the extra rigor, e.g. for large or automated multi-step changes:
- `npm run verify:transaction` / `verify:atomic` — reject a staged change if it touches more than one "domain" (`scripts/domainClassifier.js` classifies by path prefix: `ai`, `recovery`, `core`, `ui`, `health`, `training`, `config`, fallback `app`)
- `npm run verify:diff` — rejects staged changes over 60 changed lines total
- `npm run verify:strict` — runs the above plus a full build+test
- `npm run commit:transaction` — runs `verify:strict`, then commits with message `feat(<domain>): tx-<timestamp>-<sha>-<domain>` and appends to `logs/feature-ledger.json`

## Architecture

### Two build systems coexist by design
`vite.config.ts` is a documentation stub — the app is bundled with **Create React App** (`react-scripts`), output forced to `dist/` via `BUILD_PATH`. Do not "fix" this by wiring up Vite.

### Two AI providers, split by feature rather than by backend
- **Chat coach** (`POST /api/ai` → `api/_lib/coachHandlers.js` `handleAiCoach`): calls **Anthropic/Claude** (`claude-sonnet-4-6`) via `ANTHROPIC_API_KEY` (`callClaudeApi`). If `ANTHROPIC_API_KEY` is missing or the Claude call throws, it falls back to `fallbackStructuredResponse` (deterministic, in-process) rather than to OpenAI. Frontend picks provider in `src/lib/ai/generateAiResponse.ts`: `mockBrain` (local, deterministic) vs `openaiBrain` (hits `/api/ai` — despite the name, that endpoint is Claude now). Chat is provider-switchable via `REACT_APP_AI_PROVIDER=mock|openai`; if the `/api/ai` call fails for any reason, `generateAiResponse` falls back to `mockBrain` and appends `(Cloud-Antwort war nicht verfuegbar, lokaler Coach aktiv.)` to the message — the app must always remain usable.
- **No OpenAI endpoint is deployed anymore**: `POST /api/ai/daily-coach`, `POST /api/onboarding/preferences-patches` and the Vercel `GET /api/ai/health` were removed (no live caller, no token check). `src/lib/ai/fetchAiDailyAdvice.ts` and `src/onboarding/applyOnboardingPreferencesPatches.ts` still exist client-side but have no live caller; the OpenAI helpers left in `api/_lib/coachHandlers.js` and `server/index.js` are legacy. `GET /api/ai/health` survives only in the local Express server.
- **Every paid endpoint requires a Supabase session token** (`Authorization: Bearer …`): `api/_lib/apiGuard.js` `guardRequest` → `api/_lib/requireUser.js`. Client calls get the header from `src/lib/api/authHeaders.ts` `getApiAuthHeaders()`.
- **Guard order for paid endpoints**: token → hard input limits (`api/_lib/inputLimits.js`) → per-user rate limit (`api/_lib/apiQuota.js`, Postgres function `consume_api_quota`, migration 014). The rate limit fails open on database errors; the token check fails closed. `API_QUOTA_EXEMPT_USER_IDS` (comma-separated user IDs) exempts accounts from the limit.
- **Onboarding plan generation** (`api/onboarding/generate-plan*`, `api/_lib/claudePlanGenerator.js`, `api/_lib/phasedFullPlanGenerator.js`): calls **Anthropic/Claude** via `ANTHROPIC_API_KEY` — phased generation (Haiku per-phase calls, Sonnet for the structure call), entirely separate from the chat coach's Claude call. `api/_lib/deterministicPlanGenerator.js` is the non-AI fallback plan builder.
- Either AI path is proposal-only: `src/ai/mutations/**` and `src/ai/intents/**` compute the change, but nothing is written back to the user's plan until confirmed in the UI (see `src/ai/validation/**` for the checks a proposed mutation must pass — swap, phase-swap, load-shift, micro-structure, plan integrity).

### `TrainingPlanV2` is the single source of truth for plans
`src/planV2/normalizeTrainingPlan.ts` is the mandatory boundary function: every read/write path (local storage, Supabase, AI mutation output, legacy import formats) must pass payloads through `normalizeTrainingPlan`/`normalizeTrainingPlanOrNull` before use. It repairs partial/legacy shapes (bare arrays, `{weeks}`, `{workouts}`, mixed `s`/`workouts` keys, German legacy date labels) into a structurally valid plan, dedupes workout IDs, and rebuilds via `rebuildPlanFromWorkouts`. If `validateTrainingPlanV2Integrity` fails post-rebuild, it silently returns `EMPTY_TRAINING_PLAN_V2` rather than a malformed plan — never partially-normalized data.

### One authoritative clock
`src/core/time/timeSystem.ts` is the only file allowed to call bare `new Date()` or `Date.now()` — enforced by an ESLint `no-restricted-syntax` rule (`package.json` `eslintConfig`) over all other `src/**/*.{ts,tsx}`. Use `getAppNow()` / `getAppNowEpochMs()` / `getAppTodayYmd()` everywhere else; the frame-based cache means all reads within one render share the same instant. Tests pin time with `freezeTimeForTests(date)`.

### `src/auxiliary/**` is quarantined
An ESLint `no-restricted-imports` rule blocks any `src/**/*.{ts,tsx}` file (outside `src/auxiliary` itself) from importing `**/auxiliary/**` — experimental modules there (e.g. `dailyDecision`) must not leak into SSOT-facing code.

### Recovery domain
`src/recovery/**` is a multi-layer scoring pipeline: raw sample aggregation → `recoveryScoringEngine`/`computeRecoveryScores` → confidence/semantic/interpretation layers → `recoveryPresentation`/`recoveryDisplayState` for UI consumption, plus an AI insight layer (`aiInsightGenerator.ts`). `src/app/runtime/useRecoveryDomainRuntime.ts` and `legacyRecoveryReadModelBoundaries.ts` wire this into the app shell — check those before changing recovery data shapes, since older read models are bridged explicitly rather than migrated.

### Persistence
`src/persistence/**` wraps `localStorage` access (namespaced keys, safe get/set, a full clear helper). `supabase/migrations/**` defines the remote Postgres schema (training plans, session logs, profiles — versioned, unique-constrained per user). `src/app/boot/repairPersistedStateOnBoot.ts` runs plan/state repair (via `normalizeTrainingPlan`) at app startup, before either persistence path is trusted.

## Aktuelle Roadmap
Lies vor jeder Arbeit an Phase 2 (Kalenderintegration) docs/roadmap.md.
Das dort dokumentierte Akzeptanzkriterium ist bindend, nicht der Chat-Verlauf.

## Projekt-Kontext (Anton)
Coding Agent: Cursor mit Composer (claude-sonnet oder GPT-4.1)
Test-Device: iPhone 13 (nie Simulator für device-kritische Fixes)

### Offene Punkte (MVP)
- Email-Verifizierung (kein `type=signup`-Branch im Deep-Link — bekannter Bug)
- Sign in with Apple
- Password Reset
- Onboarding-Plan-Qualität weiter verbessern
- AI Coach: funktioniert, aber Antwortqualität noch nicht optimal — kein Blocker mehr, weiter verbessern
- Account-Deletion Test
- `SUPPORT_EMAIL` in `src/features/settings/appInfo.ts` ist ein Platzhalter (`support@example.invalid`) — vor TestFlight echte Adresse eintragen (Hilfe & Feedback, Fehler melden, Datenexport anfordern)
- Strava-Integration: Backend komplett, On-Device-Test auf iPhone 13 noch offen

### Erledigt (nicht mehr offen)
- Long-Run-Cap 30%/33% ist als harter Code-Clamp umgesetzt, nicht mehr nur Prompt-Regel
- Privacy Policy Link ist im App-Store-Review-Flow eingebunden

### Post-TestFlight (jetzt NICHT anfassen, nur zur Info)
Garmin-Integration, Samsung/Android, kompletter UI/UX-Umbau, Settings-Umbau Schritte 4–7 (i18n/Systemsprache, Profil/HF-Zonen, Benachrichtigungen-Seite, Verbindungen-Zeilen), Triathlon-Erweiterung, Apple-Watch-Companion.

### Settings-Umbau (Branch `feat/settings-redesign`)
Schritte 1–3 sind vor TestFlight freigegeben: 1) Gerüst (Profilkarte, 6 Bereiche, Detailseiten), 2) Konto & Hilfe + Datenschutz & Daten, 3) Werkzeuge raus (Race Calculator, Teilen, Backup-Import, Debug-Buttons, Dark-Mode-Schalter). Schritte 4–7 folgen danach. Eigene Folge-Branches, nicht hier: vollständiger Datenexport, Trainingswoche bearbeiten, HF-Zonen überschreiben, KI-Einwilligung (`feat/ai-consent`).

## Workflow (Pflicht)
- Diagnose-first (keine Code-Änderung ohne vorherige Diagnose) → Fix-Vorschlag → `CI=false npm run build` → erst dann committen.
- Ein Auftrag pro Session/Branch, nicht mehrere Baustellen parallel — vermeidet Merge-Chaos.
- Completion-String am Ende jeder abgeschlossenen Aufgabe.
- Nach jedem Fix: `git add -A && git commit`, danach **git push nicht vergessen** — das wurde in der Vergangenheit öfter vergessen.
- Kein Merge zu `main` ohne explizite Freigabe.

## Live-Test-Setup
Lokaler Server für Chrome-Verifikation: `npm run start:full` (Frontend + Express-API :8787 gleichzeitig, nötig um den echten AI-Pfad zu testen statt nur Mock-Fallback).