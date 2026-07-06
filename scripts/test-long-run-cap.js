"use strict";

/**
 * Standalone test for the long-run hard clamp (api/_lib/planWorkoutUtils.js).
 * Not wired into `npm test` (react-scripts test only scans src/) — run directly:
 *   node scripts/test-long-run-cap.js
 */

const assert = require("assert");
const {
  clampLongRunToWeekPercent,
  applyLongRunCapPerWeek,
  LONG_RUN_CAP_STANDARD,
  LONG_RUN_CAP_HIGH_VOLUME,
} = require("../api/_lib/planWorkoutUtils");
const { generateMarathonPlanV2ToRace } = require("../api/_lib/deterministicPlanGenerator");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function run(sessionType, km, sport = "run") {
  return { id: `${sessionType}-${km}`, sessionType, sport, km };
}

function sumKm(workouts) {
  return Math.round(workouts.reduce((s, w) => s + (w.sport !== "rest" ? w.km : 0), 0) * 10) / 10;
}

// ── Test 1: known ~166 km/week peak-week boundary case from the diagnosis ──────────────
check("166 km/week peak week: long run clamped to 33%, week total unchanged", () => {
  const before = [
    run("long", 60),
    run("easy", 22),
    run("easy", 20),
    run("tempo", 18),
    run("interval", 16),
    run("easy", 30),
    run("rest", 0, "rest"),
  ];
  const weekTotalKm = sumKm(before);
  assert.strictEqual(weekTotalKm, 166, "fixture sanity check");

  const after = clampLongRunToWeekPercent(before, weekTotalKm, LONG_RUN_CAP_HIGH_VOLUME);

  const longAfter = after.find((w) => w.sessionType === "long");
  // capKm is rounded to 0.1km for a clean output value, which can land marginally
  // above the exact mathematical percentage (54.8 vs 54.78) — allow that rounding slack.
  assert.ok(
    longAfter.km <= weekTotalKm * LONG_RUN_CAP_HIGH_VOLUME + 0.05,
    `long run ${longAfter.km}km exceeds ${LONG_RUN_CAP_HIGH_VOLUME * 100}% of ${weekTotalKm}km`,
  );
  assert.strictEqual(longAfter.km, 54.8, "expected long run clamped to 54.8km");

  const totalAfter = sumKm(after);
  assert.strictEqual(totalAfter, weekTotalKm, "week total must stay exactly unchanged");

  // Excess redistributed proportionally onto the other runs (largest gets the most).
  assert.strictEqual(after.find((w) => w.id === "easy-30").km, 31.4);
  assert.strictEqual(after.find((w) => w.id === "easy-22").km, 23.1);
});

// ── Test 2: standard (non-peak / < 120km) week uses 30%, not 33% ───────────────────────
check("standard week (< 120km): 30% cap applies, not 33%", () => {
  const before = [run("long", 30), run("easy", 25), run("easy", 25), run("rest", 0, "rest")];
  const weekTotalKm = sumKm(before); // 80
  const after = clampLongRunToWeekPercent(before, weekTotalKm, LONG_RUN_CAP_STANDARD);
  const longAfter = after.find((w) => w.sessionType === "long");
  assert.strictEqual(longAfter.km, 24, "30% of 80km = 24km");
  assert.strictEqual(sumKm(after), weekTotalKm);
});

// ── Test 3: compliant week (long run already under the 30% cap) is left untouched ─────
check("compliant week (long run already under cap) is left unchanged", () => {
  const before = [run("long", 17), run("easy", 20), run("easy", 20), run("rest", 0, "rest")];
  const weekTotalKm = sumKm(before); // 57, 17/57 = 29.8% < 30%
  const after = clampLongRunToWeekPercent(before, weekTotalKm, LONG_RUN_CAP_STANDARD);
  assert.deepStrictEqual(after, before, "already-compliant week must be returned as-is");
});

