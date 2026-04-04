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

export function getTodayNextSession(activeSessions, logs, now = new Date()){
  const todayKey = now.toDateString();
  const datedSessions = activeSessions
    .map((session) => ({ session, date: parseSessionDateLabel(session.date) }))
    .filter((item) => item.date);

  const todaySession = datedSessions.find((item) => item.date.toDateString() === todayKey);
  if(todaySession){
    return { mode: "today", session: todaySession.session };
  }

  const nextOpenSession = datedSessions.find((item) => item.date >= now && !logs[item.session.id]?.done);
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

export function getConsistencyStats(plan, logs){
  const weekCompletion = plan.map((week) => week.s.filter((session) => session.type !== "rest").every((session) => logs[session.id]?.done));
  let weeklyStreak = 0;
  for(let index = weekCompletion.length - 1; index >= 0; index -= 1){
    if(!weekCompletion[index])break;
    weeklyStreak += 1;
  }

  const sessionLogStates = plan
    .flatMap((week) => week.s)
    .filter((session) => session.type !== "rest")
    .map((session) => logs[session.id]?.done === true);
  let sessionStreak = 0;
  for(let index = sessionLogStates.length - 1; index >= 0; index -= 1){
    if(!sessionLogStates[index])break;
    sessionStreak += 1;
  }

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
    `Streak: ${consistencyStats.sessionStreak} Sessions in Folge`,
    `Nächster Fokus: ${nextKeySession ? nextKeySession.title : "Alles erledigt"}`,
  ].join("\n");
}
