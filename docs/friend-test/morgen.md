# Morgen – Abhakliste für Anton

Reihenfolge einhalten. Ausführliche Erklärungen stehen in `docs/friend-test/testflight.md`, die Abschnittsnummern stehen in Klammern. Den Bericht findest du in `docs/friend-test/REPORT.md`.

## 0. Entscheiden (10 min)

- [ ] Die **Entscheidungen zum Absegnen** in `REPORT.md` durchgehen. Wenn du etwas anders willst, gib es vor dem Merge an mich zurück.
- [ ] Wie soll die Rennwoche im Schicht-Modus laufen?
  - Variante a: nur Verschiebungen auf frühere Tage, so ist es jetzt.
  - Variante b: gar keine Vorschläge, so steht es in Spec §8.7.

## 1. Migrationen 023–025 (Supabase → SQL Editor)

Jede Datei mit ihrem ganzen Inhalt einfügen und auf **Run** klicken, genau in dieser Reihenfolge. Alle drei sind idempotent, ein zweiter Lauf schadet also nicht.

- [ ] `supabase/migrations/023_shift_mode.sql`
- [ ] `supabase/migrations/024_strava_sync_state.sql`
- [ ] `supabase/migrations/025_feedback_usage.sql`
- [ ] Prüfabfrage (jede Zeile muss `ok = true` zeigen):

```sql
select 'shift_entries' as t, to_regclass('public.shift_entries') is not null as ok
union all select 'user_feedback', to_regclass('public.user_feedback') is not null
union all select 'usage_events', to_regclass('public.usage_events') is not null
union all select 'profiles.works_shifts', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='works_shifts')
union all select 'profiles.shift_defaults', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='shift_defaults')
union all select 'strava_connections.last_synced_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='strava_connections' and column_name='last_synced_at')
union all select 'strava_connections.last_sync_status', exists (select 1 from information_schema.columns where table_schema='public' and table_name='strava_connections' and column_name='last_sync_status')
union all select 'strava_connections.disconnected_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='strava_connections' and column_name='disconnected_at')
union all select 'RLS an (3 Tabellen)', (select bool_and(relrowsecurity) from pg_class where oid in ('public.shift_entries'::regclass,'public.user_feedback'::regclass,'public.usage_events'::regclass));
```

- [ ] Policies prüfen:
  `select tablename, policyname, cmd from pg_policies where tablename in ('shift_entries','user_feedback','usage_events') order by 1,2;`
  Erwartet wird:
  - `shift_entries`: `user_own_data`
  - `user_feedback`: je eine Policy für INSERT und SELECT, nichts weiter
  - `usage_events`: je eine Policy für INSERT und SELECT, nichts weiter

## 2. Supabase Auth (testflight.md 3.2)

- [ ] **Mailversand.** Ohne diesen Schritt kommen die Freunde nicht ins Konto. Zwei Wege:
  - Weg A: Authentication → Emails → SMTP Settings → eigenen Anbieter eintragen.
  - Weg B: Authentication → Sign In / Providers → Email → **Confirm email** ausschalten. Gilt nur für den Test, danach wieder einschalten.
- [ ] Authentication → URL Configuration:
  - **Redirect URLs** enthält `myrace://auth/confirm` und `https://marathon-app-alpha.vercel.app/`.
  - **Site URL** ist `https://marathon-app-alpha.vercel.app`.
- [ ] Testkonto für Apples Beta-Prüfung anlegen: Users → Add user, dabei Auto Confirm einschalten.

## 3. Vercel-Variablen (Projekt → Settings → Environment Variables, Production + Preview)

- [ ] `REACT_APP_SUPPORT_EMAIL` = deine echte Support-Adresse. Diese Variable ist neu. Ohne sie bleibt der Platzhalter `support@example.invalid`.
- [ ] Prüfen, ob die vorhandenen Variablen gesetzt sind:
  - `ANTHROPIC_API_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `REACT_APP_SUPABASE_URL`
  - `REACT_APP_SUPABASE_ANON_KEY`
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `PLAN_CORE_MODE=on`
- [ ] `STRAVA_REDIRECT_URI` muss exakt `https://marathon-app-alpha.vercel.app/api/strava/callback` lauten, mit **callback** in der Einzahl. In `.env.local` steht fälschlich `/callbacks`, das bitte auch korrigieren.
- [ ] `REACT_APP_SHIFT_MODE` **nicht** setzen, dann ist der Schicht-Modus an.
- [ ] Für den iOS-Build in deiner lokalen `.env` ebenfalls `REACT_APP_SUPPORT_EMAIL` setzen. Die App liest ihre `REACT_APP_*`-Werte beim Bauen auf dem Mac.
- [ ] Nach jeder Änderung: Deployments → letztes Production-Deployment → **Redeploy**.