// ── Test 4: no other run workouts to redistribute onto -> clamp anyway, total drops ────
check("taper week with only long run + rest: clamp applies, total drops (documented edge case)", () => {
  const before = [run("long", 30), run("rest", 0, "rest"), run("rest", 0, "rest")];
  const weekTotalKm = sumKm(before); // 30
  const after = clampLongRunToWeekPercent(before, weekTotalKm, LONG_RUN_CAP_STANDARD);
  const longAfter = after.find((w) => w.sessionType === "long");
  assert.strictEqual(longAfter.km, 9, "30% of 30km = 9km");
  assert.ok(sumKm(after) < weekTotalKm, "total drops since nothing absorbs the excess");
});

// ── Test 5: applyLongRunCapPerWeek picks 33% only for peak weeks >= 120km ──────────────
check("applyLongRunCapPerWeek: 33% only in peak weeks >= 120km, 30% elsewhere", () => {
  const peakWeek = [
    run("long", 60),
    run("easy", 106),
  ].map((w, i) => ({ ...w, dateIso: `2026-08-${String(10 + i).padStart(2, "0")}T12:00:00.000Z` }));
  const baseWeek = [
    run("long", 30),
    run("easy", 50),
  ].map((w, i) => ({ ...w, dateIso: `2026-03-${String(2 + i).padStart(2, "0")}T12:00:00.000Z` }));

  const all = [...peakWeek, ...baseWeek];
  const getPhase = (weekStartIso) => (weekStartIso === "2026-08-10" ? "peak" : "base");
  const result = applyLongRunCapPerWeek(all, getPhase);

  const peakLong = result.find((w) => w.dateIso.startsWith("2026-08-10"));
  const baseLong = result.find((w) => w.dateIso.startsWith("2026-03-02"));
  assert.strictEqual(peakLong.km, 54.8, "peak week >=120km uses 33%");
  assert.strictEqual(baseLong.km, 24, "base week uses 30% regardless of volume");
});

// ── Test 6: ultra distances are exempt (deterministic generator end-to-end) ────────────
check("ultra distance (100km) is exempt from the percent cap", () => {
  const start = new Date("2026-01-05T12:00:00.000Z");
  const race = new Date("2026-07-05T12:00:00.000Z");
  const plan = generateMarathonPlanV2ToRace(start, race, "finish", 100, "60–80", undefined, null, null);

  const weeksWithLongOverCap = plan.weeks.filter((week) => {
    const totalKm = week.workouts.reduce((s, w) => s + (w.sport !== "rest" ? w.km : 0), 0);
    const longRun = week.workouts.find((w) => w.sessionType === "long");
    return longRun && totalKm > 0 && longRun.km / totalKm > LONG_RUN_CAP_STANDARD + 0.001;
  });

  assert.ok(
    weeksWithLongOverCap.length > 0,
    "expected at least one week where the ultra long run exceeds 30% (proves it was NOT clamped)",
  );
});

// ── Test 7: non-ultra deterministic plan respects the cap end-to-end ──────────────────
check("marathon distance (42.2km) plan has no week exceeding the cap", () => {
  const start = new Date("2026-01-05T12:00:00.000Z");
  const race = new Date("2026-06-01T12:00:00.000Z");
  const plan = generateMarathonPlanV2ToRace(start, race, "time", 42.2, "60–80", undefined, null, null);

  for (const week of plan.weeks) {
    const totalKm = week.workouts.reduce((s, w) => s + (w.sport !== "rest" ? w.km : 0), 0);
    const longRun = week.workouts.find((w) => w.sessionType === "long");
    if (!longRun || totalKm <= 0) continue;
    const percent = longRun.km / totalKm;
    assert.ok(
      percent <= LONG_RUN_CAP_HIGH_VOLUME + 0.001,
      `week ${week.startIso}: long run ${longRun.km}km is ${(percent * 100).toFixed(1)}% of ${totalKm}km`,
    );
  }
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error("Some tests FAILED.");
  process.exit(1);
}
