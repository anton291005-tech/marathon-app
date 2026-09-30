import { useCallback, useEffect, useMemo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { hapticImpactLight, hapticSuccess } from "../../native/haptics";
import { formatFinishTime } from "../../prepRecap/raceResultPresentation";
import { formatRecapHero, formatRecapNumber, type RecapHero, type RecapSlide } from "./buildRecapSlides";
import { launchCelebration, type CelebrationHandle } from "./celebration";
import CountUp from "./CountUp";
import { prefersReducedMotion } from "./motion";
import { recapThemeFor } from "./recapTheme";
import {
  heroFontSize,
  recapCloseButtonStyle,
  recapEyebrowStyle,
  recapOverlayStyle,
  recapPrimaryButtonStyle,
  recapSecondaryButtonStyle,
} from "./recapStyles";
import { useStoryPlayer } from "./useStoryPlayer";

export const LONG_PRESS_MS = 250;
export const SWIPE_CLOSE_PX = 80;
const DRAG_START_PX = 10;

type Props = {
  slides: RecapSlide[];
  initialIndex?: number;
  onClose: () => void;
  /** Aktion auf der Outro-Slide (Zielzeit eintragen/bestätigen/bearbeiten). */
  outroAction?: { label: string; onPress: () => void } | null;
  /** „Neue Vorbereitung starten" auf der Outro-Slide — nur vom Home-Rückblick, nie aus dem Archiv. */
  onStartNewPrep?: (() => void) | null;
};

type Gesture = {
  x: number;
  y: number;
  dy: number;
  dragging: boolean;
  longPress: boolean;
  timer: ReturnType<typeof setTimeout> | null;
};

const STORY_CSS = `
@keyframes recapSegFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes recapIn { from { opacity: 0; transform: translate3d(0, 16px, 0); } to { opacity: 1; transform: none; } }
@keyframes recapBgIn { from { opacity: 0; } to { opacity: 1; } }
.recap-in { animation: recapIn .62s cubic-bezier(.2,.8,.2,1) both; }
.recap-bg-in { animation: recapBgIn .5s ease-out both; }
.recap-seg-fill { transform-origin: left center; will-change: transform; }
@media (prefers-reduced-motion: reduce) {
  .recap-in, .recap-bg-in { animation: none !important; }
}
`;

function heroFormatter(hero: RecapHero): (v: number) => string {
  if (hero.kind === "duration") return (v) => formatFinishTime(Math.round(v));
  const digits = hero.fractionDigits;
  return (v) => formatRecapNumber(digits === 0 ? Math.round(v) : v, digits);
}

function stagger(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

function SlideHero({ hero, unit, isRace, animate }: { hero: RecapHero; unit?: string; isRace: boolean; animate: boolean }) {
  const text = formatRecapHero(hero) + (unit ? ` ${unit}` : "");
  const value = hero.kind === "duration" ? hero.seconds : hero.value;
  const format = useMemo(() => heroFormatter(hero), [hero]);
  const goldText: CSSProperties = isRace
    ? {
        backgroundImage: "linear-gradient(180deg, #fffbeb 0%, #fde68a 48%, #f59e0b 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
      }
    : {};
  return (
    <div
      data-testid="recap-hero"
      className="recap-in"
      style={{
        ...stagger(80),
        marginTop: 14,
        fontSize: heroFontSize(text, hero.kind === "duration" ? 112 : 148),
        fontWeight: 850,
        letterSpacing: "-0.055em",
        lineHeight: 0.92,
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
        paddingBottom: "0.04em",
      }}
    >
      <CountUp value={value} format={format} animate={animate} durationMs={hero.kind === "duration" ? 1500 : 1100} style={goldText} />
      {unit ? (
        <span style={{ fontSize: "0.34em", fontWeight: 800, letterSpacing: "-0.01em", marginLeft: "0.18em", color: isRace ? "#fde68a" : undefined }}>
          {unit}
        </span>
      ) : null}
    </div>
  );
}

function PhaseTimeline({ phases }: { phases: NonNullable<RecapSlide["phases"]> }) {
  return (
    <ol style={{ listStyle: "none", margin: "26px 0 0", padding: 0, display: "flex", flexDirection: "column" }}>
      {phases.map((p, i) => (
        <li
          key={p.key}
          className="recap-in"
          style={{ ...stagger(160 + i * 110), display: "flex", gap: 16, alignItems: "stretch", minWidth: 0 }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 14, flexShrink: 0 }}>
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 999,
                background: p.color,
                boxShadow: `0 0 18px ${p.color}`,
                marginTop: 8,
              }}
            />
            {i < phases.length - 1 ? (
              <span style={{ flex: 1, width: 2, minHeight: 18, background: "rgba(248,250,252,0.18)", marginTop: 4 }} />
            ) : null}
          </div>
          <div style={{ paddingBottom: i < phases.length - 1 ? 16 : 0, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{p.label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "rgba(226,232,240,0.65)", marginTop: 3 }}>
              {[`${p.weeks} ${p.weeks === 1 ? "Woche" : "Wochen"}`, p.km != null ? `${formatRecapNumber(Math.round(p.km), 0)} km` : null]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function BodyRows({ rows, accent }: { rows: NonNullable<RecapSlide["body"]>; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22, marginTop: 28 }}>
      {rows.map((row, i) => (
        <div key={row.label} className="recap-in" style={stagger(140 + i * 120)}>
          <div style={{ ...recapEyebrowStyle, fontSize: 12, color: accent, opacity: 0.9 }}>{row.label}</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              flexWrap: "wrap",
              gap: "4px 14px",
              marginTop: 6,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ fontSize: 30, fontWeight: 700, color: "rgba(226,232,240,0.55)", letterSpacing: "-0.02em" }}>
              {row.first}
            </span>
            <span aria-label="zu" style={{ fontSize: 24, color: "rgba(226,232,240,0.45)" }}>
              →
            </span>
            <span style={{ fontSize: 46, fontWeight: 850, letterSpacing: "-0.035em" }}>{row.last}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Vollbild-Story „Deine Vorbereitung". Tap rechts ⅔ weiter, links ⅓ zurück, Halten (> 250 ms)
 * pausiert, nach unten wischen (> 80 px) oder ✕ schließt. 6 s pro Slide, letzte Slide ohne Auto-Advance.
 */
export default function PrepRecapStory({
  slides,
  initialIndex = 0,
  onClose,
  outroAction = null,
  onStartNewPrep = null,
}: Props) {
  const player = useStoryPlayer({ count: slides.length, initialIndex });
  const { index, next, prev, setHeld, paused, running, isLast, durationMs } = player;
  const slide = slides[index];
  const theme = recapThemeFor(slide.id);
  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const prevIndexRef = useRef<number | null>(null);
  const celebrationRef = useRef<CelebrationHandle | null>(null);
  const previousBg = prevIndexRef.current != null && prevIndexRef.current !== index ? slides[prevIndexRef.current] : null;

  // Haptik bei jedem Slide-Wechsel (nicht beim Öffnen); die Renn-Slide bekommt das Erfolgs-Muster.
  useEffect(() => {
    const previous = prevIndexRef.current;
    prevIndexRef.current = index;
    if (previous == null || previous === index) return;
    if (slides[index]?.id === "race") void hapticSuccess();
    else void hapticImpactLight();
  }, [index, slides]);

  // Konfetti: Basis immer, Extra-Burst nur bei erreichtem Ziel. Nie parallel zweimal.
  useEffect(() => {
    const celebration = slide.celebration;
    if (!celebration || reducedMotion || celebrationRef.current) return;
    const handle = launchCelebration({ extraBurst: celebration === "goal", colors: theme.confetti });
    celebrationRef.current = handle;
    void handle.done.then(() => {
      if (celebrationRef.current === handle) celebrationRef.current = null;
    });
  }, [slide.celebration, slide.id, reducedMotion, theme.confetti, index]);

  useEffect(
    () => () => {
      celebrationRef.current?.cancel();
      celebrationRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  const setStageDrag = useCallback((dy: number, animateBack: boolean) => {
    const el = stageRef.current;
    if (!el) return;
    el.style.transition = animateBack ? "transform .28s cubic-bezier(.2,.8,.2,1), opacity .28s ease" : "none";
    el.style.transform = dy > 0 ? `translate3d(0, ${dy}px, 0) scale(${Math.max(0.9, 1 - dy / 2000)})` : "";
    el.style.opacity = dy > 0 ? String(Math.max(0.5, 1 - dy / 600)) : "";
  }, []);

  const clearGesture = () => {
    const g = gestureRef.current;
    if (g?.timer) clearTimeout(g.timer);
    gestureRef.current = null;
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button != null && e.button > 0) return;
    clearGesture();
    const g: Gesture = { x: e.clientX, y: e.clientY, dy: 0, dragging: false, longPress: false, timer: null };
    g.timer = setTimeout(() => {
      g.longPress = true;
      g.timer = null;
      setHeld(true);
    }, LONG_PRESS_MS);
    gestureRef.current = g;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    const dy = e.clientY - g.y;
    const dx = e.clientX - g.x;
    if (!g.dragging && dy > DRAG_START_PX && dy > Math.abs(dx)) {
      g.dragging = true;
      if (g.timer) {
        clearTimeout(g.timer);
        g.timer = null;
      }
      setHeld(true);
    }
    if (g.dragging) {
      g.dy = Math.max(0, dy);
      setStageDrag(g.dy, false);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gestureRef.current;
    if (!g) return;
    clearGesture();
    if (g.dragging) {
      if (g.dy > SWIPE_CLOSE_PX) {
        onClose();
        return;
      }
      setStageDrag(0, true);
      setHeld(false);
      return;
    }
    if (g.longPress) {
      setHeld(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const x = e.clientX - rect.left;
    if (x < width / 3) prev();
    else next();
  };

  const onPointerCancel = () => {
    const g = gestureRef.current;
    clearGesture();
    if (g?.dragging) setStageDrag(0, true);
    if (g?.dragging || g?.longPress) setHeld(false);
  };

  const stopForControls = (e: ReactPointerEvent) => e.stopPropagation();
  const animate = !reducedMotion;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rückblick auf deine Vorbereitung"
      data-testid="prep-recap-story"
      style={recapOverlayStyle}
    >
      <style>{STORY_CSS}</style>

      <div
        ref={stageRef}
        data-testid="recap-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
          borderRadius: 0,
        } as CSSProperties}
      >
        {previousBg ? (
          <div aria-hidden style={{ position: "absolute", inset: 0, background: recapThemeFor(previousBg.id).background }} />
        ) : null}
        <div
          key={`bg-${index}`}
          aria-hidden
          className={previousBg ? "recap-bg-in" : undefined}
          style={{ position: "absolute", inset: 0, background: theme.background }}
        />

        {/* Kopf: Segmente + Schließen. Beim Halten ausgeblendet, damit nur der Inhalt bleibt. */}
        <div
          style={{
            position: "relative",
            padding: "calc(env(safe-area-inset-top, 0px) + 10px) 12px 0",
            transition: "opacity .2s ease",
            opacity: paused ? 0 : 1,
          }}
        >
          <div style={{ display: "flex", gap: 4 }} aria-hidden>
            {slides.map((s, i) => (
              <div
                key={s.id}
                style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(248,250,252,0.26)", overflow: "hidden" }}
              >
                <div
                  key={i === index ? `fill-${index}` : undefined}
                  className="recap-seg-fill"
                  data-testid={i === index ? "recap-seg-current" : undefined}
                  style={{
                    height: "100%",
                    background: "#f8fafc",
                    transform: i < index || (i === index && isLast) ? "scaleX(1)" : i > index ? "scaleX(0)" : undefined,
                    animation:
                      i === index && !isLast ? `recapSegFill ${durationMs}ms linear forwards` : undefined,
                    animationPlayState: i === index && !running ? "paused" : "running",
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 750, letterSpacing: "0.02em", color: "rgba(248,250,252,0.78)" }}>
              MyRace · Rückblick
            </div>
            <button
              type="button"
              aria-label="Rückblick schließen"
              onPointerDown={stopForControls}
              onPointerUp={stopForControls}
              onClick={onClose}
              style={recapCloseButtonStyle}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Inhalt: eine Aussage pro Slide, viel Luft. */}
        <div
          key={`slide-${index}`}
          data-testid={`recap-slide-${slide.id}`}
          aria-live="polite"
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 28px",
            width: "100%",
            maxWidth: 560,
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          <div className="recap-in" style={{ ...recapEyebrowStyle, color: theme.accent }}>
            {slide.eyebrow}
          </div>
          {slide.hero ? <SlideHero hero={slide.hero} unit={slide.heroUnit} isRace={slide.id === "race"} animate={animate} /> : null}
          <div
            className="recap-in"
            style={{
              ...stagger(slide.hero ? 180 : 80),
              marginTop: slide.hero ? 14 : 18,
              fontSize: slide.hero ? "clamp(24px, 7vw, 32px)" : "clamp(32px, 9.5vw, 44px)",
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              overflowWrap: "anywhere",
            }}
          >
            {slide.headline}
          </div>
          {slide.subline ? (
            <div
              className="recap-in"
              style={{
                ...stagger(slide.hero ? 280 : 180),
                marginTop: 12,
                fontSize: 17,
                lineHeight: 1.45,
                color: "rgba(226,232,240,0.74)",
                maxWidth: "32ch",
                overflowWrap: "anywhere",
              }}
            >
              {slide.subline}
            </div>
          ) : null}
          {slide.phases ? <PhaseTimeline phases={slide.phases} /> : null}
          {slide.body ? <BodyRows rows={slide.body} accent={theme.accent} /> : null}
          {slide.detail ? (
            <div
              className="recap-in"
              style={{
                ...stagger(380),
                marginTop: 18,
                fontSize: 14,
                fontWeight: 650,
                color: "rgba(226,232,240,0.58)",
                overflowWrap: "anywhere",
              }}
            >
              {slide.detail}
            </div>
          ) : null}
          {slide.summary && slide.summary.length > 0 ? (
            <div className="recap-in" style={{ ...stagger(300), display: "flex", flexWrap: "wrap", gap: 8, marginTop: 24 }}>
              {slide.summary.map((item) => (
                <span
                  key={item}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 999,
                    background: "rgba(248,250,252,0.1)",
                    border: "1px solid rgba(248,250,252,0.14)",
                    fontSize: 15,
                    fontWeight: 750,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {/* Fuß: Outro-Aktionen bzw. dezenter Bedienhinweis auf der ersten Slide. */}
        <div
          style={{
            position: "relative",
            padding: "0 24px calc(env(safe-area-inset-bottom, 0px) + 18px)",
            width: "100%",
            maxWidth: 560,
            margin: "0 auto",
            boxSizing: "border-box",
            minHeight: 44,
          }}
        >
          {isLast ? (
            <div
              className="recap-in"
              style={{ ...stagger(420), display: "flex", flexDirection: "column", gap: 10 }}
              onPointerDown={stopForControls}
              onPointerUp={stopForControls}
            >
              <button type="button" onClick={onClose} style={recapPrimaryButtonStyle}>
                Fertig
              </button>
              {onStartNewPrep ? (
                <button type="button" onClick={onStartNewPrep} style={recapSecondaryButtonStyle}>
                  Neue Vorbereitung starten
                </button>
              ) : null}
              {outroAction ? (
                <button type="button" onClick={outroAction.onPress} style={recapSecondaryButtonStyle}>
                  {outroAction.label}
                </button>
              ) : null}
            </div>
          ) : index === 0 ? (
            <div
              style={{
                textAlign: "center",
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(226,232,240,0.5)",
                transition: "opacity .2s ease",
                opacity: paused ? 0 : 1,
              }}
            >
              Tippen für weiter · Halten zum Pausieren
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
