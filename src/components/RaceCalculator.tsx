import { useMemo, useState } from "react";
import { parseTargetTimeToSeconds } from "../appSmartFeatures";
import { HALF_MARATHON_KM, canonicalRaceDistanceKm, raceDistanceKind, raceDistanceName, splitMarksKm, targetTimeExample } from "../raceDistance";

function formatRaceTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatPacePerKm(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

type Props = {
  /** Renndistanz des aktiven Plans; ohne Angabe rechnet der Rechner nicht (neutraler Hinweis). */
  raceDistanceKm?: number | null;
  /** Zielzeit des aktiven Plans (hh:mm:ss) als Startwert; leer = „Nur finishen" / kein Ziel. */
  initialTime?: string | null;
};

/** Rechenergebnis für eine Zielzeit über `distanceKm` — pure, damit testbar. */
export function computeRaceSplits(totalSeconds: number, distanceKm: number) {
  const paceSec = totalSeconds / distanceKm;
  const splits = splitMarksKm(distanceKm).map((km) => ({ km, cumulative: formatRaceTime(paceSec * km) }));
  splits.push({ km: distanceKm, cumulative: formatRaceTime(totalSeconds) });
  return {
    pacePerKm: formatPacePerKm(paceSec),
    // Halbmarathon-Zwischenzeit nur im Marathon sinnvoll.
    halfMarathon: raceDistanceKind(distanceKm) === "marathon" ? formatRaceTime(paceSec * HALF_MARATHON_KM) : null,
    splits,
    totalFormatted: formatRaceTime(totalSeconds),
  };
}

/** Parent setzt `key` auf Plan-ID + Distanz, damit ein Planwechsel Eingabe und Splits neu startet. */
export default function RaceCalculator({ raceDistanceKm, initialTime }: Props) {
  const distanceKm = canonicalRaceDistanceKm(raceDistanceKm);
  const distanceName = raceDistanceName(distanceKm);
  const [input, setInput] = useState(initialTime?.trim() ?? "");

  const result = useMemo(() => {
    if (distanceKm == null) return null;
    const total = parseTargetTimeToSeconds(input);
    if (total == null || total <= 0) return null;
    return computeRaceSplits(total, distanceKm);
  }, [input, distanceKm]);

  const hasInput = input.trim() !== "";
  const splitStepLabel = distanceKm != null && distanceKm <= 10.5 ? "1-km-Splits" : "5-km-Splits";
  const splitAt = (km: number) => result?.splits.find((row) => row.km === km)?.cumulative ?? "—";

  return (
    <section className="mr-card">
      <h2 className="mr-card__title" style={{ marginBottom: 14 }}>
        Rennrechner
      </h2>
      <label htmlFor="race-calculator-goal" className="mr-field-label">
        {distanceName ? `Zielzeit ${distanceName}` : "Zielzeit"}
      </label>
      <input
        id="race-calculator-goal"
        type="text"
        inputMode="numeric"
        className="mr-field mr-field--metric"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={targetTimeExample(distanceKm)}
        disabled={distanceKm == null}
      />

      {distanceKm == null ? (
        <p className="mr-card__insight">Im Plan fehlt die Renndistanz.</p>
      ) : !result ? (
        hasInput ? (
          <p className="mr-card__insight mr-card__insight--warn">
            Ungültige Zeit. Gib sie als {targetTimeExample(distanceKm)} ein.
          </p>
        ) : (
          <p className="mr-card__insight">Zielzeit eingeben, um Pace und Zwischenzeiten zu sehen.</p>
        )
      ) : (
        <>
          <div className="mr-km" style={{ marginTop: 16 }}>
            <span className="mr-metric-l">{result.pacePerKm.replace(/\/km$/, "")}</span>
            <span className="mr-unit">/ km</span>
          </div>
          {result.halfMarathon ? (
            <div className="mr-cols mr-card__divided">
              <div>
                <div className="mr-cols__label">10 km</div>
                <div className="mr-cols__value">{splitAt(10)}</div>
              </div>
              <div>
                <div className="mr-cols__label">Halbmarathon</div>
                <div className="mr-cols__value">{result.halfMarathon}</div>
              </div>
              <div>
                <div className="mr-cols__label">30 km</div>
                <div className="mr-cols__value">{splitAt(30)}</div>
              </div>
            </div>
          ) : null}
          <div className="mr-card__divided">
            <div className="mr-label" style={{ marginBottom: 4 }}>
              {splitStepLabel}
            </div>
            {result.splits.map((row) => (
              <div key={row.km} className="mr-kv">
                <span>{row.km === distanceKm ? "Ziel" : `${row.km} km`}</span>
                <strong>{row.cumulative}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
