# Komponenten

Regeln pro Komponente. Styles als Vorlage in components.css, Aussehen in den Mockups.

## ActionCard

Die Action-Card zeigt eine vom Coach vorgeschlagene Planänderung, die erst nach Bestätigung wirkt.

## Der Verwender liefert
Art der Änderung, Titel (ein Satz), den Vorher-Nachher-Vergleich und die zwei Aktionen.

## Regeln
- Fläche `surface-1` mit Rand `line-strong`, damit sie sich vom Chattext abhebt.
- Art als `StatusChip` (`--accent --plain`) mit Lucide-Icon.
- Vergleich in `surface-2`: alt durchgestrichen in `ink-3`, Pfeil `arrow-right`, neu in `ink`.
- Buttons „Übernehmen" (primär, klein) und „Verwerfen" (sekundär, klein). Nie „Uebernehmen" oder „Apply".

## Button

Buttons lösen eine Aktion aus; Text ist immer ein Verb auf Deutsch.

## Varianten
- `mr-btn--primary`: die eine Hauptaktion eines Screens oder einer Karte. Fläche `accent`, Schrift `on-accent`, gedrückt `accent-press`. Höchstens ein Primärbutton pro sichtbarem Bereich.
- `mr-btn--secondary`: gleichwertige Alternative neben dem Primärbutton („Auslassen" neben „Erledigt"). Fläche `surface-2`.
- `mr-btn--ghost`: weiterführende Links („Alle Einheiten"). Schrift `accent-text`, keine Fläche.
- `mr-btn--danger`: destruktive Aktionen („Konto löschen", „Plan entfernen"). Schrift `accent-text` (Rot wie bei iOS üblich), immer mit Bestätigung.
- `mr-btn--small`: in Action-Cards und Listen, 36 px hoch.

## Der Verwender liefert
Beschriftung (Verb), optional ein Lucide-Icon in `size-icon-s` links davon, `disabled` wenn nicht ausführbar.

## Regeln
- Höhe `size-button`, Radius `radius-m`, Text `headline`.
- Fokus immer `shadow-focus`.
- Kein Emoji, kein Englisch („Done", „Skip").
- Zwei Buttons nebeneinander: Primär breiter (2:1), Sekundär rechts.

## Card

Die Karte ist die Standardfläche für zusammengehörige Inhalte auf einem Screen.

## Der Verwender liefert
Überschrift (`headline`), optional rechts eine Meta-Angabe (`caption`, `ink-3`), darunter den Inhalt.

## Regeln
- Fläche `surface-1`, Radius `radius-l`, Innenabstand `space-5`, Abstand zwischen Karten `space-6`.
- Kein Rahmen, kein Schatten, kein farbiger Rand links.
- Inhalte innerhalb der Karte auf `surface-2` (z. B. `MetricTile`). Keine dritte Kartenebene.
- Fortschrittsbalken: 4 px hoch, Spur `surface-3`, Füllung `accent`.

## CoachMessage

Nachrichten im Coach-Chat: der Nutzer in einer Sprechblase, der Coach als ruhiger Fließtext.

## Der Verwender liefert
Text der Nachricht und Absender.

## Regeln
- User: rechtsbündige Blase `surface-3`, Radius `radius-l` mit kleiner Ecke unten rechts.
- Coach: keine Blase. Kleine Zeile „Coach" mit `message-circle` in `accent-text`, darunter `body` in `ink`.
- Kein Sparkles-Icon, kein „AI", kein Avatar mit Roboter oder Gesicht.
- Inhalt: Datum statt interner IDs („Mi, 7. Okt", nicht „w2-mi"), deutsche Zahlen, keine Emojis, keine Begeisterungsfloskeln.
- Wichtige Werte dürfen `strong` sein, sonst keine Formatierung.

## ListRow

Listenzeilen führen in Detailseiten oder zeigen einen Wert; sie bilden die Einstellungen und alle Auswahllisten.

## Der Verwender liefert
Beschriftung, optional ein Lucide-Icon links, rechts entweder einen Wert (`ink-2`) oder einen Chevron (`chevron-right`, `ink-3`).

## Regeln
- Zeilen liegen gruppiert in `mr-list` (`surface-1`, `radius-l`). Über einer Gruppe ein `label`.
- Höhe mindestens `size-row`. Trennlinie `line`, links um `space-4` eingerückt.
- Gedrückt `surface-2`, ausgewählt `accent-tint`.
- Destruktive Zeilen in `accent-text`, ohne Icon, immer letzte Zeile der Gruppe.

## MetricTile

Eine Kachel zeigt genau einen Messwert mit Beschriftung und optionalem Kontext.

## Der Verwender liefert
`label` (max. zwei Wörter), den Wert mit Einheit, darunter entweder einen `StatusChip` oder eine Fußzeile mit Vergleich.

## Regeln
- Fläche `surface-2`, liegt immer in einer `Card` oder direkt auf `surface-1`.
- Wert in `metric-m`, tabellarische Ziffern, Einheit klein in `ink-3`.
- Vergleiche mit Vorzeichen und Wort („−4 zum Schnitt"), nie nur Farbe oder Pfeil.
- Keine Daten: Wert `—` in `ink-3` und ein Satz, was fehlt. Nie eine erfundene 0.
- Maximal drei Kacheln nebeneinander, maximal vier pro Gruppe. Hierarchie entsteht durch eine große Hauptzahl darüber, nicht durch mehr Kacheln.

## ProgressRing

Der Ring zeigt Fortschritt als Anteil; er ist das einzige grafische Element mit Wirkung in MyRace.

## Der Verwender liefert
Den Anteil (0–1), die Zahl in der Mitte und optional eine Zeile darunter.

## Regeln
- Groß (`size-ring`) nur einmal pro Screen, im `TodayHero`. Klein (72 px) in Listen und Wochenansicht.
- Spur `surface-3`, Füllung `accent`, runde Enden. Keine Verläufe, kein Glow.
- Zahl in der Mitte zentriert, tabellarische Ziffern. Das ist die einzige zentrierte Zahl der App.
- 0 % zeigt nur die Spur, keine leere rote Kappe.

## StatusChip

Der Chip zeigt einen Zustand mit Punkt und Wort und ersetzt jede Ampel-Emoji.

## Varianten
- `mr-chip--good` / `--fair` / `--low`: Erholung, Belastung, Planstatus. Text `status-*`, Fläche `status-*-tint`. „Niedrig" ist Orange, damit es nicht mit dem Markenrot verwechselt wird.
- `mr-chip--accent`: neutrale Hervorhebung in Markenrot (`accent-text` auf `accent-tint`), z. B. die Herzfrequenzzone.
- `mr-chip--plain`: Kategorie ohne Wertung, ohne Punkt.

## Der Verwender liefert
Ein bis zwei Wörter Text. Die Farbe folgt aus dem Zustand, nie aus Geschmack.

## Regeln
- Immer Wort plus Punkt. Farbe allein reicht nie.
- Keine Emojis (🟢 🟡 🔴), keine Pfeile als einzige Information.
- Radius `radius-pill`, Text 13 px, 600.

## TabBar

Die Tab-Bar ist die Hauptnavigation am unteren Rand, immer sichtbar, auch auf Detailseiten.

## Der Verwender liefert
Den aktiven Tab. Icons und Beschriftungen sind fest.

## Belegung
Heute `house`, Woche `calendar-days`, Leistung `activity`, Übersicht `route`, Coach `message-circle`, Einstellungen `settings`.

## Regeln
- Fläche `surface-1`, oben Haarlinie `line`, Höhe `size-tabbar` plus Safe Area.
- Aktiv: Icon und Wort in `accent-text`. Inaktiv: `ink-3`. Kein Hintergrund-Pill, kein Punkt.
- Jeder Tab hat Icon **und** Wort, in jedem Zustand. Keine dynamischen Inhalte (km-Zahl, Emoji) im Tab.
- Keine Unicode-Zeichen, kein Sparkles-Icon, nicht „AI Coach", sondern „Coach".

## TodayHero

Der Hero ist der Kopf des Heute-Screens und beantwortet in einer Sekunde: Was laufe ich heute?

## Der Verwender liefert
Datum, Erholungsstatus, Distanz, Name der Einheit, zwei bis drei Fakten (Zone, Dauer, Pace), Wochenfortschritt.

## Regeln
- Die Distanz ist die Hauptzahl des Screens (`metric-xl`), linksbündig, Einheit `km` klein in `ink-3`.
- Erholung als `StatusChip` oben rechts, nicht als Emoji, nicht als eigene Kachel.
- Fakten als Zeilen mit Lucide-Icon (`heart-pulse`, `timer`), Text `ink-2`.
- Aktionen „Erledigt" (primär) und „Auslassen" (sekundär) im Verhältnis 2:1.
- Fläche `surface-1`, Radius `radius-xl`. Kein Verlauf, kein Glow, kein Hintergrundbild.
- Ruhetag: statt Distanz das Wort „Ruhetag" in `title-l` und ein Satz, warum.
