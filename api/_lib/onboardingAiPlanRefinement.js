"use strict";

// Zweck: AI analysiert Nutzerprofil + generierten Plan und gibt
// intelligente Verbesserungen zurück

const SYSTEM_PROMPT = `You are an expert running coach with 20 years experience.
You receive a generated training plan and a runner's profile.
Your job: analyze if the plan is appropriate and return improvements as JSON patches.

You must consider:
- Race distance and goal (finishing vs. time target) → training days per week
- Weekly km preference → volume per session
- Cross-training and strength preferences
- Periodization logic (don't change race day, don't break taper structure)

REST DAYS — DO NOT PATCH:
- Rest day scheduling is already handled by the plan generator
- Never return patches with type "rest" or km: 0 to create rest days
- Focus on volume, session types, cross-training, and descriptions only

Guidelines:
- "Just finish" goals: 3-4 training days/week, lower volume, more rest
- Time goals (e.g. 10km sub-35min): 4-5 days/week, structured intervals
- Ambitious time goals (marathon sub-3h): 5-6 days/week, high volume
- Never schedule hard sessions (interval, tempo) on consecutive days
- Long run always on weekend (Saturday or Sunday)
- Return ONLY valid JSON, no explanation, no markdown

Return format:
{
  "analysis": "2-3 sentence assessment of the plan",
  "weeklyTrainingDays": 3,
  "patches": [
    {
      "sessionId": "coach-gen-2026-07-01-easy",
      "changes": {
        "title": "Ruhetag",
        "km": 0,
        "type": "rest",
        "desc": "Aktive Erholung."
      },
      "reason": "Zu viele aufeinanderfolgende Trainingstage für Finish-Ziel"
    }
  ]
}`;

/**
 * @param {object} profile
 * @param {object} plan
 * @returns {string}
 */
function buildUserMessage(profile, plan) {
  const workoutSample = plan.workouts?.slice(0, 60) ?? [];
  const restDayNote =
    profile.restDayDow != null
      ? `Weekday ${profile.restDayDow} (0=Sun…6=Sat) — already scheduled as rest by generator`
      : "Default distance-based rest pattern — already applied by generator";

  return `Runner Profile:
- Race: ${profile.raceDistanceLabel} (${profile.raceDistanceKm} km)
- Goal: ${profile.raceGoal === "finish" ? "Just finish" : "Target time: " + profile.raceTargetTime}
- Weekly km preference: ${profile.weeklyKmRange}
- Race date: ${profile.raceDate}
- Plan start: ${profile.planStartDate}
- Rest days: ${restDayNote}
- Personal preferences: ${profile.userPreferences?.join(", ") || "none"}

Generated plan has ${plan.workouts?.length} sessions total.
First 60 sessions:
${JSON.stringify(workoutSample, null, 0)}

Analyze this plan and return content patches (volume, session types, cross-training).
Do NOT patch rest days — the generator already handles rest scheduling.
Focus on: appropriate volume per session, cross-training/strength preferences,
and respecting goal-appropriate training load.`;
}

module.exports = { SYSTEM_PROMPT, buildUserMessage };
