import type { AiPlanWeek } from "../../lib/ai/types";
import { parseIntent } from "./parseIntent";
import { resolveSwap } from "./resolveSwap";

const MAY_5 = new Date(2026, 4, 5, 12, 0, 0); // Di — matches plan fixture below

function planHeuteMorgenLongRest(): AiPlanWeek[] {
  return [
    {
      wn: 1,
      phase: "T",
      label: "RW",
      dates: "mix",
      km: 55,
      s: [
        { id: "long-today", day: "Di", date: "5. Mai", type: "long", title: "Langlauf", km: 23 },
        { id: "rest-tomorrow", day: "Mi", date: "6. Mai", type: "rest", title: "Ruhetag", km: 0 },
      ],
    },
  ];
}

function planFixture(): AiPlanWeek[] {
  return [
    {
      wn: 1,
      phase: "BASE",
      label: "W1",
      dates: "—",
      km: 0,
      s: [
        { id: "t0", day: "Do", date: "30. Apr", type: "easy", title: "Easy Run", km: 10 },
        { id: "t1", day: "Fr", date: "1. Mai", type: "bike", title: "Rennrad 60 min", km: 0 },
      ],
    },
    {
      wn: 2,
      phase: "BASE",
      label: "W2",
      dates: "—",
      km: 0,
      s: [
        { id: "n0", day: "Do", date: "7. Mai", type: "bike", title: "Rennrad 75 min", km: 0 },
        { id: "n1", day: "Fr", date: "8. Mai", type: "interval", title: "Intervall 5×2000", km: 16 },
      ],
    },
  ];
}

describe("parseIntent swap + relative phrases", () => {
  test.each([
    ["Tausche heute und morgen"],
    ["Ich fühle mich nicht gut. Tausch heute mit morgen."],
    ["Heute langer Lauf, morgen Ruhetag — kannst du das tauschen?"],
    ["morgen und heute tauschen"],
  ])("detects swap: %s", (line) => {
    expect(parseIntent(line).type).toBe("swap_workouts");
  });
});

describe("resolveSwap relative calendar days (heute/morgen)", () => {
  test("pairs today long run ↔ tomorrow rest (symmetric wording)", () => {
    const plan = planHeuteMorgenLongRest();
    const inputs = [
      "Tausche heute und morgen",
      "Ich fühle mich nicht gut. Tausch heute mit morgen.",
      "Heute langer Lauf, morgen Ruhetag — kannst du das tauschen?",
      "morgen und heute tauschen",
    ];
    for (const raw of inputs) {
      const res = resolveSwap(plan, raw, { now: MAY_5 });
      expect(res.status).toBe("ok");
      if (res.status !== "ok") continue;
      expect(res.confidence).toBe("low");
      expect(res.source.id).toBe("long-today");
      expect(res.target.id).toBe("rest-tomorrow");
    }
  });

  test("legacy weekday+Dienstag path still resolves (relative fast path skips when only «heute»)", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "T",
        label: "t",
        dates: "mix",
        km: 55,
        s: [
          { id: "w01-so", day: "So", date: "3. Mai", type: "easy", title: "Heute Easy", km: 6 },
          { id: "w01-di", day: "Di", date: "5. Mai", type: "interval", title: "Dienstag", km: 10 },
        ],
      },
    ];
    const res = resolveSwap(plan, "Tausche das Training von naechstem Dienstag mit dem von heute.", {
      now: new Date(2026, 4, 3, 12, 0, 0),
    });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source.id).toBe("w01-so");
    expect(res.target.id).toBe("w01-di");
  });
});

