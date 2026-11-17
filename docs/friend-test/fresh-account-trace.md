# Frisches Konto – Durchlauf am Code (W3, `fix/friend-test-hardening`)

Stand: 17.11.2026, Basis `origin/main` @ `78109aa`. Zeilenangaben beziehen sich auf `origin/main` (vor den Fixes).
Schwere: **hoch** = Freund sieht fremde/falsche Daten oder kommt nicht weiter · **mittel** = falscher Eindruck,
irreführender Text · **niedrig** = Kosmetik.

## Durchlauf

1. **Registrierung** (`src/components/AuthScreen.tsx`) → `signUp` mit `emailRedirectTo` (`src/lib/supabase/auth.ts`),
   danach `clearMarathonLocalStorage()` + `signOut()` und Hinweis „Bestätigungs-Mail".
2. **Bestätigung per Deep Link** `myrace://auth/confirm#access_token=…` → `src/index.tsx` `appUrlOpen` →
   `supabase.auth.setSession` → `AuthContext.applySessionUser` (1,5-s-Nachprüfung von `email_confirmed_at`).
3. **Wizard** (`src/components/Onboarding.tsx`) erscheint, sobald Plan und Profil geladen sind
   (`AppMain.tsx` `showOnboarding`, `needsOnboarding`). Plan-Kern lokal/Server.
4. **KI-Einwilligung** (`AiConsentSheet`) kommt im Code **nach** dem Wizard (`aiConsentSheetVisible` verlangt
   `!showOnboarding`) — nicht davor wie im Auftrag skizziert. Kein Fehler: der Plan-Kern braucht keine Einwilligung.
5. **Plan → Heute/Woche**, **erste Einheit erledigen** (`saveModalEntry` / `quickCompleteSession`, Apple Health über
   `applyAppleHealthTrainingSync`), **Anstrengungsfrage** (`RpePromptCard`, `pickRpePromptSession`), **Coach**
   (`/api/ai` → `api/_lib/coachHandlers.js`).
6. **Abmelden → anderes Konto** auf demselben Gerät (`runSignOut`, `AuthContext`).

## Befunde