## 4. Strava-Kapazität (strava.com/settings/api, testflight.md 3.3)

- [ ] Prüfen, ob das Strava-Abo deines Entwickler-Kontos aktiv ist.
- [ ] `https://www.strava.com/settings/api` öffnen und zu „My API Application“ gehen.
- [ ] **Authorization Callback Domain** auf `marathon-app-alpha.vercel.app` setzen, ohne `https://` → **Update**.
- [ ] App-Angaben vollständig ausfüllen: Name, Kategorie, Website, Beschreibung, **App-Icon hochladen**. Erst danach lässt Strava das Hochstufen zu.
- [ ] Bei **Athlete Capacity** den Knopf zum Hochstufen aus dem Single Player Mode klicken. Danach muss dort **10** stehen.
- [ ] Falls kein Knopf erscheint: Mail an `developers@strava.com` mit der Client ID. Bis dahin nutzen die Freunde den Weg Garmin → Apple Health, die Hilfe dazu steht in den Einstellungen.

## 5. Chrome-Prüfliste (Vercel-Preview von `test/friends-build`, eingeloggt, nach Schritt 1)

Die Preview-URL steht in Vercel → Deployments beim Branch `test/friends-build`. Wenn die Deployment Protection greift, Vercel einloggen oder `vercel curl` nutzen. Fenster auf 390 px stellen (DevTools → iPhone 12 Pro).

Schicht-Modus (Einstellungen → Training → „Ich arbeite in Schichten“ an → Dienstplan):

- [ ] **S1 Pflege:** Nacht, Nacht, Frei, Frei. Ein Intervall liegt am Tag nach der 2. Nacht, der Long Run am 1. freien Tag.
  - Erwartet: Beide Einheiten sind markiert. Der Vorschlag nennt den Dienst, zum Beispiel „Nach dem Nachtdienst (22–6 Uhr) …“, und schlägt einen freien Tag vor, ohne zwei harte Tage in Folge.
  - Zusätzlich die Zeit messen: 4 Wochen Dienste eintragen (Rotationsmuster oder „Woche kopieren“) soll unter 1 Minute dauern.
- [ ] **S2 Quick Return:** Spät, danach Früh, mit Tempo am Frühdienst-Tag.
  - Erwartet: Der Tag ist eingeschränkt. Einen Vorschlag gibt es nur, wenn ein freier Tag existiert.
- [ ] **S3 Gastro:** Eigene Zeit 17:00–00:30 am Abend vor einem Intervalltag.
  - Erwartet: Der Intervalltag ist eingeschränkt.
- [ ] **S4:** nur Frühdienste 6–14.
  - Erwartet: kein Konflikt, kein Vorschlag.
- [ ] Bei jedem Vorschlag prüfen: Ohne „Übernehmen“ ändert sich nichts. „Verwerfen“ lässt den Plan unverändert.
- [ ] Datenschutz & Daten → „Welche Daten MyRace nutzt“: Die Abschnitte Dienstplan, Strava, Feedback und Nutzungsdaten sind vorhanden.

Feedback:

- [ ] Einstellungen → Konto & Hilfe → „Feedback geben“ öffnen, Text eingeben, Kategorie „Idee“ wählen, senden.
- [ ] Kontrolle in Supabase: `select category, message, app_version, screen, device, created_at from user_feedback order by created_at desc limit 5;`
- [ ] Auf „Heute“ ist der dezente Feedback-Eintrag zu sehen. Er erscheint nur bei einem Konto, das jünger als 14 Tage ist.
- [ ] Nutzungsdaten prüfen: `select name, props, created_at from usage_events order by created_at desc limit 20;`. Erwartet werden Einträge wie `app_open`, `feedback_sent`, `shift_entries_saved` mit `count` und `shift_proposal_*`.
- [ ] „Nutzung zählen“ ausschalten, abmelden, wieder anmelden. Der Schalter muss weiter aus sein, und es dürfen keine neuen Zeilen entstehen.

Web-Fallback:

- [ ] In einem neuen privaten Fenster ein frisches Konto registrieren. Der Bestätigungslink führt auf die Web-Adresse.
- [ ] Danach durch den Wizard bis zum Plan gehen, dann Heute und Woche öffnen und eine Einheit manuell als erledigt markieren.
  - Erwartet: kein Absturz, kein Demo-Plan, kein toter Erinnerungs-Schalter (stattdessen ein Hinweis auf die iPhone-App).