describe("resolveSwap (scored)", () => {
  test("resolves today + next-week bike deterministically", () => {
    const plan = planFixture();
    const res = resolveSwap(plan, "Tausche heute 10km Lauf mit Rennrad nächste Woche", {
      now: new Date(2026, 3, 30, 12, 0, 0),
    });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source.id).toBe("t0");
    expect(res.target.id).toBe("n0");
  });

  test("returns ambiguous when top scores tie closely", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "—",
        km: 0,
        s: [
          { id: "a", day: "Do", date: "30. Apr", type: "easy", title: "Easy Run", km: 10 },
          { id: "b", day: "Do", date: "30. Apr", type: "easy", title: "Easy Run 2", km: 10 },
        ],
      },
      {
        wn: 2,
        phase: "BASE",
        label: "W2",
        dates: "—",
        km: 0,
        s: [{ id: "c", day: "Do", date: "7. Mai", type: "bike", title: "Rennrad", km: 0 }],
      },
    ];
    const res = resolveSwap(plan, "Tausche heute 10km Lauf mit Rennrad nächste Woche", {
      now: new Date(2026, 3, 30, 12, 0, 0),
    });
    expect(res.status).toBe("ambiguous");
  });
});

describe("resolveSwap absolute German / numeric dates", () => {
  const MAY_7 = new Date(2026, 4, 7, 12, 0, 0);

  function planForDatePair(): AiPlanWeek[] {
    return [
      {
        wn: 1,
        phase: "BASE",
        label: "W1",
        dates: "mix",
        km: 0,
        s: [
          { id: "a-8", day: "Fr", date: "8. Mai", type: "easy", title: "Easy", km: 8 },
          { id: "b-9", day: "Sa", date: "9. Mai", type: "long", title: "Langlauf", km: 21 },
        ],
      },
    ];
  }

  test("8. Mai + 9. Mai (tauschen wording)", () => {
    const plan = planForDatePair();
    const res = resolveSwap(plan, "Tausche training vom 8 mai mit dem vom 9 mai", { now: MAY_7 });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source.id).toBe("a-8");
    expect(res.target.id).toBe("b-9");
  });

  test("8.5 mit 9.5 (numeric)", () => {
    const plan = planForDatePair();
    const res = resolveSwap(plan, "8.5 mit 9.5 tauschen", { now: MAY_7 });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source.id).toBe("a-8");
    expect(res.target.id).toBe("b-9");
  });
});

describe("resolveSwap mit + type hints", () => {
  test("Krafttraining heute mit Lauf morgen", () => {
    const plan: AiPlanWeek[] = [
      {
        wn: 1,
        phase: "T",
        label: "t",
        dates: "mix",
        km: 0,
        s: [
          { id: "str", day: "Do", date: "7. Mai", type: "strength", title: "Kraft", km: 0 },
          { id: "lng", day: "Fr", date: "8. Mai", type: "long", title: "Lang", km: 18 },
        ],
      },
    ];
    const now = new Date(2026, 4, 7, 10, 0, 0);
    const res = resolveSwap(plan, "das krafttraining von heute mit dem lauf von morgen tauschen", { now });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.source.id).toBe("str");
    expect(res.target.id).toBe("lng");
  });
});

describe("resolveSwap clarification reasons", () => {
  test("tausche heute → needs_second_anchor", () => {
    const plan = planHeuteMorgenLongRest();
    const res = resolveSwap(plan, "tausche heute", { now: MAY_5 });
    expect(res.status).toBe("not_found");
    if (res.status !== "not_found") return;
    expect(res.reason).toBe("needs_second_anchor");
  });

  test("tausche krafttraining → needs_dates_for_type", () => {
    const plan = planHeuteMorgenLongRest();
    const res = resolveSwap(plan, "tausche das krafttraining", { now: MAY_5 });
    expect(res.status).toBe("not_found");
    if (res.status !== "not_found") return;
    expect(res.reason).toBe("needs_dates_for_type");
  });
});

describe("parseIntent — extra sloppy German", () => {
  test.each([
    ["tausche training von heute und morgen"],
    ["heute morgen tauschen"],
    ["8 mai und 9 mai"],
    ["heute ruhetag morgen lauf bitte tauschen"],
    ["das von heute gegen morgen"],
    ["morgen lieber heute machen"],
    ["ich fühle mich nicht gut, tausche heute und morgen"],
  ])("swap intent: %s", (line) => {
    expect(parseIntent(line).type).toBe("swap_workouts");
  });

  test("vague week bulk → none", () => {
    expect(parseIntent("tausche alles nächste Woche").type).toBe("none");
  });
});

