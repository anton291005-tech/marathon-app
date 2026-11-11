// @ts-nocheck

import { getAppNow } from "./core/time/timeSystem";
import { labelToYmd, sessionDate, sessionYmd } from "./core/time/sessionDate";
import { calculatePlanAwareStreak } from "./trainingIntelligence/streak";
import { pluralDe } from "./utils/pluralDe";

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

/**
 * LEGACY — liest ein Label ("14. Mär") mit einem **explizit übergebenen** Jahr. Es gibt kein Default-Jahr
 * mehr; ohne gültiges `year` kommt `null`. Für Plan-Sessions nie verwenden: dort ist `sessionDate(session)`
 * aus `core/time/sessionDate` richtig (`dateIso` zuerst). Erlaubt ist das nur, wo das Jahr aus einem Anker
 * folgt (`planV2/legacyYearAnchor`) — siehe die Ausnahmeliste der ESLint-Regel in `package.json`.
 */
export function parseSessionDateLabel(label, year){
  const ymd = labelToYmd(label, year);
  if(!ymd)return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
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

/** Display-plan weeks only — skips null entries (e.g. before hydration). */
function safePlanWeeks(plan) {
  if (!Array.isArray(plan)) return [];
  return plan.filter((week) => week != null && typeof week === "object");
}

export function safePlanWeekLabel(week, fallback = "Keine Planwoche") {
  if (!week || typeof week !== "object") return fallback;
  if (typeof week.label === "string" && week.label.trim()) return week.label.trim();
  if (typeof week.wn === "number" && Number.isFinite(week.wn)) return `Woche ${week.wn}`;
  return fallback;
}

export function sessionsScheduledOnCalendarDay(plan, dayStart){
  const key = normalizeCalendarDay(dayStart).getTime();
  const fallbackYear = normalizeCalendarDay(dayStart).getFullYear();
  const out = [];
  for(const week of safePlanWeeks(plan)){
    for (const session of week.s ?? []) {
      const pd = sessionDate(session, fallbackYear);
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
  const fallbackYear = normalizeCalendarDay(dayStart).getFullYear();
  for(const week of safePlanWeeks(plan)){
    for (const session of week.s ?? []) {
      const pd = sessionDate(session, fallbackYear);
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
    .map((session) => ({ session, date: sessionDate(session, now.getFullYear()) }))
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
  const weeks = safePlanWeeks(plan);
  const weekCompletion = weeks.map((week) => (week.s ?? []).filter((session) => session.type !== "rest").every((session) => isSessionLogDone(logs[session.id])));
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
  const streak = consistencyStats?.sessionStreak ?? 0;
  const nextTitle =
    nextKeySession && typeof nextKeySession.title === "string" && nextKeySession.title.trim()
      ? nextKeySession.title.trim()
      : "Alles erledigt";
  return [
    "Mein MyRace-Stand",
    `Fortschritt: ${pct ?? 0}%`,
    `Aktuelle Woche: ${safePlanWeekLabel(week)}`,
    `Erholung: ${recoveryState?.label ?? "—"}`,
    `Serie: ${pluralDe(streak, "Tag", "Tage")} in Folge`,
    `Nächster Fokus: ${nextTitle}`,
  ].join("\n");
}

/** Heutiges Kalenderdatum als YYYY-MM-DD in Europe/Berlin */
export function berlinWallClockYmd(now = getAppNow()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });
}

/**
 * Frühestes Session-Datum im Plan (YYYY-MM-DD), für Plan-Start-Anchor. Kalendertag je Session aus
 * `dateIso` (echtes Jahr); `year` ist nur der Notnagel für Altpläne ohne `dateIso` (Label verliert das Jahr).
 */
export function planEarliestSessionYmd(plan, year) {
  let min = null;
  for (const week of safePlanWeeks(plan)) {
    for (const s of week.s ?? []) {
      const ymd = sessionYmd(s, year);
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

/** Wochentag eines YYYY-MM-DD, Montag = 0 … Sonntag = 6 (reine UTC-Kalenderrechnung, 1.1.1970 war ein Donnerstag). */
function weekdayMon0(ymd) {
  const [y, m, d] = ymd.split("-").map((x) => Number.parseInt(x, 10));
  const epochDay = Math.round(Date.UTC(y, m - 1, d) / 86400000);
  return (((epochDay + 3) % 7) + 7) % 7;
}

/**
 * 0-basierter PLAN-Index für „aktuelle Trainingswoche“ relativ zum Planbeginn.
 * Planwochen sind Mo–So-Kalenderwochen; Woche 1 darf eine Teilwoche sein (Planstart z. B. am Samstag).
 * Gezählt wird daher ab dem Montag der Startwoche, nicht ab dem Startdatum selbst (Europe/Berlin „heute“).
 */
export function resolveCurrentPlanWeekIndex(plan, now = getAppNow(), planYear) {
  const weeks = safePlanWeeks(plan);
  if (!weeks.length) return 0;
  const startYmd = planEarliestSessionYmd(weeks, planYear ?? now.getFullYear());
  if (!startYmd) return 0;
  const todayYmd = berlinWallClockYmd(now);
  const days = calendarDaysBetweenYmd(startYmd, todayYmd);
  if (!Number.isFinite(days)) return 0;
  if (days < 0) return 0;
  const weekNum = Math.floor((days + weekdayMon0(startYmd)) / 7) + 1;
  const exact = weeks.findIndex((w) => w.wn === weekNum);
  if (exact >= 0) return exact;
  const firstWn = weeks[0]?.wn;
  const lastWn = weeks[weeks.length - 1]?.wn;
  if (typeof firstWn === "number" && weekNum < firstWn) return 0;
  if (typeof lastWn === "number" && weekNum > lastWn) return weeks.length - 1;
  for (let i = weeks.length - 1; i >= 0; i -= 1) {
    const wn = weeks[i]?.wn;
    if (typeof wn === "number" && wn <= weekNum) return i;
  }
  return 0;
}
