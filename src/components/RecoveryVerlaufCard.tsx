import type { RecoveryFactorPill, RecoveryVerlaufCardPresentation } from "../recovery/recoveryPresentation";
import { StatusChip } from "../ui/StatusChip";

type Tone = "good" | "fair" | "low";

const WEEKDAY_LETTERS_DE = ["S", "M", "D", "M", "D", "F", "S"] as const;

function weekdayLetter(ymd: string | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return "";
  return WEEKDAY_LETTERS_DE[new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getDay()];
}

/** „78/100 (7d)" → „78"; ohne Zahl `null`. */
function scoreFromContext(context: string): string | null {
  const m = /^(\d+)\s*\/\s*100/.exec(context);
  return m ? m[1] : null;
}

/** Akutlast als ein Wort für die Kachel. */
function loadWord(context: string): string | null {
  if (context === "niedrig") return "Niedrig";
  if (context === "moderat") return "Moderat";
  if (context === "hohe Akutlast") return "Hoch";
  return null;
}

function ScoreTile({ factor }: { factor: RecoveryFactorPill | undefined }) {
  if (!factor) return null;
  const value = factor.available ? scoreFromContext(factor.context) : null;
  return (
    <div className={value == null ? "mr-tile mr-tile--empty" : "mr-tile"}>
      <span className="mr-label">{factor.label}</span>
      <span className="mr-tile__value">{value ?? "—"}</span>
      <span className="mr-tile__foot">{value == null ? "Keine Daten" : "Ø 7 Tage"}</span>
    </div>
  );
}

type Props = {
  presentation: RecoveryVerlaufCardPresentation;
  /** Stufe und Wort des Chips (wie auf Heute); ohne Stufe zeigt der Chip den Zustand („Wird ermittelt"). */
  tone?: Tone;
  toneLabel?: string;
};

/**
 * Display-only: all interpretation lives in `getRecoveryPresentationState` (recoveryPresentation.ts).
 * Aufbau nach docs/design-system/mockups/leistung.html.
 */
export default function RecoveryVerlaufCard({ presentation: p, tone, toneLabel }: Props) {
  const { header, factors, trendValues, trendDates, insightText, insightShowWarning } = p;
  const byId = (id: string) => factors.find((f) => f.id === id);
  const load = byId("load");
  const loadValue = load?.available ? loadWord(load.context) : null;
  const trend = byId("trend");
  const trendWord = trend?.available ? trend.context.replace(/\s*\(7d\)$/, "") : null;
  const caption = [header.deltaLine, trendWord ? `7 Tage ${trendWord}` : null].filter(Boolean).join(" · ");

  return (
    <section className="mr-card mr-recovery">
      <div className="mr-card__top">
        <span className="mr-label">Erholung heute</span>
        {tone && toneLabel ? <StatusChip tone={tone}>{toneLabel}</StatusChip> : <StatusChip tone="plain">{header.statusLabel}</StatusChip>}
      </div>

      <div className="mr-recovery__main">
        <div>
          <div className="mr-recovery__score">
            <span className={header.score !== null ? "mr-metric-xl" : "mr-metric-xl mr-metric--empty"}>
              {header.score !== null ? header.score : "—"}
            </span>
            <span className="mr-unit">/ 100</span>
          </div>
          {caption ? <div className="mr-caption">{caption}</div> : null}
        </div>
        {trendValues.length >= 2 ? (
          <div
            role="img"
            aria-label={`Erholung der letzten 7 Tage${trendWord ? `, ${trendWord}` : ""}`}
            className={tone ? `mr-daybars mr-daybars--${tone}` : "mr-daybars"}
          >
            {trendValues.map((v, i) => (
              <div key={i} className={i === trendValues.length - 1 ? "mr-daybars__day is-latest" : "mr-daybars__day"}>
                <div className="mr-daybars__bar" style={{ height: Math.round(8 + (Math.max(0, Math.min(100, v)) / 100) * 48) }} />
                <span className="mr-daybars__label">{weekdayLetter(trendDates?.[i])}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mr-tiles">
        <ScoreTile factor={byId("sleep")} />
        <ScoreTile factor={byId("hrv")} />
        {load ? (
          <div className={loadValue == null ? "mr-tile mr-tile--empty" : "mr-tile"}>
            <span className="mr-label">{load.label}</span>
            <span className="mr-tile__value mr-tile__value--word">{loadValue ?? "—"}</span>
            <span className="mr-tile__foot">{loadValue == null ? "Unbekannt" : "aktuell"}</span>
          </div>
        ) : null}
      </div>

      {insightText ? (
        <p className={insightShowWarning ? "mr-card__insight mr-card__insight--warn" : "mr-card__insight"}>{insightText}</p>
      ) : null}
    </section>
  );
}
