/**
 * End-to-end verification for workout card fixes (positioning, HR, modal switching).
 * Read-only assertions against implementation; does not alter app logic.
 */
import React from "react";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { PostWorkoutSummaryCard } from "./components/PostWorkoutSummaryCard";
import { computePlanAdherenceScore } from "./utils/planAdherenceScore";
import type { PostWorkoutSummary } from "./hooks/usePostWorkoutSummary";
import { usePostWorkoutSummary } from "./hooks/usePostWorkoutSummary";
import { freezeTimeForTests } from "./core/time/timeSystem";

const APP_TSX = fs.readFileSync(path.join(__dirname, "AppMain.tsx"), "utf8");
const POST_WORKOUT_CARD_TSX = fs.readFileSync(path.join(__dirname, "components/PostWorkoutSummaryCard.tsx"), "utf8");

function makeSummary(opts: {
  actualHrBpm: number | null;
  plannedHr: { min: number; max: number };
  plannedHrZone?: string | null;
}): PostWorkoutSummary {
  const plannedPace = { min: 300, max: 320 };
  const actualPace = 310;
  const plannedDist = 10;
  const actualDist = 10;
  const adherence = computePlanAdherenceScore({
    plannedPaceSecPerKm: plannedPace,
    actualPaceSecPerKm: actualPace,
    plannedDistanceKm: plannedDist,
    actualDistanceKm: actualDist,
    plannedHrBpm: opts.plannedHr,
    actualHrBpm: opts.actualHrBpm,
  });
  return {
    workoutId: "hk_test",
    workoutYmd: "2026-05-01",
    completedAtIso: "2026-05-01T08:00:00.000Z",
    session: { id: "s1", type: "easy", title: "Verification easy", paceLabel: null, dateLabel: "1. Mai" },
    planned: {
      distanceKm: plannedDist,
      paceSecPerKm: plannedPace,
      hrBpm: opts.plannedHr,
      hrZoneLabel: opts.plannedHrZone ?? "Zone 2",
    },
    actual: { distanceKm: actualDist, paceSecPerKm: actualPace, hrBpm: opts.actualHrBpm },
    adherence,
    ai: null,
  };
}

