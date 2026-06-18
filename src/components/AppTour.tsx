import { useEffect, useState, useCallback } from 'react';

export const TOUR_SEEN_KEY = 'myrace_tour_seen';

type TourStep = {
  target?: string;
  title: string;
  text?: string;
  description?: string;
  isWelcome?: boolean;
  position?: 'top' | 'bottom';
  tab: 'home' | 'week' | 'performance' | 'overview' | 'coach';
};

const TOUR_STEPS: TourStep[] = [
  {
    isWelcome: true,
    title: '👋 Willkommen bei MyRace!',
    description: 'Lass uns kurz zeigen, was dich hier erwartet. Die Tour dauert nur 30 Sekunden.',
    tab: 'home',
  },
  {
    target: 'today-session',
    title: '📅 Heutige Einheit',
    text: 'Hier siehst du dein heutiges Training — Distanz, Typ und Beschreibung. Tippe auf ✓ Done wenn du fertig bist.',
    position: 'bottom',
    tab: 'home',
  },
  {
    target: 'recovery-card',
    title: '❤️ Vorbereitungs-Einschätzung',
    text: 'Dein täglicher Readiness-Score. Zeigt ob du heute pushen oder lieber erholen solltest.',
    position: 'bottom',
    tab: 'home',
  },
  {
    target: 'week-header',
    title: '▤ Wochenplan',
    text: 'Alle Sessions der Woche auf einen Blick. Tippe auf eine Einheit für Details und zum Loggen.',
    position: 'bottom',
    tab: 'week',
  },
  {
    target: 'performance-card',
    title: '◔ Leistung',
    text: 'Dein Trainingsfortschritt und Prognose für den Renntag. Hier siehst du wie sich deine Form entwickelt.',
    position: 'bottom',
    tab: 'performance',
  },
  {
    target: 'overview-card',
    title: '◎ Übersicht',
    text: 'Der komplette Trainingsplan — alle Phasen von Base bis Taper. Sieh wo du gerade stehst.',
    position: 'bottom',
    tab: 'overview',
  },
  {
    target: 'coach-tab',
    title: '✦ Dein AI Coach',
    text: 'Frag den Coach alles — Plan anpassen, Einheiten tauschen, Fragen zum Training. Er kennt deinen Stand.',
    position: 'top',
    tab: 'coach',
  },
];

const TOOLTIP_WIDTH = 300;
const ARROW_H = 12;
const MARGIN = 16;
const TAB_BAR_H = 90; // Tab-Bar + Safe-Area-Bottom
const STATUS_BAR_H = 50; // Status-Bar + App-Header

function getElementRect(tourKey: string): DOMRect | null {
  const el = document.querySelector(`[data-tour="${tourKey}"]`);
  if (!el) return null;
  return el.getBoundingClientRect();
}

type TooltipPos = {
  top: number;
  left: number;
  arrowLeft: number;
  arrowPointsDown: boolean;
};

function calcTooltipPosition(rect: DOMRect, position: 'top' | 'bottom'): TooltipPos {
  const vh = window.innerHeight;
  const cx = rect.left + rect.width / 2;
  const left = Math.max(MARGIN, Math.min(cx - TOOLTIP_WIDTH / 2, window.innerWidth - TOOLTIP_WIDTH - MARGIN));
  const arrowLeft = Math.max(16, Math.min(cx - left - 12, TOOLTIP_WIDTH - 40));

  // Verfügbarer Bereich: zwischen Status-Bar oben und Tab-Bar unten
  const safeTop = STATUS_BAR_H;
  const safeBottom = vh - TAB_BAR_H;

  // Berechne ob unterhalb Platz ist
  const spaceBelow = safeBottom - rect.bottom - ARROW_H - 8;
  const spaceAbove = rect.top - safeTop - ARROW_H - 8;

  let top: number;
  let arrowPointsDown: boolean;

  if (position === 'bottom' && spaceBelow >= 120) {
    // Genug Platz unterhalb
    top = rect.bottom + ARROW_H + 8;
    arrowPointsDown = false;
  } else if (spaceAbove >= 120) {
    // Platz oberhalb
    top = rect.top - 140 - ARROW_H - 8;
    arrowPointsDown = true;
    if (top < safeTop) top = safeTop + MARGIN;
  } else {
    // Fallback: mittig im sicheren Bereich
    top = safeTop + (safeBottom - safeTop) / 2 - 70;
    arrowPointsDown = false;
  }

  // Finales Clamping
  top = Math.max(safeTop + MARGIN, Math.min(top, safeBottom - 160 - MARGIN));

  return { top, left, arrowLeft, arrowPointsDown };
}

type AppTourProps = {
  onComplete: () => void;
  onTabChange: (tab: TourStep['tab']) => void;
};

