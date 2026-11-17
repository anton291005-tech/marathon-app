import { reportShiftUsage, setShiftUsageListener } from "../shift/shiftUsage";
import { connectShiftUsageToTelemetry } from "./shiftUsageBridge";
import { __setUsageEventSinkForTests, type UsageEventRow } from "./usageEvents";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Schicht-Ereignisse → Nutzungsdaten (W6)", () => {
  let sent: UsageEventRow[];
  beforeEach(() => {
    localStorage.clear();
    sent = [];
    __setUsageEventSinkForTests(async (row) => {
      sent.push(row);
    });
    connectShiftUsageToTelemetry();
  });
  afterEach(() => {
    __setUsageEventSinkForTests(null);
    setShiftUsageListener(null);
  });

  it("gibt alle vier Ereignisse weiter, bei shift_entries_saved nur die Anzahl", async () => {
    reportShiftUsage("shift_entries_saved", { count: 28, remote: true, reason: "after_night" });
    reportShiftUsage("shift_proposal_shown", { reason: "Nach dem Nachtdienst (22–6 Uhr)" });
    reportShiftUsage("shift_proposal_accepted");
    reportShiftUsage("shift_proposal_declined");
    await flush();
    expect(sent).toEqual([
      { name: "shift_entries_saved", props: { count: 28 } },
      { name: "shift_proposal_shown", props: {} },
      { name: "shift_proposal_accepted", props: {} },
      { name: "shift_proposal_declined", props: {} },
    ]);
  });

  it("verwirft shift_entries_saved ohne gültige Anzahl", async () => {
    reportShiftUsage("shift_entries_saved", { remote: false });
    await flush();
    expect(sent).toEqual([]);
  });
});
