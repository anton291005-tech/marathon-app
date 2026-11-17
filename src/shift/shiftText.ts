/**
 * Texte des Schicht-Modus (Deutsch, Du-Form, ruhig, ohne medizinische Aussagen). Nur feste Bausteine, kein Modell.
 * Der Kern (`readinessCore/shiftDays.ts`) liefert Eignung und Grund-Code; hier entstehen die Sätze.
 */
import { weekdayOf } from "../planCore/dates";
import { isNightShift, resolveShiftTimes, timeToMinutes } from "../readinessCore/shiftDays";
import type { ShiftCategory, ShiftDayAssessment, ShiftEntry, ShiftKind } from "../readinessCore/shiftDays";

export const SHIFT_KIND_LABEL: Readonly<Record<ShiftKind, string>> = {
  early: "Früh",
  late: "Spät",
  night: "Nacht",
  off: "Frei",
  custom: "Eigene Zeit",
};

const SHIFT_NOUN: Readonly<Record<ShiftKind, string>> = {
  early: "Frühdienst",
  late: "Spätdienst",
  night: "Nachtdienst",
  off: "freier Tag",
  custom: "Dienst",
};

const WEEKDAY_LONG: Readonly<Record<string, string>> = {
  Mo: "Montag",
  Di: "Dienstag",
  Mi: "Mittwoch",
  Do: "Donnerstag",
  Fr: "Freitag",
  Sa: "Samstag",
  So: "Sonntag",
};

const MONTH_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export function weekdayLongDe(ymd: string): string {
  return WEEKDAY_LONG[weekdayOf(ymd)] ?? ymd;
}

/** „Do, 19. Nov“ */
export function dayLabelDe(ymd: string): string {
  return `${weekdayOf(ymd)}, ${Number(ymd.slice(8, 10))}. ${MONTH_SHORT[Number(ymd.slice(5, 7)) - 1] ?? ""}`.trim();
}

function clock(minutes: number, withMinutes: boolean): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return withMinutes ? `${h}:${String(mm).padStart(2, "0")}` : String(h);
}

/** „22–6 Uhr“, „17:00–0:30 Uhr“; leer bei frei/ungültig. */
export function formatShiftTimes(entry: Pick<ShiftEntry, "kind" | "start" | "end" | "dateYmd">): string {
  const times = resolveShiftTimes(entry as ShiftEntry);
  if (!times) return "";
  const withMinutes = times.start % 60 !== 0 || times.end % 60 !== 0;
  return `${clock(times.start, withMinutes)}–${clock(times.end, withMinutes)} Uhr`;
}

/** „Nachtdienst (22–6 Uhr)“ */
export function describeShift(entry: ShiftEntry): string {
  if (entry.kind === "off") return "freier Tag";
  const noun = entry.kind === "custom" ? (isNightShift(entry) ? "Nachtdienst" : "Dienst") : SHIFT_NOUN[entry.kind];
  const times = formatShiftTimes(entry);
  return times ? `${noun} (${times})` : noun;
}

/** Kürzel für die Wochenansicht: F · S · N · frei; eigene Zeiten nach Beginn eingeordnet. */
export function shiftShortLabel(entry: ShiftEntry): string {
  if (entry.kind === "off") return "frei";
  if (entry.kind === "early") return "F";
  if (entry.kind === "late") return "S";
  if (entry.kind === "night") return "N";
  if (isNightShift(entry)) return "N";
  const start = timeToMinutes(entry.start);
  return start != null && start < 12 * 60 ? "F" : "S";
}

/** Name der Einheit im Satz: „Intervalle“, „den Tempolauf“, „den Long Run“. */
export function sessionNounDe(type: string): { plain: string; withArticle: string } {
  switch (type) {
    case "interval":
      return { plain: "Intervalle", withArticle: "die Intervalle" };
    case "tempo":
      return { plain: "einen Tempolauf", withArticle: "den Tempolauf" };
    case "long":
      return { plain: "einen Long Run", withArticle: "den Long Run" };
    case "race":
      return { plain: "ein Rennen", withArticle: "das Rennen" };
    default:
      return { plain: "einen Lauf", withArticle: "den Lauf" };
  }
}

/** Grund als Satzanfang mit Dienst: „Nach dem Nachtdienst (22–6 Uhr)“. */
export function reasonLeadDe(day: ShiftDayAssessment, category?: ShiftCategory): string {
  const code = category ? day.reasons[category] : day.reasonCode;
  const cause = day.causeShift ?? day.shift;
  const what = cause ? describeShift(cause) : "";
  switch (code) {
    case "after_night":
      return what ? `Nach dem ${what}` : "Nach dem Nachtdienst";
    case "between_nights":
      return "Zwischen zwei Nachtdiensten";
    case "before_night":
      return what ? `Vor dem ${what}` : "Vor dem Nachtdienst";
    case "recovery_after_nights":
      return "Am ersten freien Tag nach den Nachtdiensten";
    case "free_after_nights":
      return "Am zweiten freien Tag nach den Nachtdiensten";
    case "quick_return":
      return what ? `Mit weniger als 11 Stunden Ruhe nach dem ${what}` : "Mit weniger als 11 Stunden Ruhe zwischen zwei Diensten";
    case "late_shift":
      return what ? `Nach dem ${what}` : "Nach dem Spätdienst bis nach Mitternacht";
    case "no_window":
      return what ? `Neben dem ${what}` : "Neben dem Dienst";
    case "long_shift":
      return what ? `Mit dem langen ${what}` : "Mit dem langen Dienst";
    case "day_off":
      return "Du hast frei";
    case "shift_fits":
      return what ? `Der ${what} lässt Zeit` : "Der Dienst lässt Zeit";
    default:
      return day.reasonText;
  }
}