export function AppTour({ onComplete, onTabChange }: AppTourProps) {
  const [step, setStep] = useState(0);
  const [pos, setPos] = useState<TooltipPos | null>(null);
  const [visible, setVisible] = useState(false);

  const current = TOUR_STEPS[step];

  const updatePos = useCallback(() => {
    if (!current) return;
    if (current.isWelcome || !current.target) return;
    const rect = getElementRect(current.target);
    if (!rect) return;
    setPos(calcTooltipPosition(rect, current.position ?? 'bottom'));
  }, [current]);

  useEffect(() => {
    if (!current) return;
    setVisible(false);
    setPos(null);
    if (current.isWelcome) {
      const t = setTimeout(() => {
        setVisible(true);
      }, 380);
      return () => clearTimeout(t);
    }
    onTabChange(current.tab);
    const t = setTimeout(() => {
      updatePos();
      setVisible(true);
    }, 380);
    return () => clearTimeout(t);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.addEventListener('resize', updatePos);
    return () => window.removeEventListener('resize', updatePos);
  }, [updatePos]);

  const goNext = useCallback(() => {
    if (step === TOUR_STEPS.length - 1) {
      onComplete();
    } else {
      setStep(s => s + 1);
    }
  }, [step, onComplete]);

  if (!current) return null;

  const isLast = step === TOUR_STEPS.length - 1;

  return (
    <>
      {/* Dimmed Overlay */}
      <div
        onClick={onComplete}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 8900,
          background: 'rgba(0,0,0,0.6)',
        }}
      />

      {/* Welcome Modal */}
      {current.isWelcome && (
        <div style={{
          position: 'fixed',
          zIndex: 9000,
          top: '50%',
          left: '50%',
          transform: visible ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.95)',
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.25s ease, transform 0.25s ease',
          width: 320,
          borderRadius: 20,
          background: 'rgba(13,20,38,0.98)',
          border: '1px solid rgba(59,130,246,0.4)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6)',
          padding: '28px 24px 20px',
          boxSizing: 'border-box' as const,
        }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', marginBottom: 10, letterSpacing: '-0.01em' }}>
            {current.title}
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.6, marginBottom: 24 }}>
            {current.description}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={onComplete}
              style={{ background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', padding: '4px 8px', fontFamily: 'inherit' }}
            >
              Tour überspringen
            </button>
            <button
              onClick={goNext}
              style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: 12, color: '#e2e8f0', fontSize: 14, fontWeight: 600, padding: '8px 18px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Weiter →
            </button>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {pos && (
        <div
          style={{
            position: 'fixed',
            zIndex: 9000,
            top: pos.top,
            left: pos.left,
            width: TOOLTIP_WIDTH,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(10px) scale(0.95)',
            transition: 'opacity 0.25s ease, transform 0.25s ease',
            borderRadius: 20,
            background: 'rgba(13,20,38,0.98)',
            border: '1px solid rgba(59,130,246,0.4)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.1)',
            padding: '20px 20px 16px',
            boxSizing: 'border-box',
          }}
        >
          {/* Arrow */}
          <div style={{
            position: 'absolute',
            left: pos.arrowLeft,
            ...(pos.arrowPointsDown
              ? { bottom: -ARROW_H, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderTop: '12px solid rgba(13,20,38,0.98)', width: 0, height: 0 }
              : { top: -ARROW_H, borderLeft: '10px solid transparent', borderRight: '10px solid transparent', borderBottom: '12px solid rgba(13,20,38,0.98)', width: 0, height: 0 }
            ),
          }} />

          {/* Title */}
          <div style={{
            fontSize: 15,
            fontWeight: 700,
            color: '#f1f5f9',
            marginBottom: 8,
            letterSpacing: '-0.01em',
          }}>
            {current.title}
          </div>

          {/* Text */}
          <div style={{
            fontSize: 14,
            color: '#94a3b8',
            lineHeight: 1.6,
            marginBottom: 20,
          }}>
            {current.text}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Dots — filter out welcome step */}
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {TOUR_STEPS.filter(s => !s.isWelcome).map((_, i) => {
                const actualIndex = i + 1; // welcome step is index 0, so offset by 1
                return (
                  <div key={i} style={{
                    width: actualIndex === step ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    background: actualIndex === step ? '#3b82f6' : 'rgba(148,163,184,0.2)',
                    transition: 'width 0.22s ease, background 0.22s ease',
                  }} />
                );
              })}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={onComplete}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#475569',
                  fontSize: 13,
                  cursor: 'pointer',
                  padding: '4px 8px',
                  fontFamily: 'inherit',
                }}
              >
                Überspringen
              </button>
              <button
                onClick={goNext}
                style={{
                  background: isLast
                    ? 'linear-gradient(135deg, #10b981, #3b82f6)'
                    : 'rgba(59,130,246,0.12)',
                  border: `1px solid ${isLast ? 'transparent' : 'rgba(59,130,246,0.35)'}`,
                  borderRadius: 12,
                  color: '#e2e8f0',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '8px 18px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                }}
              >
                {isLast ? "Los geht's" : 'Weiter →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