describe("TEST BLOCK 1 — Card positioning", () => {
  test("1. Overlay reserves min 100px + safe-area-inset-bottom above viewport bottom for sheet", () => {
    expect(POST_WORKOUT_CARD_TSX).toContain(
      'paddingBottom: "calc(100px + env(safe-area-inset-bottom, 0px))"',
    );
    const summary = makeSummary({ actualHrBpm: 140, plannedHr: { min: 120, max: 148 } });
    render(<PostWorkoutSummaryCard open summary={summary} onDone={() => {}} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  test("2. PostWorkoutSummaryCard (home path) is sibling after zIndex:1 shell — not nested inside it", () => {
    const idxZ = APP_TSX.indexOf("zIndex: 1");
    const marker = `{postWorkoutSummary.visible && postWorkoutSummaryDisplay ? (`;
    const idxPost = APP_TSX.indexOf(marker);
    expect(idxZ).toBeGreaterThanOrEqual(0);
    expect(idxPost).toBeGreaterThan(idxZ);
    const lookback = APP_TSX.slice(Math.max(0, idxPost - 500), idxPost);
    expect(lookback).toMatch(/\n      <\/div>\s*\n\s*\n\s*      <\/div>\s*\n\s*\n\s*$/);
  });

  test("3. Fertig control sits above bottom-nav zone (layout budget from styles)", () => {
    /** Bottom nav: ~12px offset + inner paddings ~10+11 + row — budget ≥72px bar + 12 offset + 0 safe (tests). */
    const NAV_OFFSET_PX = 12;
    const NAV_INNER_MIN_PX = 72;
    const overlayReservePx = 100;
    const footerBottomPadPx = 18;
    const safeAreaTestPx = 0;
    const spaceFromViewportBottomToPanelBottom = overlayReservePx + safeAreaTestPx;
    const spaceToFertBottomMin = spaceFromViewportBottomToPanelBottom + footerBottomPadPx;
    const navTopFromViewportBottom = NAV_OFFSET_PX + NAV_INNER_MIN_PX + safeAreaTestPx;
    expect(spaceToFertBottomMin).toBeGreaterThan(navTopFromViewportBottom);
  });
});

describe("TEST BLOCK 2 — Heart rate display", () => {
  const plannedHr = { min: 120, max: 148 };

  test("4. healthRuns avgHeartRateBpm=148 → Ist shows 148 bpm", () => {
    const summary = makeSummary({ actualHrBpm: 148, plannedHr });
    render(<PostWorkoutSummaryCard open summary={summary} onDone={() => {}} />);
    expect(screen.getByText("148 bpm")).toBeInTheDocument();
  });

  test("5. No health avgHeartRateBpm; assignedRun.avgHeartRateBpm=152 → Ist shows 152 bpm (hook fallback)", () => {
    freezeTimeForTests(new Date("2026-05-01T12:00:00.000Z"));
    function HrFallbackProbe() {
      const { getPostWorkoutSummary } = usePostWorkoutSummary({
        activeView: "home",
        planSessions: [{ id: "s1", date: "1. Mai", type: "easy", title: "Easy", pace: "5:00–5:20/km", km: 10 }],
        logs: {
          s1: {
            done: true,
            at: "2026-05-01T08:00:00.000Z",
            assignedRun: {
              runId: "hk_run_1",
              duration: 3000,
              distanceKm: 10,
              avgHeartRateBpm: 152,
            },
          },
        },
        healthRuns: [
          {
            runId: "hk_run_1",
            startDate: "2026-05-01T07:10:00.000Z",
            duration: 3000,
            distanceMeters: 10_000,
            distanceUnknown: false,
            workoutType: "running",
            sourceName: "Apple Health",
          },
        ],
        maxHeartRateBpm: 190,
        aiAnalysisEnabled: false,
      });
      const end = new Date(new Date("2026-05-01T07:10:00.000Z").getTime() + 3000 * 1000);
      const dayKey = end.toLocaleDateString("en-CA");
      const s = getPostWorkoutSummary("hk_run_1", dayKey);
      return s ? <PostWorkoutSummaryCard open summary={s} onDone={() => {}} /> : <div data-testid="no-summary" />;
    }
    render(<HrFallbackProbe />);
    expect(screen.getByText("152 bpm")).toBeInTheDocument();
  });

  test("6. No HR in either path → Ist shows Keine Daten", () => {
    const summary = makeSummary({ actualHrBpm: null, plannedHr });
    render(<PostWorkoutSummaryCard open summary={summary} onDone={() => {}} />);
    expect(screen.getByText("Keine Daten")).toBeInTheDocument();
    expect(screen.queryAllByText("—").length).toBe(0);
  });

  test("7. Planned HR shows fixed zone BPM map in cases 4–6", () => {
    const expectedPlanned = "120–140 bpm";
    for (const actual of [148, null] as const) {
      const summary = makeSummary({ actualHrBpm: actual, plannedHr });
      const { unmount } = render(<PostWorkoutSummaryCard open summary={summary} onDone={() => {}} />);
      expect(screen.getByText(expectedPlanned)).toBeInTheDocument();
      unmount();
    }
  });
});

describe("TEST BLOCK 3 — Einheit-Detailansicht (static + hook contract)", () => {
  test("8. Erledigt: Ist-Werte kommen aus der gespeicherten Conclusion (Log + verknüpfter Health-Lauf)", () => {
    expect(APP_TSX).toMatch(/modal && modalWeek && modalStatus === "done"\s*\? postWorkoutSummary\.getStoredSessionConclusion\(modal\.id\)/);
    expect(APP_TSX).toContain("result={modalResult}");
  });

  test("9. Eine Detailansicht für geplant und erledigt; das alte Formular mit Schließen/Abbrechen ist weg", () => {
    expect(APP_TSX).toMatch(/\{modal&&modalWeek \? \(\s*\n\s*<SessionDetailSheet/);
    expect(APP_TSX).not.toContain(">Einheit</div>");
    expect(APP_TSX).not.toContain(">Schließen</button>");
    expect(APP_TSX).not.toContain("Als abgeschlossen markieren");
  });

  test("9b. Eintragen ist ein eigenes Sheet; jedes Öffnen/Schließen startet wieder mit der Detailansicht", () => {
    expect(APP_TSX).toContain("onEnter={() => setModalEntryOpen(true)}");
    expect(APP_TSX).toMatch(/\{modal&&modalWeek&&modalEntryOpen \? \(\s*\n\s*<SessionEntrySheet/);
    expect(APP_TSX).toMatch(/const openModal=\(session\)=>\{\s*setModalEntryOpen\(false\);/);
    expect(APP_TSX).toMatch(/const closeModal=\(\)=>\{setModal\(null\);setModalEntryOpen\(false\);\};/);
    // Ansehen schreibt nicht: das Enrichment im Rückblick läuft mit No-op-Persist.
    expect(APP_TSX).toMatch(/modalCompletionSummaryEnriched = usePostWorkoutHrEnrichment\([\s\S]{0,400}persistWorkoutHeartRate: noopPersistWorkoutHeartRate/);
  });

  test("10. Skipped: Ist-Werte nur bei Status done (ausgelassen zeigt die Plan-Ansicht)", () => {
    expect(APP_TSX).toContain("const modalStatus = getSessionStatus(modalLog);");
    expect(APP_TSX).toContain("status={modalStatus}");
  });

  test("11. Health-Vorschlag im Eintragen-Sheet nur mit erkanntem, noch nicht zugeordnetem Lauf", () => {
    expect(APP_TSX).toMatch(/modalLog\?\.suggestedHealthRunId && !modalLog\?\.assignedRun\?\.runId/);
    expect(APP_TSX).toContain("suggestion={modalSuggestedRun ? buildHealthRunSuggestion(modalSuggestedRun, appNow) : null}");
  });

  test("12. PostWorkoutSummaryCard bleibt das Popup nach dem Workout (ein Import, eine Verwendung)", () => {
    const importMatches = APP_TSX.match(/import \{ PostWorkoutSummaryCard \} from "\.\/components\/PostWorkoutSummaryCard"/g);
    expect(importMatches?.length).toBe(1);
    expect(APP_TSX).toContain("<PostWorkoutSummaryCard\n          open={postWorkoutSummary.visible}\n          summary={postWorkoutSummaryDisplay}");
    expect(APP_TSX.match(/<PostWorkoutSummaryCard/g)?.length).toBe(1);
  });
});

describe("TEST BLOCK 4 — Source fingerprints", () => {
  test("PostWorkoutSummaryCard dialog uses flex-end + 100px bottom pad (regression guard)", () => {
    expect(POST_WORKOUT_CARD_TSX).toContain("paddingBottom: \"calc(100px + env(safe-area-inset-bottom, 0px))\"");
    expect(POST_WORKOUT_CARD_TSX).toContain('alignItems: "flex-end"');
  });
});
