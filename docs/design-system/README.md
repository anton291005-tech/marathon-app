MyRace ist ein Trainingsbegleiter für ambitionierte Läuferinnen und Läufer. Das Interface wirkt wie ein Messinstrument: dunkel, ruhig, präzise. Zahlen sind die Helden, Farbe ist selten und bedeutet immer etwas. Das Rot aus dem App-Icon ist die Marke, alles andere ist Schwarz, Grau und warmes Weiß.

## Grundregeln

- Baue jeden Screen auf `surface-0`. Inhalte liegen auf `surface-1`, Details darin auf `surface-2`. Mehr als drei Ebenen gibt es nicht.
- Setze pro Screen genau **eine** Hauptzahl in `metric-xl`. Alles andere ordnet sich darunter.
- Verwende das Markenrot sparsam: `accent` für Flächen (Primärbutton, Fortschritt, Laufeinheiten), `accent-text` für Text und Icons auf Dunkel (aktiver Tab, Links, Fokus). Wenn zwei rote Elemente um Aufmerksamkeit kämpfen, ist eins zu viel.
- Statusfarben (`status-good`, `status-fair`, `status-low`) stehen nie allein. Immer mit Wort: „Hoch", „Mittel", „Niedrig".
- Die App ist dauerhaft dunkel. Es gibt kein helles Theme.

## Nicht nach KI aussehen

Diese Regeln sind verbindlich. MyRace soll aussehen wie eine Premium-App, die ein Designteam über Jahre geschliffen hat, nicht wie ein generiertes Template.

