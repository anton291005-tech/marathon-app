import confetti from "canvas-confetti";
import { CONFETTI_BASE_PARTICLES, CONFETTI_SIDE_PARTICLES, launchCelebration } from "./celebration";

jest.mock("canvas-confetti", () => ({ __esModule: true, default: { create: jest.fn() } }));

type Shot = { particleCount: number };

function mockFire() {
  const resolvers: Array<() => void> = [];
  const shots: Shot[] = [];
  const fire = Object.assign(
    jest.fn((opts: Shot) => {
      shots.push(opts);
      return new Promise<void>((resolve) => resolvers.push(resolve));
    }),
    { reset: jest.fn() },
  );
  (confetti.create as jest.Mock).mockReturnValue(fire);
  return { fire, shots, finishAll: () => resolvers.splice(0).forEach((r) => r()) };
}

const canvasCount = () => document.querySelectorAll("[data-testid='recap-confetti-canvas']").length;

describe("launchCelebration", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    document.body.innerHTML = "";
  });

  it("Basis: begrenzte Partikel, Canvas nach dem Ende entfernt", async () => {
    const { fire, shots, finishAll } = mockFire();
    const handle = launchCelebration({ extraBurst: false });
    expect(canvasCount()).toBe(1);
    expect(shots).toHaveLength(1);
    expect(shots[0].particleCount).toBe(CONFETTI_BASE_PARTICLES);
    finishAll();
    await handle.done;
    expect(canvasCount()).toBe(0);
    expect(fire.reset).toHaveBeenCalled();
  });

  it("Ziel erreicht: zwei zusätzliche Seiten-Bursts, insgesamt ≤ 160 Partikel", async () => {
    const { shots, finishAll } = mockFire();
    const handle = launchCelebration({ extraBurst: true });
    jest.advanceTimersByTime(400);
    expect(shots).toHaveLength(3);
    const total = shots.reduce((sum, s) => sum + s.particleCount, 0);
    expect(total).toBe(CONFETTI_BASE_PARTICLES + 2 * CONFETTI_SIDE_PARTICLES);
    expect(total).toBeLessThanOrEqual(160);
    finishAll();
    await Promise.resolve();
    finishAll();
    await handle.done;
    expect(canvasCount()).toBe(0);
  });

  it("Abbrechen entfernt das Canvas sofort und feuert keinen Extra-Burst mehr", async () => {
    const { shots, finishAll } = mockFire();
    const handle = launchCelebration({ extraBurst: true });
    handle.cancel();
    expect(canvasCount()).toBe(0);
    jest.advanceTimersByTime(1000);
    expect(shots).toHaveLength(1);
    finishAll();
    await expect(handle.done).resolves.toBeUndefined();
  });
});
