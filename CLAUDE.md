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
- **Daily coach** (`POST /api/ai/daily-coach`, `api/_lib/coachHandlers.js` `handleDailyCoach`) and **onboarding preferences patches** (`api/_lib/onboardingPreferencesPatches.js`) still call **OpenAI** (`OPENAI_MODEL`/`gpt-4o-mini` default) via `OPENAI_API_KEY`.
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

## Projekt-Kontext
MyRace App – React + TypeScript + Capacitor (iOS) + Express :8787 + Supabase + Claude API + OpenAI

Coding Agent: Cursor mit Composer
Build-Check: CI=false npm run build
Test-Device: iPhone 13

Stack:
- Frontend: React/TypeScript, CRA
- Backend: Express :8787, Proxy via setupProxy.js (/api/* → :8787)
- DB: Supabase (7 Tabellen, RLS aktiv)
- Plan-Gen: Option A (phased Claude generation) — Haiku für Phasen-Calls, Sonnet für den Structure-Call
- AI Coach Chat: primär Claude Sonnet 4.6, OpenAI nur noch für daily-coach und preferences-patches

Offene Punkte (MVP in ~1 Monat):
- Email-Verifizierung
- Sign in with Apple
- Password Reset
- Onboarding Plan-Qualität
- Plan-Generation-Qualität
- Account-Deletion Test

Workflow: Diagnose-first → Fix → CI=false npm run build → erst dann committen.
Nach jedem Fix: git add -A && git commit, danach git push nicht vergessen.

## Projekt-Kontext (Anton)
Coding Agent: Cursor mit Composer
Test-Device: iPhone 13

Offene Punkte (MVP in ~1 Monat, TestFlight Mitte Juli):
- Email-Verifizierung (kein dedizierter type=signup-Branch im Deep-Link — bekannter Bug)
- Sign in with Apple
- Password Reset
- Onboarding Plan-Qualität
- Plan-Generation-Qualität (Long-Run-Cap 30%/33% noch kein harter Code-Clamp)
- Account-Deletion Test

Workflow: Diagnose-first (keine Code-Änderung) → Fix-Vorschlag → CI=false npm run build → erst dann committen.
Nach jedem Fix: git add -A && git commit, danach git push nicht vergessen — das wurde in der Vergangenheit öfter vergessen.

## Projekt-Kontext (Anton)
Coding Agent: Cursor mit Composer
Test-Device: iPhone 13

Offene Punkte (MVP in ~1 Monat, TestFlight Mitte Juli):
- AI Coach antwortet nicht (Bug, höchste Priorität)
- Email-Verifizierung (kein type=signup-Branch im Deep-Link)
- Privacy Policy Link (App-Store-Review-Blocker)
- Sign in with Apple
- Password Reset
- Onboarding Plan-Qualität
- Plan-Generation-Qualität
- Account-Deletion Test

Größere Post-TestFlight-Punkte (NICHT jetzt anfassen, nur zur Info):
Garmin-Integration, Samsung/Android, kompletter UI/UX-Umbau, Settings-Umbau auf Runna/Strava-Niveau, Triathlon-Erweiterung.

## Workflow (Pflicht)
Diagnose-first (keine Code-Änderung) → Fix-Vorschlag → CI=false npm run build → erst dann committen.
Ein Auftrag pro Session/Branch, nicht mehrere Baustellen parallel — vermeidet Merge-Chaos.
Nach jedem Fix: git add -A && git commit, danach git push nicht vergessen.

## Live-Test-Setup
Lokaler Server für Chrome-Verifikation: npm run start:full (Frontend + Express-API :8787 gleichzeitig, 
nötig um den echten AI-Pfad zu testen statt nur Mock-Fallback).
