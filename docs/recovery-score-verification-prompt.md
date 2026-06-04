# Recovery Score (1–100) — Verification & Regression Prompt

Use this document **after** implementation (or before release) to confirm the Home Screen **Recovery Score** is correct across UI, data logic, and architecture. Record **PASS / FAIL / FLAG** per section; any **FAIL** on a critical item means the feature is **not production-ready**.

---

## 1. Feature check (UI verification)

**Instructions:** Open the app on the **Home** screen (first load, cold start if possible).

Verify:

| # | Check | PASS / FAIL |
|---|--------|-------------|
| 1.1 | A row/card labeled **“Recovery Score”** exists | |
| 1.2 | It appears **directly below** **“Plan & Umsetzung”** (same parent block as “Vorbereitungs Einschätzung”) | |
| 1.3 | **Visual parity:** same control pattern as Plan row — full-width transparent button, same label typography (`uppercase`, letter-spacing), same `borderBottom` separator, same primary value size (`17`, `fontWeight: 800`), same `X / 100` format | |
| 1.4 | **Immediately visible** on first load — **not** inside the “Mehr anzeigen” expanded region, **no** collapse required, **no** modal | |
| 1.5 | Displayed value is a **single integer** in **1–100** (shown as `{n} / 100`) | |
| 1.6 | Home layout: no broken grid, no overlap, no obvious spacing regression vs. prior builds | |

**FAIL UI integration** if any of **1.1–1.6** is false.

**Code pointers (optional):** `src/App.tsx` — search `Recovery Score` and `Plan & Umsetzung` inside the “Vorbereitungs Einschätzung” block.

---

## 2. Data window verification (critical)

**Instructions:** Inspect the **domain layer**, not the UI.

Verify:

| # | Check | PASS / FAIL |
|---|--------|-------------|
| 2.1 | Scoring uses a **rolling 7 calendar days ending today**: inclusive range **[today − 6 days, today]** | |
| 2.2 | **No** calendar-week aggregation for this metric (no “current training week” / `wIdx` / week rollups as the window) | |
| 2.3 | **No** Monday anchor, **no** `weekStart`, **no** week grouping for this KPI | |

**Validation steps:**

1. Open `src/recovery/homeRecoveryScore.ts` and confirm the window is built with **`last7CalendarDays(now)`** from `src/recovery/recoveryCalendarUtils.ts` (rolling dates from `today`, not plan week).
2. Grep the Home Recovery path for week anchors — there must be **no** use of `buildRecoveryWeekRollups`, `wIdx`, or Monday-based helpers **inside** `computeHomeRecoveryScore` or its direct inputs for the window definition.

**FAIL** if:

- Calendar week logic drives this score’s window, **or**
- Any dependency on Monday / `weekStart` / static week grouping **for this metric**.

**Note:** Other features may still use week-based rollups (e.g. Performance / Recovery Verlauf). That is **not** a failure **unless** the Home Recovery Score reuses that as its window.

---

## 3. Partial data behavior

Verify:

| # | Check | PASS / FAIL |
|---|--------|-------------|
| 3.1 | With **fewer than 7** days of `DailyRecoveryComputed` rows in the rolling window, the score **still** computes | |
| 3.2 | **No** `null` / `undefined` score surfaced to UI for “insufficient days” | |
| 3.3 | **No** crash; **no** empty placeholder where the integer should be | |
| 3.4 | Value remains in **1–100** | |

**Implementation intent:** Missing days in the series use a **neutral prior** (see `weightedLatentFromWindow` in `homeRecoveryScore.ts`) so the denominator stays well-behaved.

**FAIL** if the score disappears, errors, or shows a non-numeric placeholder when data is sparse.

**Automated:** `src/recovery/homeRecoveryScore.test.ts` — “sparse series” case.

---

## 4. Score consistency check

Verify:

| # | Check | PASS / FAIL / FLAG |
|---|--------|-------------------|
| 4.1 | Day-to-day changes are **reasonable** (no huge jumps without meaningful log/health/training changes) | |
| 4.2 | Score **updates** when relevant data changes (e.g. new completed session, updated recovery daily rows after sync) | |
| 4.3 | **Single pipeline:** Home score is derived from **`computeDailyRecoverySeries`** output + existing load/adherence helpers — **no** second latent recovery engine | |

