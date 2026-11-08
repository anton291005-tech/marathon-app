/**
 * Offline-Vergleich alt/neu (Umbauplan Schritt 10): schreibt docs/plan-core-comparison.md.
 * Aufruf: node -r ./node_modules/sucrase/register scripts/planCoreCompare.ts [--count 200]
 * Ohne Claude, ohne Netz. „alt“ = deterministischer heutiger Generator mit Standardstruktur (Rückfall des Claude-Pfads).
 */

const fs = require("fs");
const path = require("path");
const {
  RANDOM_SEED,
  compareRandomProfiles,
  compareReferenceProfiles,
} = require("../src/testSupport/planCoreComparison.ts");
const { CONFIG_VERSION } = require("../src/planCore/index.ts");

type Side = Record<string, number | null>;
type Row = {
  name: string;
  label: string;
  inputs: { runDaysPerWeek: number; distance: string };
  mappingOk: boolean;
  coreErrors: number;
  coreWarnings: number;
  coreViolationRules: Record<string, number>;
  core: Side | null;
  legacy: Side;
};

const countArg = process.argv.indexOf("--count");
const COUNT = countArg > 0 ? Number(process.argv[countArg + 1]) : 200;

const fmt = (value: number | null | undefined): string =>
  value === null || value === undefined ? "–" : String(value).replace(".", ",");
const pair = (row: Row, key: string): string => `${fmt(row.legacy[key])} → ${fmt(row.core ? row.core[key] : null)}`;

function referenceTable(rows: Row[]): string {
  const head =
    "| Profil | Wochen | Peak-Woche km | Längster LR km | LR ≥ 30 km | Q/Woche | Läufe/Woche max (Vorgabe) | Wochen über Vorgabe | Vorwoche % Peak | Rennwoche % Peak | Kern errors / warnings |\n" +
    "|---|---|---|---|---|---|---|---|---|---|---|";
  const lines = rows.map(
    (r) =>
      `| ${r.name} ${r.label} | ${fmt(r.core?.weeks ?? null)} | ${pair(r, "peakWeekKm")} | ${pair(r, "longestRunKm")} | ${pair(
        r,
        "longRunsAtLeast30",
      )} | ${pair(r, "qPerWeek")} | ${pair(r, "maxRunDaysPerWeek")} (${r.inputs.runDaysPerWeek}) | ${pair(
        r,
        "weeksOverRunDays",
      )} | ${pair(r, "preRaceWeekPct")} | ${pair(r, "raceWeekPct")} | ${r.coreErrors} / ${r.coreWarnings} |`,
  );
  return [head, ...lines].join("\n");
}

const rulesText = (rules: Record<string, number>): string => {
  const keys = Object.keys(rules).sort((a, b) => rules[b] - rules[a] || a.localeCompare(b));
  return keys.length ? keys.map((key) => `\`${key}\` ×${rules[key]}`).join(", ") : "keine";
};

function referenceWarnings(rows: Row[]): string {
  return [
    "| Profil | Kern-Meldungen je Code/Regel (alle sind warnings) |",
    "|---|---|",
    ...rows.map((r) => `| ${r.name} | ${rulesText(r.coreViolationRules)} |`),
  ].join("\n");
}

function randomWarnings(rows: Row[]): string {
  const messages: Record<string, number> = {};
  const plans: Record<string, number> = {};
  rows.forEach((r) =>
    Object.keys(r.coreViolationRules).forEach((key) => {
      messages[key] = (messages[key] ?? 0) + r.coreViolationRules[key];
      plans[key] = (plans[key] ?? 0) + 1;
    }),
  );
  const keys = Object.keys(messages).sort((a, b) => plans[b] - plans[a] || a.localeCompare(b));
  return ["| Code/Regel | Meldungen | Pläne |", "|---|---|---|", ...keys.map((k) => `| \`${k}\` | ${messages[k]} | ${plans[k]} |`)].join("\n");
}