/** Kurzer Grund für eine Planzeile: „nach dem Nachtdienst (22–6 Uhr)“. */
export function reasonPhraseDe(day: ShiftDayAssessment, category?: ShiftCategory): string {
  const lead = reasonLeadDe(day, category);
  return lead.charAt(0).toLowerCase() + lead.slice(1);
}

/** Warum der Zieltag passt: „da hast du frei“. */
export function targetReasonDe(day: ShiftDayAssessment | undefined): string | null {
  if (!day) return null;
  if (day.reasonCode === "day_off" || day.reasonCode === "free_after_nights") return "da hast du frei";
  if (day.reasonCode === "shift_fits" && day.shift) return `da passt es neben dem ${describeShift(day.shift)}`;
  return null;
}

/**
 * Hauptsatz eines Vorschlags: „Nach dem Nachtdienst (22–6 Uhr) ist Mittwoch kein guter Tag für Intervalle.
 * Vorschlag: Donnerstag – da hast du frei.“ (`fromYmd === todayYmd` → „heute“).
 */
export function moveSentenceDe(args: {
  sessionType: string;
  fromDay: ShiftDayAssessment;
  fromYmd: string;
  toYmd: string;
  toDay?: ShiftDayAssessment;
  todayYmd: string;
  category: ShiftCategory;
  limited: boolean;
}): string {
  const when = args.fromYmd === args.todayYmd ? "heute" : weekdayLongDe(args.fromYmd);
  const noun = sessionNounDe(args.sessionType).plain;
  const lead = reasonLeadDe(args.fromDay, args.category);
  const verdict = args.limited ? `ist ${when} nur bedingt ein guter Tag für ${noun}` : `ist ${when} kein guter Tag für ${noun}`;
  const target = targetReasonDe(args.toDay);
  return `${lead} ${verdict}. Vorschlag: ${weekdayLongDe(args.toYmd)}${target ? ` – ${target}` : ""}.`;
}

/** Satz, wenn statt Verschieben „locker statt hart“ vorgeschlagen wird. */
export function softenSentenceDe(args: { sessionType: string; fromDay: ShiftDayAssessment; fromYmd: string; todayYmd: string }): string {
  const when = args.fromYmd === args.todayYmd ? "heute" : `am ${weekdayLongDe(args.fromYmd)}`;
  const noun = sessionNounDe(args.sessionType).withArticle;
  return `${reasonLeadDe(args.fromDay, "hard")} gibt es diese Woche keinen sicheren Tag für ${noun}. Vorschlag: ${when} locker laufen.`;
}

/**
 * Genau ein Satz für „Heute“ an Tagen mit Schichtbezug. `movedToYmd`: falls die harte Einheit dieser Woche schon auf
 * einen anderen Tag gelegt wurde (nur Anzeige).
 */
export function todayShiftLineDe(day: ShiftDayAssessment, sessionType: string | null): string {
  const category: ShiftCategory | null =
    !sessionType || sessionType === "rest" ? null : sessionType === "long" ? "long" : ["interval", "tempo", "race"].indexOf(sessionType) >= 0 ? "hard" : "easy";
  if (!category) {
    if (day.reasonCode === "after_night" || day.reasonCode === "between_nights") return `${reasonLeadDe(day)} passt der Ruhetag heute gut.`;
    if (day.reasonCode === "day_off") return "Heute hast du frei und Ruhetag.";
    return `${reasonLeadDe(day)} – heute steht ohnehin kein Training an.`;
  }
  const suit = category === "hard" ? day.hard : category === "long" ? day.long : day.easy;
  const lead = reasonLeadDe(day, category);
  const noun = category === "easy" ? "deinen Lauf" : sessionNounDe(sessionType as string).withArticle;
  if (suit === "free") return freeLineDe(day, noun);
  if (category === "easy") {
    if (suit === "no_window") return `${lead} bleibt heute kaum Zeit – lieber kürzen oder auf einen anderen Tag legen.`;
    return `${lead}: heute nur kurz und locker, und erst nach dem Schlafen.`;
  }
  if (suit === "unsuitable" || suit === "no_window") return `${lead} ist heute kein guter Tag für ${noun} – im Woche-Tab findest du einen Vorschlag.`;
  return `${lead}: lauf dich 10–15 min ein und mach einen lockeren Lauf daraus, wenn es sich nicht richtig anfühlt.`;
}

function freeLineDe(day: ShiftDayAssessment, noun: string): string {
  if (day.reasonCode === "day_off" || day.reasonCode === "free_after_nights") return `Heute hast du frei – gute Zeit für ${noun}.`;
  if (day.shift && day.shift.kind !== "off") return `Der ${describeShift(day.shift)} lässt dir heute Zeit für ${noun}.`;
  return `Heute passt ${noun} gut zu deinem Dienstplan.`;
}

/** Einleitung der Wizard-Frage und der Karte auf „Heute“. */
export const SHIFT_QUESTION = "Arbeitest du in Schichten oder mit wechselnden Zeiten?";
export const SHIFT_BENEFIT =
  "Dann trag deinen Dienstplan ein: MyRace erkennt Tage nach Nacht- und Spätdiensten und schlägt dir passendere Tage für harte Einheiten vor.";
export const SHIFT_UNAVAILABLE_NOTE =
  "Der Dienstplan kann in deinem Konto gerade noch nicht gespeichert werden. Deine Einträge bleiben vorerst auf diesem Gerät.";
