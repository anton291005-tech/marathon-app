/**
 * One-time recovery script: restores the original hardcoded marathon plan for a specific user
 * and maps existing Apple Health session_logs to the original plan session IDs (w01-mo … w25-so).
 *
 * Run with:  npx ts-node --project tsconfig.scripts.json scripts/restoreOriginalPlan.ts
 *
 * Delete this file after successful execution.
 */
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import type { WorkoutV2, WeekV2, TrainingPlanV2 } from "../src/planV2/types";

// ─── Config ───────────────────────────────────────────────────────────────────

const USER_ID = "dc86a082-25a6-4708-984e-a5d0b3d58653";
const PLAN_NAME = "Marathon – Warschau – 27.09.2026";

// ─── Supabase admin client (service_role bypasses RLS) ───────────────────────

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing REACT_APP_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Original Plan Data ───────────────────────────────────────────────────────

type PlanSession = {
  id: string;
  day: string;
  date: string;
  type: string;
  title: string;
  km: number;
  desc: string;
  pace: string | null;
};

type PlanWeek = {
  wn: number;
  phase: string;
  label: string;
  dates: string;
  km: number;
  focus: string;
  s: PlanSession[];
};

const s = (
  id: string,
  day: string,
  date: string,
  type: string,
  title: string,
  km: number,
  desc: string,
  pace: string | null,
): PlanSession => ({ id, day, date, type, title, km, desc, pace });

