import { act, fireEvent, render, screen } from "@testing-library/react";
import { hapticImpactLight, hapticSuccess } from "../../native/haptics";
import { buildRecapSlides } from "./buildRecapSlides";
import { launchCelebration } from "./celebration";
import PrepRecapStory, { LONG_PRESS_MS } from "./PrepRecapStory";
import { fullRecapStats, installPointerEventPolyfill } from "./recapTestFixtures";
import { STORY_SLIDE_DURATION_MS } from "./useStoryPlayer";

jest.mock("../../native/haptics", () => ({
  hapticImpactLight: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("./celebration", () => ({ launchCelebration: jest.fn() }));

// CRA setzt Mocks vor jedem Test zurück (resetMocks) — Implementierung daher pro Test.
function mockCelebration() {
  (launchCelebration as jest.Mock).mockImplementation(() => ({ done: new Promise(() => {}), cancel: jest.fn() }));
}

const slides = buildRecapSlides({
  stats: fullRecapStats({ streak: null, longRuns: null, quality: null, strongestWeek: null, phases: null, body: null }),
  raceName: "Warschau Marathon",
  finishSeconds: 10000,
  finishConfirmed: true,
  todayYmd: "2026-09-30",
});
// intro, volume, sessions, race, outro

function currentSlideId(): string | null {
  const el = document.querySelector("[data-testid^='recap-slide-']");
  return el?.getAttribute("data-testid")?.replace("recap-slide-", "") ?? null;
}

function tap(x: number) {
  const stage = screen.getByTestId("recap-stage");
  fireEvent.pointerDown(stage, { clientX: x, clientY: 300 });
  fireEvent.pointerUp(stage, { clientX: x, clientY: 300 });
}

describe("PrepRecapStory", () => {
  let restorePointerEvent: () => void;
  beforeAll(() => {
    restorePointerEvent = installPointerEventPolyfill();
  });
  afterAll(() => restorePointerEvent());
  beforeEach(() => {
    jest.useFakeTimers();
    mockCelebration();
  });
  afterEach(() => jest.useRealTimers());

  it("Tap rechts weiter, Tap links (⅓) zurück, mit leichter Haptik", () => {
    render(<PrepRecapStory slides={slides} onClose={jest.fn()} />);
    expect(currentSlideId()).toBe("intro");
    expect(hapticImpactLight).not.toHaveBeenCalled();
    tap(window.innerWidth * 0.8);
    expect(currentSlideId()).toBe("volume");
    expect(hapticImpactLight).toHaveBeenCalledTimes(1);
    tap(window.innerWidth * 0.1);
    expect(currentSlideId()).toBe("intro");
  });

  it("Auto-Advance nach 6 s, Long-Press pausiert", () => {
    render(<PrepRecapStory slides={slides} onClose={jest.fn()} />);
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS));
    expect(currentSlideId()).toBe("volume");

    const stage = screen.getByTestId("recap-stage");
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 300 });
    act(() => jest.advanceTimersByTime(LONG_PRESS_MS + 10));
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS * 2));
    expect(currentSlideId()).toBe("volume");
    // Loslassen nach Long-Press navigiert nicht.
    fireEvent.pointerUp(stage, { clientX: 300, clientY: 300 });
    expect(currentSlideId()).toBe("volume");
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS));
    expect(currentSlideId()).toBe("sessions");
  });

  it("Swipe nach unten > 80 px schließt, kurzer Zug nicht", () => {
    const onClose = jest.fn();
    render(<PrepRecapStory slides={slides} onClose={onClose} />);
    const stage = screen.getByTestId("recap-stage");
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 250 });
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 250 });
    expect(onClose).not.toHaveBeenCalled();
    expect(currentSlideId()).toBe("intro");

    fireEvent.pointerDown(stage, { clientX: 200, clientY: 200 });
    fireEvent.pointerMove(stage, { clientX: 205, clientY: 320 });
    fireEvent.pointerUp(stage, { clientX: 205, clientY: 320 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("X schließt, ohne weiterzublättern", () => {
    const onClose = jest.fn();
    render(<PrepRecapStory slides={slides} onClose={onClose} />);
    const close = screen.getByRole("button", { name: "Rückblick schließen" });
    fireEvent.pointerDown(close, { clientX: 380, clientY: 40 });
    fireEvent.pointerUp(close, { clientX: 380, clientY: 40 });
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(currentSlideId()).toBe("intro");
  });

  it("Renn-Slide: Erfolgs-Haptik und Konfetti mit Extra-Burst bei erreichtem Ziel", () => {
    render(<PrepRecapStory slides={slides} initialIndex={2} onClose={jest.fn()} />);
    expect(launchCelebration).not.toHaveBeenCalled();
    tap(window.innerWidth * 0.8);
    expect(currentSlideId()).toBe("race");
    expect(hapticSuccess).toHaveBeenCalledTimes(1);
    expect(launchCelebration).toHaveBeenCalledWith(expect.objectContaining({ extraBurst: true }));
    expect(screen.getByText("Marathon-Finisher")).toBeInTheDocument();
  });

  it("Ziel verpasst: Basis-Konfetti ohne Extra-Burst", () => {
    const missed = buildRecapSlides({
      stats: fullRecapStats(),
      raceName: "Warschau Marathon",
      finishSeconds: 11637,
      finishConfirmed: true,
      todayYmd: "2026-09-30",
    });
    const raceIndex = missed.findIndex((s) => s.id === "race");
    render(<PrepRecapStory slides={missed} initialIndex={raceIndex} onClose={jest.fn()} />);
    expect(launchCelebration).toHaveBeenCalledWith(expect.objectContaining({ extraBurst: false }));
  });

  it("letzte Slide: kein Auto-Advance, Fertig + Zeit-Aktion", () => {
    const onClose = jest.fn();
    const onPress = jest.fn();
    render(
      <PrepRecapStory
        slides={slides}
        initialIndex={slides.length - 1}
        onClose={onClose}
        outroAction={{ label: "Zeit bearbeiten", onPress }}
      />,
    );
    act(() => jest.advanceTimersByTime(STORY_SLIDE_DURATION_MS * 3));
    expect(currentSlideId()).toBe("outro");
    fireEvent.click(screen.getByRole("button", { name: "Zeit bearbeiten" }));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Fertig" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reduced motion: kein Konfetti", () => {
    const original = window.matchMedia;
    window.matchMedia = jest.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    try {
      const raceIndex = slides.findIndex((s) => s.id === "race");
      render(<PrepRecapStory slides={slides} initialIndex={raceIndex} onClose={jest.fn()} />);
      expect(currentSlideId()).toBe("race");
      expect(launchCelebration).not.toHaveBeenCalled();
    } finally {
      window.matchMedia = original;
    }
  });
});