| # | Datei:Zeile (main) | Befund | Schwere | Status |
|---|---|---|---|---|
| 1 | `src/contexts/AuthContext.tsx:75,107` | Kontowechsel nach **abgelaufener Sitzung** (Token weg, Abmelden auf anderem Gerät): `lastUserIdRef` ist dann `null`, das Löschen griff nicht — Konto B las Plan, Logs, Preferences, Zielzeit von Konto A aus dem localStorage. | hoch | **behoben** `4da3eb2`: Gerät merkt sich den Besitzer der lokalen Daten (`src/persistence/storageOwner.ts`), anderes Konto → vor dem ersten Lesen löschen. Bestandsgeräte ohne Besitzer: nur eintragen. Test `storageOwner.test.ts`. |
| 2 | `src/persistence/clearMarathonLocalStorage.ts:8` | Abmelden ließ Sync-Anker liegen (`appleHealthAnchors`, `calendarSyncAnchors`, `calendarImportConnected`, `myrace-checkin-reminder`). Konto B holte über den Anker von A nur Workouts seit A's letztem Sync — ältere Läufe fehlten dauerhaft. | hoch | **behoben** `4da3eb2` (Liste `ACCOUNT_BOUND_EXTRA_KEYS`), Test wie 1. |
| 3 | `src/index.tsx:90` | Kontowechsel **ohne** Abmelden (Bestätigungslink von Konto B, während A angemeldet ist): AppMain blieb gemountet, React-State von A (Plan, Logs) blieb, ein leerer Remote-Plan von B überschrieb ihn nicht. | mittel | **behoben** `02a984e`: `<AppMain key={user.id} />`. Test `appMainKeyedByUser.test.js`. |
| 4 | `src/AppMain.tsx:1181` | Ohne eigenen Plan startet AppMain mit dem eingebauten **Warschau-Demo-Plan** („Ruhetag / Anreise Warschau", Z. 651), bis Supabase antwortet — ein frisches Konto sah kurz fremde Einheiten, bevor der Wizard kam. | mittel | **behoben** `072f889`: `FreshAccountBootCover` deckt in dieser Zeit ab (nur ohne eigenen Plan). Test `FreshAccountBootCover.test.tsx`. Der Demo-Plan selbst bleibt (Altpfade hängen daran). |
| 5 | `src/components/AuthScreen.tsx:159,188,194` | Supabase-Fehler roh auf Englisch („Invalid login credentials", „User already registered", „Password should be at least 6 characters"). | mittel | **behoben** `326e436` (`authErrorMessages.ts`). Test `authErrorMessages.test.ts`. |
| 6 | `src/lib/supabase/auth.ts:5` | Bestätigungs-/Reset-Link zeigte auch im **Browser** auf `myrace://` → im Web lief die Bestätigung ins Leere. | mittel (Web) | **behoben** `326e436`: `getAuthEmailRedirectTo()` = eigene Adresse im Browser. **Anton:** Web-Adresse in Supabase → Auth → Redirect URLs eintragen. Test wie 5. |
| 7 | `AuthScreen.tsx` Bestätigungs-Hinweis | Öffnet die Freundin die Mail am Laptop, bestätigt Supabase zwar, die App merkt es aber nicht. | niedrig | **behoben** (Hinweis „Am besten auf diesem Gerät … melde dich danach hier an"). |
| 8 | `src/AppMain.tsx:1309` + `profilesService.ts` | **Zielzeit** liegt nutzerweit im Profil; auf frischem Gerät (kein Besitzer im `planOwnedPreferences`-Store) griff die Profil-Zielzeit — auch wenn sie zu einem anderen Plan gehört. | hoch (Backlog a) | **behoben** `b7125b1`: `TrainingPlanV2.meta.goal`, gesetzt im Wizard, nachgetragen sobald die Preferences zum Plan gehören, gespeichert per Zeilen-ID (`updateTrainingPlanGoalMeta`). Liest vor dem Profil; Profil bleibt Rückfall. Tests `planGoalMeta.test.tsx`. |
| 9 | `api/_lib/coachHandlers.js:688,953` | Coach-Text „**morgen** beim langen Lauf **warst** du schon gefordert": Server leitete „heute" aus dem UTC-Zeitstempel ab (nachts 0–2 Uhr DE = Vortag → die Einheit von gestern stand als „Nächste/heutige Einheit" im Kontext); kein „Heute ist …", kein Tagesabstand, erledigte Workouts nur als Session-ID. | mittel (Backlog b) | **behoben** `dfee447`: `todayYmd` vom Gerät, `relativeDay`/`inDays`/`daysAgo` je Einheit, „Heute ist Montag, …", erledigte Workouts mit Tag, Zeitform-Regel im Prompt. Test `coachHandlersDayReference.test.js`. Ob das Sprachmodell nie wieder danebenliegt, ist nicht garantierbar — die Fehlerquelle im Kontext ist weg. |
| 10 | `src/ai/intents/extractReplaceWorkoutIntent.ts:148,200` | Chat „Ersetze … **am 3. Januar**": Jahr aus dem UTC-String bzw. fest **2026**, kein Vorrollen → 03.01.2026 (Vergangenheit), keine Einheit gefunden. Volle Monatsnamen August/September/November/Dezember fehlten. | mittel (Backlog c) | **behoben** `96540b3`: `nextOccurrenceYmd` (`src/core/time/sessionDate.ts`); `resolveSwap` nutzt denselben Helfer (31. April rollt nicht mehr in den Mai). Tests `chatDateYearBoundary.test.ts` (eingefrorene Uhr, Silvester 00:30). |
| 11 | `src/components/MarathonPredictionCard.tsx:56` | Prognosekarte zeigt fest „Unter 3:00" / „Unter 2:50" (Antons Ziele) — für eine 4:00-Läuferin „0 %". | mittel | **behoben** `4d3401d`: Marken nur, wenn die Zielzeit ≤ Marke + 15 min. ENTSCHEIDUNG markiert. Test `MarathonPredictionCard.marks.test.tsx`. |
| 12 | `src/lib/ai/coachRacePrediction.ts:422` | Lokaler Coach (Rückfall/ohne KI) rechnet immer gegen **Sub-3h** („Um Sub-3h zu erreichen …"). | mittel | **behoben** `4d3401d`: Bezug ist die eigene Zielzeit, ohne Zielzeit kein Zielbezug. Test in `coachRacePrediction.test.ts`. |
| 13 | `src/features/settings/appInfo.ts:9` | `SUPPORT_EMAIL` fester Platzhalter. | hoch (TestFlight) | **behoben** `63ebb35`: `REACT_APP_SUPPORT_EMAIL`, Platzhalter nur als Rückfall. Test `supportEmail.test.ts`. |
| 14 | Einstellungen → App | Im **Browser** stand der Schalter „Trainings-Erinnerung", der nichts tut (keine lokalen Notifications im Web). | niedrig (Web) | **behoben** `b363dba`/`f3e834c`: Hinweis statt Schalter. Test `notificationService.web.test.ts`. |
| 15 | `AppMain.tsx` Hauptscrollbereich | Scroll-Position blieb beim Tab-Wechsel stehen (Einstellungen gescrollt → Coach mitten im Inhalt). | niedrig | **behoben** `8356e4a` (`useResetScrollOnViewChange`). Test dazu. |
| 16 | `Onboarding.tsx:214,833` u. a. | Wizard-Chips, Zurück-Button, Fortschrittsbalken im alten Navy/Blau. | niedrig | **behoben** `f167396` (Tokens). Quelltext-Test `Onboarding.tokens.test.ts`. |
| 17 | `Onboarding.tsx:361` | „Bitte Renndatum eingeben." steht sofort, bevor etwas eingegeben wurde. | niedrig | **offen, begründet:** der bestehende Test `Onboarding.planRequired.test.tsx:35` verlangt genau dieses Verhalten („Hinweis sichtbar"). Tests werden nicht abgeschwächt — Anton entscheidet, ob der Test angepasst wird. |
| 18 | `src/components/AppTour.tsx` | „Tour gesehen" liegt geräteweit in `@capacitor/preferences` — ein zweites Konto auf demselben iPhone bekommt die Tour nicht. | niedrig | offen (selten; bewusst nicht im Löschpfad, weil Preferences nativ über Neuinstallationen bleiben). |
| 19 | `api/_lib/coachHandlers.js` Systemprompt | „Du bist ein persönlicher **Marathon**trainer" auch für 10-km-/HM-Pläne; der lokale Prognosetext sagt „für deinen Marathon". | niedrig | offen (Prompt-Änderung → Coach-Qualität separat prüfen). |
| 20 | `src/components/AuthScreen.tsx` | Anmeldeseite noch im alten Navy-Stil (Hex-Farben), nicht im Design-System. | niedrig | offen (UI-Umbau ist laut CLAUDE.md Post-TestFlight). |
| 21 | Profil → „Bisheriger Marathon-PR" | Fragt nur Marathon-PR; für 10-km-Läufer ohne Bezug. | niedrig | offen. |
| 22 | `AppMain.tsx` Wochen-Tausch `planGoal: "marathon"` (Z. 2674) | Fester Wert — geprüft: ist nur der Validierungsmodus (`ValidationContext.planGoal`), kein Nutzerziel. | — | kein Fehler. |
| 23 | `clearMarathonLocalStorage.ts` (Befund 2) | **Risiko, bewusst so gelassen:** Abmelden löscht auch die Kalender-Verbindung (`calendarImportConnected`, `calendarSyncAnchors`) und die Check-in-Erinnerung (`myrace-checkin-reminder`). Meldet sich **dasselbe** Konto wieder an, muss es den Kalender in den Einstellungen neu verbinden und die Check-in-Erinnerung neu einschalten; die Termine in Supabase bleiben erhalten. Die sichere Richtung: Kein anderes Konto übernimmt ungefragt die Kalender-Termine des Geräts. Für die Check-in-Erinnerung je Person (wie bei den Nutzungsdaten) müsste die Speicherung in `notificationService.ts` auf die Nutzer-ID umgestellt werden — nicht trivial, deshalb offen. | niedrig | offen (dokumentiert) |
| 24 | Nachprüfung W3 | Die Wahl „Nutzung zählen" lag geräteweit in der Löschliste: wer ausschaltete und sich ab- und wieder anmeldete, wurde wieder gezählt. | hoch | **behoben** `81829cb`: `marathonUsageEventsEnabled:<userId>`, übersteht das Abmelden. Test in `usageEvents.test.ts`. |
| 25 | Nachprüfung W3 | `usePlanGoalSync`: Eine veraltete lokale Zielzeit konnte beim Öffnen `meta.goal` überschreiben; bei fremdem Besitzer wurden Ziel und Besitzer übernommen. Der Nachtrag las und schrieb den ganzen Plan ohne Schutz vor einem gleichzeitigen Speichern. | mittel | **behoben** `28d5269`, `5ff82d4`: Ziel nur bei unbekanntem Besitzer übernehmen; schreiben nur, wenn `meta.goal` fehlt oder nach echter Eingabe (`noteGoalInput`); vor dem Schreiben frisch lesen, Nachtrag nur ohne Ziel, Update nur bei unverändertem `updated_at`. Restrisiko: Speichert die App in derselben Sitzung später einen Plan-Stand ohne das Ziel, fehlt es wieder — dann trägt der nächste Durchlauf es erneut nach. |
| 26 | Nachprüfung W3 | Boot-Abdeckung ohne Höchstdauer: Antwortet Supabase nicht, blieb die Fläche stehen. | mittel | **behoben** `6a2bb0f`: höchstens 10 s, beim Abmelden sofort weg. Test mit Fake-Timer. |
| 27 | Nachprüfung W3 | Lokaler Coach: Eine HM-/10-km-Zielzeit wurde als Marathonziel gelesen („2:29/km Marathonpace"). | mittel | **behoben** `f18cc20`: Zielbezug nur bei Marathon-Rennen im Plan. Test mit HM-Ziel 1:45:00. |
| 28 | Nachprüfung W3 | Apple-Health-`session_completed` vor `logsRemoteReady`: Nach dem Anmelden zählten alte Einheiten als neu erledigt. | niedrig | **behoben** `5d4eda1`. Test in `usageEvents.test.ts`. |

## Web-Fallback (Browser, Vercel)

Geprüft: alle nativen Plugins sind entweder dynamisch importiert (`@capgo/capacitor-health`,
`@ebarooni/capacitor-calendar`, `@capacitor/browser`, `@capacitor/haptics`) oder per `Capacitor.isNativePlatform()` /
`getPlatform() === "ios"` abgesichert (Keyboard, LocalNotifications, Apple-Health-Sync, Kalender-Resync, Strava-Connect).
Einstellungen → Verbindungen zeigt im Web „nur in der iOS-App". `@capacitor/preferences` und `@capacitor/app`
(`getInfo` nur nativ) haben Web-Implementierungen. Grundablauf Registrierung → Wizard (Kalender-Schritt fällt auf
Presets zurück) → Plan → Heute/Woche → Einheit erledigen → Coach geht ohne native Plugins.
Behoben: Befund 6 (Bestätigungslink) und 14 (Erinnerungs-Schalter). Nicht im Browser getestet (kein Gerät/Browser
in dieser Sitzung) — **Anton:** einmal auf der Vercel-Preview durchklicken.

## Für Anton vor dem Freundes-Build

- Vercel/iOS-Build: `REACT_APP_SUPPORT_EMAIL` setzen (sonst Platzhalter, Mail-Rückfälle gehen ins Leere).
- Supabase → Authentication → URL Configuration → Redirect URLs: `myrace://auth/confirm` **und** die Web-Adresse
  (z. B. `https://marathon-app-alpha.vercel.app/`).
- Migration `025_feedback_usage.sql` im SQL-Editor anwenden (Verifikations-SQL am Dateiende); bis dahin fällt
  Feedback auf `mailto:` zurück und Nutzungsdaten werden still verworfen.
