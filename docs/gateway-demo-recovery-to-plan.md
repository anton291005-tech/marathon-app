# Demo: Recovery-Signal → Plan-Anpassung (Gateway-Meeting 08.07.2026)

## Garantiert funktionierender Satz (Live-Coach, Claude Sonnet 4.6)

> **"Ich fühle mich krank"**

Getestet 5/5 über den echten `/api/ai`-Pfad (nicht Mock), sowohl bei neutralem
Recovery-Score (68/100) als auch bei niedrigem Recovery-Score (22/100,
Fatigue-Band) — die Illness-Erkennung ist rein textbasiert (`hasIllness` in
`api/_lib/coachHandlers.js`) und hängt **nicht** vom aktuellen `recoverySummary`
ab. Löst zuverlässig `adjust_plan_for_illness` mit korrekter Preview aus
(Titel "Vorgeschlagene Anpassung", 3 Items, Confirm "Ja, übernehmen" / Cancel
"Nein").

**Backup-Sätze** (ebenfalls 2/2 getestet, falls die erste Formulierung im Chat
schon genutzt wurde):
- "Ich bin krank, mir geht es richtig schlecht."
- "Ich habe Fieber und fühle mich komplett schlapp."

## Wichtig: NICHT "Der Plan ist mir gerade zu hart" für die Illness-Demo verwenden

Dieser Satz triggert reliable (5/5 getestet) — aber eine **andere** Action:
`boost_next_week_volume` (Preview "Plan diese Woche entlasten", reduziert
Tempo/Long-Run-Volumen), nicht `adjust_plan_for_illness`. Das ist inhaltlich
korrekt (Claude interpretiert "zu hart" als Lastproblem, nicht als Krankheit),
aber eine andere Preview/Aktion als im Task angenommen. Nach dem Fix unten ist
dieser Pfad ebenfalls demo-sicher — nur eben ein zweiter, eigenständiger Flow,
kein zweiter Trigger für dieselbe Action.

## Gefundene und gefixte Bugs (Diagnose vor Fix)

1. **`inferActionType()` in `api/_lib/coachHandlers.js`** hatte ein
   `if (rawAction === null) return null;` das den risikobasierten
   Fallback (`hasIllness/hasInjury/hasFatigue → adjust_plan_for_illness`)
   deaktivierte, sobald Claude **keinen** JSON-Action-Block lieferte (z. B.
   eine sympathische Rückfrage in Fließtext — das passiert bei einer knappen
   "Ich fühle mich krank"-Aussage ohne Kontext-Plan öfter). Ohne diesen Fix
   war der Trigger nicht zuverlässig, weil er komplett von Claudes spontaner
   Entscheidung abhing, das JSON-Format zu benutzen. Fix: früher Return
   entfernt, Fallback greift jetzt immer.
2. **`buildBoostNextWeekVolumePatches()` in `src/lib/ai/coachPlanMutations.ts`**
   clampte `pct` via `Math.max(5, pct)` — ein negativer (reduzierender) Wert
   von Claude (z. B. `pct: -20` für "Volumen reduzieren") wurde dadurch auf
   `+5` hochgezogen. Die Preview hätte "Volumen -20%" angezeigt, aber
   "Übernehmen" hätte tatsächlich das Volumen um +5% **erhöht** — ein
   Live-Demo-Worst-Case (Publikum sieht Reduktion, App tut das Gegenteil).
   Fix: Vorzeichen wird jetzt erhalten, nur der Betrag auf 5–35% geclamped;
   Titel/Beschreibung sagen jetzt korrekt "reduziert" bzw. "erhöht".

## Kein Seed-Testaccount nötig

Da der Illness-Trigger nachweislich unabhängig vom aktuellen
`recoverySummary`-Zustand ist (Punkt 3 der Diagnose, oben belegt), ist die
Demo **auf Antons echtem Account und iPhone reproduzierbar** — unabhängig
davon, wie sein Recovery-Score gerade steht. Kein separater Testaccount
notwendig.

## Wichtiger Infra-Hinweis für lokale Tests (nicht demo-relevant)

`server/index.js` lädt nur `.env` (nicht `.env.local`) über
`require("dotenv").config()`. Da im Projekt kein `.env` existiert, liefen
bisherige lokale Tests über `npm run start:full` **immer** über den
serverseitigen deterministischen Fallback, nie über die echte Claude-API —
ohne sichtbaren Hinweis darauf. Für echte lokale Tests: Keys vor dem Start
exportieren, z. B. `set -a; source .env.local; set +a; npm run start:api`.
Betrifft **nicht** die iPhone-Demo: Die App ruft laut `.env.production`
(`REACT_APP_AI_API_BASE`) direkt den deployten Vercel-Endpunkt auf, der seine
eigenen, korrekt gesetzten Env-Vars hat.

## Rollout-Hinweis

- Der `coachHandlers.js`-Fix wirkt sofort nach Deploy (Vercel), ohne
  App-Rebuild — die Chat-Logik läuft server-seitig, das Telefon ruft nur die
  API.
- Der `coachPlanMutations.ts`-Fix (Boost-Vorzeichen) ist Client-Code und
  landet erst im installierten iOS-Build nach `npm run build` (bereits
  gelaufen, `dist/` aktuell) + `npx cap sync ios` (bereits gelaufen) +
  Xcode-Rebuild auf dem iPhone. Nur relevant, falls die "zu hart"-Variante
  gezeigt wird — für den primären Illness-Satz ohne Bedeutung.
