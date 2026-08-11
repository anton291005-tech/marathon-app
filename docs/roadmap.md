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

### 6. Vorher/Nachher-Diff-Screen
**Ziel:** Nach Kalender-Connect (Wow-Moment) im "Woche"-Screen zeigen, wie sich die Trainingswoche durch die Capacity-Engine verändert hat.
**Datei-Anker:** Live-Wochenansicht ist inline in `src/AppMain.tsx` (`activeView==="week"`, ab Zeile ~4160) — es gibt noch keine separate Woche-Komponente und keine Vorher/Nachher-Darstellung.
**Akzeptanzkriterium (Vorschlag, noch nicht final freigegeben):** Diff wird im Woche-Screen sichtbar (nicht nur im Chat), zeigt pro verschobener Session alten vs. neuen Tag, verletzt keine bestehende Wochenansicht-Struktur.

### 7. Post-Workout-Feedback-Loop zur Belastungsfaktor-Kalibrierung
**Ziel:** Regelbasierte Load-Scoring-Faktoren kalibrieren sich selbst über Post-Workout-Feedback nach (Bezug zu Schritt 5, das bereits "self-calibrating Load-Scoring" nennt — Schritt 7 ist die Feedback-Seite davon).
**Akzeptanzkriterium:** noch zu präzisieren (Platzhalter — aus Produkt-Roadmap-PDF nachzutragen).

### 8. Erklärbarkeits-UI ("Warum wurde das geändert?")
**Ziel:** Sichtbar machen, warum die Engine eine Session auf einen Tag gelegt hat (Ranking: Micro-Structure-Severity vor Capacity-Score vor Datum), inkl. Warnung bei unvermeidbarem Konflikt.
**Datei-Anker:**
- `assignSessionToBestCapacityDay.ts:21-29` liefert bereits `microStructureSeverity`, `warning`, `chosenTargetSessionId` — Basis für die Erklärbarkeits-UI vorhanden, aber **keine Runner-up-Kandidaten/-Scores** (nur der gewählte Tag) — für eine echte Ranking-Erklärung müsste der Rückgabetyp erweitert werden.
- Einziges bestehendes "Warum"-UI-Pattern (`DetailBlock title="Warum diese Einheit?"`) existiert nur in der toten `App.tsx:2553` (Legacy, nicht im Live-Pfad `AppMain.tsx`) — kein wiederverwendbares Live-Pattern.
- Die Chat-Bestätigungskarte im Live-Pfad ist `AiActionCard.tsx` (nicht `SwapConfirmationCard.tsx`, welches unbenutzter toter Code ist) — generisch, rendert nur Freitext-`items`, kein strukturiertes Alt/Neu- oder Warnungs-Feld. Andockmöglichkeit vorhanden, aber Erweiterung nötig.

## Harte Regel (nicht verhandelbar)
Wissenschaftliche Planqualität ist die Leitplanke. Kalender-Constraints optimieren nur INNERHALB der Trainingsplan-Regeln — sie dürfen diese niemals überschreiben. Bei Konflikt gewinnt immer die Trainingsplan-Regel, nicht der Kalender.

## Bekannte Blocker
- **Onboarding-Bug:** Onboarding erscheint fälschlich beim Hauptaccount bei localhost-Login trotz existierendem Plan. Gleiches Supabase-Projekt (`eeiakrybuxszmzlhlooj`) bestätigt — kein Dev/Prod-Trennungsproblem, also echter Bug. Onboarding auf dem Hauptaccount NICHT abschließen, bis diagnostiziert (Gefahr: überschreibt bestehenden Trainingsplan).
- **Strava On-Device-Test:** Backend/Registrierung fertig, OAuth-Flow auf iPhone 13 noch nicht durchgetestet (Safari-Handoff → Login → Deep Link `myrace://strava-connected` → Eintrag in `strava_connections`). Wartet auf verfügbares Lightning-Kabel — kein Blocker für Backend-Arbeit.