const EXPLANATIONS = `## Warum alt und neu abweichen

Die Unterschiede sind Absicht der Spec (\`docs/plan-spec.md\`), kein Fehler des Mappings. Belege stehen in den Tabellen oben; die Zahlen in diesem Abschnitt gelten für Kern 0.9.0 und Seed 20261110 und werden bei einer Änderung von Hand nachgezogen.

- **Lauftage und verfügbare Tage:** Der heutige Pfad kennt beide nicht (\`legacyPlanProfile\`) und plant mit festen Regeln (Ruhetag Mo, bis zu 5–6 Läufe). Daher die Wochen über der Vorgabe (P3, P4, P6, 134 von 200) und die Trainingsläufe an nicht verfügbaren Tagen (126 von 200). Der Kern hält beides immer ein (§6, I6/I16).
- **Peak-Woche (Ø 58,6 → 45,6 km, P1 19,8 → 15):** Alt rechnet mit der Spanne (z. B. „20–40 km“ → Ziel 30 km), unabhängig vom genauen Wochenumfang und mit mehr Läufen als vorgegeben. Der Kern startet beim angegebenen Umfang, steigert höchstens +10 % oder +4 km je Woche, deckelt den Peak nach Lauftagen und bei Start × 1,5 und plant nur, was die Einheiten-Grenzen tragen (§5.1–5.3, Tragfähigkeit und monotoner Verlauf, Review-Punkte 32, 37). Für P1 ist der Peak-Bereich 13–15 km freigegeben (§13).
- **Q je Woche (Ø 1,9 → 0,7, P1 2 → 0,1):** Alt setzt in jeder Woche einen Intervall- und einen Tempotag, auch für Einsteiger mit 3 Tagen und im Taper. Der Kern begrenzt Q nach Lauftagen (3 Tage: 1), lässt Q2 in Basis, Entlastung und bei Einsteigern weg und schwächt Q zu E + Strides ab, wenn Q-Budget (15 % bei 3–4 Tagen, sonst 20 %) oder Mindestgröße nicht passen (\`I2/q-softened\`, §6, Review-Punkt 38). P1 läuft ohne Rennergebnis im Einsteiger-Modus: im ganzen Plan 1 T-Einheit, 3 abgeschwächte Q. Marathontempo-Läufe zählen im Kern als \`tempo\` und damit als Q; Long Runs mit M-Block zählen als \`long\`.
- **Long Runs ≥ 30 km (P5 0 → 3):** Für den Marathon mit 5–6 Lauftagen verlangt die Spec einen längsten Long Run von 30–34 km, mindestens zweimal (§7.1, §13 P5). Der heutige Generator deckelt den Long Run tiefer (P5: 28,6 km).
- **Längster Long Run höher (P2 6 → 14,6, P4 14,2 → 25, P6 14,3 → 23,6):** Der Kern setzt den Long-Run-Anteil nach Lauftagen (bis 55 % bei 3 Tagen) und das Peak-Ziel je Distanz (§7.1). Alt verteilt mehr Läufe und hält den Long Run kurz.
- **Taper (P6 Rennwoche 39 → 24 %):** Bei 3 Lauftagen bleiben in der Rennwoche neben dem Rennen 2 Läufe (P6: E 6 km, E 4,1 km); der Lauf in den letzten 2 Tagen ist höchstens 30 min, Q entfällt (\`I13/taper-q-excused\`, §5.4, §8). Die Taper-Reduktion prüft der Kern als Mittel über die Taper-Phase (I13), nicht je Woche. Die Vorwoche liegt im Kern bei 70 % (Taper 70 % / 42,5 %, §5.4); alt bei 74 %.
- **Warnings:** Alle Kern-Meldungen sind begründete warnings (Hinweis des Kerns erklärt die Abweichung, Schritt 7); 0 errors in allen Fällen.
`;

const mean = (values: number[]): number => (values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0);

