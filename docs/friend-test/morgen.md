# iPhone-13-Checkliste für den Freundes-Test

Stand: 2026-11-18 abends, Branch `test/friends-build`. Reihenfolge einhalten: Die frühen Schritte entscheiden, ob die späteren sinnvoll sind. Je Schritt steht, was du tust und was du sehen musst. Hintergrund und Befundnummern (H1, M1 …) stehen in `docs/friend-test/REPORT.md`, Abschnitt „18.11. Abendlauf“.

Was im Browser schon geprüft ist: Registrieren, Wizard, Dienstplan, Wochen-Scan, Nutzungsdaten, Feedback, Abmelden/Anmelden und Konto löschen laufen im Rauchtest (`npm run test:e2e`) durch. Offen ist alles, was nur das Gerät kann.

## 0. Vorbereitung am Mac (15 min)

- [ ] `git fetch && git checkout test/friends-build && git pull`, dann `npm ci`.
- [ ] In deiner lokalen `.env` steht `REACT_APP_SUPPORT_EMAIL` mit deiner echten Adresse. Die App liest ihre `REACT_APP_*`-Werte beim Bauen.
- [ ] Info.plist-Patch und Privacy Manifest einspielen (`docs/friend-test/ios-patches/README.md`).
- [ ] `npm run build:ios-safe`, dann `npm run cap:ios`. Nicht `deploy:ios`, das öffnet einen Workspace, den es nicht gibt.
- [ ] Xcode: Team auf das bezahlte Team stellen, iPhone 13 wählen, Run.
- [ ] Supabase: Authentication → Sign In / Providers → Email → **Confirm email** ist aus. So war es heute beim Test; sonst kommen die Freunde ohne eigenen SMTP nicht ins Konto.

Schon erledigt, nur zur Kontrolle: Die Migrationen 023–025 sind in Production (heute per Lesezugriff bestätigt: `shift_entries`, `user_feedback`, `usage_events`, `profiles.works_shifts`, `strava_connections.last_synced_at` sind lesbar).

## 1. Konto löschen – zuerst, weil es voraussichtlich scheitert (H1)

- [ ] In der App ein Wegwerf-Konto registrieren (z. B. `myrace-ios-test@example.com`), den Wizard bis zum Plan durchklicken.
- [ ] Einstellungen → Konto & Hilfe → Konto löschen → `LÖSCHEN` eintippen → bestätigen.
- **Erwartet mit dem heutigen Production-Stand:** Fehlermeldung im Dialog, das Konto bleibt. Ursache ist CORS: Die Production-API erlaubt `DELETE` im Preflight nicht.
- [ ] Wenn es so scheitert: Commit `18d62cb` nach `main` nehmen (nur `api/_lib/cors.js`, `vercel.json` und ein Test), Production-Deployment abwarten, Schritt wiederholen.
- **Erwartet nach dem Deploy:** Die App springt auf den Anmelde-Bildschirm, ein erneuter Login mit dem Konto scheitert.
- [ ] Gegenprobe am Mac: `npm run test:e2e -- -g "12 iPhone"`. Vor dem Deploy ist der Test als erwarteter Fehler markiert, danach muss er regulär bestehen.
- [ ] Falls das Löschen auf dem iPhone schon vor dem Deploy klappt: bitte notieren. Dann stimmt meine Herleitung für die WebView nicht, und H1 ist erledigt.

## 2. Frisches Konto: Anmeldung, Wizard, Apple-Health-Abfrage (M1)

- [ ] App löschen und neu installieren (frisches Gerät), ein neues Konto registrieren.
- **Erwartet:** Du landest ohne Bestätigungsmail im Wizard „Distanz & Ziel“. Kein „Warschau Marathon“, auch nicht kurz.
- [ ] Achte darauf, **wann die Apple-Health-Abfrage von iOS erscheint**.
  - Am Code erwartet: sofort nach dem Login, über dem Wizard, ohne Erklärung.
  - [ ] Einmal „Nicht erlauben“ wählen und danach in Einstellungen → Verbindungen nachsehen. Am Code erwartet: Die App zeigt trotzdem „verbunden“. Das ist Entscheidung 4 im Bericht.
