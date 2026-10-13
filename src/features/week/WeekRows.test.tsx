import { fireEvent, render, screen } from "@testing-library/react";
import { WeekDayRow, WeekSummaryCard } from "./WeekRows";

describe("WeekDayRow", () => {
  test("offene Einheit zeigt km; Kalender-Symbol öffnet nicht die Einheit", () => {
    const onOpen = jest.fn();
    const onCalendar = jest.fn();
    render(<WeekDayRow dayLabel="Sa" dayNumber={17} type="long" title="Langer Lauf" distanceKm={16.5} onOpen={onOpen} onCalendar={onCalendar} />);
    expect(screen.getByText("16,5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Langer Lauf an Kalender anpassen" }));
    expect(onCalendar).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Langer Lauf"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  test("erledigte Einheit zeigt das Häkchen statt km; Ruhetag ist nicht bedienbar", () => {
    render(
      <>
        <WeekDayRow dayLabel="Mo" dayNumber={12} type="easy" title="Lockerer Dauerlauf" distanceKm={11.3} state="done" onOpen={() => {}} />
        <WeekDayRow dayLabel="Di" dayNumber={13} type="rest" title="Ruhetag" />
      </>,
    );
    expect(screen.getByRole("img", { name: "Erledigt" })).toBeInTheDocument();
    expect(screen.queryByText("11,3")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});

describe("WeekSummaryCard", () => {
  test("Kalenderzeile nur mit Handler", () => {
    const onSync = jest.fn();
    const { rerender } = render(<WeekSummaryCard actualKm={11.6} plannedKm={55} doneSessions={1} plannedSessions={4} />);
    expect(screen.getByText("1 von 4 erledigt")).toBeInTheDocument();
    expect(screen.queryByText("Mit meinem Kalender abgleichen")).not.toBeInTheDocument();
    rerender(<WeekSummaryCard actualKm={11.6} plannedKm={55} doneSessions={1} plannedSessions={4} onSyncCalendar={onSync} />);
    fireEvent.click(screen.getByText("Mit meinem Kalender abgleichen"));
    expect(onSync).toHaveBeenCalledTimes(1);
  });
});
