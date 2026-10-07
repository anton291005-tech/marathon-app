import type { ScheduleBlockCategory } from "../lib/supabase/services/weeklyScheduleBlocksService";

/**
 * Belastungssemantik eines Kalendertermins — getrennt von der Zeitüberlappung und von `category`
 * (Kontext: job/study/…):
 *
 *   physical → körperlich belastend (Sprint-Prüfung, Sportpraxis, Fußballturnier); kann harte Einheiten
 *              am selben Tag blockieren, auch wenn viel Zeit frei ist
 *   time     → belegt nur Zeit (Klausur, Abgabe, Schicht)
 *
 * Wird zur Lesezeit aus dem Titel abgeleitet und nicht gespeichert: eine bessere Stichwortliste wirkt
 * sofort, auch für Presets und manuelle Zeilen. `category` ist nie Auslöser, nur Bremse (siehe
 * `JOB_BRAKED_KEYWORDS`) — `sport` allein macht keinen Termin körperlich („Spieleabend", „Training").
 *
 * Nicht mit `core/loadClass` verwechseln: das ist die Belastungsklasse einer Lauf-SESSION.
 */
export type EventLoadKind = "physical" | "time";

/**
 * Lower-case title keywords that mark a calendar block as physical exertion (sports, tournaments).
 * Deliberately excludes generic words like "spiel" or "training". Extend here — matching is done by
 * `isPhysicalLoadTitle`.
 */
export const PHYSICAL_LOAD_TITLE_KEYWORDS: readonly string[] = [
  "fußball",
  "fussball",
  "football",
  "soccer",
  "wettkampf",
  "match",
  "turnier",
  "handball",
  "basketball",
  "volleyball",
  "hockey",
  "tennis",
  "badminton",
  "squash",
  "rugby",
  "klettern",
  "bouldern",
  "triathlon",
  "duathlon",
  "sprint",
  "sportpraxis",
  "sportprüfung",
  "sporttest",
  "leichtathletik",
];

/** Keywords shorter than this only match as a whole word ("match" must not hit "Matcha"). */
const MIN_COMPOUND_KEYWORD_LENGTH = 6;

/** Stichwörter, die nur „Wettbewerb" sagen, nicht „Sport" — zählen nicht, wenn der Titel ein Denk-/Kartenspiel nennt. */
const CONTEST_KEYWORDS: ReadonlySet<string> = new Set(["turnier", "wettkampf", "match"]);

/** Schachturnier, Skatturnier, Pokerturnier, Quiz-Turnier, E-Sport-Turnier sind keine körperliche Belastung. */
export const NON_PHYSICAL_CONTEST_MARKERS: readonly string[] = ["schach", "skat", "poker", "quiz", "esport"];

/** „Sprint" ist im Job-Kalender ein Arbeitsabschnitt (Sprint Planning), keine Laufbelastung. */
const JOB_BRAKED_KEYWORDS: ReadonlySet<string> = new Set(["sprint"]);

/** Begleitwörter, an denen ein agiler „Sprint" auch ohne Kategorie `job` erkennbar ist. */
const AGILE_SPRINT_MARKERS: readonly string[] = [
  "planning",
  "planung",
  "review",
  "retro",
  "retrospektive",
  "backlog",
  "refinement",
  "grooming",
  "demo",
  "daily",
  "standup",
  "kickoff",
];

function titleWords(title: string): string[] {
  return title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** Wörter plus zusammengezogene Nachbarwörter, damit „Sport-Prüfung" wie „Sportprüfung" trifft. */
function wordsWithJoinedNeighbours(words: string[]): string[] {
  const out = [...words];
  for (let i = 0; i + 1 < words.length; i += 1) out.push(words[i] + words[i + 1]);
  return out;
}

function matchesKeyword(word: string, keyword: string): boolean {
  return (
    word === keyword ||
    (keyword.length >= MIN_COMPOUND_KEYWORD_LENGTH && (word.startsWith(keyword) || word.endsWith(keyword)))
  );
}

/**
 * Belastungssemantik eines Termins. Ein Wort des Titels (case-insensitive) muss einem Stichwort
 * entsprechen oder — bei Stichwörtern ab `MIN_COMPOUND_KEYWORD_LENGTH` Zeichen — damit beginnen oder
 * enden, so dass deutsche Komposita („Fußballturnier", „Hallenfußball") treffen, Treffer mitten im Wort
 * aber nicht.
 *
 * Ausnahmen:
 * - Wettbewerbs-Stichwörter (`CONTEST_KEYWORDS`) zählen nicht, wenn der Titel ein Denk-/Kartenspiel nennt
 *   (`NON_PHYSICAL_CONTEST_MARKERS`).
 * - „Sprint" zählt nicht bei Kategorie `job` oder mit agilem Begleitwort (`AGILE_SPRINT_MARKERS`).
 */
export function classifyEventLoad(event: { title: string; category?: ScheduleBlockCategory | null }): EventLoadKind {
  const words = titleWords(event.title ?? "");
  if (words.length === 0) return "time";
  const candidates = wordsWithJoinedNeighbours(words);

  const isNonPhysicalContest = candidates.some((word) => NON_PHYSICAL_CONTEST_MARKERS.some((marker) => word.includes(marker)));
  const isJobContext = event.category === "job" || words.some((word) => AGILE_SPRINT_MARKERS.includes(word));

  const hit = PHYSICAL_LOAD_TITLE_KEYWORDS.some((keyword) => {
    if (isNonPhysicalContest && CONTEST_KEYWORDS.has(keyword)) return false;
    if (isJobContext && JOB_BRAKED_KEYWORDS.has(keyword)) return false;
    return candidates.some((word) => matchesKeyword(word, keyword));
  });
  return hit ? "physical" : "time";
}

/** Nur-Titel-Sicht von `classifyEventLoad` (ohne Kategorie-Bremse). */
export function isPhysicalLoadTitle(title: string): boolean {
  return classifyEventLoad({ title }) === "physical";
}
