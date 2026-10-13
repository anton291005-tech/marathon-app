import { useMemo, useState } from "react";
import { parseTargetTimeToSeconds } from "../appSmartFeatures";

const MARATHON_KM = 42.195;
const HALF_KM = 21.0975;

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

export default function RaceCalculator() {
  const [input, setInput] = useState("2:50:00");

  const result = useMemo(() => {
    const total = parseTargetTimeToSeconds(input);
    if (total == null || total <= 0) {
      return null;
    }
    const paceSec = total / MARATHON_KM;
    const halfTime = (total / MARATHON_KM) * HALF_KM;
    const splits: { km: number; cumulative: string }[] = [];
    for (let km = 5; km < MARATHON_KM; km += 5) {
      const cumSec = paceSec * km;
      splits.push({ km, cumulative: formatRaceTime(cumSec) });
    }
    splits.push({ km: MARATHON_KM, cumulative: formatRaceTime(total) });
    return {
      pacePerKm: formatPacePerKm(paceSec),
      halfMarathon: formatRaceTime(halfTime),
      splits,
      totalFormatted: formatRaceTime(total),
    };
  }, [input]);

  const splitAt = (km: number) => result?.splits.find((row) => row.km === km)?.cumulative ?? "—";

  return (
    <section className="mr-card">
      <h2 className="mr-card__title" style={{ marginBottom: 14 }}>
        Rennrechner
      </h2>
      <label htmlFor="race-calculator-goal" className="mr-field-label">
        Zielzeit Marathon
      </label>
      <input
        id="race-calculator-goal"
        type="text"
        inputMode="numeric"
        className="mr-field mr-field--metric"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="2:50:00"
      />

      {!result ? (
        <p className="mr-card__insight mr-card__insight--warn">Ungültige Zeit. Gib sie als 2:50:00 ein.</p>
      ) : (
        <>
          <div className="mr-km" style={{ marginTop: 16 }}>
            <span className="mr-metric-l">{result.pacePerKm.replace(/\/km$/, "")}</span>
            <span className="mr-unit">/ km</span>
          </div>
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
          <div className="mr-card__divided">
            <div className="mr-label" style={{ marginBottom: 4 }}>
              5-km-Splits
            </div>
            {result.splits.map((row) => (
              <div key={row.km} className="mr-kv">
                <span>{row.km === MARATHON_KM ? "Ziel" : `${row.km} km`}</span>
                <strong>{row.cumulative}</strong>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
