/**
 * Read-only Textgenerierung für Recovery — keine Netzwerk-Calls, stabil.
 */

import type {
  AiReasoningMode,
  DailyRecoveryComputed,
  RecoveryConfidenceModel,
  RecoveryDailyRow,
  RecoveryInsight,
  RecoveryInsightDataMode,
  SemanticUncertaintyState,
} from "./recoveryTypes";
import { baselineValues, buildPlanWeekToDateMap, computeDailyRecoverySeries, median } from "./recoveryScoringEngine";
import {
  aiReasoningModeFromSemantic,
  insightDataModeFromSemantic,
  rollupSemanticUncertaintyState,
} from "./recoverySemanticLayer";
import { last7CalendarDays, ymd } from "./recoveryCalendarUtils";
import type { PlanWeek, SessionLog } from "../marathonPrediction";
import { getAppNow } from "../core/time/timeSystem";

function mean(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export type RecoveryWarningFlags = {
  hrvDown3Plus: boolean;
  sleepDeficit2Nights: boolean;
  rhrElevatedPersistent: boolean;
  stressCombo: boolean;
};

export function detectRecoveryWarnings(
  rowsByDate: Map<string, RecoveryDailyRow>,
  baselineHrv: number | null,
  baselineSleep: number | null,
  baselineRhr: number | null,
  now: Date = getAppNow(),
): RecoveryWarningFlags {
  const last7 = last7CalendarDays(now);
  let hrvDown3Plus = false;
  if (baselineHrv) {
    const tail3 = last7.slice(-3);
    const vals = tail3.map((d) => rowsByDate.get(d)?.hrvMs);
    if (vals.every((v): v is number => typeof v === "number")) {
      hrvDown3Plus = vals.every((v) => v < baselineHrv * 0.92);
    }
  }

  let deficitNights = 0;
  if (baselineSleep) {
    for (const d of last7) {
      const h = rowsByDate.get(d)?.sleepHours;
      if (h !== undefined && h < baselineSleep - 0.95) deficitNights += 1;
    }
  }
  const sleepDeficit2Nights = deficitNights >= 2;

  let rhrElevatedPersistent = false;
  if (baselineRhr && last7.length >= 5) {
    const elevated = last7.filter((d) => {
      const r = rowsByDate.get(d)?.restingHr;
      return typeof r === "number" && r > baselineRhr + 3.5;
    }).length;
    if (elevated >= 5) rhrElevatedPersistent = true;
  }

  const ind = [hrvDown3Plus, sleepDeficit2Nights, rhrElevatedPersistent].filter(Boolean).length;
  const stressCombo = ind >= 2;

  return { hrvDown3Plus, sleepDeficit2Nights, rhrElevatedPersistent, stressCombo };
}

export function buildRecoveryInsightText(args: {
  /** Last 7 calendar days of latent R_t (sole driver for tone / level). */
  last7LatentR: number[];
  dailyRows: RecoveryDailyRow[];
  warnings: RecoveryWarningFlags;
  baselineSleep: number | null;
  baselineHrv: number | null;
  loadStressIdx: number;
  now?: Date;
  dataMode: RecoveryInsightDataMode;
  recoveryConfidence: RecoveryConfidenceModel | null;
  semanticUncertaintyState: SemanticUncertaintyState | null;
  aiReasoningMode: AiReasoningMode | null;
}): RecoveryInsight {
  const {
    last7LatentR,
    dailyRows,
    warnings,
    baselineSleep,
    baselineHrv,
    loadStressIdx,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
  } = args;
  const now = args.now ?? getAppNow();
  const rowsByDate = new Map(dailyRows.map((r) => [r.date, r]));
  const last7dates = last7CalendarDays(now);

  if (last7LatentR.length === 0) {
    return {
      text:
        "Zu wenig Daten für eine stabile Recovery-Aussage. Sobald Schlaf- und Vitaldaten vorliegen, wird der Verlauf aussagekräftiger.",
      showWarning: false,
      dataMode: "low",
      recoveryConfidence,
      semanticUncertaintyState: "highUncertainty",
      aiReasoningMode: "uncertain",
    };
  }

  const mode = aiReasoningMode ?? "probabilistic";

  const avgR = mean(last7LatentR);
  const tone =
    avgR === null
      ? "moderat"
      : avgR >= 85
        ? "exzellent"
        : avgR >= 70
          ? "gut"
          : avgR >= 50
            ? "moderat"
            : "eingeschränkt";

  const sleepHours = last7dates.map((d) => rowsByDate.get(d)?.sleepHours).filter((v): v is number => typeof v === "number");
  const avgSleep = mean(sleepHours);
  let sleepClause = "";
  if (mode === "deterministic") {
    if (avgSleep !== null && baselineSleep) {
      const diff = avgSleep - baselineSleep;
      if (diff < -0.35) sleepClause = ` Schlafdauer klar unter deinem üblichen Niveau.`;
      else if (diff > 0.35) sleepClause = ` Schlafdauer klar über deinem Mittel.`;
      else sleepClause = ` Schlafdauer liegt nah an deinem persönlichen Mittel.`;
    } else if (sleepHours.length < 3) {
      sleepClause = ` Schlaf ist nur teilweise erfasst — klarer Schluss auf die Nächte allein geht nicht.`;
    }
  } else if (mode === "probabilistic") {
    if (avgSleep !== null && baselineSleep) {
      const diff = avgSleep - baselineSleep;
      if (diff < -0.35)
        sleepClause = ` Schlafdauer liegt wahrscheinlich unter deinem Mittel; leichte Unsicherheit durch mögliche Erfassungslücken.`;
      else if (diff > 0.35)
        sleepClause = ` Schlafdauer liegt vermutlich über deinem Mittel; Bandbreite ist nicht exakt fixierbar.`;
      else sleepClause = ` Schlafdauer bewegt sich plausibel nahe deinem Mittel, mit Restunsicherheit.`;
    } else if (sleepHours.length < 3) {
      sleepClause = ` Schlafdaten sind lückenhaft — Trend zur Schlafdauer nur vorsichtig ableitbar.`;
    }
  } else {
    if (sleepHours.length >= 4 && baselineSleep && avgSleep !== null) {
      const diff = avgSleep - baselineSleep;
      if (diff < -0.5) sleepClause = ` Richtung eher weniger Schlaf als üblich — keine feste Aussage zur absoluten Qualität.`;
      else if (diff > 0.5) sleepClause = ` Richtung eher mehr Schlaf als üblich — Details unsicher.`;
      else sleepClause = ` Kein klarer Schlaf-Trend ableitbar bei dieser Datenlage.`;
    } else {
      sleepClause = ` Schlaf-Trend nicht belastbar genug für konkrete Aussagen — nur grobe Richtung möglich.`;
    }
  }

  const hrvVals = last7dates.map((d) => rowsByDate.get(d)?.hrvMs).filter((v): v is number => typeof v === "number");
  const avgHrv = mean(hrvVals);
  let hrvClause = "";
  if (mode === "deterministic") {
    if (avgHrv !== null && baselineHrv) {
      const ratio = avgHrv / baselineHrv;
      if (ratio >= 1.03) hrvClause = " HRV ist stabil bis freundlich — ANS wirkt entspannt.";
      else if (ratio <= 0.94) hrvClause = " HRV liegt unter deiner typischen Bandbreite; Belastung möglich, aber nicht allein beweisend.";
      else hrvClause = " HRV liegt in vertrauter Bandbreite.";
    } else if (hrvVals.length < 3) {
      hrvClause = " HRV zu lückenhaft für eine feste Aussage.";
    }
  } else if (mode === "probabilistic") {
    if (avgHrv !== null && baselineHrv) {
      const ratio = avgHrv / baselineHrv;
      if (ratio >= 1.03)
        hrvClause =
          " HRV steht wahrscheinlich im freundlichen Bereich; leichte Unsicherheit bleibt durch Tages- und Messvarianz.";
      else if (ratio <= 0.94)
        hrvClause =
          " HRV liegt vermutlich unter deiner Norm; das spricht mit mittlerer Sicherheit für mehr Stress/Last, ohne Diagnosecharakter.";
      else hrvClause = " HRV wirkt plausibel normal, mit typischer Messunsicherheit.";
    } else if (hrvVals.length < 3) {
      hrvClause = " HRV nur teilweise sichtbar — Interpretation bleibt probabilistisch.";
    }
  } else {
    if (hrvVals.length >= 4 && avgHrv !== null && baselineHrv) {
      const ratio = avgHrv / baselineHrv;
      if (ratio < 0.96) hrvClause = " Grobe Richtung: HRV eher nach unten — keine präzise Lageangabe.";
      else if (ratio > 1.02) hrvClause = " Grobe Richtung: HRV eher freundlich — keine feste Einordnung.";
      else hrvClause = " HRV-Trend nicht eindeutig bei dieser Datenlage.";
    } else {
      hrvClause = " HRV nicht ausreichend, um mehr als eine vage Richtung zu nennen.";
    }
  }

  let trainClause = "";
  if (mode === "deterministic") {
    trainClause = " Trainingslast wird nichtlinear aus Last und aktuellem Vital-Kontext abgeleitet; sie kann Recovery nicht nach oben rechnen.";
    if (avgR !== null && loadStressIdx >= 3.8 && avgR >= 72) {
      trainClause =
        " Höhere Blocklast trifft auf noch tragfähige Vitalzeichen — das spricht für eine funktionierende Adaptation.";
    } else if (avgR !== null && loadStressIdx >= 3.8 && avgR < 58) {
      trainClause = " Hohe Last ist spürbar im Modell; Konstanz bei Schlaf und leichte Tage sind sinnvoll.";
    }
  } else if (mode === "probabilistic") {
    trainClause =
      " Trainings-Stress im Modell wahrscheinlich moderat bis spürbar; genaue Wechselwirkung mit Recovery ist unscharf — keine scharfen Steuerungsbefehle nur aus der Last.";
  } else {
    trainClause =
      " Trainingslast lässt sich bei dieser Unsicherheit nicht zuverlässig mit Recovery koppeln — nur qualitative Richtung, keine feste Empfehlung.";
  }

  let warn = "";
  const shouldWarn =
    warnings.stressCombo ||
    (warnings.hrvDown3Plus && warnings.sleepDeficit2Nights) ||
    (warnings.rhrElevatedPersistent && warnings.hrvDown3Plus);
  if (mode === "deterministic") {
    if (shouldWarn) {
      warn =
        " Mehrere Stresssignale überlagern sich — das rechtfertigt mehr Aufmerksamkeit auf Regeneration, ohne sofortigen Planbruch.";
    } else if (warnings.hrvDown3Plus || warnings.sleepDeficit2Nights) {
      warn = " Einzelne Vital-Linien sind angespannt; kurzfristig beobachten.";
    }
  } else if (mode === "probabilistic") {
    if (shouldWarn) {
      warn =
        " Es gibt Hinweise auf überlappende Stresssignale; Wahrscheinlichkeit erhöhter Ermüdung ist erhöht, aber nicht sicher.";
    } else if (warnings.hrvDown3Plus || warnings.sleepDeficit2Nights) {
      warn = " Einige Signale sind wahrscheinlich belastet — keine harte Schlussfolgerung.";
    }
  } else if (shouldWarn || warnings.hrvDown3Plus || warnings.sleepDeficit2Nights) {
    warn = " Mögliche Belastungstrends, aber Datenlage zu dünn für verbindliche Warnungen.";
  }

  let intro = "";
  if (mode === "deterministic") {
    intro =
      tone === "exzellent"
        ? "Latenter Recovery-Zustand R der letzten 7 Tage liegt stabil im sehr guten Bereich."
        : tone === "gut"
          ? "Latenter Recovery-Zustand R der letzten 7 Tage liegt stabil im guten Bereich."
          : tone === "moderat"
            ? "Latenter Recovery-Zustand R der letzten 7 Tage ist stabil moderat."
            : "Latenter Recovery-Zustand R der letzten 7 Tage ist stabil eher begrenzt.";
  } else if (mode === "probabilistic") {
    intro =
      tone === "exzellent"
        ? "R liegt wahrscheinlich im sehr guten Bereich; Restunsicherheit durch Mess- und Tagesvarianz."
        : tone === "gut"
          ? "R liegt vermutlich im guten Bereich, mit leichter Unsicherheit."
          : tone === "moderat"
            ? "R ist wahrscheinlich moderat — keine extreme Einordnung möglich."
            : "R ist vermutlich eher begrenzt; Bandbreite bleibt unscharf.";
  } else {
    intro =
      "Hohe Unsicherheit im physiologischen Zustand — R̂ bleibt unscharf; verlässlich sind vor allem Richtungstrends, keine festen Zustandsaussagen.";
  }

  let close = "";
  if (mode === "deterministic") {
    close =
      shouldWarn || (avgR !== null && avgR < 52)
        ? " Kein sicherer Hinweis auf akute Überlastung ohne Symptome — subjektives Befinden mitentscheidend."
        : " Kein sicherer Hinweis auf akute Überlastung bei stabiler Datenlage.";
  } else if (mode === "probabilistic") {
    close =
      " Unter Unsicherheit: keine präzisen Grenzwerte — subjektives Befinden und Verlauf wiegen stärker.";
  } else {
    close = " Bei hoher Unsicherheit keine festen Handlungsschritte nur aus einer Zahl ableiten — R ist hier unscharf.";
  }

  const semanticNote =
    semanticUncertaintyState === "highUncertainty"
      ? " Reasoning-Modus: unsicher (nur Trends)."
      : semanticUncertaintyState === "mediumUncertainty"
        ? " Reasoning-Modus: probabilistisch."
        : " Reasoning-Modus: regelbasiert.";

  const confNote =
    recoveryConfidence && recoveryConfidence.overallConfidence < 0.55 && mode !== "uncertain"
      ? ` Quantitative Modell-Konfidenz eher niedrig (${Math.round(recoveryConfidence.overallConfidence * 100)} %).`
      : "";

  const text = `${intro}${sleepClause}${hrvClause}${trainClause}${warn}${close} ${semanticNote}${confNote}`
    .replace(/\s+/g, " ")
    .trim();

  return {
    text,
    showWarning: shouldWarn,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
  };
}

export function buildLast7InsightFromState(args: {
  dailyRows: RecoveryDailyRow[];
  plan: PlanWeek[];
  logs: Record<string, SessionLog>;
  now?: Date;
  loadStressIdx: number;
  precomputedSeries?: DailyRecoveryComputed[];
}): RecoveryInsight {
  const now = args.now ?? getAppNow();
  const { series } = args.precomputedSeries
    ? { series: args.precomputedSeries }
    : computeDailyRecoverySeries(
        args.dailyRows,
        buildPlanWeekToDateMap(args.plan),
        args.plan,
        args.logs,
        now,
      );
  const rowsByDate = new Map(args.dailyRows.map((r) => [r.date, r]));
  const todayYmd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const last7dates = last7CalendarDays(now);
  const last7LatentR = last7dates
    .map((d) => series.find((s) => s.date === d)?.latentR)
    .filter((v): v is number => typeof v === "number");

  const last7Series = last7dates
    .map((d) => series.find((s) => s.date === d))
    .filter((x): x is DailyRecoveryComputed => !!x);

  const semanticRoll = rollupSemanticUncertaintyState(last7Series.map((s) => s.semanticUncertaintyState));
  const semanticUncertaintyState = semanticRoll ?? "highUncertainty";
  const aiReasoningMode = aiReasoningModeFromSemantic(semanticUncertaintyState);
  const dataMode: RecoveryInsightDataMode = insightDataModeFromSemantic(semanticUncertaintyState);

  const recoveryConfidence: RecoveryConfidenceModel | null =
    last7Series.length > 0
      ? {
          dataCompleteness: mean(last7Series.map((s) => s.recoveryConfidence.dataCompleteness))!,
          signalQuality: mean(last7Series.map((s) => s.recoveryConfidence.signalQuality))!,
          physiologicalStability: mean(last7Series.map((s) => s.recoveryConfidence.physiologicalStability))!,
          overallConfidence: mean(last7Series.map((s) => s.recoveryConfidence.overallConfidence))!,
        }
      : null;

  const baselineSleep = median(baselineValues(rowsByDate, todayYmd, 56, (r) => r.sleepHours));
  const baselineHrv = median(baselineValues(rowsByDate, todayYmd, 42, (r) => r.hrvMs));
  const baselineRhr = median(baselineValues(rowsByDate, todayYmd, 42, (r) => r.restingHr));

  const warnings = detectRecoveryWarnings(rowsByDate, baselineHrv, baselineSleep, baselineRhr, now);

  return buildRecoveryInsightText({
    last7LatentR,
    dailyRows: args.dailyRows,
    warnings,
    baselineSleep,
    baselineHrv,
    loadStressIdx: args.loadStressIdx,
    now,
    dataMode,
    recoveryConfidence,
    semanticUncertaintyState,
    aiReasoningMode,
  });
}