## Bekannte Testfehler (behoben)
Stand `CI=true npm test` (2026-08-11): alle 4 vorbestehenden Suiten (11 Einzeltests) wurden diagnostiziert und gefixt, `CI=true npm test` zeigt 85/85 Suiten, 536/536 Tests grün (inkl. 1 neuer Charakterisierungstest). `CI=false npm run build` läuft durch. Die Produkt-Roadmap-PDF nannte "18 vorbestehende Testfehler" — diese Zahl deckte sich nie mit den tatsächlichen 4 Suiten/11 Tests; **Diskrepanz bleibt ungeklärt** (evtl. PDF-Stand vor Fix-Commits, oder "18" zählte zusätzliche, aktuell übersprungene Tests mit).

| Suite | Fix | Commit |
|---|---|---|
| `appleHealthWorkoutSync.test.ts` (2) | `workoutToStored` (`src/healthRuns.ts`) normalisiert `distance`/`duration` → `distanceMeters`/`durationSeconds` und leitet `laps` aus `workoutEvents` (type `"lap"`/`3`) ab. War ein nie gebautes Feature, kein Regressions-Bug. | `c33287f` |
| `recoveryConfidenceLayer.test.ts` (3) + `recoveryPipeline.integration.test.ts` (5) | Zwei unabhängige Bugs, kein gemeinsamer Root Cause: (a) `computeDailyRecoverySeries` setzte `source`/`pointConfidence` nie — `recoverySummary.ts` fiel dadurch in Produktion still immer auf `"physio"` zurück; jetzt beide Werte aus bereits berechneten `coverage`/`overallConfidence` durchgereicht. (b) `computeRecoveryFallback7d` und `computeLoadOnlyHomeRecoveryScore0_100` waren fertig gebaut, aber nie importiert — jetzt in `getRecoveryDomainState` verdrahtet (nur im `hasMinData`-Fallback-Zweig, `hasPhysioData`-Gate bleibt bewusst hart, siehe bestehenden `recoveryDomainState.test.ts`-Fall). | `d2aced6` |
| `aiUncertaintyLanguage.test.ts` (1) | `buildRiskCoachMessage` (`mockBrain.ts`) liest jetzt `recoveryDomain.latent.uncertaintyTier` und hängt bei `"high"` einen Vorsicht-Hinweis an — Wording an `recoverySemanticLayer.ts` `certaintyLabelDe()` angelehnt. War eine Integrationslücke (Wortwahl existierte bereits im Recovery-Dashboard, war aber nie an den Chat-Coach-Pfad angebunden), kein zu strikter Test. Charakterisierungs-Gegenprobe (niedrige Unsicherheit → kein Zusatzsatz) ergänzt. | `cadfe2f` |

Keiner der 11 Fälle war eindeutig trivial (kein veralteter Snapshot-Wert) — alle brauchten echte Diagnose vor dem Fix, wie hier dokumentiert.

**Offener Nachschärfungspunkt (Test-Lücke, kein Bug):** `recoveryPipeline.integration.test.ts` Testfall "valid same-day inputs → numeric score shown consistently…" prüft `homeRecoveryScoreSource` nicht. Empirisch bestätigt: dieser Fixture-Fall (nur 1 Tag Daten) läuft über den `loadOnly`-Fallback (`source="loadOnly"`, nicht `"live"`), weil `hasMinData` bei nur 1 Tag scheitert und `computeRecoveryFallback7d` mangels ≥3 valider Tage ebenfalls `null` liefert. Test sollte um `expect(domain.homeRecoveryScoreSource).toBe("loadOnly")` ergänzt werden, damit explizit abgesichert ist, dass 1-Tag-Daten nie fälschlich als `"live"` markiert werden. Kein aktueller Fix nötig, nur Testschärfung für später.

## Cleanup-Kandidaten
Während der Recherche zu Schritt 6/8 als unbenutzt identifiziert — noch nicht gelöscht, nur dokumentiert, damit es nicht vergessen wird:
- `src/components/ai/SwapConfirmationCard.tsx` — nur vom eigenen Test (`AiCoachPanel.swapConfirm.test.tsx`) referenziert, kein Produktions-Import gefunden. Der echte Live-Pfad läuft über `AiActionCard.tsx`.
- `App.tsx:2553` (`DetailBlock title="Warum diese Einheit?"`) — Legacy-Datei, nicht im Live-Pfad (`AppMain.tsx`); einziges bestehendes "Warum"-UI-Pattern, aber tot. Relevant für Schritt 8, falls das Pattern reaktiviert statt neu gebaut werden soll.

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
