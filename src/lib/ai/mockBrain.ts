import { buildActionPreview } from "./actions";
import type { AiAssistantResponse, AiContext } from "./types";

type IntentId =
  | "adjust_plan_for_illness"
  | "replace_bike_with_run"
  | "shift_race_date"
  | "shift_plan_start_date"
  | "navigate_to_screen"
  | "explain_feature";

type ScoredIntent = {
  id: IntentId;
  score: number;
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[!?.,;:()[\]{}"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function countMatches(text: string, terms: string[]): number {
  return terms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
}

function detectShiftDays(text: string): number {
  const weekMatch = text.match(/(\d+)\s*woche/);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  if (hasAny(text, ["eine woche", "naechste woche", "nachste woche"])) return 7;
  const dayMatch = text.match(/(\d+)\s*tag/);
  if (dayMatch) return Number(dayMatch[1]);
  if (hasAny(text, ["ein paar tage", "paar tage"])) return 3;
  return 7;
}

function getWeekdayTargetOffset(text: string, context: AiContext): number | null {
  const weekdayTokens: Record<string, number> = {
    sonntag: 0,
    montag: 1,
    dienstag: 2,
    mittwoch: 3,
    donnerstag: 4,
    freitag: 5,
    samstag: 6,
  };
  const token = Object.keys(weekdayTokens).find((day) => text.includes(day));
  if (!token) return null;
  const now = new Date(context.todayIso);
  const current = now.getDay();
  const target = weekdayTokens[token];
  let offset = (target - current + 7) % 7;
  if (offset === 0) offset = 7;
  if (hasAny(text, ["naechst", "nachst"])) offset += 7;
  return Math.max(1, Math.min(21, offset));
}

function detectStartShiftDays(text: string, context: AiContext): number {
  const weekdayOffset = getWeekdayTargetOffset(text, context);
  if (weekdayOffset) return weekdayOffset;
  const dayMatch = text.match(/(\d+)\s*tag/);
  if (dayMatch) return Math.max(1, Math.min(21, Number(dayMatch[1])));
  if (hasAny(text, ["naechste woche", "nachste woche", "erst naechste woche", "starte spaeter"])) return 7;
  if (hasAny(text, ["ein paar tage", "paar tage"])) return 3;
  return 4;
}

function mapNavigationTarget(text: string, context: AiContext) {
  const hasSetting = /einstellung|setting|zielzeit|rennziel/.test(text);
  if (hasSetting) {
    return {
      targetScreen: "settings",
      targetScreenLabel: "Einstellungen",
      section: "race_goal",
      sectionLabel: "Rennziel",
    };
  }
  const hasWeek = /wochenplan|woche|wochenansicht/.test(text);
  if (hasWeek) {
    return {
      targetScreen: "week",
      targetScreenLabel: "Wochenplan",
      section: "current_week",
      sectionLabel: "Aktuelle Woche",
    };
  }
  const fallback = context.availableScreens[0];
  return {
    targetScreen: fallback?.key || "home",
    targetScreenLabel: fallback?.label || "Start",
    section: undefined,
    sectionLabel: undefined,
  };
}

function scoreIntents(text: string): ScoredIntent[] {
  const illnessTerms = ["krank", "erkaltet", "erkaelt", "angeschlagen", "nicht fit", "grippe", "fieber", "huste", "infekt"];
  const illnessPlanTerms = ["plan anpassen", "training reduzieren", "zuruckfahren", "zurueckfahren"];

  const bikeTerms = ["rennrad", "bike", "rad fahren", "fahrrad"];
  const bikeIssueTerms = ["werkstatt", "kaputt", "defekt", "faellt aus", "fallt aus", "kann nicht"];
  const bikeReplacementTerms = ["ersatzlauf", "ersatztraining", "radeinheit ersetzen", "stattdessen lauf"];

  const raceTerms = ["rennen", "wettkampf", "marathon", "race date", "race"];
  const raceShiftTerms = ["verschoben", "verlegt", "spaeter", "spater", "eine woche spaeter", "hat sich verschoben"];

  const startTerms = ["starte erst", "fange erst", "kann erst", "trainingsstart", "start verschieben", "spater anfangen", "spaeter anfangen"];

  const navTerms = ["wo finde", "navigier", "oeffne", "offne", "zeige mir", "bring mich", "zum plan", "zu den einstellungen"];
  const explainTerms = ["was ist", "was bedeutet", "erklar", "erklaere", "readiness", "taper", "app"];

  const scores: ScoredIntent[] = [
    {
      id: "adjust_plan_for_illness",
      score: (countMatches(text, illnessTerms) * 4) + (countMatches(text, illnessPlanTerms) * 2),
    },
    {
      id: "replace_bike_with_run",
      score:
        (countMatches(text, bikeTerms) * 2) +
        (countMatches(text, bikeIssueTerms) * 2) +
        (countMatches(text, bikeReplacementTerms) * 3),
    },
    {
      id: "shift_race_date",
      score: (countMatches(text, raceTerms) * 2) + (countMatches(text, raceShiftTerms) * 3),
    },
    {
      id: "shift_plan_start_date",
      score: (countMatches(text, startTerms) * 3) + (hasAny(text, ["naechste woche", "donnerstag"]) ? 2 : 0),
    },
    {
      id: "navigate_to_screen",
      score: countMatches(text, navTerms) * 3,
    },
    {
      id: "explain_feature",
      score: countMatches(text, explainTerms) * 2,
    },
  ];
  return scores;
}

function pickIntent(text: string): IntentId | null {
  const scores = scoreIntents(text).sort((a, b) => b.score - a.score);
  const best = scores[0];
  if (!best || best.score <= 0) return null;

  // Priority for safety and explicit operational requests.
  const priority: IntentId[] = [
    "shift_plan_start_date",
    "shift_race_date",
    "adjust_plan_for_illness",
    "replace_bike_with_run",
    "navigate_to_screen",
    "explain_feature",
  ];
  const sameScore = scores.filter((entry) => entry.score === best.score).map((entry) => entry.id);
  if (sameScore.length <= 1) return best.id;
  return priority.find((id) => sameScore.includes(id)) || best.id;
}

function stableVariantIndex(seed: string, size: number): number {
  const safeSize = Math.max(1, size);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % safeSize;
}

function getRecentLoadSignals(context: AiContext): { avgFeeling: number | null; doneCount: number } {
  const logs = context.logs || {};
  const doneLogs = Object.values(logs).filter((entry: any) => entry?.done);
  const feelings = doneLogs
    .map((entry: any) => Number(entry?.feeling))
    .filter((value) => Number.isFinite(value));
  const avgFeeling = feelings.length ? feelings.reduce((sum, value) => sum + value, 0) / feelings.length : null;
  return {
    avgFeeling: avgFeeling === null ? null : Number(avgFeeling.toFixed(2)),
    doneCount: doneLogs.length,
  };
}

function getNextKeySessionLabel(context: AiContext): string {
  const next = context.next14Days.find((session) => ["interval", "tempo", "long", "race"].includes(session.type))
    || context.next14Days[0];
  if (!next) return "deine naechste Qualitaetseinheit";
  return `${next.day} ${next.date} (${next.title})`;
}

function detectRiskSignals(text: string, context: AiContext) {
  const load = getRecentLoadSignals(context);
  const illness = hasAny(text, ["krank", "erkaelt", "erkaltet", "grippe", "fieber", "infekt", "husten"]);
  const injury = hasAny(text, ["knie", "stech", "schmerz", "sehne", "verletz", "pain"]);
  const fatigueByWords = hasAny(text, ["muede", "mude", "erschoepft", "erschopft", "schlapp", "leer"]);
  const fatigueByLogs = load.avgFeeling !== null && load.avgFeeling <= 2.6;
  const fatigue = fatigueByWords || fatigueByLogs;
  const wantsHard = hasAny(text, ["interval", "intervalle", "tempo", "hart", "durchziehen"]);
  const insists = hasAny(text, ["ich will", "trotzdem", "egal", "push"]);
  return {
    illness,
    injury,
    fatigue,
    pushDespiteRisk: wantsHard && (fatigue || illness || injury || insists),
    nextKeySession: getNextKeySessionLabel(context),
    avgFeeling: load.avgFeeling,
  };
}

function buildRiskCoachMessage(text: string, risk: ReturnType<typeof detectRiskSignals>): string {
  const variant = stableVariantIndex(text, 3);
  if (risk.injury) {
    const openers = [
      "Stechender Knieschmerz ist ein klares Warnsignal.",
      "Das ist kein normaler Trainingsschmerz, das ist ein Risikozeichen.",
      "Mit stechendem Schmerz trainierst du Richtung Ausfall.",
    ];
    return `${openers[variant]} Heute kein Laufen und keine Intensitaet, stattdessen Last fuer 48-72h deutlich reduzieren. Wenn der Schmerz bleibt, sportmedizinisch abklaeren.`;
  }
  if (risk.pushDespiteRisk || risk.fatigue) {
    const openers = [
      "Muedigkeit und Intervalle passen heute nicht zusammen.",
      "Du gewinnst heute nichts mit einer harten Einheit auf mueden Beinen.",
      "Das ist ein Ego-Tag, kein Performance-Tag.",
    ];
    const loadHint = risk.avgFeeling !== null ? `Aktuell liegt dein Belastungssignal bei ca. ${risk.avgFeeling.toFixed(1)}/5. ` : "";
    return `${openers[variant]} ${loadHint}Heute nur locker oder komplett frei, keine Intervalle. Schiebe Qualitaet auf ${risk.nextKeySession}.`;
  }
  const ask = text.includes("ich bin krank") ? "Seit wann bist du krank und hast du Fieber oder Brustsymptome? " : "";
  return `Krankheit hat Trainingsvorrang. ${ask}Heute 2-4 Tage Pause vom Laufen, nur Spaziergang oder Mobility wenn fieberfrei. Danach 20-30 Min lockerer Testlauf und Reaktion 24h beobachten.`;
}

function buildRiskPreview(risk: ReturnType<typeof detectRiskSignals>) {
  if (risk.injury) {
    return {
      title: "Vorsicht bei Verletzungssignal",
      items: [
        "Heute keine Laufeinheit, keine Intensitaet.",
        "48-72h Last deutlich reduzieren, nur schmerzfreie Bewegung.",
        "Rueckkehr erst bei Schmerzfreiheit im Alltag und lockeren Schritten.",
      ],
      confirmLabel: "Uebernehmen",
      secondaryLabel: "Bearbeiten",
      cancelLabel: "Abbrechen",
    };
  }
  if (risk.pushDespiteRisk || risk.fatigue) {
    return {
      title: "Laststeuerung heute",
      items: [
        "Intervalle heute streichen.",
        "Stattdessen locker 20-40 Min oder kompletter Ruhetag.",
        `Naechster Qualitaetstermin: ${risk.nextKeySession}.`,
      ],
      confirmLabel: "Uebernehmen",
      secondaryLabel: "Bearbeiten",
      cancelLabel: "Abbrechen",
    };
  }
  return {
    title: "Krankheits-Anpassung",
    items: [
      "2-4 Tage Laufpause.",
        "Nur Spaziergang/Mobility und nur fieberfrei.",
      "Dann 20-30 Min Testlauf und 24h checken.",
    ],
    confirmLabel: "Uebernehmen",
    secondaryLabel: "Bearbeiten",
    cancelLabel: "Abbrechen",
  };
}

export function buildMockAiResponse(userInput: string, context: AiContext): AiAssistantResponse {
  const text = normalize(userInput);
  const risk = detectRiskSignals(text, context);
  if (risk.illness || risk.injury || risk.pushDespiteRisk) {
    const severity = risk.injury ? "high" : risk.pushDespiteRisk ? "moderate" : "low";
    const reason = risk.injury ? "injury_signal" : risk.pushDespiteRisk ? "high_fatigue" : "illness";
    const action = {
      type: "adjust_plan_for_illness" as const,
      payload: { reason, severity },
      preview: buildRiskPreview(risk),
    };
    return {
      mode: "coach",
      message: buildRiskCoachMessage(text, risk),
      action,
    };
  }
  const intent = pickIntent(text);

  if (intent === "adjust_plan_for_illness") {
    const action = {
      type: "adjust_plan_for_illness" as const,
      payload: { reason: "illness" },
    };
    return {
      mode: "coach",
      message:
        "Assessment: Krankheitszeichen aktiv; Risiko fuer Rueckfall ist heute erhoeht. Entscheidung heute: 2-4 Tage Laufpause, nur Spaziergang oder Mobility wenn fieberfrei. Grund: So schuetzen wir die naechsten Qualitaetseinheiten und den sub-2:50 Aufbau.",
      action: {
        ...action,
        preview: buildActionPreview(action, context),
      },
    };
  }

  if (intent === "shift_plan_start_date") {
    const requestedStartOffsetDays = detectStartShiftDays(text, context);
    const action = {
      type: "shift_plan_start_date" as const,
      payload: {
        requestedStartOffsetDays,
        reason: "late_start",
      },
    };
    return {
      mode: "coach",
      message: `Assessment: Deine aktuelle Belastbarkeit passt nicht zu einem harten Einstieg. Entscheidung heute: Start um ${requestedStartOffsetDays} Tage nach hinten und dann kontrolliert anlaufen. Grund: Konstanz ist wichtiger als ein frueher, riskanter Start Richtung sub-2:50.`,
      action: {
        ...action,
        preview: buildActionPreview(action, context),
      },
    };
  }

  if (intent === "replace_bike_with_run") {
    const action = {
      type: "replace_bike_with_run" as const,
      payload: { reason: "bike_unavailable" },
    };
    return {
      mode: "coach",
      message:
        "Assessment: Der Ausfall der Bike-Einheit ist kein Leistungsproblem. Entscheidung heute: Ersetze sie durch einen lockeren, klar dosierten Lauf ohne Zusatztempo. Grund: Wir halten den Reiz sauber und vermeiden unnoetige Ermuedung fuer die wichtigen Sessions.",
      action: {
        ...action,
        preview: buildActionPreview(action, context),
      },
    };
  }

  if (intent === "shift_race_date") {
    const shiftDays = detectShiftDays(text);
    const action = {
      type: "shift_race_date" as const,
      payload: { shiftDays },
    };
    return {
      mode: "coach",
      message: `Assessment: Der Wettkampfzeitpunkt hat sich geaendert, das erfordert saubere Neu-Steuerung. Entscheidung heute: Ich verschiebe den verbleibenden Plan um ${shiftDays} Tage bei gleicher Grundstruktur. Grund: So bleiben Progression und Formaufbau stabil fuer dein sub-2:50 Ziel.`,
      action: {
        ...action,
        preview: buildActionPreview(action, context),
      },
    };
  }

  if (intent === "navigate_to_screen") {
    const target = mapNavigationTarget(text, context);
    const action = {
      type: "navigate_to_screen" as const,
      payload: target,
    };
    return {
      mode: "navigator",
      message: "Ich kann dich direkt dorthin bringen.",
      action: {
        ...action,
        preview: buildActionPreview(action, context),
      },
    };
  }

  if (intent === "explain_feature") {
    let explain = "Readiness zeigt, wie belastbar deine aktuelle Datenlage fuer eine vernuenftige Prognose ist.";
    if (text.includes("taper")) {
      explain = "Taper ist die geplante Entlastung vor dem Rennen: weniger Umfang, genug Reize, frische Beine am Start.";
    } else if (hasAny(text, ["app", "erklar", "erklaere"])) {
      explain =
        "Die App kombiniert Trainingsplan, Wochensteuerung und Performance-Hinweise. Der AI Coach schlaegt Aktionen vor, die du erst bestaetigst.";
    }
    return {
      mode: "support",
      message: explain,
      action: {
        type: "explain_feature",
        payload: { topic: text.includes("taper") ? "taper" : "readiness" },
      },
    };
  }

  return {
    mode: "support",
    message:
      "Ich bin noch nicht ganz sicher, was du brauchst. Ich kann z.B. den Plan bei Krankheit anpassen, den Start verschieben, ein Bike-Workout ersetzen oder dich direkt zu einem Screen navigieren.",
  };
}

export async function mockBrainGenerate(userInput: string, context: AiContext): Promise<AiAssistantResponse> {
  return buildMockAiResponse(userInput, context);
}
