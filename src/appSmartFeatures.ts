// @ts-nocheck

import { getAppNow } from "./core/time/timeSystem";
import { calculatePlanAwareStreak } from "./trainingIntelligence/streak";

const MONTHS = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  Mai: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Okt: 9,
  Nov: 10,
  Dez: 11,
};

export function safeParseJSON(value, fallback){
  if(!value)return fallback;
  try{
    return JSON.parse(value);
  }catch{
    return fallback;
  }
}

export function parseTargetTimeToSeconds(value){
  if(!value || typeof value !== "string")return null;
  const parts = value.split(":").map((part) => Number(part.trim()));
  if(parts.length !== 3 || parts.some((part) => Number.isNaN(part)))return null;
  return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
}

export function parseSessionDateLabel(label, year = 2026){
  if(!label)return null;
  const match = label.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/);
  if(!match)return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  if(Number.isNaN(day) || month === undefined)return null;
  return new Date(year, month, day, 12, 0, 0, 0);
}

export function normalizeCalendarDay(d){
  const x = d instanceof Date ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

/**
 * Session gilt als erledigt, wenn manuell done ODER ein Health-Lauf zugeordnet ist.
 * (skipped wird hier nicht als „done“ gewertet.)
 */
export function isSessionLogDone(log){
  if(!log)return false;
  if(log.done === true)return true;
  if(log.assignedRun && log.assignedRun.runId)return true;
  return false;
}

export function sessionsScheduledOnCalendarDay(plan, dayStart){
  const key = normalizeCalendarDay(dayStart).getTime();
  const out = [];
  for(const week of plan){
    for(const session of week.s){
      const pd = parseSessionDateLabel(session.date);
      if(!pd)continue;
      if(normalizeCalendarDay(pd).getTime() === key){
        out.push(session);
      }
    }
  }
  return out;
}

/** Plan-Woche, die den Kalendertag enthält (Trainingstag), sonst null */
export function findPlanWeekContainingDate(plan, dayStart){
  const t = normalizeCalendarDay(dayStart).getTime();
  for(const week of plan){
    for(const session of week.s){
      const pd = parseSessionDateLabel(session.date);
      if(!pd)continue;
      if(normalizeCalendarDay(pd).getTime() === t){
        return week;
      }
    }
  }
  return null;
}

/**
 * Per-day status for streak: non-rest sessions that day define "planned".
 * Completed if any such session is logged done (Health-zuordnung zählt).
 */
function planDayStreakStatus(plan, logs, dayStart) {
  const onDay = sessionsScheduledOnCalendarDay(plan, dayStart);
  const trainingSessions = onDay.filter((s) => s.type !== "rest");
  if (trainingSessions.length === 0) {
    return "no_training_planned";
  }
  if (trainingSessions.some((s) => isSessionLogDone(logs[s.id]))) {
    return "completed";
  }
  return "incomplete_planned";
}

/**
 * Streak: erledigte Trainingstage in Folge (lokal). Geplante **Ruhetage** unterbrechen die Serie nicht.
 * Heute mit offenem Training wird übersprungen (wie zuvor); gestern noch offen beendet die Serie.
 */
export function getCalendarTrainingStreak(plan, logs, now = getAppNow()) {
  const streak = calculatePlanAwareStreak(now, (dayStart) => planDayStreakStatus(plan, logs, dayStart));
  return streak;
}

/**
 * @param planSessions — alle Kalender-Einträge inkl. Ruhetage (z. B. ALL_SESSIONS).
 *   Nur so wird ein Ruhetag als „heute“ erkannt; sonst fiel die Logik fälschlich auf die nächste Einheit.
 */
export function getTodayNextSession(planSessions, logs, now = getAppNow()){
  const todayKey = now.toDateString();
  const datedSessions = planSessions
    .map((session) => ({ session, date: parseSessionDateLabel(session.date) }))
    .filter((item) => item.date);

  const todaySession = datedSessions.find((item) => item.date.toDateString() === todayKey);
  if(todaySession){
    return { mode: "today", session: todaySession.session };
  }

  const nowDay = normalizeCalendarDay(now).getTime();
  const nextOpenSession = datedSessions.find((item) => {
    if(item.session.type === "rest")return false;
    const sd = normalizeCalendarDay(item.date).getTime();
    return sd >= nowDay && !isSessionLogDone(logs[item.session.id]);
  });
  if(nextOpenSession){
    return { mode: "next", session: nextOpenSession.session };
  }

  return null;
}

export function getConsistencyStats(plan, logs, now = getAppNow()){
  const weekCompletion = plan.map((week) => week.s.filter((session) => session.type !== "rest").every((session) => isSessionLogDone(logs[session.id])));
  let weeklyStreak = 0;
  for(let index = weekCompletion.length - 1; index >= 0; index -= 1){
    if(!weekCompletion[index])break;
    weeklyStreak += 1;
  }

  const sessionStreak = getCalendarTrainingStreak(plan, logs, now);

  return { weeklyStreak, sessionStreak };
}

export function getPredictionReadiness({ doneSessionsCount, loggedKm, doneLongRuns, doneHardSessions }){
  const ready = doneSessionsCount >= 4 && loggedKm >= 25 && (doneLongRuns >= 1 || doneHardSessions >= 1);
  if(ready){
    return {
      ready: true,
      title: null,
      detail: null,
    };
  }
  return {
    ready: false,
    title: "Noch zu wenig Daten",
    detail: "Logge erst mehrere Einheiten und mindestens einen Long Run oder eine Quality-Session für eine belastbare Formprognose.",
  };
}

export function getShareSummary({ pct, week, nextKeySession, recoveryState, consistencyStats }){
  return [
    "MyRace Snapshot",
    `Fortschritt: ${pct}%`,
    `Aktuelle Woche: ${week.label}`,
    `Recovery: ${recoveryState.label}`,
    `Streak: ${consistencyStats.sessionStreak} Tage in Folge`,
    `Nächster Fokus: ${nextKeySession ? nextKeySession.title : "Alles erledigt"}`,
  ].join("\n");
}

/** Heutiges Kalenderdatum als YYYY-MM-DD in Europe/Berlin */
export function berlinWallClockYmd(now = getAppNow()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

function sessionDateLabelToYmd(label, year = 2026) {
  if (!label) return null;
  const match = label.match(/(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  if (!Number.isFinite(day) || month === undefined) return null;
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

/** Frühestes Session-Datum im Plan (YYYY-MM-DD), für Plan-Start-Anchor */
export function planEarliestSessionYmd(plan, year = 2026) {
  let min = null;
  for (const week of plan) {
    for (const s of week.s) {
      const ymd = sessionDateLabelToYmd(s.date, year);
      if (!ymd) continue;
      if (!min || ymd < min) min = ymd;
    }
  }
  return min;
}

/** Ganzzahl-Tagesdifferenz startYmd → endYmd (Kalender, UTC-Komponenten) */
export function calendarDaysBetweenYmd(startYmd, endYmd) {
  const [sy, sm, sd] = startYmd.split("-").map((x) => Number.parseInt(x, 10));
  const [ey, em, ed] = endYmd.split("-").map((x) => Number.parseInt(x, 10));
  if (![sy, sm, sd, ey, em, ed].every((n) => Number.isFinite(n))) return NaN;
  const s = Date.UTC(sy, sm - 1, sd);
  const e = Date.UTC(ey, em - 1, ed);
  return Math.round((e - s) / 86400000);
}

/**
 * 0-basierter PLAN-Index für „aktuelle Trainingswoche“ relativ zum Planbeginn.
 * Woche 1 = die ersten 7 Kalendertage ab frühestem Session-Datum (Europe/Berlin „heute“).
 */
export function resolveCurrentPlanWeekIndex(plan, now = getAppNow(), planYear = 2026) {
  if (!plan?.length) return 0;
  const startYmd = planEarliestSessionYmd(plan, planYear);
  if (!startYmd) return 0;
  const todayYmd = berlinWallClockYmd(now);
  const days = calendarDaysBetweenYmd(startYmd, todayYmd);
  if (!Number.isFinite(days)) return 0;
  if (days < 0) return 0;
  const weekNum = Math.floor(days / 7) + 1;
  const exact = plan.findIndex((w) => w.wn === weekNum);
  if (exact >= 0) return exact;
  if (weekNum < plan[0].wn) return 0;
  if (weekNum > plan[plan.length - 1].wn) return plan.length - 1;
  for (let i = plan.length - 1; i >= 0; i--) {
    if (plan[i].wn <= weekNum) return i;
  }
  return 0;
}