- [ ] Wizard: 10 km, „Unter einer Zielzeit“, Renndatum in etwa 10 Wochen, Schicht-Frage „Ja“ → „Später“, 4 Tage, 25 km pro Woche, „Schätzung“, bis „Plan erstellen“.
- **Erwartet:** Plan in wenigen Sekunden, danach der Screen „KI-Coach aktivieren?“.
- [ ] „Ohne Coach fortfahren“. **Erwartet:** Tour-Angebot, danach „Heute“ mit „Woche 1 von …“.
- [ ] VoiceOver kurz einschalten, solange ein Wizard offen ist (Einstellungen → Training → Neuer Trainingsplan). **Erwartet:** Nur der Wizard wird vorgelesen, nichts von der App dahinter.

## 3. Safe Areas und Tab-Leiste

- [ ] Alle sechs Tabs öffnen. **Erwartet:** Nichts liegt unter der Notch oder unter der Tab-Leiste, die letzte Karte endet über der Leiste.
- [ ] Woche-Tab: eine Einheit antippen, das Sheet bis ganz unten scrollen. **Erwartet:** „Eintragen“ und „Auslassen“ liegen über dem Home-Indikator.
- [ ] Dienstplan-Seite öffnen (Woche → „Dienste eintragen“). **Erwartet:** Der Titel liegt unter der Notch, „Speichern“ und „Schließen“ über dem Home-Indikator.

## 4. Dienstplan: Tastatur und Eingabe

- [ ] „Rotation oder Woche übernehmen“ aufklappen, ins Musterfeld tippen (`N N – – – F F`).
- **Erwartet:** Die Tastatur verdeckt das Feld nicht, die Seite zoomt nicht (Schrift 16 pt), die Tasten F/S/N/– unter dem Feld bleiben erreichbar.
- [ ] „Ab“ und „Für“ wählen (iOS-Auswahlrad), „Muster eintragen“, „Speichern“.
- **Erwartet:** „Gespeichert.“ Vier Wochen Dienste in unter einer Minute.
- [ ] Bei einem Tag „Eigene Zeit“ wählen und Beginn und Ende ändern.
- **Erwartet:** Das Zeit-Rad erscheint, das Feld bleibt sichtbar, nach „Fertig“ steht die Zeit in der Zeile.
- [ ] „Standardzeiten → Ändern“, eine Zeit ändern. **Erwartet:** wie oben, kein Springen der Seite.

## 5. Schicht-Modus: Vorschlag S1

- [ ] Die Nächte so legen, dass die zweite am Morgen einer harten Einheit endet (Intervalle oder Tempo; ab etwa Planwoche 4).
- [ ] Woche-Tab → zu dieser Woche blättern → „Mit meinem Dienstplan abgleichen“.
- **Erwartet:** Karte „Woche an deinen Dienstplan anpassen“ mit dem Satz „Nach dem Nachtdienst (22–6 Uhr) ist … kein guter Tag für … Vorschlag: …“ und den Knöpfen Übernehmen und Verwerfen.
- [ ] „Verwerfen“. **Erwartet:** Die Woche ist unverändert.
- [ ] Noch einmal abgleichen, „Übernehmen“, App ganz schließen und neu öffnen, wieder abgleichen.
- **Erwartet:** „Diese Woche passt zu deinem Dienstplan.“
- [ ] Den Dienst am Vortag des neuen Tages ändern und speichern, wieder abgleichen.
- **Erwartet:** Die verschobene Einheit wird wieder gemeldet.
- [ ] Die verschobene Einheit antippen → „An Kalender anpassen“ → „Trotzdem Tag wählen“.
- **Erwartet:** Liste mit Tagen, eingeschränkte Tage grau als „Eingeschränkt: …“, regelwidrige als „Ungünstig“.

## 6. Hintergrund und Rückkehr (M11)

- [ ] App abends in den Hintergrund legen (nicht beenden), am nächsten Morgen öffnen.
- **Erwartet:** „Heute“ zeigt das neue Datum und die Einheit von heute. Vor dem Fix `a75645c` blieb ohne Apple Health der Vortag stehen.
- [ ] Schneller Ersatz ohne zu warten: Datum in den iOS-Einstellungen einen Tag vorstellen, zur App zurückkehren. Erwartet dasselbe. Danach das Datum zurückstellen.
- [ ] App 10 Minuten im Hintergrund lassen und zurückkehren. **Erwartet:** kein weißer Bildschirm, kein erneuter Login.

## 7. Apple Health und Garmin als Quelle

