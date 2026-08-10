# MyRace – Roadmap (lebendes Dokument)

> Dieses Dokument ist die Quelle der Wahrheit für Claude Code. Vor jeder Arbeitssitzung zu Phase 2 wird es gelesen — nicht per Copy-Paste-Prompt neu erklärt.

## Vision (kurz)
"Runna gibt dir einen Plan. MyRace gibt dir einen Coach." Kern-USP: kalender-/lebensplanungs-bewusste Trainingsplanung — die App baut Trainingswochen strategisch um reale Kalenderverpflichtungen (Job, Uni, Ehrenamt, Sport) statt nur um physiologische Signale.

## Aktuelle Phase: Phase 2 – Kalender-/Lebensintegration

## Abgeschlossen (Phase 1, Referenz)
- Strava-Integration Backend komplett: Migration `008_strava_connections.sql` (RLS aktiv), `stravaService.js`, `auth.js`/`callback.js`, `@capacitor/browser`-Trigger in Settings. On-Device-OAuth-Test auf iPhone 13 steht noch aus (aktuell kein Kabel verfügbar).
- AI Coach läuft auf Claude Sonnet 4.6 via `coachHandlers.js` (`callClaudeApi`) — bestätigt einziger aktiver Pfad. OpenAI gpt-4o-mini nur für `/api/ai/daily-coach` und `/api/onboarding/preferences-patches`.
- Prompt Caching + Context Trimming deployed (next14Days/last7Days/planSummary, logsLast10Days/healthRunsLast10Days).

## Nächste Schritte (Reihenfolge als Leitplanke, nicht als starres Skript)

### 1. `weekly_schedule_blocks` — Datenmodell + Migration
**Akzeptanzkriterium:** Tabelle in Supabase mit aktiver RLS, Migration idempotent anwendbar, lokale Tests grün, Schema deckt wiederkehrende und einmalige Termine ab.

### 2. Capacity Scoring pro Tag
**Akzeptanzkriterium:** Score-Funktion deterministisch und dokumentiert, Unit-Tests für Randfälle (voll ausgebuchter Tag, komplett freier Tag, Teilverfügbarkeit, Wochenend-Sonderfall).

### 3. Session Assignment Engine — abgeschlossen (`src/ai/mutations/assignSessionToBestCapacityDay.ts`)
**Akzeptanzkriterium:** Kann eine bestehende Trainingswoche unter neuen Kalender-Constraints umverteilen, ohne die Trainingsplan-Regeln zu brechen (siehe Harte Regel unten). Tests grün.

**Klarstellung (Stufe-1-Recherche, swapTrainingDays-Migration):** Frühere Formulierung "erweitert `swapTrainingDays`" war irreführend — Namenskollision zwischen totem `src/lib/ai/tools.ts`-Code (inzwischen entfernt) und dem echten, nutzerinitiierten 2-Tage-Chat-Swap (`AiCoachPanel.tsx` → `AppMain.tsx:handleSwapWorkoutsV2` → `trySwapWorkoutDatesInPlan`/`validateSwap`, `TrainingPlanV2`-Ebene). `assignSessionToBestCapacityDay` erweitert diesen Chat-Swap nicht; es ist die Grundlage für Schritt 4 (systeminitiierte N-Kandidaten-Auswahl bei einem Kalender-Trigger), arbeitet auf `AiPlanWeek`/`PlanPatch` und ist noch nicht an einen Live-Einstiegspunkt angebunden.

### 4. iOS Calendar Import via EventKit + Onboarding-Presets
**Blockiert von:** Onboarding-Bug-Diagnose (siehe unten) — nicht vor dessen Fix beginnen, da hier Onboarding-Presets ergänzt werden.

### 5. Load-Tag-Presets-Library + self-calibrating Load-Scoring
Regelbasiert, transparent, kalibriert sich über Post-Workout-Feedback selbst nach.

## Harte Regel (nicht verhandelbar)
Wissenschaftliche Planqualität ist die Leitplanke. Kalender-Constraints optimieren nur INNERHALB der Trainingsplan-Regeln — sie dürfen diese niemals überschreiben. Bei Konflikt gewinnt immer die Trainingsplan-Regel, nicht der Kalender.

## Bekannte Blocker
- **Onboarding-Bug:** Onboarding erscheint fälschlich beim Hauptaccount bei localhost-Login trotz existierendem Plan. Gleiches Supabase-Projekt (`eeiakrybuxszmzlhlooj`) bestätigt — kein Dev/Prod-Trennungsproblem, also echter Bug. Onboarding auf dem Hauptaccount NICHT abschließen, bis diagnostiziert (Gefahr: überschreibt bestehenden Trainingsplan).
- **Strava On-Device-Test:** Backend/Registrierung fertig, OAuth-Flow auf iPhone 13 noch nicht durchgetestet (Safari-Handoff → Login → Deep Link `myrace://strava-connected` → Eintrag in `strava_connections`). Wartet auf verfügbares Lightning-Kabel — kein Blocker für Backend-Arbeit.

## Out of Scope bis TestFlight
UI/UX-Redesign, Triathlon-Erweiterung, Android, Apple-Watch-Companion — nicht anfassen, auch nicht "nebenbei".

## Datei-Anker (Referenz für Claude Code)
- `assignSessionToBestCapacityDay.ts` (`src/ai/mutations/`) — Session Assignment Engine für Schritt 4, N-Kandidaten-Auswahl; **nicht** dasselbe wie der Chat-Swap (`AiCoachPanel`/`handleSwapWorkoutsV2`/`trySwapWorkoutDatesInPlan`)
- `claudePlanGenerator.js` / `claudePlanService.ts` — Plan-Gen, Option A phasiert (Haiku-Phasenaufrufe + Sonnet für Struktur)
- `coachSystemPrompt.ts` — Coach-Persona/Regeln, darf durch Kalenderlogik nicht verwässert werden

## Wie Claude Code dieses Dokument benutzt
1. **Vor jeder neuen Session zu Phase 2:** Dieses Dokument + betroffenen Code lesen (Plan Mode), selbst herleiten was als Nächstes sinnvoll ist, Plan mit konkretem Akzeptanzkriterium vorschlagen, auf Freigabe warten.
2. **Nach Freigabe:** `/goal` mit dem Akzeptanzkriterium des jeweiligen Schritts setzen, Auto Mode aktivieren, eigenständig arbeiten lassen.
3. **Nach Abschluss:** Subagent-Review gegen dieses Dokument anstoßen (`.claude/agents/plan-reviewer.md`).
4. **Bei Scope-Änderung:** Dieses Dokument aktualisieren, bevor weitergearbeitet wird — nicht nur im Chat erwähnen.
