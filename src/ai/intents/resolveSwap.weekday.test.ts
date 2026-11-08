import { resolveSwap } from "./resolveSwap";
import type { AiPlanWeek } from "../../lib/ai/types";
import { pinAppClock } from "../../testSupport/pinAppClock";

// Label-only-Fixtures ("10. Aug") brauchen ein festes Jahr; siehe pinAppClock.
pinAppClock("2026-11-08T12:00:00+01:00");

describe("resolveSwap weekday anchoring", () => {
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

  test("Tausche naechstem Dienstag mit heute", () => {
    const now = new Date("2026-05-03T14:00:00");
    const raw = "Tausche das Training von naechstem Dienstag mit dem von heute.";
    const res = resolveSwap(plan, raw, { now });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.source.id).toBe("w01-so");
      expect(res.target.id).toBe("w01-di");
    }
  });
});