- [ ] Einstellungen → Verbindungen → Apple Health verbinden, alle Kategorien erlauben.
- **Erwartet:** Die Abfrage erscheint (vor dem W4-Fix scheiterte sie ganz), danach stehen Läufe der letzten 7 Tage unter den Aktivitäten.
- [ ] Ein Lauf von der Garmin-Uhr (Garmin Connect → Apple Health) liegt an einem Tag mit geplanter Einheit.
- **Erwartet:** Die Einheit ist erledigt, mit Ist-Distanz und der Frage nach der Anstrengung. Die volle Auswertung erscheint wie bei einem Apple-Watch-Lauf.
- [ ] Zwei Läufe am selben Tag haben (z. B. Hauptlauf und kurzes Auslaufen getrennt aufgezeichnet).
- **Am Code erwartet (M3):** Der spätere, kürzere Lauf wird zugeordnet. Bitte notieren, ob das so ist.
- [ ] Leistung-Tab: **Erwartet:** Schlaf und HRV der letzten Nacht. Wenn die App seit gestern nur im Hintergrund lag, stehen dort am Code erwartet die Werte von gestern (M5); nach Beenden und Neustart die aktuellen.
- [ ] Kontowechsel auf demselben iPhone: abmelden, mit einem zweiten Konto anmelden, **nicht** auf „Apple Health verbinden“ tippen, App in den Hintergrund und zurück.
- **Am Code erwartet (M2):** Im zweiten Konto tauchen trotzdem Läufe und Erholungswerte des Geräts auf. Bitte notieren.

## 8. Deep Links

- [ ] **Passwort zurücksetzen:** Einstellungen → Konto & Hilfe → Passwort zurücksetzen, die Mail auf dem iPhone öffnen, Link antippen.
- **Erwartet:** Die App öffnet sich (`myrace://auth/confirm`) und zeigt „Neues Passwort“. Voraussetzung: `myrace://auth/confirm` steht in Supabase unter Redirect URLs.
- [ ] Denselben Link ein zweites Mal antippen. **Am Code erwartet (N13):** Die App öffnet sich, zeigt aber nichts an.
- [ ] **Strava:** nur wenn Strava-Abo und Athleten-Kapazität stehen und der Server-Code in Production ist. Einstellungen → Strava verbinden → in Safari anmelden → zurück in die App.
- **Erwartet:** Safari schließt sich, die App zeigt „verbunden“. In Vercel muss `STRAVA_REDIRECT_URI` auf `/api/strava/callback` enden (in `.env.local` steht fälschlich `/callbacks`).

## 9. KI-Einwilligung, Coach, Erinnerung (offene Punkte aus CLAUDE.md)

- [ ] Coach-Tab ohne Einwilligung. **Erwartet:** Hinweis mit „Coach aktivieren“, kein Eingabefeld.
- [ ] „Coach aktivieren“ → zustimmen → „Was steht morgen an?“. **Erwartet:** Antwort mit dem richtigen Tag. Der Tagesbezug kommt vom Server; in Production gilt bis zum Merge der alte Stand.
- [ ] Einstellungen → Datenschutz & Daten → KI-Coach ausschalten. **Erwartet:** Der Coach ist sofort wieder gesperrt.
- [ ] Trainings-Erinnerung einschalten. **Erwartet:** Mitteilung nur an Tagen mit offener Einheit, keine nach Plan-Ende.

## 10. Feedback und Nutzungsdaten vom Gerät

- [ ] Einstellungen → Konto & Hilfe → Feedback geben → „Idee“ → senden.
- [ ] In Supabase prüfen: `select category, message, app_version, screen, device, created_at from user_feedback order by created_at desc limit 5;`
- **Erwartet:** Deine Zeile, in `device` steht iOS mit Version.
- [ ] `select name, props, created_at from usage_events order by created_at desc limit 20;`
- **Erwartet:** `app_open` höchstens einmal je Stunde, dazu `onboarding_done`, `shift_entries_saved` mit `count`, `shift_proposal_*`.

## 11. Danach: was nach `main` darf (nur mit deiner Freigabe)

1. [ ] `18d62cb` (CORS) – sofort, wenn Schritt 1 den Fehler bestätigt.
2. [ ] Die Entscheidungen im Bericht durchgehen, vor allem 4 (Apple-Health-Abfrage) und 5 (Strava 7 Tage).
3. [ ] `test/friends-build` als Ganzes nach `main`, wenn die Schritte 2–10 ohne Blocker durch sind. Erst dann sind Strava-Sync, Coach-Tagesbezug und der Lösch-Code für die neuen Tabellen in Production.
4. [ ] iOS-Build mit Version `1.0 (1)` hochladen (`docs/friend-test/testflight.md` Abschnitt 5) und die Freunde einladen.
