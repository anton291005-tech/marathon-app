// @ts-nocheck

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

function formatLocalYmd(dayStart){
  const x = normalizeCalendarDay(dayStart);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Lauf-Einheiten im Plan (kein Ruhe/Kraft/Rad — zählt für Streak „echter Lauf“). */
function isStreakRunSession(session){
  return session && session.type !== "rest" && session.type !== "strength" && session.type !== "bike";
}

/**
 * Streak: aufeinanderfolgende lokale Kalendertage ab heute rückwärts, an denen mindestens
 * eine geplante Lauf-Session erledigt ist (manuell done oder Apple-Health zugeordnet).
 * Mehrere Läufe am selben Tag zählen als ein Tag. Ruhetage ohne Lauf-Session brechen den Streak.
 */
export function getCalendarTrainingStreak(plan, logs, now = new Date()){
  let streak = 0;
  const streakDays = [];
  let d = normalizeCalendarDay(now);
  for(;;){
    const onDay = sessionsScheduledOnCalendarDay(plan, d).filter(isStreakRunSession);
    const hasCompletedRun = onDay.some((s) => isSessionLogDone(logs[s.id]));
    if(!hasCompletedRun){
      break;
    }
    streak += 1;
    streakDays.push(formatLocalYmd(d));
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
  }
  console.log("streakDays:", streakDays);
  console.log("streakValue:", streak);
  return streak;
}

export function getTodayNextSession(activeSessions, logs, now = new Date()){
  const todayKey = now.toDateString();
  const datedSessions = activeSessions
    .map((session) => ({ session, date: parseSessionDateLabel(session.date) }))
    .filter((item) => item.date);

  const todaySession = datedSessions.find((item) => item.date.toDateString() === todayKey);
  if(todaySession){
    return { mode: "today", session: todaySession.session };
  }

  const nowDay = normalizeCalendarDay(now).getTime();
  const nextOpenSession = datedSessions.find((item) => {
    const sd = normalizeCalendarDay(item.date).getTime();
    return sd >= nowDay && !isSessionLogDone(logs[item.session.id]);
  });
  if(nextOpenSession){
    return { mode: "next", session: nextOpenSession.session };
  }

  return null;
}

export function getJumpTargets(plan){
  const peakWeek = plan.reduce((best, week) => week.km > (best?.km || 0) ? week : best, null);
  const hmWeek = plan.find((week) => week.s.some((session) => session.type === "race" && session.km >= 21 && session.km < 42));
  const raceWeek = plan.find((week) => week.s.some((session) => session.type === "race" && session.km >= 42));
  return [
    peakWeek ? { label: "Peak Week", weekNumber: peakWeek.wn } : null,
    hmWeek ? { label: "HM Week", weekNumber: hmWeek.wn } : null,
    raceWeek ? { label: "Race Week", weekNumber: raceWeek.wn } : null,
  ].filter(Boolean);
}

export function getConsistencyStats(plan, logs, now = new Date()){
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