- **Keine Emojis als Icons, Statusanzeige oder Dekoration.** Nicht in der Tab-Bar, nicht in Kacheln, nicht in Buttons, nicht in Coach-Antworten, nicht im Teilen-Text. Status wird mit `StatusChip` gezeigt, Sportarten mit Lucide-Icons.
- **Keine Unicode-Zeichen als Icons** (▤ ◔ ◎ ⌂ ✦ ⚙ ✓). Ausschließlich Lucide, siehe Ikonografie.
- **Keine KI-Symbolik.** Kein Funkeln/Sparkles-Icon, kein Zauberstab, kein Gehirn, keine Bezeichnung „AI" in der Oberfläche. Der Coach heißt „Coach" und hat das Icon `message-circle`.
- **Keine Verläufe**, insbesondere keine Blau-Lila-Verläufe, kein Glow, kein Glassmorphism, keine leuchtenden Ränder. Der einzige erlaubte „Effekt" ist der Fortschrittsring.
- **Keine Karten mit farbigem Rand links**, keine Karte in einer Karte in einer Karte, keine Schatten auf Karten.
- **Nicht alles zentrieren.** Titel, Texte und Kennzahlen sind linksbündig. Zentriert ist nur die Zahl im Ring.
- **Keine gleich großen Kachel-Raster als Ersatz für Hierarchie.** Eine Zahl groß, zwei bis vier Nebenwerte klein. Lieber weglassen als eine sechste Kachel.
- **Keine Füllwörter und kein Marketing-Ton** („Let's go!", „Du rockst das!", „Großartige Frage!"). Kein Englisch in der UI („Done", „Skip", „Streak", „Recovery", „LONG", „QUALITY").
- **Keine Platzhalter-Zahlen.** Fehlen Daten, zeige `—` in `ink-3` und einen Satz, was fehlt.
- **Echte Typografie:** tabellarische Ziffern bei allen Zahlen, Dezimalkomma, schmales Leerzeichen vor Einheiten, echte Gedankenstriche und Anführungszeichen („…").

## Sprache und Ton

- Deutsch, Du-Form, kurz. Ein Satz pro Hinweis.
- Wie ein guter Trainer: sachlich, konkret, ruhig. „Halte den Puls heute unter 150." statt „Versuche, es locker angehen zu lassen 😊".
- Buttons sind Verben: „Erledigt", „Auslassen", „Übernehmen", „Verwerfen", „Plan erstellen".
- Zahlen deutsch: `11,3 km`, `4:16 /km`, `2:49:30`, `63 bpm`. Uhrzeiten `18:40`. Daten „Mo, 12. Okt".
- Großbuchstaben nur im Stil `label`, maximal zwei Wörter.

## Farbe

- `ink` für Text und Zahlen, `ink-2` für Beschriftungen, `ink-3` für Einheiten und Zeitstempel. `ink-3` nie auf `surface-3`.
- `accent` ist das Rot aus dem App-Icon und nur für Flächen gedacht; Schrift darauf ist `on-accent` (Weiß, wie im Icon).
- `accent-text` ist die hellere Variante für Text und Icons auf dunklen Flächen. `accent` selbst ist als Text zu dunkel.
- `accent-tint` markiert Auswahl (aktive Zeile, gewählter Filter), ohne laut zu werden.
- Destruktive Aktionen („Konto löschen") stehen in `accent-text`, wie bei iOS üblich, und brauchen immer eine Bestätigung.
- Status-Chips: Text in `status-*`, Fläche in `status-*-tint`. „Niedrig" ist Orange (`status-low`), nie Rot, damit Status und Marke nicht verschwimmen. Fehlermeldungen nutzen ebenfalls `status-low`.
- Sportarten: `sport-run` (Markenrot), `sport-bike` (Stahlblau), `sport-strength` (neutral). Ruhetage `surface-3`.
- `line` trennt Zeilen, `line-strong` umrandet Bedienelemente.

## Typografie

- Systemschrift (SF Pro auf iOS). Keine Webfonts laden.
- Alle Zahlen in der Familie `rounded` mit `font-variant-numeric: tabular-nums`, Stile `metric-*`. So springen Zahlen nicht, wenn sie sich ändern.
- Text in `sans`: `title-l` für Screen-Titel, `title-m` für Einheiten, `headline` für Kartenüberschriften und Buttons, `body` für Fließtext, `caption` für Hilfstext, `label` über Kennzahlen.
- Einheiten kleiner und in `ink-3` neben der Zahl: `11,3` in `metric-xl`, `km` in `headline`.

## Abstände und Layout

- 4-px-Raster. Seitenrand immer `space-4` (16 px).
- Karten: Innenabstand `space-5`, Abstand untereinander `space-6`. Abschnitte trennt `space-8`.
- Screen-Titel `title-l` oben links, darunter `space-8` Luft.
- Jede Trefferfläche mindestens `size-touch` (44 px). Buttons `size-button`, Zeilen `size-row`.
- Großzügig sein: Leere ist ein Premium-Signal. Lieber scrollen als stapeln.

## Form

- Radien: `radius-l` für Karten, `radius-m` für Buttons und Kacheln, `radius-s` für Felder, `radius-pill` für Chips, `radius-xl` für Sheets.
- Keine Rahmen um Karten. Flächen trennen sich durch Helligkeit.
- Schatten nur `shadow-sheet` für schwebende Ebenen. Fokus immer `shadow-focus`.

## Zustände

- Gedrückt: Primärbutton `accent-press`, Zeilen `surface-2`.
- Deaktiviert: 40 % Deckkraft, keine andere Farbe.
- Laden: ruhiger Skeleton in `surface-2`, kein Spinner mitten im Inhalt.
- Fehler: `status-low` auf `status-low-tint`, ein Satz, eine Aktion („Erneut versuchen").
- Leer: `—` plus ein Satz, was fehlt, und wenn möglich ein Button, der es behebt.

## Ikonografie

- Icon-Set: **Lucide** (`lucide-react`), Strichstärke 1,75, Größe `size-icon` in Tab-Bar und Listen, `size-icon-s` in Chips und Buttons.
- Icons übernehmen die Textfarbe (`currentColor`). Aktiv `accent-text`, inaktiv `ink-3`.
- Tab-Bar: Heute `house`, Woche `calendar-days`, Leistung `activity`, Übersicht `route`, Coach `message-circle`, Einstellungen `settings`.
- Sportarten: Laufen `footprints`, Rad `bike`, Kraft `dumbbell`, Ruhetag `moon`.
- Daten: Herzfrequenz `heart-pulse`, Schlaf `moon`, Belastung `flame`, Info `info`, Weiter `chevron-right`.
- Ein Icon steht nie allein für eine Aktion, die nicht universell verständlich ist. Dann mit Wort.

## Status und Daten

- Erholung, Belastung, Planstatus: immer `StatusChip` mit Punkt und Wort. Nie Ampel-Emojis.
- Fortschritt: `ProgressRing` im Hero, schmale Balken (`radius-s`, 4 px hoch) in Listen.
- Vergleiche zeigen Richtung mit Wort und Vorzeichen („+1,2 km zum Plan"), nicht nur mit Farbe.

## Komponenten

`Button`, `Card`, `MetricTile`, `StatusChip`, `ProgressRing`, `ListRow`, `TabBar`, `TodayHero`, `CoachMessage`, `ActionCard`. Jede hat eine Vorschau und eigene Regeln. Klassen beginnen mit `mr-` und stehen in `components/bundle.css`.

## Logo und Splash

Das Logo ist das App-Icon: ein rotes abgerundetes Quadrat (`accent`, Verlauf von `#e30314` oben nach `#d1040e` unten) mit einer weißen, kurvigen Strecke, die an einer Zielflagge endet (`assets/Logos/app-icon.png`). Es steht für den Weg zum Rennen.

- Verwende das Icon unverändert: nicht neu zeichnen, nicht umfärben, keinen Schatten, Glanz oder Rahmen hinzufügen.
- Der Name daneben wird in `rounded`, Gewicht 700, Farbe `ink` gesetzt.
- **Splash:** Hintergrund `accent`, die weiße Strecke mit Flagge zeichnet sich in rund 0,5 s von unten links bis zur Flagge auf (Pfad-Animation, ease-out). Danach direkter Übergang in die App auf `surface-0`. Kein Logo-Text, kein Spinner, keine zweite Animation.
- Die Strecke ist das einzige Marken-Motiv. Sie darf als Linie in Leerzuständen oder im Prep-Rückblick auftauchen, immer weiß oder `accent`, nie als Deko-Muster.

## Umstieg von den alten Variablen

Die App nutzt heute 14 Variablen in `src/index.css`. Bilde sie beim Umbau so ab:

| Alt | Neu |
|---|---|
| `--bg-primary` | `--surface-0` |
| `--bg-secondary` | `--surface-1` |
| `--bg-card` | `--surface-1` |
| `--bg-input` | `--surface-2` |
| `--bg-surface` | `--surface-2` |
| `--text-primary` | `--ink` |
| `--text-secondary` | `--ink-2` |
| `--text-muted` | `--ink-3` |
| `--border-default` | `--line` |
| `--border-input` | `--line-strong` |
| `--accent-run` | `--sport-run` (jetzt Markenrot) |
| `--accent-bike` | `--sport-bike` |
| `--accent-rest` | `--surface-3` |
| `--shadow` | entfällt, nur `--shadow-sheet` |