const PLAN: PlanWeek[] = [
  // ── MINI-PREP ──────────────────────────────────────────────────────────────
  {
    wn: 1, phase: "MINI", label: "Mini-Prep Woche 1", dates: "6.–12. April 2026", km: 35,
    focus: "Sanfter Wiedereinstieg nach Weisheitszahn-OP – kein Druck!",
    s: [
      s("w01-mo", "Mo", "6. Apr",  "rest",     "Ruhetag",                      0,  "Vollständige Erholung. Spazieren ok.",                                            null),
      s("w01-di", "Di", "7. Apr",  "easy",     "Easy Run",                     6,  "Sehr locker. Körper testen nach OP. Puls <140.",                                  "5:30–5:50/km"),
      s("w01-mi", "Mi", "8. Apr",  "easy",     "Easy Run",                     8,  "Lockeres Dauerlauftempo. Kein Stress.",                                           "5:20–5:40/km"),
      s("w01-do", "Do", "9. Apr",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper mit Gewichten – locker nach OP-Pause.",                               null),
      s("w01-fr", "Fr", "10. Apr", "bike",     "Rennrad locker",               0,  "45–60 min lockeres Radfahren ODER Easy 7 km.",                                    "sehr locker"),
      s("w01-sa", "Sa", "11. Apr", "easy",     "Easy Run",                     10, "Lockerer Dauerlauf.",                                                             "5:20–5:30/km"),
      s("w01-so", "So", "12. Apr", "long",     "Langer Lauf",                  14, "Erster Long Run – sehr gemütlich, kein Tempo!",                                   "5:30–5:50/km"),
    ],
  },
  {
    wn: 2, phase: "MINI", label: "Mini-Prep Woche 2", dates: "13.–19. April 2026", km: 45,
    focus: "Basis aufbauen + erste Strides für Speed-Impuls",
    s: [
      s("w02-mo", "Mo", "13. Apr", "easy",     "Easy Run",                     6,  "Lockerer Recovery-Lauf.",                                                         "5:30–5:50/km"),
      s("w02-di", "Di", "14. Apr", "easy",     "Easy + 6× Strides",            8,  "8 km easy, dann 6×80m Strides (locker-schnell, 60s Pause).",                      "5:20/km + Strides"),
      s("w02-mi", "Mi", "15. Apr", "easy",     "Easy Run",                     10, "Lockerer Dauerlauf. Fundament legen.",                                            "5:15–5:30/km"),
      s("w02-do", "Do", "16. Apr", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper – etwas mehr Intensität als Woche 1.",                                 null),
      s("w02-fr", "Fr", "17. Apr", "bike",     "Rennrad 60 min",               0,  "Aktive Regeneration auf dem Rad.",                                                "locker ~65% HFmax"),
      s("w02-sa", "Sa", "18. Apr", "easy",     "Easy Run",                     12, "Progressiv: erst locker, letzte 2 km etwas flotter.",                             "5:15–5:30/km"),
      s("w02-so", "So", "19. Apr", "long",     "Langer Lauf → Vorbereitung done!", 17, "🚀 Letzter Lauf der Mini-Prep. Easy & genussvoll!",                           "5:20–5:40/km"),
    ],
  },
  // ── BASE ───────────────────────────────────────────────────────────────────
  {
    wn: 3, phase: "BASE", label: "Basisaufbau W1", dates: "20.–26. April 2026", km: 50,
    focus: "Erste Qualitätseinheit – aerobes System stärken (pyramidal ~80/15/5)",
    s: [
      s("w03-mo", "Mo", "20. Apr", "rest",     "Ruhetag – START HAUPTPREP",    0,  "Erholung. Ab heute beginnt die echte Vorbereitung!",                             null),
      s("w03-di", "Di", "21. Apr", "easy",     "Easy Run",                     10, "Lockerer Dauerlauf als Unterbau für Wochenmitte.",                                "5:10–5:25/km"),
      s("w03-mi", "Mi", "22. Apr", "interval", "Intervall: 6×1000m",           13, "2km WU · 6×1000m @ 4:20/km (90s Trottpause) · 2km CD.",                          "4:20/km"),
      s("w03-do", "Do", "23. Apr", "easy",     "Easy Run",                     10, "Lockere Regeneration nach Intervallen.",                                          "5:15–5:30/km"),
      s("w03-fr", "Fr", "24. Apr", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper mit Gewichten.",                                                      null),
      s("w03-sa", "Sa", "25. Apr", "bike",     "Rennrad 60 min",               0,  "Aktive Erholung auf dem Rad.",                                                    "locker"),
      s("w03-so", "So", "26. Apr", "long",     "Long Run 22 km",               22, "Gleichmäßig aerob. Nicht zu schnell starten!",                                   "5:15–5:25/km"),
    ],
  },
  {
    wn: 4, phase: "BASE", label: "Basisaufbau W2", dates: "27. Apr – 3. Mai 2026", km: 55,
    focus: "Schwellenarbeit + erstes MP-Feeling im Long Run",
    s: [
      s("w04-mo", "Mo", "27. Apr", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w04-di", "Di", "28. Apr", "easy",     "Easy + Strides",               10, "10 km easy + 6×80m Strides.",                                                    "5:10–5:20/km"),
      s("w04-mi", "Mi", "29. Apr", "tempo",    "Tempodauerlauf 14 km",         14, "2km WU · 8km @ 4:08–4:12/km (Schwelle) · 2km easy · 2km CD.",                    "4:08–4:12/km"),
      s("w04-do", "Do", "30. Apr", "easy",     "Easy Run",                     10, "Lockere Erholung nach Tempo.",                                                    "5:15–5:30/km"),
      s("w04-fr", "Fr", "1. Mai",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w04-sa", "Sa", "2. Mai",  "easy",     "Easy Run",                     12, "Lockerer Lauf vor dem langen Sonntag.",                                           "5:15–5:25/km"),
      s("w04-so", "So", "3. Mai",  "long",     "Long Run 23 km mit MP",        23, "17km easy → letzte 6km @ 4:10/km. Erstes MP-Feeling!",                           "5:15/km → letzte 6: 4:10/km"),
    ],
  },
  {
    wn: 5, phase: "BASE", label: "Basisaufbau W3", dates: "4.–10. Mai 2026", km: 60,
    focus: "Längere Intervalle – VO2max-Reiz setzen",
    s: [
      s("w05-mo", "Mo", "4. Mai",  "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w05-di", "Di", "5. Mai",  "interval", "Intervall: 5×2000m",           16, "2km WU · 5×2000m @ 4:10/km (2min Pause) · 2km CD.",                              "4:10/km"),
      s("w05-mi", "Mi", "6. Mai",  "easy",     "Easy Run",                     12, "Lockerer Dauerlauf.",                                                             "5:10–5:25/km"),
      s("w05-do", "Do", "7. Mai",  "bike",     "Rennrad 75 min",               0,  "Aerobes Training ohne Laufbelastung.",                                            "locker ~65% HFmax"),
      s("w05-fr", "Fr", "8. Mai",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w05-sa", "Sa", "9. Mai",  "easy",     "Easy Run",                     12, "Locker. Fokus auf Lauftechnik.",                                                  "5:10–5:20/km"),
      s("w05-so", "So", "10. Mai", "long",     "Long Run 24 km",               24, "Gleichmäßig easy – keine Tempoarbeit heute.",                                     "5:15–5:25/km"),
    ],
  },
  {
    wn: 6, phase: "BASE", label: "Recovery-Woche 1 ⬇️", dates: "11.–17. Mai 2026", km: 45,
    focus: "⬇️ Entlastungswoche – Adaptationen festigen, Körper erholen",
    s: [
      s("w06-mo", "Mo", "11. Mai", "rest",     "Ruhetag",                      0,  "Vollständige Erholung.",                                                          null),
      s("w06-di", "Di", "12. Mai", "easy",     "Easy Run",                     8,  "Kurzer, lockerer Lauf. Kein Druck.",                                              "5:20–5:35/km"),
      s("w06-mi", "Mi", "13. Mai", "easy",     "Easy + Strides",               10, "10km easy + 6×80m Strides.",                                                     "5:15–5:25/km"),
      s("w06-do", "Do", "14. Mai", "strength", "Krafttraining (Gym)",           0,  "Moderate Intensität.",                                                            null),
      s("w06-fr", "Fr", "15. Mai", "bike",     "Rennrad 60 min",               0,  "Lockere Radeinheit – aktive Regeneration.",                                       "sehr locker"),
      s("w06-sa", "Sa", "16. Mai", "easy",     "Easy Run",                     10, "Kurzer, lockerer Lauf.",                                                          "5:15–5:30/km"),
      s("w06-so", "So", "17. Mai", "long",     "Long Run 18 km",               18, "Kürzerer Long Run – leicht & entspannt.",                                         "5:20–5:30/km"),
    ],
  },
  {
    wn: 7, phase: "BASE", label: "Basisaufbau W5", dates: "18.–24. Mai 2026", km: 62,
    focus: "Doppelte Qualität: Intervall + Long Run mit MP-Anteil",
    s: [
      s("w07-mo", "Mo", "18. Mai", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w07-di", "Di", "19. Mai", "interval", "Intervall: 8×1000m",           14, "2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km CD.",                               "4:10/km"),
      s("w07-mi", "Mi", "20. Mai", "easy",     "Easy Run",                     12, "Lockerer Dauerlauf.",                                                             "5:10–5:25/km"),
      s("w07-do", "Do", "21. Mai", "easy",     "Easy Run",                     10, "Locker erholen.",                                                                 "5:15–5:25/km"),
      s("w07-fr", "Fr", "22. Mai", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w07-sa", "Sa", "23. Mai", "tempo",    "Tempodauerlauf 16 km",         16, "2km WU · 10km @ 4:05/km · 2km easy · 2km CD.",                                   "4:05/km"),
      s("w07-so", "So", "24. Mai", "long",     "Long Run 24 km mit MP",        24, "16km easy → letzte 8km @ 4:15/km. Kraft + Tempo!",                               "5:15 → letzte 8km: 4:15/km"),
    ],
  },
  // ── DEV ────────────────────────────────────────────────────────────────────
  {
    wn: 8, phase: "DEV", label: "Entwicklung W1", dates: "25.–31. Mai 2026", km: 65,
    focus: "Längere Intervalle + 26km Long Run – erste große Marke",
    s: [
      s("w08-mo", "Mo", "25. Mai", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w08-di", "Di", "26. Mai", "interval", "Intervall: 6×1200m",           14, "2km WU · 6×1200m @ 4:05/km (90s Pause) · 2km CD.",                               "4:05/km"),
      s("w08-mi", "Mi", "27. Mai", "easy",     "Easy Run",                     13, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w08-do", "Do", "28. Mai", "bike",     "Rennrad 75 min",               0,  "Lockere Radeinheit – Beine schonen.",                                             "locker"),
      s("w08-fr", "Fr", "29. Mai", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w08-sa", "Sa", "30. Mai", "easy",     "Easy Run",                     13, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w08-so", "So", "31. Mai", "long",     "Long Run 26 km 🎉",            26, "Erste 26er-Marke! Gleichmäßig easy.",                                             "5:10–5:20/km"),
    ],
  },
  {
    wn: 9, phase: "DEV", label: "Entwicklung W2", dates: "1.–7. Juni 2026", km: 68,
    focus: "Langer Schwellenlauf 16km + 27km Long Run",
    s: [
      s("w09-mo", "Mo", "1. Jun",  "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w09-di", "Di", "2. Jun",  "tempo",    "Tempodauerlauf 16 km",         16, "2km WU · 12km @ 4:05/km · 2km CD. Langer Schwellenlauf!",                        "4:05/km"),
      s("w09-mi", "Mi", "3. Jun",  "easy",     "Easy Run",                     13, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w09-do", "Do", "4. Jun",  "easy",     "Easy Run",                     12, "Locker regenerieren.",                                                            "5:15–5:25/km"),
      s("w09-fr", "Fr", "5. Jun",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w09-sa", "Sa", "6. Jun",  "bike",     "Rennrad 75 min",               0,  "Aktive Erholung auf dem Rad.",                                                    "locker"),
      s("w09-so", "So", "7. Jun",  "long",     "Long Run 27 km",               27, "Gleichmäßig easy. Aerobe Kraft aufbauen.",                                        "5:10–5:20/km"),
    ],
  },
  {
    wn: 10, phase: "DEV", label: "Entwicklung W3", dates: "8.–14. Juni 2026", km: 72,
    focus: "VO2max-Intervalle + erster 28km mit MP-Block",
    s: [
      s("w10-mo", "Mo", "8. Jun",  "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w10-di", "Di", "9. Jun",  "interval", "Intervall: 4×3000m",           16, "2km WU · 4×3000m @ 4:00/km (3min Pause) · 2km CD.",                              "4:00/km"),
      s("w10-mi", "Mi", "10. Jun", "easy",     "Easy Run",                     13, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w10-do", "Do", "11. Jun", "bike",     "Rennrad 90 min",               0,  "Längere Radeinheit – aerobes Training ohne Laufstress.",                          "locker-moderat"),
      s("w10-fr", "Fr", "12. Jun", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w10-sa", "Sa", "13. Jun", "easy",     "Easy Run",                     13, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w10-so", "So", "14. Jun", "long",     "Long Run 28 km mit MP 💪",     28, "20km easy → letzte 8km @ 4:10/km. Erste spezifische Einheit!",                   "5:10 → letzte 8km: 4:10/km"),
    ],
  },
  {
    wn: 11, phase: "DEV", label: "Recovery-Woche 2 ⬇️", dates: "15.–21. Juni 2026", km: 55,
    focus: "⬇️ Entlastungswoche – Kraft sammeln für Peak-Phase",
    s: [
      s("w11-mo", "Mo", "15. Jun", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w11-di", "Di", "16. Jun", "easy",     "Easy Run",                     10, "Lockerer Lauf.",                                                                  "5:15–5:30/km"),
      s("w11-mi", "Mi", "17. Jun", "interval", "Kurze Intervalle: 6×800m",     12, "2km WU · 6×800m @ 3:52/km (90s Pause) · 2km CD. Schnell & frisch!",              "3:52/km"),
      s("w11-do", "Do", "18. Jun", "strength", "Krafttraining (Gym)",           0,  "Gewichtstraining.",                                                               null),
      s("w11-fr", "Fr", "19. Jun", "bike",     "Rennrad 60 min",               0,  "Lockere Radeinheit.",                                                             "locker"),
      s("w11-sa", "Sa", "20. Jun", "easy",     "Easy Run",                     12, "Lockerer Lauf.",                                                                  "5:15–5:25/km"),
      s("w11-so", "So", "21. Jun", "long",     "Long Run 20 km",               20, "Kürzerer Long Run – entspannt & genussvoll.",                                     "5:15–5:25/km"),
    ],
  },
  {
    wn: 12, phase: "DEV", label: "Entwicklung W5", dates: "22.–28. Juni 2026", km: 74,
    focus: "Schwellentempo + 28km mit progressivem MP-Segment",
    s: [
      s("w12-mo", "Mo", "22. Jun", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w12-di", "Di", "23. Jun", "interval", "Intervall: 5×2000m",           16, "2km WU · 5×2000m @ 4:00/km (2min Pause) · 2km CD.",                              "4:00/km"),
      s("w12-mi", "Mi", "24. Jun", "easy",     "Easy Run",                     13, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w12-do", "Do", "25. Jun", "easy",     "Easy Run",                     13, "Lockere Erholung.",                                                               "5:15–5:25/km"),
      s("w12-fr", "Fr", "26. Jun", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w12-sa", "Sa", "27. Jun", "tempo",    "Tempodauerlauf 16 km",         16, "2km WU · 12km @ 4:02/km · 2km CD.",                                              "4:02/km"),
      s("w12-so", "So", "28. Jun", "long",     "Long Run 28 km mit MP",        28, "20km easy → letzte 8km @ 4:08/km. Progressiver Long Run!",                       "5:10 → letzte 8: 4:08/km"),
    ],
  },
  {
    wn: 13, phase: "DEV", label: "Entwicklung W6", dates: "29. Jun – 5. Jul 2026", km: 78,
    focus: "Langer Schwellenlauf 18km + 28km mit großem MP-Block",
    s: [
      s("w13-mo", "Mo", "29. Jun", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w13-di", "Di", "30. Jun", "tempo",    "Tempodauerlauf 18 km",         18, "2km WU · 14km @ 4:00/km · 2km CD. Langer Schwellenlauf!",                        "4:00/km"),
      s("w13-mi", "Mi", "1. Jul",  "easy",     "Easy Run",                     14, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w13-do", "Do", "2. Jul",  "bike",     "Rennrad 90 min",               0,  "Lockere-moderate Radeinheit.",                                                    "locker-moderat"),
      s("w13-fr", "Fr", "3. Jul",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w13-sa", "Sa", "4. Jul",  "easy",     "Easy Run",                     13, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w13-so", "So", "5. Jul",  "long",     "Long Run 28 km – großer MP-Block 💥", 28, "18km easy → letzte 10km @ 4:05/km. Starkes MP-Feeling!",                   "5:10 → letzte 10: 4:05/km"),
    ],
  },
  // ── BUILD/PEAK ─────────────────────────────────────────────────────────────
  {
    wn: 14, phase: "BUILD", label: "Aufbau W1", dates: "6.–12. Juli 2026", km: 80,
    focus: "Erste 80km-Woche 🔥 – polarisierter Trainingsansatz beginnt",
    s: [
      s("w14-mo", "Mo", "6. Jul",  "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w14-di", "Di", "7. Jul",  "interval", "Intervall: 6×1600m",           16, "2km WU · 6×1600m @ 3:55/km (2min Pause) · 2km CD.",                              "3:55/km"),
      s("w14-mi", "Mi", "8. Jul",  "easy",     "Easy Run",                     14, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w14-do", "Do", "9. Jul",  "easy",     "Easy Run",                     13, "Lockere Erholung.",                                                               "5:10–5:25/km"),
      s("w14-fr", "Fr", "10. Jul", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w14-sa", "Sa", "11. Jul", "easy",     "Easy Run",                     13, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w14-so", "So", "12. Jul", "long",     "Long Run 30 km 🎉",            30, "ERSTE 30er-MARKE! Gleichmäßig easy – große Leistung!",                           "5:10–5:20/km"),
    ],
  },
  {
    wn: 15, phase: "BUILD", label: "Aufbau W2", dates: "13.–19. Juli 2026", km: 83,
    focus: "Schwellentempo + 30km mit starkem MP-Block",
    s: [
      s("w15-mo", "Mo", "13. Jul", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w15-di", "Di", "14. Jul", "tempo",    "Tempodauerlauf 18 km",         18, "2km WU · 14km @ 3:58/km · 2km CD.",                                              "3:58/km"),
      s("w15-mi", "Mi", "15. Jul", "easy",     "Easy Run",                     14, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w15-do", "Do", "16. Jul", "bike",     "Rennrad 90 min",               0,  "Moderate Radeinheit – aktive Erholung.",                                          "locker-moderat"),
      s("w15-fr", "Fr", "17. Jul", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w15-sa", "Sa", "18. Jul", "easy",     "Easy Run",                     14, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w15-so", "So", "19. Jul", "long",     "Long Run 30 km mit MP-Block 💥", 30, "18km easy → letzte 12km @ 4:05/km. Schlüsseleinheit!",                         "5:10 → letzte 12: 4:05/km"),
    ],
  },
  {
    wn: 16, phase: "BUILD", label: "Recovery-Woche 3 ⬇️", dates: "20.–26. Juli 2026", km: 63,
    focus: "⬇️ Entlastungswoche vor dem Peak – gut erholen!",
    s: [
      s("w16-mo", "Mo", "20. Jul", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w16-di", "Di", "21. Jul", "interval", "Kurze Intervalle: 6×800m",     12, "2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Schnell & frisch!",              "3:45/km"),
      s("w16-mi", "Mi", "22. Jul", "easy",     "Easy Run",                     12, "Lockerer Dauerlauf.",                                                             "5:15–5:25/km"),
      s("w16-do", "Do", "23. Jul", "strength", "Krafttraining (Gym)",           0,  "Gewichtstraining.",                                                               null),
      s("w16-fr", "Fr", "24. Jul", "bike",     "Rennrad 75 min",               0,  "Lockere Radeinheit.",                                                             "locker"),
      s("w16-sa", "Sa", "25. Jul", "easy",     "Easy Run",                     12, "Lockerer Lauf.",                                                                  "5:15–5:25/km"),
      s("w16-so", "So", "26. Jul", "long",     "Long Run 24 km",               24, "Kürzerer Long Run – locker & erholt.",                                            "5:15–5:25/km"),
    ],
  },
  {
    wn: 17, phase: "BUILD", label: "Aufbau W4", dates: "27. Jul – 2. Aug 2026", km: 86,
    focus: "Doppelte Qualität: 3×5000m + Schwelle + riesiger Long Run",
    s: [
      s("w17-mo", "Mo", "27. Jul", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w17-di", "Di", "28. Jul", "interval", "Intervall: 3×5000m 🔥",        18, "2km WU · 3×5000m @ 3:58/km (3min Pause) · 2km CD. Härteste Intervalleinheit!",   "3:58/km"),
      s("w17-mi", "Mi", "29. Jul", "easy",     "Easy Run",                     14, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w17-do", "Do", "30. Jul", "bike",     "Rennrad 90 min",               0,  "Moderate Radeinheit.",                                                            "locker-moderat"),
      s("w17-fr", "Fr", "31. Jul", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w17-sa", "Sa", "1. Aug",  "tempo",    "Tempodauerlauf 18 km",         18, "2km WU · 14km @ 3:58/km · 2km CD.",                                              "3:58/km"),
      s("w17-so", "So", "2. Aug",  "long",     "Long Run 32 km mit MP-Block 🏔️", 32, "20km easy → letzte 12km @ 4:05/km. Eine der wichtigsten Einheiten!",           "5:10 → letzte 12: 4:05/km"),
    ],
  },
  {
    wn: 18, phase: "BUILD", label: "🔥 PEAK-WOCHE", dates: "3.–9. August 2026", km: 90,
    focus: "🔥 PEAK-WOCHE – Höchste Kilometerzahl der Saison! Du schaffst das!",
    s: [
      s("w18-mo", "Mo", "3. Aug",  "rest",     "Ruhetag",                      0,  "Regeneration nach Sa/So. Sehr wichtig!",                                          null),
      s("w18-di", "Di", "4. Aug",  "tempo",    "Tempodauerlauf 20 km 🔥",      20, "2km WU · 16km @ 3:58/km · 2km CD. Langer, harter Schwellenlauf!",                "3:58/km"),
      s("w18-mi", "Mi", "5. Aug",  "easy",     "Easy Run",                     15, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w18-do", "Do", "6. Aug",  "easy",     "Easy Run",                     14, "Lockere Erholung.",                                                               "5:15–5:25/km"),
      s("w18-fr", "Fr", "7. Aug",  "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w18-sa", "Sa", "8. Aug",  "easy",     "Easy Run",                     13, "Locker – Beine für den großen Sonntag schonen.",                                  "5:15–5:25/km"),
      s("w18-so", "So", "9. Aug",  "long",     "Long Run 34 km 🏔️ LÄNGSTER LAUF", 34, "LÄNGSTER LAUF DER SAISON! 22km easy → letzte 12km @ 4:05/km. EPIC!",        "5:10 → letzte 12: 4:05/km"),
    ],
  },
  // ── SPEC ───────────────────────────────────────────────────────────────────
  {
    wn: 19, phase: "SPEC", label: "Aufbau W6 – Pre-HM", dates: "10.–16. August 2026", km: 72,
    focus: "Etwas ruhiger – Kräfte für Kölner HM am 30. Aug sammeln",
    s: [
      s("w19-mo", "Mo", "10. Aug", "rest",     "Ruhetag",                      0,  "Regeneration nach Peak-Woche – sehr wichtig!",                                   null),
      s("w19-di", "Di", "11. Aug", "interval", "Intervall: 6×1200m",           14, "2km WU · 6×1200m @ 3:55/km (90s Pause) · 2km CD.",                               "3:55/km"),
      s("w19-mi", "Mi", "12. Aug", "easy",     "Easy Run",                     13, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w19-do", "Do", "13. Aug", "bike",     "Rennrad 75 min",               0,  "Lockere Radeinheit.",                                                             "locker"),
      s("w19-fr", "Fr", "14. Aug", "strength", "Krafttraining (Gym)",           0,  "Ganzkörper.",                                                                     null),
      s("w19-sa", "Sa", "15. Aug", "easy",     "Easy Run",                     13, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w19-so", "So", "16. Aug", "long",     "Long Run 28 km easy",          28, "Easy – Erholung von Peak, aber Kilometer halten.",                                "5:15–5:25/km"),
    ],
  },
  {
    wn: 20, phase: "SPEC", label: "Pre-HM Woche", dates: "17.–23. August 2026", km: 60,
    focus: "Kräfte sammeln für Kölner HM – leichte Woche mit Qualität",
    s: [
      s("w20-mo", "Mo", "17. Aug", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w20-di", "Di", "18. Aug", "interval", "Intervall: 6×800m",            12, "2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Beine scharf halten!",           "3:45/km"),
      s("w20-mi", "Mi", "19. Aug", "easy",     "Easy Run",                     12, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w20-do", "Do", "20. Aug", "easy",     "Easy Run",                     10, "Kurz und locker.",                                                                "5:15–5:25/km"),
      s("w20-fr", "Fr", "21. Aug", "strength", "Krafttraining (Gym)",           0,  "Moderate Intensität.",                                                            null),
      s("w20-sa", "Sa", "22. Aug", "easy",     "Easy Run",                     8,  "Kurzer lockerer Lauf.",                                                           "5:15–5:30/km"),
      s("w20-so", "So", "23. Aug", "long",     "Long Run 22 km easy",          22, "Easy – letzter großer Lauf vor dem HM.",                                          "5:20–5:30/km"),
    ],
  },
  {
    wn: 21, phase: "SPEC", label: "🏁 KÖLNER HALBMARATHON", dates: "24.–30. August 2026", km: 42,
    focus: "🏁 MEILENSTEIN: Kölner Halbmarathon! Ziel: ~1:23–1:25 (3:56–3:59/km)",
    s: [
      s("w21-mo", "Mo", "24. Aug", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w21-di", "Di", "25. Aug", "easy",     "Easy + 6× Strides",            8,  "Locker einlaufen, Beine aktivieren.",                                             "5:20–5:30/km + Strides"),
      s("w21-mi", "Mi", "26. Aug", "easy",     "Easy Run",                     8,  "Kurzer lockerer Lauf.",                                                           "5:20–5:30/km"),
      s("w21-do", "Do", "27. Aug", "strength", "Krafttraining – sehr leicht",  0,  "Leichtes Krafttraining! Keinen Muskelkater riskieren!",                           null),
      s("w21-fr", "Fr", "28. Aug", "easy",     "Easy Run",                     6,  "Kurz & locker. Mentale Vorbereitung.",                                            "5:20–5:30/km"),
      s("w21-sa", "Sa", "29. Aug", "easy",     "Easy + 4× Strides (shakeout)", 5,  "5km easy + 4×Strides. Früh ins Bett!",                                           "locker + Strides"),
      s("w21-so", "So", "30. Aug", "race",     "🏁 KÖLNER HALBMARATHON",       21.1, "MEILENSTEIN! Zeigt dir, wie gut die Prep läuft. Rennday-Feeling sammeln!",      "3:56–3:59/km (Ziel 1:23–1:25)"),
    ],
  },
  {
    wn: 22, phase: "SPEC", label: "Recovery Post-HM", dates: "31. Aug – 6. Sep 2026", km: 62,
    focus: "Erholen & zurück in den Rhythmus – letzte richtige Trainingsphase",
    s: [
      s("w22-mo", "Mo", "31. Aug", "easy",     "Regenerations-Lauf",           8,  "Sehr locker nach dem HM. Kein Druck.",                                            "5:30–5:50/km"),
      s("w22-di", "Di", "1. Sep",  "easy",     "Easy Run",                     10, "Lockerer Dauerlauf.",                                                             "5:15–5:25/km"),
      s("w22-mi", "Mi", "2. Sep",  "interval", "Intervall: 5×1000m",           13, "2km WU · 5×1000m @ 4:00/km (90s Pause) · 2km CD. Scharf bleiben!",               "4:00/km"),
      s("w22-do", "Do", "3. Sep",  "easy",     "Easy Run",                     12, "Lockere Erholung.",                                                               "5:10–5:20/km"),
      s("w22-fr", "Fr", "4. Sep",  "strength", "Krafttraining (Gym)",           0,  "Letztes intensiveres Krafttraining.",                                             null),
      s("w22-sa", "Sa", "5. Sep",  "easy",     "Easy Run",                     12, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w22-so", "So", "6. Sep",  "long",     "Long Run 24 km",               24, "Letzter richtiger Long Run vor dem Taper. Easy & selbstbewusst!",                 "5:10–5:20/km"),
    ],
  },
  // ── TAPER ──────────────────────────────────────────────────────────────────
  {
    wn: 23, phase: "TAPER", label: "Taper W1 ⬇️", dates: "7.–13. September 2026", km: 55,
    focus: "⬇️ Taper beginnt – Volumen runter, Intensität BLEIBT!",
    s: [
      s("w23-mo", "Mo", "7. Sep",  "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w23-di", "Di", "8. Sep",  "interval", "Intervall: 5×1000m",           13, "2km WU · 5×1000m @ 3:55/km (90s Pause) · 2km CD.",                               "3:55/km"),
      s("w23-mi", "Mi", "9. Sep",  "easy",     "Easy Run",                     12, "Lockerer Dauerlauf.",                                                             "5:10–5:20/km"),
      s("w23-do", "Do", "10. Sep", "bike",     "Rennrad 60 min",               0,  "Lockere Radeinheit.",                                                             "locker"),
      s("w23-fr", "Fr", "11. Sep", "strength", "Krafttraining – leicht",       0,  "Leichtes Gewichtstraining.",                                                      null),
      s("w23-sa", "Sa", "12. Sep", "easy",     "Easy + Strides",               10, "10km easy + 6×80m Strides.",                                                     "5:15–5:25/km"),
      s("w23-so", "So", "13. Sep", "long",     "Long Run 24 km mit MP",        24, "16km easy → letzte 8km @ 4:01/km (MARATHON PACE!). Letzter harter Long Run.",    "5:15 → letzte 8: 4:01/km"),
    ],
  },
  {
    wn: 24, phase: "TAPER", label: "Taper W2 ⬇️⬇️", dates: "14.–20. September 2026", km: 42,
    focus: "⬇️⬇️ Volumen stark reduziert – die Form kommt jetzt!",
    s: [
      s("w24-mo", "Mo", "14. Sep", "rest",     "Ruhetag",                      0,  "Regeneration.",                                                                   null),
      s("w24-di", "Di", "15. Sep", "interval", "Intervall: 4×1000m",           10, "2km WU · 4×1000m @ 3:55/km (90s Pause) · 2km CD.",                               "3:55/km"),
      s("w24-mi", "Mi", "16. Sep", "easy",     "Easy Run",                     10, "Lockerer Lauf.",                                                                  "5:10–5:20/km"),
      s("w24-do", "Do", "17. Sep", "easy",     "Easy Run",                     8,  "Kurz und locker.",                                                                "5:15–5:25/km"),
      s("w24-fr", "Fr", "18. Sep", "strength", "Krafttraining – sehr leicht",  0,  "Sehr leicht. Kein Muskelkater!",                                                  null),
      s("w24-sa", "Sa", "19. Sep", "easy",     "Easy + 6× Strides",            8,  "8km easy + 6×80m Strides. Beine aktivieren.",                                    "5:15–5:25/km"),
      s("w24-so", "So", "20. Sep", "long",     "Long Run 18 km mit MP",        18, "12km easy → letzte 6km @ 4:01/km. Letzte längere Einheit!",                       "5:15 → letzte 6: 4:01/km"),
    ],
  },
  {
    wn: 25, phase: "TAPER", label: "🏆 RACE WEEK – WARSCHAU", dates: "21.–27. September 2026", km: 28,
    focus: "🏆 RACE WEEK – Du hast alles gegeben. Jetzt erntest du! SUB 2:50!",
    s: [
      s("w25-mo", "Mo", "21. Sep", "rest",     "Ruhetag",                      0,  "Füße hochlegen, gut essen & trinken, relaxen.",                                   null),
      s("w25-di", "Di", "22. Sep", "easy",     "Easy + Strides",               8,  "8km easy + 4×80m Strides. Beine aktivieren.",                                    "5:15–5:25/km"),
      s("w25-mi", "Mi", "23. Sep", "easy",     "Easy Run",                     6,  "6km sehr locker. Nicht viel denken.",                                             "5:20–5:30/km"),
      s("w25-do", "Do", "24. Sep", "easy",     "Easy + 3× MP-Strides",         5,  "5km easy + 3×100m @ MP. Kurz reinspüren.",                                       "5:20 + 3×MP-Strides"),
      s("w25-fr", "Fr", "25. Sep", "rest",     "Ruhetag / Anreise Warschau",   0,  "Anreise, Expo, Startnummer. Beine schonen! Carbo-Loading!",                       null),
      s("w25-sa", "Sa", "26. Sep", "easy",     "Shakeout: 4 km + Strides",     4,  "4km sehr locker + 4×80m Strides. Beine aufwecken!",                              "locker + Strides"),
      s("w25-so", "So", "27. Sep", "race",     "🏆 WARSCHAU MARATHON – SUB 2:50!", 42.2, "START 🔥 Erste Hälfte: 4:04–4:05/km · Zweite Hälfte: aufdrehen! Du hast es dir verdient!", "⌀ 4:01/km = 2:49:50"),
    ],
  },
];

// ─── Date Helpers ─────────────────────────────────────────────────────────────

/** Week 1 starts on Monday, 6 April 2026 (UTC noon). */
const WEEK1_MONDAY_UTC = new Date("2026-04-06T12:00:00Z");

const DAY_OFFSETS: Record<string, number> = {
  mo: 0, di: 1, mi: 2, do: 3, fr: 4, sa: 5, so: 6,
};

/** Returns a full ISO datetime string (UTC noon) for the given session ID. */
function dateIsoForSession(sessionId: string): string {
  const m = sessionId.match(/^w(\d+)-([a-z]+)$/);
  if (!m) throw new Error(`Invalid session ID format: ${sessionId}`);
  const weekNum = parseInt(m[1], 10);
  const dayOffset = DAY_OFFSETS[m[2]];
  if (dayOffset === undefined) throw new Error(`Unknown day abbreviation: ${m[2]}`);
  const msOffset = ((weekNum - 1) * 7 + dayOffset) * 86_400_000;
  return new Date(WEEK1_MONDAY_UTC.getTime() + msOffset).toISOString();
}

/** Extract YYYY-MM-DD from any ISO string, using UTC. */
function ymd(iso: string): string {
  if (iso.length >= 10 && !iso.includes("T")) return iso.slice(0, 10);
  return new Date(iso).toISOString().slice(0, 10);
}

/** Add `delta` days to a YYYY-MM-DD string. */
function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ─── Sport / Intensity Mapping ────────────────────────────────────────────────

function sessionSport(type: string): "run" | "bike" | "rest" {
  if (type === "rest") return "rest";
  if (type === "bike") return "bike";
  return "run";
}

function sessionIntensity(type: string): "low" | "medium" | "high" | undefined {
  if (type === "rest") return undefined;
  if (type === "easy" || type === "long" || type === "bike" || type === "strength") return "low";
  if (type === "tempo") return "medium";
  if (type === "interval" || type === "race") return "high";
  return "low";
}

// ─── Build TrainingPlanV2 ─────────────────────────────────────────────────────

function buildTrainingPlanV2(): TrainingPlanV2 {
  const workouts: WorkoutV2[] = [];
  const weeks: WeekV2[] = [];

  for (const planWeek of PLAN) {
    const weekWorkouts: WorkoutV2[] = [];
    let totalKm = 0;

    for (const ss of planWeek.s) {
      const dateIso = dateIsoForSession(ss.id);
      const sport = sessionSport(ss.type);
      const intensity = sessionIntensity(ss.type);
      const km = typeof ss.km === "number" ? ss.km : 0;

      const workout: WorkoutV2 = {
        id: ss.id,
        dateIso,
        sport,
        sessionType: ss.type,
        title: ss.title,
        km,
        desc: ss.desc ?? null,
        pace: ss.pace ?? null,
        ...(intensity != null ? { intensity } : {}),
      };

      workouts.push(workout);
      weekWorkouts.push(workout);
      if (sport !== "rest") {
        totalKm += km;
      }
    }

    // Week start = Monday of this week (YYYY-MM-DD)
    const weekStartMs = WEEK1_MONDAY_UTC.getTime() + (planWeek.wn - 1) * 7 * 86_400_000;
    const startIso = new Date(weekStartMs).toISOString().slice(0, 10);

    weeks.push({
      startIso,
      totalKm,
      workouts: weekWorkouts,
      meta: {
        wn: planWeek.wn,
        phase: planWeek.phase,
        label: planWeek.label,
        dates: planWeek.dates,
        focus: planWeek.focus,
        isRecoveryWeek: planWeek.label.includes("Recovery") || planWeek.label.includes("⬇️"),
      },
    });
  }

  return { version: 2, workouts, weeks };
}

// ─── DB Types ─────────────────────────────────────────────────────────────────

type DbSessionLog = {
  id: string;
  user_id: string;
  session_id: string;
  completed: boolean | null;
  skipped: boolean | null;
  feeling: number | null;
  actual_distance_meters: number | null;
  notes: string | null;
  assigned_run: Record<string, unknown> | null;
  run_evaluation: unknown | null;
  logged_at: string | null;
  created_at: string;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  MyRace – Original Plan Restore Script");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  User:  ${USER_ID}`);
  console.log(`  Plan:  ${PLAN_NAME}`);
  console.log(`  Start: 2026-04-06  →  Race: 2026-09-27`);
  console.log("");

  // ── Step 1: Load all session_logs ─────────────────────────────────────────
  console.log("[1/6] Loading all session_logs from Supabase...");

  const { data: rawLogs, error: logsError } = await supabase
    .from("session_logs")
    .select("*")
    .eq("user_id", USER_ID)
    .order("logged_at", { ascending: true });

  if (logsError) throw new Error(`session_logs load failed: ${logsError.message}`);

  const allLogs: DbSessionLog[] = (rawLogs ?? []) as DbSessionLog[];
  console.log(`    → ${allLogs.length} session_logs loaded`);

  // Filter out coach-gen-* entries and logs without a startDate
  const healthLogs = allLogs.filter(
    (log) => !log.id?.includes("coach-gen") && log.assigned_run?.startDate != null,
  );
  console.log(`    → ${healthLogs.length} health logs after filtering coach-gen entries`);

  // ── Step 2: Build date → logs map ─────────────────────────────────────────
  console.log("\n[2/6] Building date → log index...");

  // Only logs with an Apple Health startDate are usable for matching
  const logsByDate = new Map<string, DbSessionLog[]>();

  for (const log of healthLogs) {
    const rawDate = log.assigned_run?.startDate;
    if (!rawDate) continue;
    // Slice to YYYY-MM-DD only – avoids timezone shifts from new Date() parsing
    const dateKey = (rawDate as string).slice(0, 10);
    if (!logsByDate.has(dateKey)) logsByDate.set(dateKey, []);
    logsByDate.get(dateKey)!.push(log);
  }

  const datesWithLogs = Array.from(logsByDate.keys()).sort();
  console.log(`    → ${datesWithLogs.length} distinct workout dates found`);
  if (datesWithLogs.length > 0) {
    console.log(`      earliest: ${datesWithLogs[0]}  latest: ${datesWithLogs[datesWithLogs.length - 1]}`);
  }

  // ── Step 3: Match plan sessions to Apple Health logs ──────────────────────
  console.log("\n[3/6] Matching plan sessions to Apple Health logs...");

  type MatchResult = {
    session: PlanSession;
    matchedLog: DbSessionLog;
  };

  const matched: MatchResult[] = [];
  const usedLogIds = new Set<string>();
  const unmatched: PlanSession[] = [];

  // Helper: find best unused log for a given set of candidate dates
  function findLog(
    candidateDates: string[],
    isBike: boolean,
    sessionKm: number,
  ): DbSessionLog | null {
    for (const d of candidateDates) {
      const candidates = logsByDate.get(d);
      if (!candidates) continue;

      for (const log of candidates) {
        if (usedLogIds.has(log.id)) continue;

        // Bike type check: if ar.workoutType contains cycling keywords, prefer it
        // Since ar_workout_type is often null, we don't strictly require it
        const wt = typeof log.assigned_run?.workoutType === "string"
          ? log.assigned_run.workoutType.toLowerCase()
          : "";
        const isBikeLog = wt.includes("cycl") || wt.includes("bike") || wt.includes("biking");

        if (isBike && wt !== "" && !isBikeLog) continue; // has type info but it's not a bike → skip
        if (!isBike && isBikeLog) continue; // explicitly a bike log but we need a run → skip

        // KM proximity check (only when distance data is available)
        const logDistKm = log.actual_distance_meters != null
          ? log.actual_distance_meters / 1000
          : typeof log.assigned_run?.distanceMeters === "number"
            ? (log.assigned_run.distanceMeters as number) / 1000
            : null;

        if (logDistKm != null && sessionKm > 0) {
          if (Math.abs(logDistKm - sessionKm) > 3) continue;
        }

        return log;
      }
    }
    return null;
  }

  for (const planWeek of PLAN) {
    for (const ss of planWeek.s) {
      // Skip rest sessions (no Apple Health data expected)
      if (ss.type === "rest") continue;

      // Skip strength sessions (no Apple Health match possible)
      if (ss.type === "strength") continue;

      const isBike = ss.type === "bike";
      const sessionDate = ymd(dateIsoForSession(ss.id));

      // Build candidate date list: exact first, then ±1, then ±2
      let candidateDates: string[];
      if (isBike) {
        // Bike: check ±2 day window all at once (date precision less important)
        candidateDates = [
          sessionDate,
          addDays(sessionDate, -1), addDays(sessionDate, 1),
          addDays(sessionDate, -2), addDays(sessionDate, 2),
        ];
      } else {
        // Run: exact date first, then ±1, then ±2
        candidateDates = [
          sessionDate,
          addDays(sessionDate, -1), addDays(sessionDate, 1),
          addDays(sessionDate, -2), addDays(sessionDate, 2),
        ];
      }

      const log = findLog(candidateDates, isBike, ss.km);

      if (log) {
        usedLogIds.add(log.id);
        matched.push({ session: ss, matchedLog: log });
      } else {
        unmatched.push(ss);
      }
    }
  }

  console.log(`    → ${matched.length} sessions matched to Apple Health logs`);
  console.log(`    → ${unmatched.length} sessions with no Apple Health match (will be unmarked)`);

  // ── Step 4: Build TrainingPlanV2 ──────────────────────────────────────────
  console.log("\n[4/6] Building TrainingPlanV2...");

  const plan = buildTrainingPlanV2();
  const nonRestSessions = PLAN.flatMap((w) => w.s).filter((ss) => ss.type !== "rest");
  console.log(`    → ${plan.workouts.length} workouts, ${plan.weeks.length} weeks`);
  console.log(`    → ${nonRestSessions.length} non-rest sessions total`);

  // Validate the plan structure (mirrors validateTrainingPlanV2Integrity)
  {
    const ids = new Set<string>();
    let totalKmMismatch = false;
    for (const w of plan.workouts) {
      if (ids.has(w.id)) throw new Error(`Duplicate workout ID: ${w.id}`);
      ids.add(w.id);
    }
    for (const week of plan.weeks) {
      let sumKm = 0;
      for (const w of week.workouts) {
        if (w.sport !== "rest") sumKm += w.km;
      }
      if (Math.abs(week.totalKm - sumKm) > 0.0001) {
        console.warn(`    ⚠ Week ${week.startIso} totalKm mismatch: ${week.totalKm} vs computed ${sumKm}`);
        totalKmMismatch = true;
      }
    }
    if (!totalKmMismatch) {
      console.log("    ✓ Plan structure validation passed");
    }
  }

  // ── Step 5: Delete existing plans and session_logs ────────────────────────
  console.log("\n[5/6] Deleting all existing plans and session_logs...");

  const { error: deleteLogsError } = await supabase
    .from("session_logs")
    .delete()
    .eq("user_id", USER_ID);

  if (deleteLogsError) throw new Error(`Delete session_logs failed: ${deleteLogsError.message}`);
  console.log(`    → All session_logs deleted`);

  const { error: deletePlansError } = await supabase
    .from("training_plans")
    .delete()
    .eq("user_id", USER_ID);

  if (deletePlansError) throw new Error(`Delete training_plans failed: ${deletePlansError.message}`);
  console.log(`    → All training_plans deleted`);

  // ── Step 6: Insert original plan ──────────────────────────────────────────
  console.log("\n[6/6] Writing original plan and matched session_logs...");

  const { error: insertPlanError } = await supabase.from("training_plans").insert({
    user_id: USER_ID,
    plan_slot: 1,
    plan_name: PLAN_NAME,
    is_active: true,
    schema_version: 2,
    data: plan,
  });

  if (insertPlanError) throw new Error(`Insert training_plan failed: ${insertPlanError.message}`);
  console.log(`    → Plan "${PLAN_NAME}" inserted (slot 1, active)`);

  // Write session_logs for each matched session
  let upsertOk = 0;
  let upsertFail = 0;

  for (const { session, matchedLog } of matched) {
    const { error: upsertError } = await supabase.from("session_logs").upsert(
      {
        user_id: USER_ID,
        session_id: session.id,
        completed: true,
        skipped: null,
        feeling: matchedLog.feeling,
        actual_distance_meters: matchedLog.actual_distance_meters,
        notes: matchedLog.notes,
        assigned_run: matchedLog.assigned_run ?? null,
        run_evaluation: matchedLog.run_evaluation ?? null,
        logged_at: matchedLog.logged_at ?? matchedLog.created_at,
      },
      { onConflict: "user_id,session_id" },
    );

    if (upsertError) {
      console.warn(`    ⚠ Upsert failed for ${session.id}: ${upsertError.message}`);
      upsertFail++;
    } else {
      upsertOk++;
    }
  }

  console.log(`    → ${upsertOk} session_logs written${upsertFail > 0 ? `, ${upsertFail} failed` : ""}`);

  // ── Verification ──────────────────────────────────────────────────────────
  const totalSessions = nonRestSessions.length;
  const runnableSessions = nonRestSessions.filter((ss) => ss.type !== "strength").length;
  const doneSessions = matched.length;
  const progress = runnableSessions > 0 ? (doneSessions / runnableSessions) * 100 : 0;

  console.log("\n══════════════════ Verification ══════════════════");
  console.log(`Total sessions (non-rest):     ${totalSessions}`);
  console.log(`Matchable sessions (non-strength): ${runnableSessions}`);
  console.log(`Matched (done: true):          ${doneSessions}`);
  console.log(`Unmatched (done: false):       ${unmatched.length}`);
  console.log(`Progress (of matchable):       ${progress.toFixed(1)}%`);

  console.log("\n✅ Matched sessions:");
  for (const { session, matchedLog } of matched) {
    const arDate = matchedLog.assigned_run?.startDate
      ? ymd(matchedLog.assigned_run.startDate as string)
      : "?";
    const planDate = ymd(dateIsoForSession(session.id));
    const diff = arDate !== planDate ? ` (actual: ${arDate})` : "";
    console.log(`   ${session.id.padEnd(8)} ${planDate}${diff}  ${session.km > 0 ? `${session.km}km` : "     "}  ${session.title}`);
  }

  if (unmatched.length > 0) {
    console.log("\n❌ Unmatched sessions (no Apple Health data found):");
    for (const ss of unmatched) {
      const planDate = ymd(dateIsoForSession(ss.id));
      console.log(`   ${ss.id.padEnd(8)} ${planDate}  ${ss.km > 0 ? `${ss.km}km` : "     "}  ${ss.title}`);
    }
  }

  console.log("\n❌ NICHT GEMATCHT (manuell prüfen):");
  unmatched.forEach((s) => {
    console.log(`  ${s.id} | ${s.date} | ${s.type} | ${s.km} km`);
  });

  console.log("\n✓ Recovery complete. You can now delete this script.");
}

main().catch((err: unknown) => {
  console.error("\n✗ Script failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