**Cross-check:**

- `computeHomeRecoveryScore` should **only** combine existing signals (`smoothedLatentR`, `recoveryConfidence`, `buildDailyTrainingLoadByDate`, plan/logs for execution ratio).
- Performance tab / coach may expose related latent state; directionally they should not contradict wildly without cause.

**FAIL** if a **duplicate** scoring pipeline exists for the same purpose.

**FLAG** (investigate) if the score swings sharply with **no** input change.

---

## 5. Architecture integrity check

Verify:

| # | Check | PASS / FAIL |
|---|--------|-------------|
| 5.1 | Score is part of the **Home projection**: computed in React via **`useMemo`** from domain outputs (`recoveryComputed.series`, `plan`, `logs`), not inline JSX math | |
| 5.2 | Same **projection layer** as Plan adherence: both feed **`getAiContext`** → **`planIntelligence`** (see `buildCurrentAiContext` in `App.tsx`; `homeRecoveryScore` on `AiPlanIntelligence` in `src/lib/ai/types.ts`) | |
| 5.3 | Core logic lives in **`src/recovery/homeRecoveryScore.ts`** (domain), **not** only in components | |

**FAIL** if:

- The integer is computed **only** in JSX with local ad-hoc formulas, **or**
- `planIntelligence` / AI context is bypassed while claiming parity with Plan KPIs, **or**
- A separate untracked scoring service duplicates latent recovery.

---

## 6. Refresh / sync behavior

Verify:

| # | Check | PASS / FAIL / FLAG |
|---|--------|-------------------|
| 6.1 | After new **training** or **recovery** data, revisiting Home (or re-render) shows an **updated** score when dependencies change | |
| 6.2 | `useMemo` deps for Home Recovery include **`recoveryComputed.series`** and **`logs`** (and plan patches if plan affects load/execution) — same refresh “family” as other recovery-derived state | |
| 6.3 | No **extra** caching layer that stalemates the score beyond other Home KPIs | |

**FAIL** if new data clearly updates latent series but Home Recovery stays frozen.

**FLAG** if Home Recovery updates noticeably slower than other metrics without justification.

---

## 7. Final acceptance criteria

**PASS (production-ready) only if ALL are true:**

- [ ] Visible on Home **under** “Plan & Umsetzung”
- [ ] Uses the **same** card/button row UI system as that row
- [ ] Based on **rolling 7-day** window **[today−6, today]**, **not** weekly cycle
- [ ] Works with **partial** data (always **1–100**)
- [ ] Integrated via **`homeRecoveryScoreProjection` + `computeHomeRecoveryScore`** and **`planIntelligence.homeRecoveryScore`**
- [ ] **No** parallel duplicate scoring system for latent recovery
- [ ] Updates when **`recoveryComputed.series`** / **`logs`** (and plan) change

If **any** critical condition fails → feature is **NOT production-ready**.

---

## Quick grep helpers (reviewer)

```bash
# Window implementation
rg "computeHomeRecoveryScore|last7CalendarDays" src/recovery/homeRecoveryScore.ts src/App.tsx

# Ensure Home score is not wired to week index
rg "homeRecoveryScore|computeHomeRecoveryScore" src/App.tsx
rg "wIdx|buildRecoveryWeekRollups" src/recovery/homeRecoveryScore.ts  # should be no matches in the latter
```

---

## Copy-paste prompt for an AI or reviewer

> Verify the Recovery Score on the Home screen: (1) UI — “Recovery Score” immediately below “Plan & Umsetzung”, same styling, 1–100, no expand/collapse. (2) Data — `computeHomeRecoveryScore` + `last7CalendarDays` only; no Monday/weekStart/week rollups for this metric. (3) Partial data — always a number 1–100. (4) One pipeline from `computeDailyRecoverySeries`, no duplicate engine. (5) `useMemo` + `planIntelligence.homeRecoveryScore` in `App.tsx` / `getAiContext`. (6) Updates with `recoveryComputed.series` and `logs`. Mark FAIL if any critical check fails.