function randomSummary(rows: Row[]): string {
  const mapped = rows.filter((r) => r.mappingOk && r.core);
  const side = (pick: (r: Row) => Side) => ({
    peak: mean(mapped.map((r) => pick(r).peakWeekKm as number)),
    lr: mean(mapped.map((r) => pick(r).longestRunKm as number)),
    q: mean(mapped.map((r) => pick(r).qPerWeek as number)),
    lr30: mapped.filter((r) => (pick(r).longRunsAtLeast30 as number) > 0).length,
    unavailable: mapped.filter((r) => (pick(r).runsOnUnavailableDays as number) > 0).length,
    overDays: mapped.filter((r) => (pick(r).weeksOverRunDays as number) > 0).length,
    pre: mean(mapped.filter((r) => pick(r).preRaceWeekPct !== null).map((r) => pick(r).preRaceWeekPct as number)),
    race: mean(mapped.filter((r) => pick(r).raceWeekPct !== null).map((r) => pick(r).raceWeekPct as number)),
  });
  const alt = side((r) => r.legacy);
  const neu = side((r) => r.core as Side);
  const n = mapped.length;
  return [
    `Fälle: ${rows.length} (Seed ${RANDOM_SEED} …), Mapping ok: ${n}, Kern-Pläne mit error: ${mapped.filter((r) => r.coreErrors > 0).length}, Ø Kern-warnings: ${mean(mapped.map((r) => r.coreWarnings))}.`,
    "",
    "| Kennzahl | alt | neu |",
    "|---|---|---|",
    `| Ø Peak-Woche km | ${fmt(alt.peak)} | ${fmt(neu.peak)} |`,
    `| Ø längster Long Run km | ${fmt(alt.lr)} | ${fmt(neu.lr)} |`,
    `| Ø Q-Einheiten je Woche | ${fmt(alt.q)} | ${fmt(neu.q)} |`,
    `| Pläne mit Long Run ≥ 30 km | ${alt.lr30} | ${neu.lr30} |`,
    `| Pläne mit Trainingsläufen an nicht verfügbaren Tagen (ohne Rennen) | ${alt.unavailable} von ${n} | ${neu.unavailable} von ${n} |`,
    `| Pläne mit Wochen über der Lauftage-Vorgabe | ${alt.overDays} von ${n} | ${neu.overDays} von ${n} |`,
    `| Ø Vorwoche in % der Peak-Woche | ${fmt(alt.pre)} | ${fmt(neu.pre)} |`,
    `| Ø Rennwoche (ohne Rennen) in % der Peak-Woche | ${fmt(alt.race)} | ${fmt(neu.race)} |`,
  ].join("\n");
}

const reference: Row[] = compareReferenceProfiles();
const random: Row[] = compareRandomProfiles(COUNT);

const doc = `# Offline-Vergleich alt/neu (Plan-Kern Schritt 10)

Erzeugt mit \`node -r ./node_modules/sucrase/register scripts/planCoreCompare.ts\` (Kern \`CONFIG_VERSION\` ${CONFIG_VERSION}). Nicht von Hand bearbeiten.

**Weg je Fall:** Kern-Eingaben → Wizard-Profil wie Schritt 9 → Server-Whitelist (\`validatePlanBody\`) → Mapping (\`profileToCoreInputs\`) → \`buildCheckedPlan\` (**neu**). Dasselbe Profil → deterministischer heutiger Generator \`generateMarathonPlanV2ToRace\` mit Standardstruktur und -regeln (**alt**; das ist der Rückfall des Claude-Pfads in \`phasedFullPlanGenerator.js\`, nicht die Claude-Ausgabe selbst). Der heutige Pfad kennt Lauftage und verfügbare Tage nicht (\`legacyPlanProfile\`).

**Kennzahlen** (\`api/_lib/planMetrics.ts\`, für beide gleich): Peak-Woche ohne Renn-km; längster Lauf vom Typ \`long\`; Q = \`tempo\` + \`interval\` je Woche vor der Rennwoche (M-Läufe zählen im Kern als \`tempo\`); Läufe/Woche max inkl. Rennwoche; Trainingsläufe an nicht verfügbaren Tagen ohne das Rennen (der Renntag ist vorgegeben); Wochen über Vorgabe = Wochen vor der Rennwoche mit mehr Läufen als \`runDaysPerWeek\`; Vorwoche/Rennwoche in % der Peak-Woche.

## Referenzprofile P1–P6 (Spec §13), Spalten „alt → neu“

${referenceTable(reference)}

### Kern-Meldungen P1–P6

${referenceWarnings(reference)}

## Zufallsprofile

${randomSummary(random)}

### Kern-Meldungen je Code/Regel (${random.length} Zufallsprofile)

${randomWarnings(random)}

${EXPLANATIONS}`;

const target = path.resolve(__dirname, "../docs/plan-core-comparison.md");
fs.writeFileSync(target, doc);
// eslint-disable-next-line no-console
console.log(doc);