- [ ] Abmelden und mit einem zweiten Konto anmelden: Es dürfen keine Daten des ersten Kontos auftauchen.
- [ ] Coach mit KI-Einwilligung fragen: „Was steht morgen an?“
  - Erwartet: Die Antwort hat den richtigen Tagesbezug.
  - Hinweis: Neues Server-Verhalten gibt es nur auf der Preview, nicht in Production.

## 6. iPhone-13-Test (Gerät, nicht Simulator)

- [ ] Build vorbereiten:
  - `git checkout test/friends-build`
  - `npm ci`
  - Info.plist-Patch und Privacy Manifest einspielen (`docs/friend-test/ios-patches/README.md`)
  - `npm run build:ios-safe`
  - Xcode: Team auf das bezahlte Team stellen, Gerät wählen, Run
  - Nicht `deploy:ios` verwenden, das öffnet einen Workspace, den es nicht gibt. Stattdessen `npm run cap:ios`.
- [ ] **Apple Health (W4):** Die Anfrage erscheint, und nach dem Erlauben kommen Läufe und Kalorien an. Vorher scheiterte die ganze Anfrage.
- [ ] **Garmin über Apple Health (W2 Weg A):** Ein Lauf von der Garmin-Uhr erscheint und erledigt die geplante Einheit automatisch, mit Ist-Distanz und Anstrengungsfrage.
- [ ] **Strava (W2 Weg B):** Erst nach Schritt 4 und erst wenn der Server-Code in Production ist, siehe Schritt 7.
  - Einstellungen → Strava verbinden → zurück in die App.
  - Erwartet: Ein Lauf der letzten 10 Tage erledigt die Einheit, und das Logo „Powered by Strava“ ist zu sehen.
  - Den gleichen Lauf zusätzlich in Apple Health haben. Er darf nur einmal zählen.
  - Strava trennen. Die Meldung lautet „gelöscht“, und die Strava-Läufe verschwinden.
- [ ] **Schicht-Modus:**
  - Dienstplan für 4 Wochen eintragen. Der Vorschlag S1 erscheint wie in Schritt 5.
  - Dienste am Kalender-Import vorbeigehen lassen, es dürfen keine Doppelungen entstehen.
- [ ] **Kontowechsel:**
  - Mit Konto A anmelden, Plan anlegen, abmelden, mit Konto B anmelden. Es darf nichts von A zu sehen sein, auch kein Dienstplan.
  - Den Bestätigungslink auf dem iPhone öffnen. Die App öffnet sich (`myrace://auth/confirm`).
- [ ] **Offene Punkte aus CLAUDE.md:**
  - KI-Einwilligung: Screen, Coach-Sperre, Widerruf.
  - Trainings-Erinnerung: nur an Trainingstagen, nichts nach Plan-Ende.
- [ ] **Feedback** vom iPhone senden. In Supabase muss das Gerät bzw. OS korrekt eingetragen sein.

## 7. Was danach in welcher Reihenfolge nach `main` darf (nur mit deiner Freigabe)

Erst wenn die Schritte 1–3 erledigt sind und der Chrome-Test aus Schritt 5 grün ist. Jeweils einzeln mergen, nach jedem Merge prüfen, ob das Vercel-Production-Deployment grün ist, und kurz klicken.

1. [ ] `fix/apple-health-read-types`: Hotfix, unabhängig, sofort.
2. [ ] `docs/friend-test-plan` und `docs/testflight-readiness`: nur Doku.
3. [ ] `fix/friend-test-hardening` (W3): Braucht Migration 025. Ohne sie fällt das Feedback auf Mail zurück, und Nutzungsdaten werden still verworfen.
4. [ ] `feat/strava-activity-import` (W2): Braucht Migration 024. Damit kommt die 7. Vercel-Funktion `api/strava/sync.js` live.
5. [ ] `feat/shift-mode` (W1): Braucht Migration 023. Mit W1 kommt der Konflikt in `src/persistence/*` mit, so wie er in `test/friends-build` gelöst ist.

Einfacher Weg: `test/friends-build` als Ganzes nach `main` mergen. Das ist geprüft, aber nur nach deiner Freigabe.

Danach den iOS-Build mit Version `1.0 (1)` hochladen (testflight.md Abschnitt 5) und die Freunde einladen.
