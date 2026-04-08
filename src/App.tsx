// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from "react";
import BackupControls from "./BackupControls";
import { Capacitor } from "@capacitor/core";
import {
  getConsistencyStats,
  getPredictionReadiness,
  getShareSummary,
  getTodayNextSession,
  isSessionLogDone,
  parseSessionDateLabel,
  parseTargetTimeToSeconds,
  safeParseJSON,
} from "./appSmartFeatures";
import MarathonPredictionCard from "./components/MarathonPredictionCard";
import RaceCalculator from "./components/RaceCalculator";
import SurfaceCard from "./components/SurfaceCard";
import WeeklyAnalysisCard from "./components/WeeklyAnalysisCard";
import AiCoachPanel from "./components/ai/AiCoachPanel";
import DailyCoachDecisionCard from "./components/ai/DailyCoachDecisionCard";
import { getDailyCoachDecision } from "./lib/ai/getDailyCoachDecision";
import { fetchAiDailyAdvice } from "./lib/ai/fetchAiDailyAdvice";
import { getCoachFeedback } from "./coachFeedback";
import { isHomePreStart } from "./homeStatus";
import { getMarathonPrediction } from "./marathonPrediction";
import { analyzeWeek } from "./weeklyAnalysis";
import { readRemoteStorage, writeRemoteStorage } from "./storage";
import { applyPlanPatches } from "./lib/ai/actions";
import { getAiContext } from "./lib/ai/getAiContext";
import {
  HEALTH_RUNS_STORAGE_KEY,
  averageHeartRateBpmInWorkoutWindow,
  loadHealthRunsFromStorage,
  mergeHealthRuns,
  workoutToStored,
} from "./healthRuns";
import { applyAppleHealthTrainingSync } from "./trainingIntelligence/applyAppleHealthSync";
import {
  buildTrainingLoadFallbackRecommendation,
  getTrainingLoadRecommendation,
} from "./trainingLoadRecommendation";

const APPLE_HEALTH_CONNECTED_KEY = "marathonAppleHealthConnected";
/** iOS HealthKit read types (native plugin accepts strings; "workouts" is special-cased in Swift). */
const APPLE_HEALTH_READ_TYPES = ["workouts", "distance", "heartRate", "calories"];

function localCalendarYmd() {
  const now = new Date();
  const ts = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")}`;
}

/**
 * HealthKit query range: local calendar (today − 7 days) at 00:00:00 through now (UTC instants via toISOString).
 * iOS plugin defaults to last 24h if startDate is missing or fails to parse — always send valid ISO bounds.
 */
function appleHealthWorkoutQueryRange7DaysLocal() {
  const endNow = new Date();
  const startLocalMidnight = new Date(endNow.getFullYear(), endNow.getMonth(), endNow.getDate());
  startLocalMidnight.setDate(startLocalMidnight.getDate() - 7);
  startLocalMidnight.setHours(0, 0, 0, 0);
  const endForNative = new Date(endNow.getTime() + 2000);
  return {
    startIso: startLocalMidnight.toISOString(),
    endIsoLogical: endNow.toISOString(),
    endIsoForQuery: endForNative.toISOString(),
  };
}

function logHealthKit(message, ...rest) {
  console.log("[HealthKit]", message, ...rest);
}

const PI = {
  MINI:  { label:"Mini-Prep",         emoji:"🔄", col:"#6366f1", bg:"rgba(99,102,241,0.12)" },
  BASE:  { label:"Basisaufbau",        emoji:"🌱", col:"#10b981", bg:"rgba(16,185,129,0.12)" },
  DEV:   { label:"Entwicklung",        emoji:"📈", col:"#3b82f6", bg:"rgba(59,130,246,0.12)" },
  BUILD: { label:"Aufbau & Peak",      emoji:"🔥", col:"#ef4444", bg:"rgba(239,68,68,0.12)" },
  SPEC:  { label:"Wettkampfspez.",     emoji:"🎯", col:"#f59e0b", bg:"rgba(245,158,11,0.12)" },
  TAPER: { label:"Taper",             emoji:"⚡", col:"#a855f7", bg:"rgba(168,85,247,0.12)" },
};
const DEFAULT_VIEW = "home";
const TI = {
  rest:     { label:"Ruhe",         emoji:"😴", col:"#4b5563" },
  easy:     { label:"Easy Run",     emoji:"🟢", col:"#10b981" },
  interval: { label:"Intervall",    emoji:"⚡", col:"#ef4444" },
  tempo:    { label:"Tempo",        emoji:"🔶", col:"#f59e0b" },
  long:     { label:"Long Run",     emoji:"🔵", col:"#3b82f6" },
  strength: { label:"Krafttraining",emoji:"💪", col:"#8b5cf6" },
  bike:     { label:"Rennrad",      emoji:"🚴", col:"#06b6d4" },
  race:     { label:"Rennen",       emoji:"🏁", col:"#fbbf24" },
};

const s=(id,day,date,type,title,km,desc,pace)=>({id,day,date,type,title,km,desc,pace});

const PLAN=[
  // ── MINI-PREP ──────────────────────────────────
  {wn:1,phase:"MINI",label:"Mini-Prep Woche 1",dates:"6.–12. April 2026",km:35,
   focus:"Sanfter Wiedereinstieg nach Weisheitszahn-OP – kein Druck!",
   s:[
    s("w01-mo","Mo","6. Apr","rest","Ruhetag",0,"Vollständige Erholung. Spazieren ok.",null),
    s("w01-di","Di","7. Apr","easy","Easy Run",6,"Sehr locker. Körper testen nach OP. Puls <140.","5:30–5:50/km"),
    s("w01-mi","Mi","8. Apr","easy","Easy Run",8,"Lockeres Dauerlauftempo. Kein Stress.","5:20–5:40/km"),
    s("w01-do","Do","9. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper mit Gewichten – locker nach OP-Pause.",null),
    s("w01-fr","Fr","10. Apr","bike","Rennrad locker",0,"45–60 min lockeres Radfahren ODER Easy 7 km.","sehr locker"),
    s("w01-sa","Sa","11. Apr","easy","Easy Run",10,"Lockerer Dauerlauf.","5:20–5:30/km"),
    s("w01-so","So","12. Apr","long","Langer Lauf",14,"Erster Long Run – sehr gemütlich, kein Tempo!","5:30–5:50/km"),
  ]},
  {wn:2,phase:"MINI",label:"Mini-Prep Woche 2",dates:"13.–19. April 2026",km:45,
   focus:"Basis aufbauen + erste Strides für Speed-Impuls",
   s:[
    s("w02-mo","Mo","13. Apr","easy","Easy Run",6,"Lockerer Recovery-Lauf.","5:30–5:50/km"),
    s("w02-di","Di","14. Apr","easy","Easy + 6× Strides",8,"8 km easy, dann 6×80m Strides (locker-schnell, 60s Pause).","5:20/km + Strides"),
    s("w02-mi","Mi","15. Apr","easy","Easy Run",10,"Lockerer Dauerlauf. Fundament legen.","5:15–5:30/km"),
    s("w02-do","Do","16. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper – etwas mehr Intensität als Woche 1.",null),
    s("w02-fr","Fr","17. Apr","bike","Rennrad 60 min",0,"Aktive Regeneration auf dem Rad.","locker ~65% HFmax"),
    s("w02-sa","Sa","18. Apr","easy","Easy Run",12,"Progressiv: erst locker, letzte 2 km etwas flotter.","5:15–5:30/km"),
    s("w02-so","So","19. Apr","long","Langer Lauf → Vorbereitung done!",17,"🚀 Letzter Lauf der Mini-Prep. Easy & genussvoll!","5:20–5:40/km"),
  ]},
  // ── BASE ───────────────────────────────────────
  {wn:3,phase:"BASE",label:"Basisaufbau W1",dates:"20.–26. April 2026",km:50,
   focus:"Erste Qualitätseinheit – aerobes System stärken (pyramidal ~80/15/5)",
   s:[
    s("w03-mo","Mo","20. Apr","rest","Ruhetag – START HAUPTPREP",0,"Erholung. Ab heute beginnt die echte Vorbereitung!",null),
    s("w03-di","Di","21. Apr","easy","Easy Run",10,"Lockerer Dauerlauf als Unterbau für Wochenmitte.","5:10–5:25/km"),
    s("w03-mi","Mi","22. Apr","interval","Intervall: 6×1000m",13,"2km WU · 6×1000m @ 4:20/km (90s Trottpause) · 2km CD.","4:20/km"),
    s("w03-do","Do","23. Apr","easy","Easy Run",10,"Lockere Regeneration nach Intervallen.","5:15–5:30/km"),
    s("w03-fr","Fr","24. Apr","strength","Krafttraining (Gym)",0,"Ganzkörper mit Gewichten.",null),
    s("w03-sa","Sa","25. Apr","bike","Rennrad 60 min",0,"Aktive Erholung auf dem Rad.","locker"),
    s("w03-so","So","26. Apr","long","Long Run 22 km",22,"Gleichmäßig aerob. Nicht zu schnell starten!","5:15–5:25/km"),
  ]},
  {wn:4,phase:"BASE",label:"Basisaufbau W2",dates:"27. Apr – 3. Mai 2026",km:55,
   focus:"Schwellenarbeit + erstes MP-Feeling im Long Run",
   s:[
    s("w04-mo","Mo","27. Apr","rest","Ruhetag",0,"Regeneration.",null),
    s("w04-di","Di","28. Apr","easy","Easy + Strides",10,"10 km easy + 6×80m Strides.","5:10–5:20/km"),
    s("w04-mi","Mi","29. Apr","tempo","Tempodauerlauf 14 km",14,"2km WU · 8km @ 4:08–4:12/km (Schwelle) · 2km easy · 2km CD.","4:08–4:12/km"),
    s("w04-do","Do","30. Apr","easy","Easy Run",10,"Lockere Erholung nach Tempo.","5:15–5:30/km"),
    s("w04-fr","Fr","1. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w04-sa","Sa","2. Mai","easy","Easy Run",12,"Lockerer Lauf vor dem langen Sonntag.","5:15–5:25/km"),
    s("w04-so","So","3. Mai","long","Long Run 23 km mit MP",23,"17km easy → letzte 6km @ 4:10/km. Erstes MP-Feeling!","5:15/km → letzte 6: 4:10/km"),
  ]},
  {wn:5,phase:"BASE",label:"Basisaufbau W3",dates:"4.–10. Mai 2026",km:60,
   focus:"Längere Intervalle – VO2max-Reiz setzen",
   s:[
    s("w05-mo","Mo","4. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w05-di","Di","5. Mai","interval","Intervall: 5×2000m",16,"2km WU · 5×2000m @ 4:10/km (2min Pause) · 2km CD.","4:10/km"),
    s("w05-mi","Mi","6. Mai","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:25/km"),
    s("w05-do","Do","7. Mai","bike","Rennrad 75 min",0,"Aerobes Training ohne Laufbelastung.","locker ~65% HFmax"),
    s("w05-fr","Fr","8. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w05-sa","Sa","9. Mai","easy","Easy Run",12,"Locker. Fokus auf Lauftechnik.","5:10–5:20/km"),
    s("w05-so","So","10. Mai","long","Long Run 24 km",24,"Gleichmäßig easy – keine Tempoarbeit heute.","5:15–5:25/km"),
  ]},
  {wn:6,phase:"BASE",label:"Recovery-Woche 1 ⬇️",dates:"11.–17. Mai 2026",km:45,
   focus:"⬇️ Entlastungswoche – Adaptationen festigen, Körper erholen",
   s:[
    s("w06-mo","Mo","11. Mai","rest","Ruhetag",0,"Vollständige Erholung.",null),
    s("w06-di","Di","12. Mai","easy","Easy Run",8,"Kurzer, lockerer Lauf. Kein Druck.","5:20–5:35/km"),
    s("w06-mi","Mi","13. Mai","easy","Easy + Strides",10,"10km easy + 6×80m Strides.","5:15–5:25/km"),
    s("w06-do","Do","14. Mai","strength","Krafttraining (Gym)",0,"Moderate Intensität.",null),
    s("w06-fr","Fr","15. Mai","bike","Rennrad 60 min",0,"Lockere Radeinheit – aktive Regeneration.","sehr locker"),
    s("w06-sa","Sa","16. Mai","easy","Easy Run",10,"Kurzer, lockerer Lauf.","5:15–5:30/km"),
    s("w06-so","So","17. Mai","long","Long Run 18 km",18,"Kürzerer Long Run – leicht & entspannt.","5:20–5:30/km"),
  ]},
  {wn:7,phase:"BASE",label:"Basisaufbau W5",dates:"18.–24. Mai 2026",km:62,
   focus:"Doppelte Qualität: Intervall + Long Run mit MP-Anteil",
   s:[
    s("w07-mo","Mo","18. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w07-di","Di","19. Mai","interval","Intervall: 8×1000m",14,"2km WU · 8×1000m @ 4:10/km (90s Pause) · 2km CD.","4:10/km"),
    s("w07-mi","Mi","20. Mai","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:25/km"),
    s("w07-do","Do","21. Mai","easy","Easy Run",10,"Locker erholen.","5:15–5:25/km"),
    s("w07-fr","Fr","22. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w07-sa","Sa","23. Mai","tempo","Tempodauerlauf 16 km",16,"2km WU · 10km @ 4:05/km · 2km easy · 2km CD.","4:05/km"),
    s("w07-so","So","24. Mai","long","Long Run 24 km mit MP",24,"16km easy → letzte 8km @ 4:15/km. Kraft + Tempo!","5:15 → letzte 8km: 4:15/km"),
  ]},
  // ── DEV ────────────────────────────────────────
  {wn:8,phase:"DEV",label:"Entwicklung W1",dates:"25.–31. Mai 2026",km:65,
   focus:"Längere Intervalle + 26km Long Run – erste große Marke",
   s:[
    s("w08-mo","Mo","25. Mai","rest","Ruhetag",0,"Regeneration.",null),
    s("w08-di","Di","26. Mai","interval","Intervall: 6×1200m",14,"2km WU · 6×1200m @ 4:05/km (90s Pause) · 2km CD.","4:05/km"),
    s("w08-mi","Mi","27. Mai","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w08-do","Do","28. Mai","bike","Rennrad 75 min",0,"Lockere Radeinheit – Beine schonen.","locker"),
    s("w08-fr","Fr","29. Mai","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w08-sa","Sa","30. Mai","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w08-so","So","31. Mai","long","Long Run 26 km 🎉",26,"Erste 26er-Marke! Gleichmäßig easy.","5:10–5:20/km"),
  ]},
  {wn:9,phase:"DEV",label:"Entwicklung W2",dates:"1.–7. Juni 2026",km:68,
   focus:"Langer Schwellenlauf 16km + 27km Long Run",
   s:[
    s("w09-mo","Mo","1. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w09-di","Di","2. Jun","tempo","Tempodauerlauf 16 km",16,"2km WU · 12km @ 4:05/km · 2km CD. Langer Schwellenlauf!","4:05/km"),
    s("w09-mi","Mi","3. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w09-do","Do","4. Jun","easy","Easy Run",12,"Locker regenerieren.","5:15–5:25/km"),
    s("w09-fr","Fr","5. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w09-sa","Sa","6. Jun","bike","Rennrad 75 min",0,"Aktive Erholung auf dem Rad.","locker"),
    s("w09-so","So","7. Jun","long","Long Run 27 km",27,"Gleichmäßig easy. Aerobe Kraft aufbauen.","5:10–5:20/km"),
  ]},
  {wn:10,phase:"DEV",label:"Entwicklung W3",dates:"8.–14. Juni 2026",km:72,
   focus:"VO2max-Intervalle + erster 28km mit MP-Block",
   s:[
    s("w10-mo","Mo","8. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w10-di","Di","9. Jun","interval","Intervall: 4×3000m",16,"2km WU · 4×3000m @ 4:00/km (3min Pause) · 2km CD.","4:00/km"),
    s("w10-mi","Mi","10. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w10-do","Do","11. Jun","bike","Rennrad 90 min",0,"Längere Radeinheit – aerobes Training ohne Laufstress.","locker-moderat"),
    s("w10-fr","Fr","12. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w10-sa","Sa","13. Jun","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w10-so","So","14. Jun","long","Long Run 28 km mit MP 💪",28,"20km easy → letzte 8km @ 4:10/km. Erste spezifische Einheit!","5:10 → letzte 8km: 4:10/km"),
  ]},
  {wn:11,phase:"DEV",label:"Recovery-Woche 2 ⬇️",dates:"15.–21. Juni 2026",km:55,
   focus:"⬇️ Entlastungswoche – Kraft sammeln für Peak-Phase",
   s:[
    s("w11-mo","Mo","15. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w11-di","Di","16. Jun","easy","Easy Run",10,"Lockerer Lauf.","5:15–5:30/km"),
    s("w11-mi","Mi","17. Jun","interval","Kurze Intervalle: 6×800m",12,"2km WU · 6×800m @ 3:52/km (90s Pause) · 2km CD. Schnell & frisch!","3:52/km"),
    s("w11-do","Do","18. Jun","strength","Krafttraining (Gym)",0,"Gewichtstraining.",null),
    s("w11-fr","Fr","19. Jun","bike","Rennrad 60 min",0,"Lockere Radeinheit.","locker"),
    s("w11-sa","Sa","20. Jun","easy","Easy Run",12,"Lockerer Lauf.","5:15–5:25/km"),
    s("w11-so","So","21. Jun","long","Long Run 20 km",20,"Kürzerer Long Run – entspannt & genussvoll.","5:15–5:25/km"),
  ]},
  {wn:12,phase:"DEV",label:"Entwicklung W5",dates:"22.–28. Juni 2026",km:74,
   focus:"Schwellentempo + 28km mit progressivem MP-Segment",
   s:[
    s("w12-mo","Mo","22. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w12-di","Di","23. Jun","interval","Intervall: 5×2000m",16,"2km WU · 5×2000m @ 4:00/km (2min Pause) · 2km CD.","4:00/km"),
    s("w12-mi","Mi","24. Jun","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w12-do","Do","25. Jun","easy","Easy Run",13,"Lockere Erholung.","5:15–5:25/km"),
    s("w12-fr","Fr","26. Jun","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w12-sa","Sa","27. Jun","tempo","Tempodauerlauf 16 km",16,"2km WU · 12km @ 4:02/km · 2km CD.","4:02/km"),
    s("w12-so","So","28. Jun","long","Long Run 28 km mit MP",28,"20km easy → letzte 8km @ 4:08/km. Progressiver Long Run!","5:10 → letzte 8: 4:08/km"),
  ]},
  {wn:13,phase:"DEV",label:"Entwicklung W6",dates:"29. Jun – 5. Jul 2026",km:78,
   focus:"Langer Schwellenlauf 18km + 28km mit großem MP-Block",
   s:[
    s("w13-mo","Mo","29. Jun","rest","Ruhetag",0,"Regeneration.",null),
    s("w13-di","Di","30. Jun","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 4:00/km · 2km CD. Langer Schwellenlauf!","4:00/km"),
    s("w13-mi","Mi","1. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w13-do","Do","2. Jul","bike","Rennrad 90 min",0,"Lockere-moderate Radeinheit.","locker-moderat"),
    s("w13-fr","Fr","3. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w13-sa","Sa","4. Jul","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w13-so","So","5. Jul","long","Long Run 28 km – großer MP-Block 💥",28,"18km easy → letzte 10km @ 4:05/km. Starkes MP-Feeling!","5:10 → letzte 10: 4:05/km"),
  ]},
  // ── BUILD/PEAK ─────────────────────────────────
  {wn:14,phase:"BUILD",label:"Aufbau W1",dates:"6.–12. Juli 2026",km:80,
   focus:"Erste 80km-Woche 🔥 – polarisierter Trainingsansatz beginnt",
   s:[
    s("w14-mo","Mo","6. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w14-di","Di","7. Jul","interval","Intervall: 6×1600m",16,"2km WU · 6×1600m @ 3:55/km (2min Pause) · 2km CD.","3:55/km"),
    s("w14-mi","Mi","8. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w14-do","Do","9. Jul","easy","Easy Run",13,"Lockere Erholung.","5:10–5:25/km"),
    s("w14-fr","Fr","10. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w14-sa","Sa","11. Jul","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w14-so","So","12. Jul","long","Long Run 30 km 🎉",30,"ERSTE 30er-MARKE! Gleichmäßig easy – große Leistung!","5:10–5:20/km"),
  ]},
  {wn:15,phase:"BUILD",label:"Aufbau W2",dates:"13.–19. Juli 2026",km:83,
   focus:"Schwellentempo + 30km mit starkem MP-Block",
   s:[
    s("w15-mo","Mo","13. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w15-di","Di","14. Jul","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 3:58/km · 2km CD.","3:58/km"),
    s("w15-mi","Mi","15. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w15-do","Do","16. Jul","bike","Rennrad 90 min",0,"Moderate Radeinheit – aktive Erholung.","locker-moderat"),
    s("w15-fr","Fr","17. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w15-sa","Sa","18. Jul","easy","Easy Run",14,"Lockerer Lauf.","5:10–5:20/km"),
    s("w15-so","So","19. Jul","long","Long Run 30 km mit MP-Block 💥",30,"18km easy → letzte 12km @ 4:05/km. Schlüsseleinheit!","5:10 → letzte 12: 4:05/km"),
  ]},
  {wn:16,phase:"BUILD",label:"Recovery-Woche 3 ⬇️",dates:"20.–26. Juli 2026",km:63,
   focus:"⬇️ Entlastungswoche vor dem Peak – gut erholen!",
   s:[
    s("w16-mo","Mo","20. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w16-di","Di","21. Jul","interval","Kurze Intervalle: 6×800m",12,"2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Schnell & frisch!","3:45/km"),
    s("w16-mi","Mi","22. Jul","easy","Easy Run",12,"Lockerer Dauerlauf.","5:15–5:25/km"),
    s("w16-do","Do","23. Jul","strength","Krafttraining (Gym)",0,"Gewichtstraining.",null),
    s("w16-fr","Fr","24. Jul","bike","Rennrad 75 min",0,"Lockere Radeinheit.","locker"),
    s("w16-sa","Sa","25. Jul","easy","Easy Run",12,"Lockerer Lauf.","5:15–5:25/km"),
    s("w16-so","So","26. Jul","long","Long Run 24 km",24,"Kürzerer Long Run – locker & erholt.","5:15–5:25/km"),
  ]},
  {wn:17,phase:"BUILD",label:"Aufbau W4",dates:"27. Jul – 2. Aug 2026",km:86,
   focus:"Doppelte Qualität: 3×5000m + Schwelle + riesiger Long Run",
   s:[
    s("w17-mo","Mo","27. Jul","rest","Ruhetag",0,"Regeneration.",null),
    s("w17-di","Di","28. Jul","interval","Intervall: 3×5000m 🔥",18,"2km WU · 3×5000m @ 3:58/km (3min Pause) · 2km CD. Härteste Intervalleinheit!","3:58/km"),
    s("w17-mi","Mi","29. Jul","easy","Easy Run",14,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w17-do","Do","30. Jul","bike","Rennrad 90 min",0,"Moderate Radeinheit.","locker-moderat"),
    s("w17-fr","Fr","31. Jul","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w17-sa","Sa","1. Aug","tempo","Tempodauerlauf 18 km",18,"2km WU · 14km @ 3:58/km · 2km CD.","3:58/km"),
    s("w17-so","So","2. Aug","long","Long Run 32 km mit MP-Block 🏔️",32,"20km easy → letzte 12km @ 4:05/km. Eine der wichtigsten Einheiten!","5:10 → letzte 12: 4:05/km"),
  ]},
  {wn:18,phase:"BUILD",label:"🔥 PEAK-WOCHE",dates:"3.–9. August 2026",km:90,
   focus:"🔥 PEAK-WOCHE – Höchste Kilometerzahl der Saison! Du schaffst das!",
   s:[
    s("w18-mo","Mo","3. Aug","rest","Ruhetag",0,"Regeneration nach Sa/So. Sehr wichtig!",null),
    s("w18-di","Di","4. Aug","tempo","Tempodauerlauf 20 km 🔥",20,"2km WU · 16km @ 3:58/km · 2km CD. Langer, harter Schwellenlauf!","3:58/km"),
    s("w18-mi","Mi","5. Aug","easy","Easy Run",15,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w18-do","Do","6. Aug","easy","Easy Run",14,"Lockere Erholung.","5:15–5:25/km"),
    s("w18-fr","Fr","7. Aug","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w18-sa","Sa","8. Aug","easy","Easy Run",13,"Locker – Beine für den großen Sonntag schonen.","5:15–5:25/km"),
    s("w18-so","So","9. Aug","long","Long Run 34 km 🏔️ LÄNGSTER LAUF",34,"LÄNGSTER LAUF DER SAISON! 22km easy → letzte 12km @ 4:05/km. EPIC!","5:10 → letzte 12: 4:05/km"),
  ]},
  // ── SPEC ───────────────────────────────────────
  {wn:19,phase:"SPEC",label:"Aufbau W6 – Pre-HM",dates:"10.–16. August 2026",km:72,
   focus:"Etwas ruhiger – Kräfte für Kölner HM am 30. Aug sammeln",
   s:[
    s("w19-mo","Mo","10. Aug","rest","Ruhetag",0,"Regeneration nach Peak-Woche – sehr wichtig!",null),
    s("w19-di","Di","11. Aug","interval","Intervall: 6×1200m",14,"2km WU · 6×1200m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w19-mi","Mi","12. Aug","easy","Easy Run",13,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w19-do","Do","13. Aug","bike","Rennrad 75 min",0,"Lockere Radeinheit.","locker"),
    s("w19-fr","Fr","14. Aug","strength","Krafttraining (Gym)",0,"Ganzkörper.",null),
    s("w19-sa","Sa","15. Aug","easy","Easy Run",13,"Lockerer Lauf.","5:10–5:20/km"),
    s("w19-so","So","16. Aug","long","Long Run 28 km easy",28,"Easy – Erholung von Peak, aber Kilometer halten.","5:15–5:25/km"),
  ]},
  {wn:20,phase:"SPEC",label:"Pre-HM Woche",dates:"17.–23. August 2026",km:60,
   focus:"Kräfte sammeln für Kölner HM – leichte Woche mit Qualität",
   s:[
    s("w20-mo","Mo","17. Aug","rest","Ruhetag",0,"Regeneration.",null),
    s("w20-di","Di","18. Aug","interval","Intervall: 6×800m",12,"2km WU · 6×800m @ 3:45/km (2min Pause) · 2km CD. Beine scharf halten!","3:45/km"),
    s("w20-mi","Mi","19. Aug","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w20-do","Do","20. Aug","easy","Easy Run",10,"Kurz und locker.","5:15–5:25/km"),
    s("w20-fr","Fr","21. Aug","strength","Krafttraining (Gym)",0,"Moderate Intensität.",null),
    s("w20-sa","Sa","22. Aug","easy","Easy Run",8,"Kurzer lockerer Lauf.","5:15–5:30/km"),
    s("w20-so","So","23. Aug","long","Long Run 22 km easy",22,"Easy – letzter großer Lauf vor dem HM.","5:20–5:30/km"),
  ]},
  {wn:21,phase:"SPEC",label:"🏁 KÖLNER HALBMARATHON",dates:"24.–30. August 2026",km:42,
   focus:"🏁 MEILENSTEIN: Kölner Halbmarathon! Ziel: ~1:23–1:25 (3:56–3:59/km)",
   s:[
    s("w21-mo","Mo","24. Aug","rest","Ruhetag",0,"Regeneration.",null),
    s("w21-di","Di","25. Aug","easy","Easy + 6× Strides",8,"Locker einlaufen, Beine aktivieren.","5:20–5:30/km + Strides"),
    s("w21-mi","Mi","26. Aug","easy","Easy Run",8,"Kurzer lockerer Lauf.","5:20–5:30/km"),
    s("w21-do","Do","27. Aug","strength","Krafttraining – sehr leicht",0,"Leichtes Krafttraining! Keinen Muskelkater riskieren!",null),
    s("w21-fr","Fr","28. Aug","easy","Easy Run",6,"Kurz & locker. Mentale Vorbereitung.","5:20–5:30/km"),
    s("w21-sa","Sa","29. Aug","easy","Easy + 4× Strides (shakeout)",5,"5km easy + 4×Strides. Früh ins Bett!","locker + Strides"),
    s("w21-so","So","30. Aug","race","🏁 KÖLNER HALBMARATHON",21.1,"MEILENSTEIN! Zeigt dir, wie gut die Prep läuft. Rennday-Feeling sammeln!","3:56–3:59/km (Ziel 1:23–1:25)"),
  ]},
  {wn:22,phase:"SPEC",label:"Recovery Post-HM",dates:"31. Aug – 6. Sep 2026",km:62,
   focus:"Erholen & zurück in den Rhythmus – letzte richtige Trainingsphase",
   s:[
    s("w22-mo","Mo","31. Aug","easy","Regenerations-Lauf",8,"Sehr locker nach dem HM. Kein Druck.","5:30–5:50/km"),
    s("w22-di","Di","1. Sep","easy","Easy Run",10,"Lockerer Dauerlauf.","5:15–5:25/km"),
    s("w22-mi","Mi","2. Sep","interval","Intervall: 5×1000m",13,"2km WU · 5×1000m @ 4:00/km (90s Pause) · 2km CD. Scharf bleiben!","4:00/km"),
    s("w22-do","Do","3. Sep","easy","Easy Run",12,"Lockere Erholung.","5:10–5:20/km"),
    s("w22-fr","Fr","4. Sep","strength","Krafttraining (Gym)",0,"Letztes intensiveres Krafttraining.",null),
    s("w22-sa","Sa","5. Sep","easy","Easy Run",12,"Lockerer Lauf.","5:10–5:20/km"),
    s("w22-so","So","6. Sep","long","Long Run 24 km",24,"Letzter richtiger Long Run vor dem Taper. Easy & selbstbewusst!","5:10–5:20/km"),
  ]},
  // ── TAPER ──────────────────────────────────────
  {wn:23,phase:"TAPER",label:"Taper W1 ⬇️",dates:"7.–13. September 2026",km:55,
   focus:"⬇️ Taper beginnt – Volumen runter, Intensität BLEIBT!",
   s:[
    s("w23-mo","Mo","7. Sep","rest","Ruhetag",0,"Regeneration.",null),
    s("w23-di","Di","8. Sep","interval","Intervall: 5×1000m",13,"2km WU · 5×1000m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w23-mi","Mi","9. Sep","easy","Easy Run",12,"Lockerer Dauerlauf.","5:10–5:20/km"),
    s("w23-do","Do","10. Sep","bike","Rennrad 60 min",0,"Lockere Radeinheit.","locker"),
    s("w23-fr","Fr","11. Sep","strength","Krafttraining – leicht",0,"Leichtes Gewichtstraining.",null),
    s("w23-sa","Sa","12. Sep","easy","Easy + Strides",10,"10km easy + 6×80m Strides.","5:15–5:25/km"),
    s("w23-so","So","13. Sep","long","Long Run 24 km mit MP",24,"16km easy → letzte 8km @ 4:01/km (MARATHON PACE!). Letzter harter Long Run.","5:15 → letzte 8: 4:01/km"),
  ]},
  {wn:24,phase:"TAPER",label:"Taper W2 ⬇️⬇️",dates:"14.–20. September 2026",km:42,
   focus:"⬇️⬇️ Volumen stark reduziert – die Form kommt jetzt!",
   s:[
    s("w24-mo","Mo","14. Sep","rest","Ruhetag",0,"Regeneration.",null),
    s("w24-di","Di","15. Sep","interval","Intervall: 4×1000m",10,"2km WU · 4×1000m @ 3:55/km (90s Pause) · 2km CD.","3:55/km"),
    s("w24-mi","Mi","16. Sep","easy","Easy Run",10,"Lockerer Lauf.","5:10–5:20/km"),
    s("w24-do","Do","17. Sep","easy","Easy Run",8,"Kurz und locker.","5:15–5:25/km"),
    s("w24-fr","Fr","18. Sep","strength","Krafttraining – sehr leicht",0,"Sehr leicht. Kein Muskelkater!",null),
    s("w24-sa","Sa","19. Sep","easy","Easy + 6× Strides",8,"8km easy + 6×80m Strides. Beine aktivieren.","5:15–5:25/km"),
    s("w24-so","So","20. Sep","long","Long Run 18 km mit MP",18,"12km easy → letzte 6km @ 4:01/km. Letzte längere Einheit!","5:15 → letzte 6: 4:01/km"),
  ]},
  {wn:25,phase:"TAPER",label:"🏆 RACE WEEK – WARSCHAU",dates:"21.–27. September 2026",km:28,
   focus:"🏆 RACE WEEK – Du hast alles gegeben. Jetzt erntest du! SUB 2:50!",
   s:[
    s("w25-mo","Mo","21. Sep","rest","Ruhetag",0,"Füße hochlegen, gut essen & trinken, relaxen.",null),
    s("w25-di","Di","22. Sep","easy","Easy + Strides",8,"8km easy + 4×80m Strides. Beine aktivieren.","5:15–5:25/km"),
    s("w25-mi","Mi","23. Sep","easy","Easy Run",6,"6km sehr locker. Nicht viel denken.","5:20–5:30/km"),
    s("w25-do","Do","24. Sep","easy","Easy + 3× MP-Strides",5,"5km easy + 3×100m @ MP. Kurz reinspüren.","5:20 + 3×MP-Strides"),
    s("w25-fr","Fr","25. Sep","rest","Ruhetag / Anreise Warschau",0,"Anreise, Expo, Startnummer. Beine schonen! Carbo-Loading!",null),
    s("w25-sa","Sa","26. Sep","easy","Shakeout: 4 km + Strides",4,"4km sehr locker + 4×80m Strides. Beine aufwecken!","locker + Strides"),
    s("w25-so","So","27. Sep","race","🏆 WARSCHAU MARATHON – SUB 2:50!",42.2,"START 🔥 Erste Hälfte: 4:04–4:05/km · Zweite Hälfte: aufdrehen! Du hast es dir verdient!","⌀ 4:01/km = 2:49:50"),
  ]},
];
const BASE_PLAN = PLAN;

const ALL_SESSIONS = PLAN.flatMap((week) => week.s);
const ACTIVE_SESSIONS = ALL_SESSIONS.filter((session) => session.type !== "rest");

const LONG_RUN_SESSIONS = ACTIVE_SESSIONS.filter((session) => session.type === "long" && session.km > 0);
const LONGEST_LONG_RUN_KM = LONG_RUN_SESSIONS.reduce((max, session) => Math.max(max, session.km || 0), 0);
const FIRST_30K_ID = LONG_RUN_SESSIONS.find((session) => session.km >= 30)?.id;

const PHASE_ORDER = Object.keys(PI);
const VIEW_ORDER = ["home","week","performance","overview","coach","settings"];

function clampPct(value){
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

/** Running workouts in the last 7 local-calendar days (from 00:00 seven days ago), newest first. */
function runningWorkoutsLast7DaysNewestFirst(healthRunsList) {
  const endNow = new Date();
  const windowStart = new Date(endNow.getFullYear(), endNow.getMonth(), endNow.getDate());
  windowStart.setDate(windowStart.getDate() - 7);
  windowStart.setHours(0, 0, 0, 0);
  const cutoff = windowStart.getTime();
  const endCap = endNow.getTime() + 120_000;
  return [...(healthRunsList || [])]
    .filter((r) => {
      if (!r?.startDate) return false;
      const t = new Date(r.startDate).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= endCap;
    })
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

function getLoggedKm(session, log){
  if(!isSessionLogDone(log))return 0;
  const ar = log?.assignedRun;
  if(ar && typeof ar.distanceKm === "number" && Number.isFinite(ar.distanceKm) && ar.distanceKm > 0){
    return ar.distanceKm;
  }
  const parsed = parseFloat(String(log?.actualKm || "").replace(",", "."));
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return session.km > 0 ? session.km : 0;
}

function getSessionTypeLabel(type){
  return TI[type]?.label || "Einheit";
}

function getSessionMilestones(session, week){
  const milestones = [];

  if(session.type === "long" && session.km > 28){
    milestones.push({ label: "Long Run 28+", emoji: "🏔️", color: "#38bdf8" });
  }
  if(session.id === FIRST_30K_ID){
    milestones.push({ label: "Erste 30 km", emoji: "🚀", color: "#f97316" });
  }
  if(session.type === "long" && session.km === LONGEST_LONG_RUN_KM && session.km > 0){
    milestones.push({ label: "Längster Lauf", emoji: "👑", color: "#f59e0b" });
  }
  if(session.type === "race" && session.km >= 42){
    milestones.push({ label: "Marathon", emoji: "🏁", color: "#ef4444" });
  }else if(session.type === "race" && session.km >= 21){
    milestones.push({ label: "Halbmarathon", emoji: "🎯", color: "#a855f7" });
  }
  if(week.km >= 90){
    milestones.push({ label: "Peak Woche", emoji: "🔥", color: "#10b981" });
  }

  return milestones;
}

function getSessionWhy(session, week){
  if(session.type === "long"){
    return "Diese Einheit baut die marathonrelevante Ausdauer auf, trainiert Energie-Management und macht dich mental belastbarer.";
  }
  if(session.type === "interval"){
    return "Diese Einheit schärft VO2max, Laufökonomie und Tempohärte, damit sich Marathonpace später kontrollierter anfühlt.";
  }
  if(session.type === "tempo"){
    return "Diese Einheit verschiebt deine Schwelle und macht längere schnelle Abschnitte effizienter und ruhiger.";
  }
  if(session.type === "race"){
    return session.km >= 42
      ? "Das ist dein Hauptziel. Hier soll die gesamte Vorbereitung zusammenlaufen."
      : "Diese Einheit ist ein Formtest unter Rennbedingungen und gibt dir Feedback für die finale Marathonphase.";
  }
  if(session.type === "strength"){
    return "Diese Einheit stabilisiert deinen Bewegungsapparat, verbessert Kraftübertragung und reduziert Verletzungsrisiko.";
  }
  if(session.type === "bike"){
    return "Diese Einheit liefert aeroben Reiz ohne zusätzliche Laufbelastung und unterstützt aktive Regeneration.";
  }
  if(week.phase === "TAPER"){
    return "Diese Einheit hält Spannung und Rhythmus hoch, ohne unnötige Müdigkeit aufzubauen.";
  }
  return "Diese Einheit sammelt saubere, kontrollierte Trainingsarbeit und unterstützt die Gesamtbelastung deiner Woche.";
}

function getCoachHint(session, week){
  if(session.type === "long"){
    return "Starte bewusst kontrolliert, achte auf Fueling und bewerte die Qualität erst in der zweiten Hälfte.";
  }
  if(session.type === "interval"){
    return "Treffe die Zielpace sauber statt aggressiv zu eröffnen. Gute Wiederholungen schlagen heroische erste Intervalle.";
  }
  if(session.type === "tempo"){
    return "Bleib rhythmisch und technisch locker. Das Ziel ist Kontrolle, nicht maximaler Kampf.";
  }
  if(session.type === "race"){
    return session.km >= 42
      ? "Die ersten Kilometer dürfen sich fast zu leicht anfühlen. Geduld ist hier Performance."
      : "Nutze das Rennen als Standortbestimmung und laufe mit Fokus statt mit Ego.";
  }
  if(session.type === "strength"){
    return "Saubere Ausführung vor Last. Du sollst dich danach stabiler fühlen, nicht zerstört.";
  }
  if(session.type === "bike"){
    return "Halte die Intensität wirklich locker. Ziel ist Durchblutung und Zusatzvolumen, nicht Ermüdung.";
  }
  if(week.phase === "TAPER"){
    return "Weniger machen ist jetzt oft klüger. Frische ist ein Trainingsreiz.";
  }
  return "Laufe die Einheit so, dass du morgen noch qualitativ trainieren kannst.";
}

function parseWorkoutStructure(session){
  const rawParts = (session.desc || "")
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean);

  let warmup = "Locker einrollen und mobilisieren.";
  let mainSet = session.desc || "Nach Plan locker und kontrolliert absolvieren.";
  let cooldown = "Ruhig auslaufen oder aktiv regenerieren.";

  if(rawParts.length >= 3){
    warmup = rawParts[0];
    cooldown = rawParts[rawParts.length - 1];
    mainSet = rawParts.slice(1, -1).join(" · ");
  }else if(rawParts.length === 2){
    warmup = rawParts[0];
    mainSet = rawParts[1];
    cooldown = "Locker auslaufen und kurz runterfahren.";
  }else if(session.type === "interval" || session.type === "tempo"){
    warmup = "10-20 Minuten locker + Mobilität.";
    mainSet = session.desc;
    cooldown = "10-15 Minuten locker auslaufen.";
  }else if(session.type === "long"){
    warmup = "Sehr ruhig anlaufen und Puls niedrig halten.";
    mainSet = session.desc;
    cooldown = "Kurz auslaufen, trinken und Fueling direkt starten.";
  }else if(session.type === "strength"){
    warmup = "Allgemeines Warm-up + Aktivierung.";
    mainSet = session.desc;
    cooldown = "Leicht mobilisieren und Spannung lösen.";
  }else if(session.type === "bike"){
    warmup = "10 Minuten locker einrollen.";
    mainSet = session.desc;
    cooldown = "5-10 Minuten sehr locker ausfahren.";
  }

  return { warmup, mainSet, cooldown };
}

function formatLogTimestamp(value){
  if(!value)return "Noch kein Zeitstempel";
  const date = new Date(value);
  if(Number.isNaN(date.getTime()))return "Zeitpunkt unbekannt";
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSecondsToRaceTime(totalSeconds){
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${hours}:${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;
}

function getTrendLabel(predictedSeconds, targetSeconds){
  const diff = predictedSeconds - targetSeconds;
  if(diff <= 0)return "Richtung Sub 2:50";
  if(diff <= 120)return "Knapp an Sub 2:50 dran";
  if(diff <= 300)return "Stabil auf gutem Marathonkurs";
  return "Noch Aufbau, aber klar auf dem Weg";
}

function getRecoveryState(recentSessions, completionRatio){
  const avgFeeling = recentSessions.length
    ? recentSessions.reduce((sum, item) => sum + (item.log.feeling || 3), 0) / recentSessions.length
    : 3;
  const hardLoad = recentSessions.filter((item) => ["interval","tempo","race"].includes(item.session.type)).length;
  const longLoad = recentSessions.some((item) => item.session.type === "long" && item.session.km >= 28) ? 1 : 0;
  const missedPenalty = completionRatio < 0.65 ? 1.2 : completionRatio < 0.8 ? 0.5 : 0;
  const fatigueScore = hardLoad * 1.1 + longLoad * 1.3 + missedPenalty - avgFeeling * 0.75;

  if(fatigueScore >= 1.9){
    return {
      label: "🔴 Fatigue",
      tone: "#f87171",
      detail: "Zuletzt viel Belastung oder zu wenig gute Rückmeldungen. Eher konservativ steuern.",
    };
  }
  if(fatigueScore >= 0.7){
    return {
      label: "🟡 Normal",
      tone: "#fbbf24",
      detail: "Solider Trainingszustand mit normaler Ermüdung. Fokus auf Rhythmus und Schlaf.",
    };
  }
  return {
    label: "🟢 Fresh",
    tone: "#34d399",
    detail: "Die jüngsten Logs wirken stabil. Gute Basis für Qualität oder kontrolliertes Volumen.",
  };
}

function getWeeklyFatigue(week){
  const hardCount = week.s.filter((session) => ["interval","tempo","race"].includes(session.type)).length;
  const longestRun = week.s.reduce((max, session) => Math.max(max, session.type === "long" ? session.km || 0 : 0), 0);
  let score = 0;
  if(week.km >= 80)score += 2;
  else if(week.km >= 60)score += 1;
  if(hardCount >= 2)score += 1.5;
  else if(hardCount === 1)score += 0.75;
  if(longestRun >= 30)score += 1.5;
  else if(longestRun >= 24)score += 1;

  if(score >= 4){
    return { label: "hoch", icon: "🔴", color: "#f87171", note: "Viele Reize, Belastung aktiv managen." };
  }
  if(score >= 2.25){
    return { label: "mittel", icon: "🟡", color: "#fbbf24", note: "Solide Trainingswoche mit spürbarer Beanspruchung." };
  }
  return { label: "niedrig", icon: "🟢", color: "#34d399", note: "Kontrollierte Woche, gut für Konstanz und Erholung." };
}

function getPerformancePrediction({
  doneLongRuns,
  longRuns,
  doneHardSessions,
  hardSessions,
  avgFeeling,
  progressRatio,
  qualityLongRunScore,
  halfMarathonSignal,
  targetSeconds,
}){
  const safeTargetSeconds = targetSeconds || (2 * 3600 + 49 * 60 + 50);
  const longRunScore = longRuns > 0 ? doneLongRuns / longRuns : 0;
  const hardScore = hardSessions > 0 ? doneHardSessions / hardSessions : 0;
  const feelingScore = Math.max(0, Math.min(1, (avgFeeling - 2) / 3));
  const readiness = (longRunScore * 0.28) + (hardScore * 0.24) + (feelingScore * 0.14) + (progressRatio * 0.16) + (qualityLongRunScore * 0.1) + (halfMarathonSignal * 0.08);
  const penalty = (1 - readiness) * 360;
  const predictedSeconds = safeTargetSeconds + penalty;

  return {
    predictedSeconds,
    predictedTime: formatSecondsToRaceTime(predictedSeconds),
    trend: getTrendLabel(predictedSeconds, safeTargetSeconds),
    confidence: readiness >= 0.8 ? "hoch" : readiness >= 0.6 ? "mittel" : "früh im Block",
  };
}

function getFuelingHints(session){
  if(session.type === "long" && session.km >= 28){
    return [
      "Vorher 2-3 Stunden vorher kohlenhydratreich essen und 500-700 ml trinken.",
      "Im Lauf ab ca. Minute 30 starten und dann alle 25-30 Minuten ein Gel oder Carbs zuführen.",
      "Nachher in den ersten 30 Minuten Carbs plus Protein einplanen und zügig rehydrieren.",
    ];
  }
  if(session.type === "long"){
    return [
      "Vorher leicht verdauliche Carbs einbauen, besonders wenn die Einheit morgens startet.",
      "Bei Läufen ab 90 Minuten Wasser mitnehmen und Carbs früh testen.",
      "Nachher trinken und eine Recovery-Mahlzeit innerhalb von 60 Minuten anpeilen.",
    ];
  }
  if(session.type === "race" && session.km >= 42){
    return [
      "Carb-Loading am Vortag ruhig und verteilt halten, nicht experimentieren.",
      "Im Rennen idealerweise alle 25-30 Minuten Kohlenhydrate zuführen und an jeder Station kurz trinken.",
      "Koffein nur so einsetzen, wie du es im Training getestet hast.",
    ];
  }
  if(session.type === "race" && session.km >= 21){
    return [
      "Vor dem Start Frühstück 2-3 Stunden vorher und kurz vor dem Rennen optional ein Gel.",
      "Während des Halbmarathons je nach Dauer 1-2 Gels plus regelmäßige kleine Schlucke trinken.",
      "Nach dem Rennen direkt Carbs, Flüssigkeit und etwas Protein nachlegen.",
    ];
  }
  return [];
}

function getSessionStatus(log){
  if(log?.skipped)return "skipped";
  if(isSessionLogDone(log))return "done";
  return "open";
}

function getSessionStatusLabel(log){
  const status = getSessionStatus(log);
  if(status === "done")return "Erledigt";
  if(status === "skipped")return "Ausgelassen";
  return "Offen";
}

function getSessionStatusTone(log, typeColor){
  const status = getSessionStatus(log);
  if(status === "done"){
    return { background: "rgba(16,185,129,0.16)", color: "#86efac", border: "rgba(16,185,129,0.28)" };
  }
  if(status === "skipped"){
    return { background: "rgba(248,113,113,0.14)", color: "#fca5a5", border: "rgba(248,113,113,0.24)" };
  }
  return { background: `${typeColor}22`, color: typeColor, border: `${typeColor}33` };
}

function getRecoveryHistory(plan, logs){
  return plan.map((week) => {
    const activeSessions = week.s.filter((session) => session.type !== "rest");
    const doneCount = activeSessions.filter((session) => isSessionLogDone(logs[session.id])).length;
    const skippedCount = activeSessions.filter((session) => logs[session.id]?.skipped).length;
    const avgFeeling = activeSessions
      .filter((session) => isSessionLogDone(logs[session.id]) && logs[session.id]?.feeling)
      .reduce((sum, session, _, arr) => {
        return sum + (logs[session.id]?.feeling || 0) / arr.length;
      }, 0);
    const load = activeSessions.filter((session) => ["interval","tempo","race"].includes(session.type)).length
      + (activeSessions.some((session) => session.type === "long" && session.km >= 28) ? 1 : 0);
    const score = Math.max(0, Math.min(100, 58 + avgFeeling * 8 + doneCount * 4 - skippedCount * 8 - load * 6));
    return {
      label: `W${week.wn}`,
      score: Math.round(score),
      complete: doneCount === activeSessions.length && activeSessions.length > 0,
    };
  });
}

function getAdaptiveCoachingHint({ recoveryState, weeklyFatigue, performancePrediction, marathonPredictedTime, nextKeySession, phaseStatus }){
  if(recoveryState.label.includes("Fatigue") && weeklyFatigue.label === "hoch"){
    return {
      title: "Belastung aktiv deckeln",
      body: "Diese Woche lieber Qualität präzise statt heroisch laufen. Schlaf, Fueling und lockere Tage haben jetzt Priorität.",
      color: "#f87171",
    };
  }
  if(recoveryState.label.includes("Fresh") && nextKeySession){
    return {
      title: "Gutes Fenster für Qualität",
      body: `Du wirkst gerade stabil. Die nächste Schlüsseleinheit "${nextKeySession.title}" kannst du kontrolliert selbstbewusst angehen.`,
      color: "#34d399",
    };
  }
  if(phaseStatus === "Aufholen"){
    return {
      title: "Nicht hektisch aufholen",
      body: "Fehlende Einheiten nicht stapeln. Lieber den aktuellen Rhythmus sauber treffen als verlorenes Volumen erzwingen.",
      color: "#fbbf24",
    };
  }
  const headlineTime = marathonPredictedTime || performancePrediction?.predictedTime;
  return {
    title: "Konstanz schlägt Drama",
    body: headlineTime
      ? `Deine Prognose liegt aktuell bei ${headlineTime}. Saubere Wochen und stabile Energie bringen jetzt am meisten.`
      : "Sammle erst ein paar saubere Logs. Danach werden die Hinweise spürbar belastbarer.",
    color: "#60a5fa",
  };
}

function getRecommendedAction({ recoveryState, weeklyFatigue, nextKeySession, phaseStatus }){
  if(recoveryState.label.includes("Fatigue") || weeklyFatigue.label === "hoch"){
    return "Halte die nächste Einheit bewusst kontrolliert, priorisiere Schlaf, Trinken und Carbs statt Zusatzvolumen.";
  }
  if(phaseStatus === "Aufholen"){
    return "Nicht doppeln oder hektisch nachholen. Laufe die nächste geplante Einheit sauber und stabil, dann normal weiter.";
  }
  if(nextKeySession){
    return `Fokussiere dich als Nächstes auf "${nextKeySession.title}" und plane dafür genug Frische am Vortag ein.`;
  }
  return "Block halten, Rhythmus konservieren und die Form nicht mit Extra-Arbeit stören.";
}

function getDashboardMetric(session){
  if(!session)return "Ruhetag";
  if(session.type === "bike"){
    const match = session.desc?.match(/(\d+\s*(?:-|–)?\d*\s*min)/i);
    return match?.[1] || "Zeit";
  }
  if(session.type === "strength"){
    return "💪";
  }
  if(session.km > 0){
    return `${session.km} km`;
  }
  return "Session";
}

function getHeroTitle(session){
  if(!session){
    return "Ruhetag";
  }
  if(session.km > 0 && !session.title.toLowerCase().includes("km")){
    return `${session.km} km ${session.title}`;
  }
  return session.title;
}

function getHomeTabLabel(session, isPreStart){
  if(isPreStart)return "START";
  if(!session)return "HOME";
  if(session.type === "bike")return "BIKE";
  if(session.type === "strength")return "GYM";
  if(session.km > 0)return `${Math.round(session.km)}KM`;
  if(session.type === "race")return "RACE";
  return "HOME";
}

function MetricCard({ label, value, sublabel, accent }){
  return (
    <div style={{background:"rgba(13,16,33,0.86)",border:"1px solid rgba(148,163,184,0.12)",borderRadius:18,padding:14,minWidth:0,boxShadow:"0 14px 34px rgba(2,6,23,0.22)"}}>
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",marginBottom:8,fontWeight:700}}>{label}</div>
      <div style={{fontSize:24,fontWeight:800,color:accent || "#fff",lineHeight:1}}>{value}</div>
      {sublabel && <div style={{fontSize:12,color:"#94a3b8",marginTop:8,lineHeight:1.4}}>{sublabel}</div>}
    </div>
  );
}

function FilterChip({ active, children, onClick }){
  return (
    <button
      onClick={onClick}
      style={{
        background:active?"rgba(56,189,248,0.18)":"rgba(15,23,42,0.82)",
        color:active?"#bae6fd":"#94a3b8",
        border:`1px solid ${active?"rgba(56,189,248,0.35)":"rgba(148,163,184,0.12)"}`,
        borderRadius:999,
        padding:"8px 12px",
        cursor:"pointer",
        fontSize:12,
        fontWeight:700,
        transition:"background .18s ease, border-color .18s ease, color .18s ease",
      }}
    >
      {children}
    </button>
  );
}

function DetailBlock({ title, children }){
  return (
    <div style={{background:"rgba(9,11,26,0.92)",border:"1px solid rgba(148,163,184,0.12)",borderRadius:18,padding:16}}>
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:12}}>{title}</div>
      {children}
    </div>
  );
}

export default function App(){
  const [wIdx,setWIdx]=useState(0);
  const [logs, setLogs] = useState(() => safeParseJSON(localStorage.getItem("marathonLogs"), {}));
  const [aiPlanPatches, setAiPlanPatches] = useState(() => safeParseJSON(localStorage.getItem("marathonAiPlanPatches"), []));
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({feeling:0,actualKm:"",notes:"",done:false,skipped:false});
  const [view,setView]=useState(DEFAULT_VIEW);
  const [overviewPhaseFilter,setOverviewPhaseFilter]=useState("all");
  const [aiNavHint,setAiNavHint]=useState(null);
  const [preferences,setPreferences]=useState(() => safeParseJSON(localStorage.getItem("marathonPreferences"), {
    targetTime: "2:49:50",
  }));
  const [shareFeedback,setShareFeedback]=useState("");
  const [viewMotionDir,setViewMotionDir]=useState(0);
  // AI-enhanced daily coach advice — null while loading or when AI is unavailable.
  const [aiDailyAdvice, setAiDailyAdvice] = useState(null);
  const [healthRuns, setHealthRuns] = useState(() =>
    loadHealthRunsFromStorage((key) => localStorage.getItem(key), safeParseJSON),
  );
  const [healthRunsFetchBusy, setHealthRunsFetchBusy] = useState(false);
  const [healthAppleConnectBusy, setHealthAppleConnectBusy] = useState(false);
  const [appleHealthConnectFeedback, setAppleHealthConnectFeedback] = useState(null);
  const [appleHealthLoadFeedback, setAppleHealthLoadFeedback] = useState(null);
  const [isHealthConnected, setIsHealthConnected] = useState(
    () => typeof localStorage !== "undefined" && localStorage.getItem(APPLE_HEALTH_CONNECTED_KEY) === "1",
  );
  /** null = not checked yet (iOS only) */
  const [healthKitAvailable, setHealthKitAvailable] = useState(null);
  /** Set after each workout query: all types from HealthKit, then running-only subset. */
  const [appleHealthFetchStats, setAppleHealthFetchStats] = useState(null);
  /** Derived recovery/load hint from recent runs (updated when logs or plan patches change). */
  const [trainingLoadRec, setTrainingLoadRec] = useState(() =>
    buildTrainingLoadFallbackRecommendation(localCalendarYmd()),
  );
  const swipeStartRef = useRef(null);
  const lastSwipeAtRef = useRef(0);

  useEffect(() => {
    if (!VIEW_ORDER.includes(view)) {
      setView(DEFAULT_VIEW);
    }
  }, [view]);

  useEffect(() => {
    localStorage.setItem("marathonLogs", JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem("marathonPreferences", JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    localStorage.setItem("marathonAiPlanPatches", JSON.stringify(aiPlanPatches));
  }, [aiPlanPatches]);

  useEffect(() => {
    try {
      localStorage.setItem(HEALTH_RUNS_STORAGE_KEY, JSON.stringify(healthRuns));
    } catch {
      // ignore quota errors
    }
  }, [healthRuns]);

  const checkHealthKitAvailableOnDevice = async () => {
    const { Health } = await import("@capgo/capacitor-health");
    const availability = await Health.isAvailable();
    if (availability?.available) {
      logHealthKit("HealthKit available");
    } else {
      logHealthKit("HealthKit not available", availability?.reason ?? "");
    }
    return !!availability?.available;
  };

  const fetchRunningWorkoutsLast7Days = async () => {
    logHealthKit("Fetching workouts");
    const { Health } = await import("@capgo/capacitor-health");
    const { startIso, endIsoLogical, endIsoForQuery } = appleHealthWorkoutQueryRange7DaysLocal();

    console.log("[HealthKit] queryWorkouts window (7 local days 00:00 → now)", {
      startIso,
      endIsoLogical,
      endIsoForQuery,
    });

    const perPageLimit = 400;
    const maxPages = 20;
    const all = [];
    let anchor;
    for (let page = 0; page < maxPages; page++) {
      const res = await Health.queryWorkouts({
        startDate: startIso,
        endDate: endIsoForQuery,
        limit: perPageLimit,
        ascending: false,
        ...(anchor ? { anchor } : {}),
      });
      const batch = Array.isArray(res.workouts) ? res.workouts : [];
      all.push(...batch);
      if (!res.anchor || batch.length === 0) break;
      anchor = res.anchor;
    }

    const dedupeKeys = new Set();
    const deduped = [];
    for (const w of all) {
      const k = `${w.startDate}|${w.duration}|${w.workoutType}|${w.totalDistance ?? ""}|${w.platformId ?? ""}`;
      if (dedupeKeys.has(k)) continue;
      dedupeKeys.add(k);
      deduped.push(w);
    }

    console.log(
      "[HealthKit] queryWorkouts merged pages — raw rows:",
      all.length,
      "deduped:",
      deduped.length,
    );

    const running = deduped
      .filter((w) => w.workoutType === "running" || w.workoutType === "runningTreadmill")
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    console.log("[HealthKit] Workout counts — total (deduped):", deduped.length, "running:", running.length);
    if (running.length > 0) console.log("Latest run:", running[0]);

    let hrPoints = [];
    try {
      const hr = await Health.readSamples({
        dataType: "heartRate",
        startDate: startIso,
        endDate: endIsoForQuery,
        limit: 8000,
        ascending: true,
      });
      hrPoints = (hr.samples || []).map((s) => ({ startDate: s.startDate, value: s.value }));
    } catch (hrErr) {
      console.error("[HealthKit] readSamples heartRate error", hrErr);
    }

    const incoming = running.map((w) =>
      workoutToStored(
        w,
        averageHeartRateBpmInWorkoutWindow(w.startDate, w.endDate, hrPoints),
      ),
    );
    setHealthRuns((prev) => mergeHealthRuns(prev, incoming));
    setAppleHealthFetchStats({ total: deduped.length, running: running.length });
    console.log("[HealthKit] Workouts loaded:", running.length);
    logHealthKit("Workout counts logged — total:", all.length, "running merged:", running.length);
    return running.length;
  };

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let cancelled = false;
    (async () => {
      try {
        const ok = await checkHealthKitAvailableOnDevice();
        if (cancelled) return;
        setHealthKitAvailable(ok);
        if (!ok) return;
        if (localStorage.getItem(APPLE_HEALTH_CONNECTED_KEY) === "1") {
          setIsHealthConnected(true);
          try {
            await fetchRunningWorkoutsLast7Days();
          } catch (e) {
            console.error("[HealthKit] initial workout fetch failed", e);
          }
        }
      } catch (e) {
        console.error("[HealthKit] availability check failed", e);
        if (!cancelled) setHealthKitAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once on mount for iOS
  }, []);

  const handleAppleHealthConnectInSettings = async () => {
    if (Capacitor.getPlatform() !== "ios") return;
    setAppleHealthConnectFeedback(null);
    setHealthAppleConnectBusy(true);
    try {
      const { Health } = await import("@capgo/capacitor-health");
      const availability = await Health.isAvailable();
      if (!availability?.available) {
        setAppleHealthConnectFeedback({
          tone: "err",
          text: "Apple Health is not available on this device.",
        });
        return;
      }
      logHealthKit("Requesting authorization", APPLE_HEALTH_READ_TYPES);
      await Health.requestAuthorization({ read: APPLE_HEALTH_READ_TYPES });
      logHealthKit("Permission granted");
      localStorage.setItem(APPLE_HEALTH_CONNECTED_KEY, "1");
      setIsHealthConnected(true);
      setAppleHealthConnectFeedback({
        tone: "ok",
        text: "Connected to Apple Health.",
      });
      try {
        await fetchRunningWorkoutsLast7Days();
      } catch (fetchErr) {
        console.error("[HealthKit] fetch after connect failed", fetchErr);
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Could not load workouts. Try “Refresh workouts”.",
        });
      }
    } catch (err) {
      console.error("[HealthKit] connect / authorization failed", err);
      setAppleHealthConnectFeedback({
        tone: "err",
        text: "Could not connect to Apple Health. Check Settings › Health › Data Access.",
      });
    } finally {
      setHealthAppleConnectBusy(false);
    }
  };

  /** Loads running workouts (last 7 days) only — does not open the permission sheet. */
  const reloadHealthRunsFromApple = async () => {
    if (Capacitor.getPlatform() !== "ios") return;
    setAppleHealthLoadFeedback(null);
    setHealthRunsFetchBusy(true);
    try {
      const { Health } = await import("@capgo/capacitor-health");
      const availability = await Health.isAvailable();
      if (!availability?.available) {
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Apple Health is not available.",
        });
        return;
      }
      try {
        await fetchRunningWorkoutsLast7Days();
      } catch (err) {
        console.error("[HealthKit] queryWorkouts / merge failed", err);
        setAppleHealthLoadFeedback({
          tone: "err",
          text: "Allow Apple Health access first (Workouts, Distance, Heart Rate, Active Energy).",
        });
        return;
      }
      setAppleHealthLoadFeedback({
        tone: "ok",
        text: "Workouts updated.",
      });
    } catch (err) {
      console.error("[HealthKit] reloadHealthRunsFromApple error", err);
      setAppleHealthLoadFeedback({
        tone: "err",
        text: "Allow Apple Health access first (Workouts, Distance, Heart Rate, Active Energy).",
      });
    } finally {
      setHealthRunsFetchBusy(false);
    }
  };

  useEffect(()=>{
    (async()=>{
      try{
        const r=await readRemoteStorage("mwaw26-logs");
        if(r)setLogs(safeParseJSON(r.value, {}));
      }catch{
        // Startup should never block rendering if remote storage is unavailable.
      }
    })();
  },[]);

  const save=async(newLogs)=>{
    setLogs(newLogs);
    await writeRemoteStorage("mwaw26-logs", JSON.stringify(newLogs));
  };

  const assignHealthRunToSession = async (session, run) => {
    const km = (run.distanceMeters || 0) / 1000;
    const existing = logs[session.id] || {};
    await save({
      ...logs,
      [session.id]: {
        ...existing,
        suggestedHealthRunId: undefined,
        assignedRun: {
          runId: run.runId,
          startDate: run.startDate,
          duration: run.duration,
          distanceKm: Math.round(km * 100) / 100,
          ...(typeof run.avgHeartRateBpm === "number" && Number.isFinite(run.avgHeartRateBpm)
            ? { avgHeartRateBpm: run.avgHeartRateBpm }
            : {}),
        },
      },
    });
  };

  const clearHealthRunAssignment = async (session) => {
    if (!session) return;
    const existing = logs[session.id] || {};
    const next = { ...existing };
    delete next.assignedRun;
    await save({
      ...logs,
      [session.id]: next,
    });
  };

  const quickCompleteSession=async(session)=>{
    const existing = logs[session.id] || {};
    await save({
      ...logs,
      [session.id]: {
        ...existing,
        done: !existing.done,
        skipped: false,
        at: new Date().toISOString(),
      }
    });
  };

  const quickSkipSession=async(session)=>{
    const existing = logs[session.id] || {};
    await save({
      ...logs,
      [session.id]: {
        ...existing,
        done: false,
        skipped: !existing.skipped,
        at: new Date().toISOString(),
      }
    });
  };

  const copyShareSummary=async()=>{
    try{
      await navigator.clipboard?.writeText?.(shareSummary);
      setShareFeedback("Zusammenfassung kopiert");
      setTimeout(()=>setShareFeedback(""), 1800);
    }catch{
      setShareFeedback("Kopieren nicht verfügbar");
      setTimeout(()=>setShareFeedback(""), 1800);
    }
  };

  const openModal=(session)=>{
    const ex=logs[session.id]||{};
    setForm({feeling:ex.feeling||0,actualKm:ex.actualKm||"",notes:ex.notes||"",done:ex.done||false,skipped:ex.skipped||false});
    setModal(session);
  };

  const closeModal=()=>setModal(null);

  const navigateToView = (nextView, forcedDirection = null)=>{
    const currentView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
    if(nextView === currentView)return;
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    const nextIndex = VIEW_ORDER.indexOf(nextView);
    const direction = forcedDirection ?? (nextIndex > currentIndex ? 1 : -1);
    setViewMotionDir(direction);
    setView(nextView);
  };

  const stepView = (direction)=>{
    const currentView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
    const currentIndex = VIEW_ORDER.indexOf(currentView);
    if(currentIndex < 0)return;
    const nextIndex = Math.max(0, Math.min(VIEW_ORDER.length - 1, currentIndex + direction));
    if(nextIndex !== currentIndex){
      navigateToView(VIEW_ORDER[nextIndex], direction);
    }
  };

  const triggerSwipe = (direction)=>{
    if(modal)return;
    const now = Date.now();
    if(now - lastSwipeAtRef.current < 420)return;
    lastSwipeAtRef.current = now;
    stepView(direction);
  };

  const handleTouchStart = (event)=>{
    if(modal)return;
    const touch = event.touches?.[0];
    if(!touch)return;
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event)=>{
    if(modal || !swipeStartRef.current)return;
    const touch = event.changedTouches?.[0];
    if(!touch){
      swipeStartRef.current = null;
      return;
    }
    const deltaX = touch.clientX - swipeStartRef.current.x;
    const deltaY = touch.clientY - swipeStartRef.current.y;
    swipeStartRef.current = null;
    if(Math.abs(deltaX) < 56 || Math.abs(deltaX) <= Math.abs(deltaY))return;
    triggerSwipe(deltaX < 0 ? 1 : -1);
  };

  const handleWheel = (event)=>{
    if(modal)return;
    const tagName = event.target?.tagName;
    if(tagName === "INPUT" || tagName === "TEXTAREA")return;
    if(Math.abs(event.deltaX) < 40 || Math.abs(event.deltaX) <= Math.abs(event.deltaY))return;
    triggerSwipe(event.deltaX > 0 ? 1 : -1);
  };

  const saveModal=async()=>{
    if(!modal)return;
    const prev = logs[modal.id] || {};
    await save({...logs,[modal.id]:{...prev,...form,at:new Date().toISOString()}});
    setModal(null);
  };

  const PLAN = applyPlanPatches(BASE_PLAN, aiPlanPatches);
  const ALL_SESSIONS = PLAN.flatMap((week) => week.s);
  const ACTIVE_SESSIONS = ALL_SESSIONS.filter((session) => session.type !== "rest");
  const LONG_RUN_SESSIONS = ACTIVE_SESSIONS.filter((session) => session.type === "long" && session.km > 0);

  const logsRef = useRef(logs);
  logsRef.current = logs;

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    if (!healthRuns.length) return;
    const result = applyAppleHealthTrainingSync({
      healthRuns,
      planSessions: ACTIVE_SESSIONS,
      logs: logsRef.current,
    });
    if (!result.changed) return;
    void save(result.logs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Apple-Run-Merge nur bei neuen Health-Daten
  }, [healthRuns]);

  useEffect(() => {
    const todayYmd = localCalendarYmd();
    const logKeys = Object.keys(logs || {});
    console.log("[TrainingLoad] App effect (getTrainingLoadRecommendation path)", {
      todayYmd,
      logEntryCount: logKeys.length,
      planWeeks: PLAN.length,
    });
    const next = getTrainingLoadRecommendation({ plan: PLAN, logs, today: todayYmd });
    console.log("[TrainingLoad] App trainingLoadRec state will be set to:", next);
    setTrainingLoadRec((prev) => {
      if (
        prev.status === next.status &&
        prev.basedOnDate === next.basedOnDate &&
        prev.feedback === next.feedback &&
        prev.label === next.label
      ) {
        return prev;
      }
      return next;
    });
  // PLAN follows aiPlanPatches; omit PLAN in deps (new array ref each render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, aiPlanPatches]);

  const handleAiApplyPlanPatches = (_message, _action, patches)=>{
    if(!patches?.length)return;
    setAiPlanPatches((prev)=>{
      const byId = new Map((prev || []).map((patch)=>[patch.sessionId, patch]));
      patches.forEach((patch)=>byId.set(patch.sessionId, patch));
      return Array.from(byId.values());
    });
  };

  const handleAiNavigate = (targetScreen, section)=>{
    if(section){
      setAiNavHint({ screen: targetScreen, section });
    }
    if(targetScreen === "week"){
      const now = new Date();
      const todaySession = PLAN.find((week)=>week.s.some((session)=>{
        const parsed = parseSessionDateLabel(session.date);
        if(!parsed)return false;
        const normalized = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return normalized.getTime() === today.getTime();
      }));
      if(todaySession){
        const idx = PLAN.indexOf(todaySession);
        if(idx >= 0)setWIdx(idx);
      }
    }
    navigateToView(targetScreen);
  };

  const buildCurrentAiContext = ()=>getAiContext({
    plan: PLAN,
    logs,
    targetTime: preferences.targetTime,
    availableScreens: [
      { key: "home", label: "Start" },
      { key: "week", label: "Wochenplan", sections: ["current_week"] },
      { key: "performance", label: "Leistung" },
      { key: "overview", label: "Uebersicht" },
      { key: "coach", label: "AI Coach" },
      { key: "settings", label: "Einstellungen", sections: ["race_goal"] },
    ],
    settings: {
      targetTime: preferences.targetTime,
    },
  });

  const w=PLAN[wIdx];
  const ph=PI[w.phase];
  const totalSess=ACTIVE_SESSIONS.length;
  const totalTargetKm=PLAN.reduce((sum, week) => sum + week.km, 0);
  const doneSessions = ACTIVE_SESSIONS.filter((session) => isSessionLogDone(logs[session.id]));
  const doneSess=doneSessions.length;
  const loggedKm=ACTIVE_SESSIONS.reduce((sum, session) => sum + getLoggedKm(session, logs[session.id]), 0);
  const wLoggedKm=w.s.reduce((sum, session) => sum + getLoggedKm(session, logs[session.id]), 0);
  const pct=totalSess>0?Math.round((doneSess/totalSess)*100):0;
  const kmPct=totalTargetKm>0?Math.round((loggedKm/totalTargetKm)*100):0;
  const longRuns = LONG_RUN_SESSIONS.length;
  const doneLongRuns = LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).length;
  const hardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type)).length;
  const doneHardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type) && isSessionLogDone(logs[session.id])).length;
  const completedSessionRatio = totalSess > 0 ? doneSess / totalSess : 0;
  const avgFeeling = doneSessions.length
    ? doneSessions.reduce((sum, session) => sum + (logs[session.id]?.feeling || 3), 0) / doneSessions.length
    : 3;
  const recentRecoverySessions = ACTIVE_SESSIONS
    .filter((session) => isSessionLogDone(logs[session.id]))
    .slice(-5)
    .map((session) => ({ session, log: logs[session.id] }));
  const recoveryState = getRecoveryState(recentRecoverySessions, completedSessionRatio);
  const weeklyFatigue = getWeeklyFatigue(w);
  const qualityLongRunScore = LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).length
    ? LONG_RUN_SESSIONS.filter((session) => isSessionLogDone(logs[session.id])).reduce((sum, session, _, arr) => {
      const log = logs[session.id];
      const actualKm = parseFloat(log?.actualKm) || session.km || 0;
      const distanceScore = session.km >= 28 ? Math.min(1, actualKm / session.km) : 0.75;
      const feelingScore = log?.feeling ? Math.max(0.45, log.feeling / 5) : 0.65;
      return sum + ((distanceScore * 0.65) + (feelingScore * 0.35)) / arr.length;
    }, 0)
    : 0.4;
  const halfMarathonRace = ACTIVE_SESSIONS.find((session) => session.type === "race" && session.km >= 21 && session.km < 42 && isSessionLogDone(logs[session.id]));
  const halfMarathonSignal = halfMarathonRace
    ? Math.min(1, ((logs[halfMarathonRace.id]?.feeling || 3) / 5) * 0.55 + ((parseFloat(logs[halfMarathonRace.id]?.actualKm) || halfMarathonRace.km) >= 21 ? 0.45 : 0.2))
    : 0.45;
  const parsedTargetTime = parseTargetTimeToSeconds(preferences.targetTime);
  const targetSeconds = parsedTargetTime || (2 * 3600 + 49 * 60 + 50);
  const targetTimeDisplay = parsedTargetTime ? preferences.targetTime : "2:49:50";
  const targetPaceSeconds = Math.round(targetSeconds / 42.195);
  const targetPaceDisplay = `${Math.floor(targetPaceSeconds / 60)}:${String(targetPaceSeconds % 60).padStart(2,"0")}/km`;
  const predictionReadiness = getPredictionReadiness({
    doneSessionsCount: doneSess,
    loggedKm,
    doneLongRuns,
    doneHardSessions,
  });
  const rawPerformancePrediction = getPerformancePrediction({
    doneLongRuns,
    longRuns,
    doneHardSessions,
    hardSessions,
    avgFeeling,
    progressRatio: completedSessionRatio,
    qualityLongRunScore,
    halfMarathonSignal,
    targetSeconds,
  });
  const performancePrediction = predictionReadiness.ready
    ? rawPerformancePrediction
    : {
      predictedSeconds: null,
      predictedTime: predictionReadiness.title,
      trend: predictionReadiness.detail,
      confidence: "wartet auf Daten",
    };
  const appNow = new Date();
  const marathonPrediction = getMarathonPrediction({
    plan: PLAN,
    logs,
    targetSeconds,
    now: appNow,
  });
  const recoveryHistory = getRecoveryHistory(PLAN, logs);
  const consistencyStats = getConsistencyStats(PLAN, logs, appNow);
  const coachHints = getCoachFeedback({ plan: PLAN, logs, consistencyStats, now: appNow });
  const weekAnalysis = analyzeWeek(w, logs, appNow);

  // --- Daily Decision Engine signals ---
  // Compute lightweight inputs so getDailyDecision stays a pure function.
  const decisionRecentSessions = ACTIVE_SESSIONS
    .filter((session) => isSessionLogDone(logs[session.id]))
    .slice(-5)
    .map((session) => ({ session, log: logs[session.id] }));

  const decisionRecentHardCount = decisionRecentSessions.filter((item) =>
    ["interval", "tempo", "race"].includes(item.session.type)
  ).length;

  const decisionAvgFeeling = decisionRecentSessions.length
    ? decisionRecentSessions.reduce((sum, item) => sum + (item.log?.feeling || 3), 0) / decisionRecentSessions.length
    : 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const decisionMissedRecent = ACTIVE_SESSIONS.filter((session) => {
    const d = parseSessionDateLabel(session.date);
    if (!d) return false;
    const sd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (sd < sevenDaysAgo || sd > todayMidnight) return false;
    const log = logs[session.id];
    return !isSessionLogDone(log) && !log?.skipped;
  }).length;

  const decisionTodayNextSession = getTodayNextSession(ACTIVE_SESSIONS, logs, appNow);
  const marathonConfidenceLabel = marathonPrediction.ready
    ? predictionReadiness.ready
      ? performancePrediction.confidence
      : "Datenbasis wächst"
    : null;
  const nextKeySession = ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open" && getSessionMilestones(session, PLAN.find((week) => week.s.some((item) => item.id === session.id)) || w).length > 0)
    || ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open");
  const currentPhaseIndex = PHASE_ORDER.indexOf(w.phase);
  const currentPhaseProgress = Math.round(((currentPhaseIndex + 1) / PHASE_ORDER.length) * 100);
  const phaseStatus = pct >= currentPhaseProgress + 10 ? "Voraus" : pct >= currentPhaseProgress - 10 ? "Im Plan" : "Aufholen";
  const nextKeyDate = nextKeySession ? parseSessionDateLabel(nextKeySession.date) : null;
  const daysToNextKeySession = nextKeyDate
    ? Math.ceil((new Date(nextKeyDate.getFullYear(), nextKeyDate.getMonth(), nextKeyDate.getDate()).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24))
    : null;
  // ── Daily coach decision: deterministic rules first, AI enhancement second ──
  const todayCoachLogForDecision =
    decisionTodayNextSession?.mode === "today" && decisionTodayNextSession.session
      ? logs[decisionTodayNextSession.session.id]
      : null;
  const todayCompletedViaAssignedRun = !!(todayCoachLogForDecision?.assignedRun?.runId);

  const dailyCoachDecisionInput = {
    recoveryLabel: recoveryState.label,
    weeklyFatigueLabel: weeklyFatigue.label,
    recentHardCount: decisionRecentHardCount,
    avgRecentFeeling: decisionAvgFeeling,
    missedRecentCount: decisionMissedRecent,
    doneSessions: doneSess,
    sessionStreak: consistencyStats.sessionStreak,
    todaySessionType: decisionTodayNextSession?.session?.type ?? null,
    isToday: decisionTodayNextSession?.mode === "today",
    phase: w.phase,
    daysToNextKeySession,
    todayCompletedViaAssignedRun,
  };
  // Layer 1: deterministic rule-based result (always instant, always safe).
  const ruleBasedDailyDecision = getDailyCoachDecision(dailyCoachDecisionInput);
  // Layer 2: merge AI advice when it exists and the rule layer allows it.
  const dailyCoachDecision = (aiDailyAdvice && !ruleBasedDailyDecision.isHardOverride)
    ? { ...ruleBasedDailyDecision, ...aiDailyAdvice }
    : ruleBasedDailyDecision;

  // A stable string key — changes only when the signals that drive the decision
  // change, so we don't fire an AI call on every keystroke or minor re-render.
  const aiDecisionKey = [
    recoveryState.label,
    weeklyFatigue.label,
    decisionTodayNextSession?.session?.type ?? "none",
    doneSess,
    todayCompletedViaAssignedRun ? "1" : "0",
  ].join("|");

  // Effect: fetch AI enhancement for non-high-risk situations.
  // Runs whenever aiDecisionKey changes (i.e. context changes meaningfully).
  // Falls back to the rule-based decision silently when AI is unreachable.
  useEffect(() => {
    if (ruleBasedDailyDecision.isHardOverride) {
      // Safety rule is final — no AI call needed.
      setAiDailyAdvice(null);
      return;
    }
    const controller = new AbortController();
    fetchAiDailyAdvice(dailyCoachDecisionInput, controller.signal)
      .then((result) => {
        if (result) setAiDailyAdvice(result);
      })
      .catch(() => { /* network failure — rule-based decision stays */ });
    return () => controller.abort();
  }, [aiDecisionKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // ────────────────────────────────────────────────────────────────────────────
  const modalLog = modal ? logs[modal.id] : null;
  const modalWeek = modal ? PLAN.find((week) => week.s.some((session) => session.id === modal.id)) : null;
  const modalMilestones = modal && modalWeek ? getSessionMilestones(modal, modalWeek) : [];
  const modalWorkout = modal ? parseWorkoutStructure(modal) : null;
  const modalFuelingHints = modal ? getFuelingHints(modal) : [];
  const coachingHint = getAdaptiveCoachingHint({
    recoveryState,
    weeklyFatigue,
    performancePrediction,
    marathonPredictedTime: marathonPrediction.ready ? marathonPrediction.predictedTime : null,
    nextKeySession,
    phaseStatus,
  });
  const recommendedAction = getRecommendedAction({ recoveryState, weeklyFatigue, nextKeySession, phaseStatus });
  const visibleOverviewPhases = overviewPhaseFilter === "all" ? Object.keys(PI) : [overviewPhaseFilter];
  const todayNextSession = getTodayNextSession(ACTIVE_SESSIONS, logs, appNow);
  const firstTrainingSession = ACTIVE_SESSIONS[0] || null;
  const firstTrainingDate = firstTrainingSession ? parseSessionDateLabel(firstTrainingSession.date) : null;
  const today = appNow;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const firstTrainingStart = firstTrainingDate ? new Date(firstTrainingDate.getFullYear(), firstTrainingDate.getMonth(), firstTrainingDate.getDate()) : null;
  const hasCalendarStarted = !!(firstTrainingStart && todayStart >= firstTrainingStart);
  const isPreStart = isHomePreStart(logs, ACTIVE_SESSIONS);
  const blockStartLabel = firstTrainingDate
    ? firstTrainingDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  const dashboardSession = todayNextSession?.session || null;
  const dashboardType = dashboardSession ? TI[dashboardSession.type] : { label: "Keine Einheit geplant", emoji: "😴", col: "#64748b" };
  const planRunningSessionsForKmRing = ACTIVE_SESSIONS.filter(
    (s) => s.type !== "rest" && s.type !== "strength" && s.type !== "bike",
  );
  const overallPlannedKm = planRunningSessionsForKmRing.reduce((sum, s) => sum + (Number(s.km) || 0), 0);
  const overallCompletedKm = planRunningSessionsForKmRing.reduce((sum, s) => {
    if (!isSessionLogDone(logs[s.id])) return sum;
    return sum + getLoggedKm(s, logs[s.id]);
  }, 0);
  let planKmProgressRaw = overallPlannedKm > 0 ? (overallCompletedKm / overallPlannedKm) * 100 : 0;
  planKmProgressRaw = Math.max(0, Math.min(100, planKmProgressRaw));
  let prepProgressPct = Math.round(planKmProgressRaw);
  if (planKmProgressRaw > 0 && prepProgressPct < 1) prepProgressPct = 1;
  const ringKmDoneDisplay = Math.round(overallCompletedKm);
  const ringKmPlannedDisplay = Math.round(overallPlannedKm);
  const dashboardLog = dashboardSession ? logs[dashboardSession.id] : null;
  const dashboardDone = !!(dashboardSession && isSessionLogDone(dashboardLog));
  const dashboardHealthDone = !!(dashboardLog?.assignedRun?.runId);
  const runIntelFeedback = dashboardLog?.runEvaluation?.feedback;
  const runIntelLabel = dashboardLog?.runEvaluation?.label;
  const healthSuggestPending = !!(dashboardLog?.suggestedHealthRunId && !dashboardLog?.assignedRun?.runId);
  const ringRadius = 38;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset = ringCircumference * (1 - (prepProgressPct / 100));
  const homeTabLabel = getHomeTabLabel(dashboardSession, isPreStart);
  const shareSummary = getShareSummary({ pct, week: w, nextKeySession, recoveryState, consistencyStats });
  const viewTransitionStyle = viewMotionDir === 0
    ? {}
    : { animation: `${viewMotionDir > 0 ? "viewSlideNext" : "viewSlidePrev"} .34s cubic-bezier(0.22, 1, 0.36, 1)` };
  const activeView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;
  const safeTopPad = "calc(env(safe-area-inset-top, 0px) + 4px)";
  const safeBottomContentPad = "calc(94px + env(safe-area-inset-bottom, 0px))";
  const appRootBackground = {
    backgroundColor: "#070912",
    backgroundImage: "radial-gradient(circle at top, #1a1f44 0%, #0b0b15 40%, #070912 100%)",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
  };
  const mainScrollAreaStyle = { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" };
  const appleHealthRecentRunsDesc = useMemo(
    () => runningWorkoutsLast7DaysNewestFirst(healthRuns),
    [healthRuns],
  );
  const latestAppleHealthRun = appleHealthRecentRunsDesc[0] ?? null;

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    if (appleHealthRecentRunsDesc.length > 0) {
      console.log("Latest run:", appleHealthRecentRunsDesc[0]);
    }
  }, [appleHealthRecentRunsDesc]);

  useEffect(() => {
    console.log("overallPlannedKm", overallPlannedKm);
    console.log("overallCompletedKm", overallCompletedKm);
    console.log("displayedProgressPercent", prepProgressPct);
  }, [overallPlannedKm, overallCompletedKm, prepProgressPct]);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    console.log("[layout] iOS: viewport-fit=cover; root paddingTop=calc(env(safe-area-inset-top)+4px), content paddingBottom reserves bottom nav + safe area");
  }, []);

  return(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{
        boxSizing: "border-box",
        flex: 1,
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: "#070912",
        color: "#e2e8f0",
        fontFamily: "'Segoe UI',system-ui,sans-serif",
        fontSize: 14,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          pointerEvents: "none",
          ...appRootBackground,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: safeTopPad,
          paddingBottom: safeBottomContentPad,
          paddingLeft: "env(safe-area-inset-left, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
      <style>{`
        .dashboard-action,
        .bottom-nav-btn {
          -webkit-tap-highlight-color: transparent;
        }
        .dashboard-action {
          transition: transform .12s ease, background .22s ease, border-color .22s ease, box-shadow .22s ease, color .22s ease;
        }
        .dashboard-action:active {
          transform: scale(.97);
        }
        .bottom-nav-btn {
          transition: transform .12s ease, background .22s ease, color .22s ease, opacity .22s ease;
          justify-content: center !important;
          align-items: center !important;
        }
        .bottom-nav-btn:active {
          transform: scale(.97);
        }
        @keyframes viewSlideNext {
          0% { opacity: .0; transform: translate3d(18px,0,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
        @keyframes viewSlidePrev {
          0% { opacity: .0; transform: translate3d(-18px,0,0); }
          100% { opacity: 1; transform: translate3d(0,0,0); }
        }
      `}</style>
      {activeView==="home"?(
        <div style={{display:"flex",flexDirection:"column",paddingBottom:12,...viewTransitionStyle}}>

          {/* ── HERO + PROGRESS RING — one seamless gradient section ───── */}
          <div style={{position:"relative",paddingTop:6,paddingBottom:2}}>
            <div style={{position:"absolute",left:0,right:0,top:0,bottom:0,background:"linear-gradient(180deg,rgba(26,31,68,0.98) 0%,rgba(9,12,22,0.98) 32%,rgba(8,10,19,0.72) 74%,transparent 100%)",pointerEvents:"none"}} />

            {/* status chip */}
            <div style={{position:"relative",display:"flex",justifyContent:"center",marginBottom:6}}>
              {!firstTrainingStart ? null : !hasCalendarStarted ? (
                <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(148,163,184,0.06)",border:"1px solid rgba(148,163,184,0.1)",borderRadius:999,padding:"4px 11px"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"#475569",display:"inline-block"}}/>
                  <span style={{fontSize:11,color:"#475569",fontWeight:700}}>Plan startet am {blockStartLabel}</span>
                </div>
              ) : (
                <div style={{display:"inline-flex",alignItems:"center",gap:6,background:"rgba(56,189,248,0.08)",border:"1px solid rgba(56,189,248,0.16)",borderRadius:999,padding:"4px 11px"}}>
                  <span style={{width:5,height:5,borderRadius:"50%",background:"#38bdf8",boxShadow:"0 0 5px #38bdf8",display:"inline-block"}}/>
                  <span style={{fontSize:11,color:"#7dd3fc",fontWeight:700}}>Training läuft</span>
                </div>
              )}
            </div>

            {/* session title */}
            <div style={{position:"relative",textAlign:"center",padding:"0 20px"}}>
              <div style={{fontSize:34,lineHeight:1,marginBottom:4}}>{dashboardType.emoji}</div>
              <div style={{fontSize:38,fontWeight:800,color:"#fff",lineHeight:1.03,letterSpacing:"-0.04em",maxWidth:320,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"center",gap:10,flexWrap:"wrap"}}>
                {dashboardDone ? (
                  <span style={{fontSize:36,color:"#4ade80",lineHeight:1}} aria-hidden>✓</span>
                ) : null}
                <span>{getHeroTitle(dashboardSession)}</span>
                {dashboardDone ? (
                  <span style={{fontSize:12,fontWeight:800,color:"#86efac",padding:"4px 10px",borderRadius:999,background:"rgba(16,185,129,0.2)",border:"1px solid rgba(16,185,129,0.35)"}}>Erledigt</span>
                ) : null}
              </div>
              <div style={{fontSize:13,color:"rgba(226,232,240,0.62)",fontWeight:650,marginTop:4,letterSpacing:"0.01em",lineHeight:1.45}}>
                {dashboardHealthDone ? (
                  <span style={{color:"#86efac",fontWeight:700}}>
                    Mit Einheit verknüpft · Apple Health{runIntelLabel ? ` · ${runIntelLabel}` : ""}
                  </span>
                ) : dashboardDone ? (
                  <span style={{color:"#86efac",fontWeight:700}}>Heute erledigt</span>
                ) : (
                  <>
                    {dashboardSession ? dashboardType.label : "Keine Einheit geplant"}
                    {dashboardSession?.km ? (
                      <span style={{color:dashboardType.col,marginLeft:8,fontWeight:700}}>
                        · {dashboardSession.km} km{dashboardSession.pace ? ` ${dashboardSession.pace}` : ""}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            {/* progress ring */}
            <div style={{position:"relative",marginTop:0,marginBottom:0,padding:"0 10px",display:"flex",flexDirection:"column",alignItems:"center"}}>
              <div style={{position:"relative",width:204,height:204}}>
                <svg viewBox="0 0 120 120" style={{width:"100%",height:"100%",display:"block"}}>
                  <defs>
                    <linearGradient id="prepRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4ade80" />
                      <stop offset="100%" stopColor="#ecfdf5" />
                    </linearGradient>
                    <filter id="prepRingGlow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="0.7" />
                    </filter>
                  </defs>
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke="rgba(148,163,184,0.14)"
                    strokeWidth="8.5"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={ringRadius}
                    fill="none"
                    stroke="url(#prepRingGrad)"
                    strokeWidth="9.8"
                    strokeLinecap="round"
                    strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                    strokeDashoffset={ringDashOffset}
                    transform="rotate(-90 60 60)"
                    filter="url(#prepRingGlow)"
                    style={{transition:"stroke-dashoffset .5s ease-out"}}
                  />
                </svg>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:48,fontWeight:800,color:"#f8fafc",lineHeight:1,letterSpacing:"-0.03em"}}>{prepProgressPct}%</div>
                  <div
                    style={{
                      fontSize:9,
                      fontWeight:700,
                      color:"rgba(226,232,240,0.5)",
                      marginTop:6,
                      letterSpacing:"0.04em",
                      textAlign:"center",
                      lineHeight:1.25,
                      maxWidth:150,
                    }}
                  >
                    Gesamter Fortschritt der Vorbereitung
                  </div>
                </div>
              </div>
              <div style={{marginTop:4,marginBottom:0,fontSize:13,fontWeight:600,color:"rgba(226,232,240,0.62)"}}>
                {ringKmDoneDisplay} von {ringKmPlannedDisplay} km
              </div>
            </div>
          </div>

          {/* ── ACTION BUTTONS ─────────────────────────────────────────── */}
          <div style={{display:"flex",gap:10,padding:"0 16px 10px"}}>
            <button
              className="dashboard-action"
              onClick={()=>dashboardSession && quickCompleteSession(dashboardSession)}
              disabled={!dashboardSession}
              style={{flex:1,background:"rgba(16,185,129,0.22)",border:"1px solid rgba(16,185,129,0.34)",color:dashboardSession ? "#d1fae5" : "#374151",borderRadius:999,padding:"14px 12px",cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:14,fontWeight:800,boxShadow:"0 8px 24px rgba(16,185,129,0.08)"}}
            >
              ✓ Done
            </button>
            <button
              className="dashboard-action"
              onClick={()=>dashboardSession && quickSkipSession(dashboardSession)}
              disabled={!dashboardSession}
              style={{flex:1,background:"rgba(239,68,68,0.16)",border:"1px solid rgba(248,113,113,0.26)",color:dashboardSession ? "#fecaca" : "#374151",borderRadius:999,padding:"14px 12px",cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:14,fontWeight:800,boxShadow:"0 8px 24px rgba(248,113,113,0.07)"}}
            >
              Skip
            </button>
            <button
              className="dashboard-action"
              onClick={()=>dashboardSession && openModal(dashboardSession)}
              disabled={!dashboardSession}
              style={{width:50,height:50,flexShrink:0,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(148,163,184,0.13)",color:dashboardSession ? "#94a3b8" : "#1e293b",borderRadius:999,cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}
              aria-label="Details öffnen"
            >
              ⓘ
            </button>
          </div>

          {/* ── BELOW-FOLD CONTENT ─────────────────────────────────────── */}
          <div style={{display:"flex",flexDirection:"column",gap:8,padding:"0 16px 0"}}>

            {/* Daily coach decision card */}
            <button
              type="button"
              onClick={() => navigateToView("coach")}
              style={{
                width:"100%",
                textAlign:"left",
                cursor:"pointer",
                borderRadius:18,
                border:"1px solid rgba(56,189,248,0.22)",
                background:"linear-gradient(160deg,rgba(12,22,36,0.92),rgba(10,16,28,0.88))",
                padding:"14px 16px",
                display:"flex",
                flexDirection:"column",
                gap:6,
                color:"#e2e8f0",
              }}
            >
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.1em",color:"#7c8aa5",fontWeight:700}}>Heutige Einschätzung</div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                <span style={{fontSize:15,fontWeight:800,color:"#f8fafc"}}>Coach &amp; Details</span>
                <span style={{fontSize:12,fontWeight:800,padding:"5px 12px",borderRadius:999,background:healthSuggestPending ? "rgba(251,191,36,0.16)" : todayCompletedViaAssignedRun ? "rgba(16,185,129,0.2)" : "rgba(56,189,248,0.12)",color:healthSuggestPending ? "#fcd34d" : todayCompletedViaAssignedRun ? "#86efac" : "#7dd3fc",border:`1px solid ${healthSuggestPending ? "rgba(251,191,36,0.35)" : todayCompletedViaAssignedRun ? "rgba(16,185,129,0.35)" : "rgba(56,189,248,0.28)"}`}}>
                  {healthSuggestPending ? "Lauf erkannt" : runIntelLabel || (todayCompletedViaAssignedRun ? "Erledigt" : "Wie geplant")}
                </span>
              </div>
              {runIntelFeedback ? (
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45, marginTop: 2 }}>{runIntelFeedback}</div>
              ) : null}
              {healthSuggestPending ? (
                <div style={{ fontSize: 11, color: "#7dd3fc", marginTop: 2 }}>Apple Health Lauf erkannt — bitte „Für heute übernehmen“.</div>
              ) : null}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(148,163,184,0.12)" }}>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 800,
                    padding: "4px 10px",
                    borderRadius: 999,
                    marginBottom: 6,
                    background:
                      trainingLoadRec.status === "red"
                        ? "rgba(248,113,113,0.16)"
                        : trainingLoadRec.status === "yellow"
                          ? "rgba(251,191,36,0.14)"
                          : "rgba(16,185,129,0.14)",
                    color:
                      trainingLoadRec.status === "red"
                        ? "#fecaca"
                        : trainingLoadRec.status === "yellow"
                          ? "#fcd34d"
                          : "#86efac",
                    border: `1px solid ${
                      trainingLoadRec.status === "red"
                        ? "rgba(248,113,113,0.35)"
                        : trainingLoadRec.status === "yellow"
                          ? "rgba(251,191,36,0.32)"
                          : "rgba(16,185,129,0.3)"
                    }`,
                  }}
                >
                  {trainingLoadRec.label}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.45 }}>{trainingLoadRec.feedback}</div>
              </div>
            </button>

            {/* Metrics group — cleaner, softer and less boxy */}
            <div style={{display:"flex",flexDirection:"column",gap:9,padding:"12px",borderRadius:20,background:"linear-gradient(160deg,rgba(15,23,42,0.33),rgba(12,18,34,0.2))",border:"1px solid rgba(148,163,184,0.1)"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8}}>
                <div style={{padding:"10px 6px",textAlign:"center",borderRadius:14,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:5}}>Recovery</div>
                  <div style={{fontSize:16,fontWeight:800,color:recoveryState.tone,lineHeight:1}}>{recoveryState.label}</div>
                </div>
                <div style={{padding:"10px 6px",textAlign:"center",borderRadius:14,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:5}}>Last</div>
                  <div style={{fontSize:16,fontWeight:800,color:weeklyFatigue.color,lineHeight:1}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
                </div>
                <div style={{padding:"10px 6px",textAlign:"center",borderRadius:14,background:"rgba(15,23,42,0.34)"}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.09em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:5}}>Streak</div>
                  <div style={{fontSize:16,fontWeight:800,color:"#c4b5fd",lineHeight:1}}>
                    {consistencyStats.sessionStreak}<span style={{fontSize:10,color:"rgba(148,163,184,0.48)",marginLeft:2}}>×</span>
                  </div>
                </div>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
                {[
                  { label: "Plan", value: `${prepProgressPct}%`, sub: `${ringKmDoneDisplay} / ${ringKmPlannedDisplay} km gesamt`, color: "#10b981" },
                  { label: "km", value: `${Math.round(loggedKm)}`, sub: `${kmPct}%`, color: "#38bdf8" },
                  { label: "Long", value: `${doneLongRuns}/${longRuns}`, sub: "done", color: "#f59e0b" },
                  { label: "Quality", value: `${doneHardSessions}/${hardSessions}`, sub: "done", color: "#fb7185" },
                ].map(m=>(
                  <div
                    key={m.label}
                    style={{
                      padding: "11px 10px",
                      borderRadius: 14,
                      background: "rgba(15,23,42,0.28)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      textAlign: "center",
                      gap: 5,
                    }}
                  >
                    <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"rgba(148,163,184,0.48)",fontWeight:700}}>{m.label}</div>
                    <div style={{fontSize:17,fontWeight:800,color:m.color,lineHeight:1.05}}>{m.value}</div>
                    <div style={{fontSize:11,color:"rgba(148,163,184,0.5)"}}>{m.sub}</div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      ):activeView==="week"?(
        <>
          <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
            <div style={{background:"linear-gradient(160deg,rgba(16,19,39,0.96),rgba(12,15,28,0.92))",border:"1px solid rgba(148,163,184,0.1)",borderRadius:22,padding:16,boxShadow:"0 20px 40px rgba(2,6,23,0.22)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <button onClick={()=>setWIdx(i=>Math.max(0,i-1))} disabled={wIdx===0} style={{background:wIdx===0?"rgba(15,23,42,0.7)":"#1e293b",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",width:38,height:38,borderRadius:12,cursor:wIdx===0?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
                <div style={{flex:1,textAlign:"center",minWidth:0}}>
                  <span style={{display:"inline-block",padding:"5px 12px",borderRadius:999,fontSize:11,fontWeight:700,background:ph.bg,color:ph.col,marginBottom:8}}>{ph.emoji} {ph.label}</span>
                  <div style={{fontSize:18,fontWeight:800,color:"#fff"}}>{w.label}</div>
                  <div style={{fontSize:12,color:"#7c8aa5",marginTop:4}}>{w.dates} · {w.km} km</div>
                </div>
                <button onClick={()=>setWIdx(i=>Math.min(PLAN.length-1,i+1))} disabled={wIdx===PLAN.length-1} style={{background:wIdx===PLAN.length-1?"rgba(15,23,42,0.7)":"#1e293b",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",width:38,height:38,borderRadius:12,cursor:wIdx===PLAN.length-1?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:16}}>
                <MetricCard label="Ziel" value={`${w.km} km`} sublabel="diese Woche" accent="#38bdf8" />
                <MetricCard label="Ist" value={`${wLoggedKm.toFixed(1)} km`} sublabel={`${Math.round(clampPct(w.km > 0 ? (wLoggedKm / w.km) * 100 : 0))}% erledigt`} accent="#10b981" />
              </div>

              <div style={{marginTop:14}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#7c8aa5",marginBottom:6}}>
                  <span>Wochenfortschritt</span>
                  <span>{wLoggedKm.toFixed(1)} / {w.km} km</span>
                </div>
                <div style={{height:7,background:"rgba(15,23,42,0.85)",borderRadius:999,overflow:"hidden"}}>
                  <div style={{height:"100%",background:"linear-gradient(90deg,#10b981,#38bdf8)",borderRadius:999,width:`${clampPct(w.km > 0 ? (wLoggedKm / w.km) * 100 : 0)}%`,transition:"width .3s"}}/>
                </div>
              </div>

              <div style={{marginTop:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                <div style={{padding:"10px 12px",borderRadius:14,background:"rgba(10,14,26,0.72)",border:`1px solid ${weeklyFatigue.color}33`}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:5}}>Last</div>
                  <div style={{fontSize:15,fontWeight:800,color:weeklyFatigue.color}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
                </div>
                <div style={{padding:"10px 12px",borderRadius:14,background:"rgba(10,14,26,0.72)",border:`1px solid ${coachingHint.color}33`}}>
                  <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:5}}>Coach</div>
                  <div style={{fontSize:13,fontWeight:700,color:coachingHint.color,lineHeight:1.3}}>{coachingHint.title}</div>
                </div>
              </div>
            </div>

            <WeeklyAnalysisCard weekLabel={w.label} weekDates={w.dates} analysis={weekAnalysis} />

            <div style={{display:"flex",flexDirection:"column",gap:10,marginTop:2}}>
              {w.s.length === 0 && (
                <div style={{background:"rgba(11,16,28,0.94)",border:"1px solid rgba(148,163,184,0.1)",borderRadius:18,padding:18,fontSize:13,color:"#94a3b8",lineHeight:1.6}}>
                  Für diese Woche sind keine Einheiten im Plan hinterlegt.
                </div>
              )}
              {w.s.map(session=>{
                const ti=TI[session.type];
                const log=logs[session.id];
                const status = getSessionStatus(log);
                const isDone=status==="done";
                const isSkipped=status==="skipped";
                const statusTone = getSessionStatusTone(log, ti.col);
                const milestones = getSessionMilestones(session, w);
                const hasHint = session.type !== "rest";
                return(
                  <div
                    key={session.id}
                    onClick={()=>hasHint&&openModal(session)}
                    style={{
                      background:isDone
                        ?"linear-gradient(160deg,rgba(7,36,31,0.94),rgba(13,19,32,0.96))"
                        : isSkipped
                          ?"linear-gradient(160deg,rgba(40,14,14,0.9),rgba(18,18,30,0.96))"
                          :"linear-gradient(160deg,rgba(18,18,36,0.98),rgba(11,16,28,0.94))",
                      borderRadius:18,
                      padding:"14px 14px 15px",
                      display:"flex",
                      gap:12,
                      alignItems:"flex-start",
                      cursor:hasHint?"pointer":"default",
                      opacity:session.type==="rest"?0.78:1,
                      border:`1px solid ${isDone?"rgba(16,185,129,0.26)":isSkipped?"rgba(248,113,113,0.2)":"rgba(148,163,184,0.1)"}`,
                      boxShadow:isDone?"0 12px 30px rgba(16,185,129,0.08)":isSkipped?"0 12px 28px rgba(248,113,113,0.08)":"0 14px 32px rgba(2,6,23,0.16)"
                    }}
                  >
                    <div style={{width:42,flexShrink:0,textAlign:"center"}}>
                      <div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.08em"}}>{session.day}</div>
                      <div style={{marginTop:8,width:42,height:42,borderRadius:14,background:`${ti.col}1a`,border:`1px solid ${ti.col}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20}}>{ti.emoji}</div>
                    </div>

                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",justifyContent:"space-between",gap:8,alignItems:"flex-start",flexWrap:"wrap"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:8,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                            <span style={{fontSize:11,padding:"4px 9px",borderRadius:999,background:`${ti.col}22`,color:ti.col,fontWeight:700}}>{getSessionTypeLabel(session.type)}</span>
                            <span style={{fontSize:11,padding:"4px 9px",borderRadius:999,background:statusTone.background,color:statusTone.color,fontWeight:700,border:`1px solid ${statusTone.border}`}}>
                              {getSessionStatusLabel(log)}
                            </span>
                            {log?.assignedRun?.runId ? (
                              <span style={{fontSize:11,padding:"4px 9px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#7dd3fc",fontWeight:700,border:"1px solid rgba(56,189,248,0.28)"}}>
                                {log?.runEvaluation?.label ? `${log.runEvaluation.label} · ` : ""}Mit Einheit verknüpft ✔
                              </span>
                            ) : log?.suggestedHealthRunId ? (
                              <span style={{fontSize:11,padding:"4px 9px",borderRadius:999,background:"rgba(251,191,36,0.14)",color:"#fcd34d",fontWeight:700,border:"1px solid rgba(251,191,36,0.28)"}}>Apple Health Lauf erkannt</span>
                            ) : null}
                            {milestones.map((milestone)=>(
                              <span key={milestone.label} style={{fontSize:11,padding:"4px 9px",borderRadius:999,background:`${milestone.color}1f`,color:milestone.color,fontWeight:700}}>
                                {milestone.emoji} {milestone.label}
                              </span>
                            ))}
                          </div>
                          <div>
                            <div style={{fontSize:15,fontWeight:700,color:"#fff",lineHeight:1.35}}>{session.title}</div>
                            <div style={{fontSize:12,color:"#7c8aa5",marginTop:5}}>{session.date}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          {hasHint && !isDone && !isSkipped && <div style={{fontSize:11,color:"#4b5563",fontWeight:700,whiteSpace:"nowrap"}}>Details</div>}
                          {hasHint && (
                            <button
                              onClick={(e)=>{e.stopPropagation(); quickCompleteSession(session);}}
                              style={{
                                width:34,
                                height:34,
                                borderRadius:12,
                                border:`1px solid ${isDone?"rgba(16,185,129,0.28)":"rgba(148,163,184,0.14)"}`,
                                background:isDone?"rgba(16,185,129,0.18)":"rgba(15,23,42,0.82)",
                                color:isDone?"#86efac":"#cbd5e1",
                                cursor:"pointer",
                                fontSize:16,
                                fontWeight:800,
                                transition:"transform .18s ease, background .18s ease"
                              }}
                              aria-label={`${session.title} schnell als erledigt markieren`}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      </div>

                      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:10}}>
                        {session.km > 0 && <div style={{fontSize:12,color:"#38bdf8",fontWeight:700}}>{session.km} km Ziel</div>}
                        {session.pace && <div style={{fontSize:12,color:"#c084fc",fontWeight:700}}>⏱ {session.pace}</div>}
                      </div>

                      <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6,marginTop:10}}>{session.desc}</div>

                      {log ? (
                        <div style={{marginTop:10,padding:"8px 10px",borderRadius:12,background:"rgba(15,23,42,0.5)",border:"1px solid rgba(148,163,184,0.08)"}}>
                          <div style={{fontSize:12,color:"#f8fafc",lineHeight:1.5}}>
                            {getSessionStatusLabel(log)}
                            {log.feeling > 0 ? ` · ${"★".repeat(log.feeling)}` : ""}
                            {log.actualKm ? ` · ${log.actualKm} km` : ""}
                            {log.notes ? ` · ${log.notes.substring(0, 60)}${log.notes.length > 60 ? "…" : ""}` : ""}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",justifyContent:"center",gap:8,padding:"4px 2px 6px",flexWrap:"wrap"}}>
              {PLAN.map((week,i)=>{
                const weekDone=week.s.filter(session=>isSessionLogDone(logs[session.id])).length;
                const weekSkipped=week.s.filter(session=>logs[session.id]?.skipped).length;
                const weekTotal=week.s.filter(session=>session.type!=="rest").length;
                const full=weekTotal>0&&weekDone===weekTotal;
                return(
                  <button key={week.wn} onClick={()=>setWIdx(i)} style={{width:i===wIdx?28:10,height:10,borderRadius:999,cursor:"pointer",background:i===wIdx?"#f8fafc":full?"#10b981":weekSkipped>0?"#f87171":weekDone>0?"#38bdf8":"#1e293b",border:"none",transition:"all .2s"}} aria-label={`Woche ${week.wn} öffnen`} />
                );
              })}
            </div>
          </div>
        </>
      ):activeView==="performance"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
          <MarathonPredictionCard
            variant="full"
            prediction={marathonPrediction}
            targetTimeLabel={targetTimeDisplay}
            confidenceLabel={marathonConfidenceLabel}
            coachHints={coachHints}
          />

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
            <SurfaceCard>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Recovery</div>
              <div style={{fontSize:20,fontWeight:800,color:recoveryState.tone,lineHeight:1.1}}>{recoveryState.label}</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Wochenlast</div>
              <div style={{fontSize:20,fontWeight:800,color:weeklyFatigue.color,lineHeight:1.1}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Streak</div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff",lineHeight:1.1}}>{consistencyStats.sessionStreak} <span style={{fontSize:13,fontWeight:600,color:"#94a3b8"}}>Tage</span></div>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>{consistencyStats.weeklyStreak} Wochen</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>{marathonPrediction.ready ? "Gesamtplan" : "Formprognose"}</div>
              <div style={{fontSize:22,fontWeight:800,color:predictionReadiness.ready ? "#fff" : "#cbd5e1",marginBottom:4}}>{performancePrediction.predictedTime}</div>
              {!marathonPrediction.ready && <div style={{fontSize:12,color:"#94a3b8"}}>{performancePrediction.trend}{predictionReadiness.ready ? ` · ${performancePrediction.confidence}` : ""}</div>}
            </SurfaceCard>
          </div>

          <SurfaceCard>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Lesart</div>
            <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6}}>{recommendedAction}</div>
          </SurfaceCard>
        </div>
      ):activeView==="overview"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
          {doneSess === 0 && (
            <div style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(148,163,184,0.08)",borderRadius:18,padding:"12px 14px"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:4}}>Log startet hier</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>Erste Einheit abhaken → Prognose und Momentum starten.</div>
            </div>
          )}

          <SurfaceCard>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>Planübersicht</div>
              <div style={{fontSize:12,color:"#94a3b8"}}>
                <span style={{color:ph.col,fontWeight:700}}>{ph.emoji} {ph.label}</span>
                {nextKeySession ? <span> · {nextKeySession.title}</span> : <span> · Alle Keys geloggt</span>}
              </div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:10}}>Race Strategy</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginBottom:10}}>
              <MetricCard label="Zielzeit" value={targetTimeDisplay} sublabel="Marathon" accent="#10b981" />
              <MetricCard label="Pace" value={targetPaceDisplay} sublabel="pro km" accent="#38bdf8" />
            </div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,display:"flex",flexDirection:"column",gap:4}}>
              <div><span style={{color:"#e2e8f0",fontWeight:700}}>HM:</span> ~1:25 — entspannt anlaufen</div>
              <div><span style={{color:"#e2e8f0",fontWeight:700}}>km 25+:</span> Rhythmus halten</div>
              <div><span style={{color:"#e2e8f0",fontWeight:700}}>km 32+:</span> in Abschnitte denken, nachlegen</div>
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:12}}>Recovery Verlauf</div>
            <div style={{display:"flex",alignItems:"end",gap:8,overflowX:"auto",paddingBottom:4}}>
              {recoveryHistory.map((item)=>(
                <div key={item.label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:8,minWidth:32}}>
                  <div style={{height:92,width:18,borderRadius:999,background:"rgba(15,23,42,0.9)",display:"flex",alignItems:"end",padding:2}}>
                    <div style={{width:"100%",height:`${Math.max(10, item.score)}%`,borderRadius:999,background:item.complete?"linear-gradient(180deg,#10b981,#38bdf8)":"linear-gradient(180deg,#f59e0b,#f87171)"}} />
                  </div>
                  <div style={{fontSize:10,color:"#94a3b8",fontWeight:700}}>{item.label}</div>
                </div>
              ))}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:8}}>Teilen</div>
            <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.7,whiteSpace:"pre-line"}}>{shareSummary}</div>
            <button onClick={copyShareSummary} style={{marginTop:12,background:"rgba(56,189,248,0.18)",color:"#dbeafe",border:"1px solid rgba(56,189,248,0.28)",borderRadius:12,padding:"10px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}>
              Zusammenfassung kopieren
            </button>
            {shareFeedback && <div style={{fontSize:11,color:"#94a3b8",marginTop:8}}>{shareFeedback}</div>}
          </SurfaceCard>

          <SurfaceCard>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:6}}>
              <div style={{fontSize:16,fontWeight:800,color:"#fff"}}>Alle Wochen</div>
              <div style={{fontSize:11,color:"#94a3b8"}}>Längster Lauf: {LONGEST_LONG_RUN_KM} km</div>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:14}}>
              {[{ key: "all", label: "Alle Phasen" }, ...PHASE_ORDER.map((phaseKey) => ({ key: phaseKey, label: PI[phaseKey].label }))].map((item)=>(
                <FilterChip key={item.key} active={overviewPhaseFilter===item.key} onClick={()=>setOverviewPhaseFilter(item.key)}>
                  {item.label}
                </FilterChip>
              ))}
            </div>

            {visibleOverviewPhases.map(phaseKey=>{
              const phaseWeeks=PLAN.filter(week=>week.phase===phaseKey);
              const phase=PI[phaseKey];
              return(
                <div key={phaseKey} style={{marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:800,color:phase.col,marginBottom:10}}>{phase.emoji} {phase.label}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {phaseWeeks.map(week=>{
                      const idx=PLAN.indexOf(week);
                      const weekDone=week.s.filter(session=>isSessionLogDone(logs[session.id])).length;
                      const weekSkipped=week.s.filter(session=>logs[session.id]?.skipped).length;
                      const weekTotal=week.s.filter(session=>session.type!=="rest").length;
                      const weekPct=weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
                      const phaseHasPeak = week.km >= 90;
                      return(
                        <button
                          key={week.wn}
                          onClick={()=>{setWIdx(idx);setView("week");}}
                          style={{background:"rgba(11,15,28,0.9)",borderRadius:16,padding:"12px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"1px solid rgba(148,163,184,0.1)",textAlign:"left"}}
                        >
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{week.label}</div>
                            <div style={{fontSize:11,color:"#7c8aa5",marginTop:4}}>{week.dates} · {week.km} km</div>
                            {phaseHasPeak && <div style={{fontSize:11,color:"#10b981",marginTop:6,fontWeight:700}}>🔥 Peak Woche</div>}
                            {weekSkipped > 0 && <div style={{fontSize:11,color:"#fca5a5",marginTop:6,fontWeight:700}}>⏭ {weekSkipped} ausgelassen</div>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10,marginLeft:10}}>
                            <div style={{width:64,height:6,background:"#0b0f1c",borderRadius:999,overflow:"hidden"}}>
                              <div style={{height:"100%",background:phase.col,borderRadius:999,width:`${weekPct}%`}}/>
                            </div>
                            <div style={{fontSize:12,fontWeight:700,color:phase.col,minWidth:38,textAlign:"right"}}>{weekDone}/{weekTotal}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </SurfaceCard>
        </div>
      ):activeView==="coach"?(
        <div style={{display:"flex",flexDirection:"column",gap:12,...viewTransitionStyle}}>
          <div style={{padding:"0 16px"}}>
            <DailyCoachDecisionCard
              decision={dailyCoachDecision}
              onGoToCoach={() => {}}
              onAdjustPlan={() => {
                if (dashboardSession) {
                  openModal(dashboardSession);
                }
              }}
            />
          </div>
          <AiCoachPanel
            getContext={buildCurrentAiContext}
            onApplyPlanPatches={handleAiApplyPlanPatches}
            onNavigate={handleAiNavigate}
          />
        </div>
      ):activeView==="settings"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:14}}>Einstellungen</div>
            {aiNavHint?.screen === "settings" && (
              <div style={{fontSize:11,color:"#7dd3fc",marginBottom:10,background:"rgba(56,189,248,0.12)",border:"1px solid rgba(56,189,248,0.28)",borderRadius:10,padding:"8px 10px"}}>
                AI Navigation: {aiNavHint.section === "race_goal" ? "Rennziel" : aiNavHint.section}
              </div>
            )}
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Zielzeit</div>
            <input
              type="text"
              value={preferences.targetTime}
              onChange={(e)=>setPreferences((prev)=>({...prev,targetTime:e.target.value}))}
              placeholder="2:49:50"
              style={{width:"100%",background:"#070b16",border:aiNavHint?.screen === "settings" && aiNavHint?.section === "race_goal" ? "1px solid rgba(56,189,248,0.5)" : "1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"11px 12px",color:"#e2e8f0",fontSize:14,boxSizing:"border-box",marginBottom:6,boxShadow:aiNavHint?.screen === "settings" && aiNavHint?.section === "race_goal" ? "0 0 0 2px rgba(56,189,248,0.2)" : "none"}}
            />
            <div style={{fontSize:11,color:"#64748b"}}>Format: hh:mm:ss</div>
          </SurfaceCard>

          {Capacitor.getPlatform() === "ios" ? (
            <SurfaceCard>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:10}}>Apple Health · Lauf zuordnen</div>
              {healthKitAvailable === null ? (
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:8}}>Checking Apple Health…</div>
              ) : null}
              {healthKitAvailable === false ? (
                <div style={{fontSize:12,color:"#fca5a5",marginBottom:8}}>Health data is not available on this device.</div>
              ) : null}
              <div
                style={{
                  fontSize:13,
                  fontWeight:700,
                  marginBottom:8,
                  color:isHealthConnected ? "#86efac" : "#94a3b8",
                  lineHeight:1.45,
                }}
              >
                {isHealthConnected ? "Connected to Apple Health" : "Not connected — tap Connect Apple Health"}
              </div>
              {appleHealthFetchStats ? (
                <div style={{fontSize:12,color:"#94a3b8",marginBottom:8,lineHeight:1.5}}>
                  <div>Total workouts: {appleHealthFetchStats.total}</div>
                  <div>Running workouts: {appleHealthFetchStats.running}</div>
                </div>
              ) : null}
              {appleHealthFetchStats && appleHealthFetchStats.total === 0 ? (
                <div style={{fontSize:12,color:"#fca5a5",marginBottom:10,lineHeight:1.45}}>
                  No Apple Health workouts found at all. Make sure you recorded runs via Apple Watch or a fitness app.
                </div>
              ) : null}
              {appleHealthFetchStats && appleHealthFetchStats.total > 0 && appleHealthFetchStats.running === 0 ? (
                <div style={{fontSize:12,color:"#fbbf24",marginBottom:10,lineHeight:1.45}}>
                  HealthKit returned workouts, but none are typed as Running (HKWorkoutActivityType.running → workoutType running in JS). Check Total above — some apps save indoor runs as Other.
                </div>
              ) : null}
              <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:8}}>
                {!isHealthConnected ? (
                  <button
                    type="button"
                    onClick={() => handleAppleHealthConnectInSettings()}
                    disabled={healthAppleConnectBusy || healthKitAvailable !== true}
                    style={{
                      background:"rgba(16,185,129,0.16)",
                      border:"1px solid rgba(52,211,153,0.4)",
                      borderRadius:12,
                      padding:"10px 14px",
                      color:"#6ee7b7",
                      fontSize:13,
                      fontWeight:700,
                      cursor:healthAppleConnectBusy || healthKitAvailable !== true ? "default" : "pointer",
                      opacity:healthAppleConnectBusy || healthKitAvailable !== true ? 0.55 : 1,
                    }}
                  >
                    {healthAppleConnectBusy ? "Connecting…" : "Connect Apple Health"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => reloadHealthRunsFromApple()}
                  disabled={healthRunsFetchBusy || healthKitAvailable !== true}
                  style={{
                    background:"rgba(56,189,248,0.18)",
                    border:"1px solid rgba(56,189,248,0.35)",
                    borderRadius:12,
                    padding:"10px 14px",
                    color:"#7dd3fc",
                    fontSize:13,
                    fontWeight:700,
                    cursor:healthRunsFetchBusy || healthKitAvailable !== true ? "default" : "pointer",
                    opacity:healthRunsFetchBusy || healthKitAvailable !== true ? 0.55 : 1,
                  }}
                >
                  {healthRunsFetchBusy ? "Refreshing…" : "Refresh workouts"}
                </button>
              </div>
              {appleHealthConnectFeedback ? (
                <div
                  style={{
                    fontSize:12,
                    lineHeight:1.45,
                    marginBottom:8,
                    color:appleHealthConnectFeedback.tone === "ok" ? "#86efac" : "#fca5a5",
                    fontWeight:650,
                  }}
                >
                  {appleHealthConnectFeedback.text}
                </div>
              ) : null}
              {appleHealthLoadFeedback ? (
                <div
                  style={{
                    fontSize:12,
                    lineHeight:1.45,
                    marginBottom:10,
                    color:appleHealthLoadFeedback.tone === "ok" ? "#86efac" : "#fca5a5",
                    fontWeight:650,
                  }}
                >
                  {appleHealthLoadFeedback.text}
                </div>
              ) : null}
              {!dashboardSession ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.5}}>Heute ist keine Trainingseinheit geplant – hier kannst du trotzdem Läufe aus Apple Health laden.</div>
                  {healthRuns.length === 0 && appleHealthFetchStats == null ? (
                    <div style={{fontSize:13,color:"#e2e8f0",fontWeight:650}}>Noch keine Läufe geladen — „Refresh workouts“ tippen.</div>
                  ) : null}
                </div>
              ) : dashboardHealthDone ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#86efac"}}>Lauf übernommen ✅</div>
                  {(() => {
                    const ar = dashboardLog?.assignedRun;
                    if (!ar?.runId) return null;
                    const start = ar.startDate ? new Date(ar.startDate) : null;
                    const timeLabel = start
                      ? start.toLocaleString("de-DE", { weekday:"short", day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" })
                      : "—";
                    const durMin = typeof ar.duration === "number" && ar.duration > 0 ? Math.max(1, Math.round(ar.duration / 60)) : null;
                    return (
                      <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.55}}>
                        <div><span style={{color:"#7c8aa5"}}>Distanz:</span> {typeof ar.distanceKm === "number" ? `${ar.distanceKm} km` : "—"}</div>
                        <div><span style={{color:"#7c8aa5"}}>Start:</span> {timeLabel}</div>
                        {durMin != null ? <div><span style={{color:"#7c8aa5"}}>Dauer:</span> ca. {durMin} Min.</div> : null}
                      </div>
                    );
                  })()}
                  <button
                    type="button"
                    onClick={() => clearHealthRunAssignment(dashboardSession)}
                    style={{
                      alignSelf:"flex-start",
                      background:"rgba(15,23,42,0.85)",
                      border:"1px solid rgba(148,163,184,0.2)",
                      borderRadius:12,
                      padding:"10px 14px",
                      color:"#cbd5e1",
                      fontSize:13,
                      fontWeight:700,
                      cursor:"pointer",
                    }}
                  >
                    Zurücksetzen
                  </button>
                </div>
              ) : healthRuns.length === 0 ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:13,color:"#e2e8f0",fontWeight:650}}>
                    {appleHealthFetchStats && appleHealthFetchStats.total === 0
                      ? "No workouts found for the last 7 days."
                      : appleHealthFetchStats && appleHealthFetchStats.total > 0 && appleHealthFetchStats.running === 0
                        ? "No running workouts in the last 7 days (see note above)."
                        : appleHealthFetchStats == null
                          ? "Noch keine Läufe geladen — „Refresh workouts“ tippen."
                          : "Keine Läufe in der App — oben Total/Running prüfen."}
                  </div>
                </div>
              ) : appleHealthRecentRunsDesc.length === 0 ? (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.5}}>
                    No Apple Health runs found in the last 7 days.
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div style={{fontSize:12,color:"#7c8aa5",fontWeight:700,marginBottom:4}}>Latest run (newest in last 7 days)</div>
                  <div
                    style={{
                      fontSize:13,
                      color:"#cbd5e1",
                      lineHeight:1.6,
                      background:"rgba(15,23,42,0.75)",
                      border:"1px solid rgba(56,189,248,0.2)",
                      borderRadius:14,
                      padding:"12px 14px",
                    }}
                  >
                    {(() => {
                      const run = latestAppleHealthRun;
                      if (!run) return null;
                      const km = (run.distanceMeters || 0) / 1000;
                      const dateLabel = new Date(run.startDate).toLocaleString("de-DE", {
                        weekday:"short",
                        day:"2-digit",
                        month:"short",
                        year:"numeric",
                        hour:"2-digit",
                        minute:"2-digit",
                      });
                      const durMin =
                        typeof run.duration === "number" && run.duration > 0
                          ? Math.max(1, Math.round(run.duration / 60))
                          : null;
                      const hrLine =
                        typeof run.avgHeartRateBpm === "number" && run.avgHeartRateBpm > 0
                          ? (
                              <div>
                                <span style={{color:"#7c8aa5"}}>Avg heart rate:</span>{" "}
                                {Math.round(run.avgHeartRateBpm)} bpm
                              </div>
                            )
                          : null;
                      return (
                        <>
                          <div>
                            <span style={{color:"#7c8aa5"}}>Date:</span> {dateLabel}
                          </div>
                          <div>
                            <span style={{color:"#7c8aa5"}}>Distance:</span>{" "}
                            {km > 0 ? `${km.toFixed(2)} km` : "—"}
                          </div>
                          <div>
                            <span style={{color:"#7c8aa5"}}>Duration:</span>{" "}
                            {durMin != null ? `~${durMin} min` : "—"}
                          </div>
                          {hrLine}
                        </>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => assignHealthRunToSession(dashboardSession, latestAppleHealthRun)}
                    style={{
                      alignSelf:"flex-start",
                      background:"rgba(56,189,248,0.22)",
                      border:"1px solid rgba(56,189,248,0.45)",
                      borderRadius:12,
                      padding:"10px 14px",
                      color:"#e0f2fe",
                      fontSize:13,
                      fontWeight:800,
                      cursor:"pointer",
                    }}
                  >
                    Für heute übernehmen
                  </button>
                </div>
              )}
            </SurfaceCard>
          ) : null}

          <RaceCalculator />

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:10}}>Backup</div>
            <BackupControls logs={logs} onImportSuccess={setLogs} />
          </SurfaceCard>
        </div>
      ):null}

      </div>

      <div style={{position:"fixed",left:12,right:12,bottom:"calc(12px + env(safe-area-inset-bottom, 0px))",zIndex:90}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(6,minmax(0,1fr))",gap:6,background:"rgba(9,12,22,0.72)",border:"1px solid rgba(148,163,184,0.08)",borderRadius:24,padding:"10px 8px 11px",boxShadow:"0 20px 50px rgba(2,6,23,0.32)",backdropFilter:"blur(22px)"}}>
          {[
            { key: "home", label: homeTabLabel, icon: null },
            { key: "week", label: "Woche", icon: "▤" },
            { key: "performance", label: "Leistung", icon: "◔" },
            { key: "overview", label: "Übersicht", icon: "◎" },
            { key: "coach", label: "AI Coach", icon: "✦" },
            { key: "settings", label: "Einstellungen", icon: "⚙" },
          ].map((item)=>{
            const active = activeView === item.key;
            return (
              <button
                className="bottom-nav-btn"
                key={item.key}
                onClick={()=>navigateToView(item.key)}
                style={{
                  background:active ? "linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))" : "transparent",
                  border:"1px solid transparent",
                  color:active ? "#fff" : "rgba(148,163,184,0.88)",
                  borderRadius:18,
                  padding:"6px 6px 6px",
                  margin:0,
                  cursor:"pointer",
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  justifyContent:"center",
                  gap:4,
                }}
                aria-label={`${item.label} öffnen`}
              >
                <span
                  aria-hidden
                  style={{
                    width:16,
                    height:16,
                    display:"flex",
                    alignItems:"center",
                    justifyContent:"center",
                    fontSize:16,
                    lineHeight:1,
                    flexShrink:0,
                    opacity:item.icon ? (active ? 1 : 0.82) : 0,
                  }}
                >
                  {item.icon ?? ""}
                </span>
                <span style={{fontSize:item.key === "home" ? 11 : item.key === "settings" || item.key === "coach" ? 8.8 : 10,fontWeight:800,opacity:active ? 1 : 0.7,letterSpacing:item.key === "home" ? "0.08em" : "0",whiteSpace:"nowrap",margin:0,lineHeight:1}}>
                  {item.label}
                </span>
                <span style={{width:4,height:4,borderRadius:"50%",background:active ? "#fff" : "transparent",flexShrink:0,margin:0,boxShadow:active ? "0 0 10px rgba(255,255,255,0.5)" : "none"}} />
              </button>
            );
          })}
        </div>
      </div>

      {modal&&modalWeek&&modalWorkout&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(2,6,23,0.82)",display:"flex",alignItems:"stretch",justifyContent:"center",padding:0,zIndex:1000}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#0c1020 0%, #090d18 100%)",width:"100%",maxWidth:720,height:"100%",overflowY:"auto",borderLeft:"1px solid rgba(148,163,184,0.12)",borderRight:"1px solid rgba(148,163,184,0.12)"}}>
            <div style={{padding:"calc(18px + max(0px, env(safe-area-inset-top, 0px))) 16px 140px",display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div>
                  <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.12em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Session Details</div>
                  <div style={{fontSize:24,fontWeight:800,color:"#fff",lineHeight:1.15}}>{modal.title}</div>
                  <div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>{modal.day}, {modal.date} · {modalWeek.label}</div>
                </div>
                <button onClick={closeModal} style={{background:"rgba(15,23,42,0.8)",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",borderRadius:12,padding:"10px 12px",cursor:"pointer",fontSize:13}}>Schließen</button>
              </div>

              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:`${TI[modal.type].col}22`,color:TI[modal.type].col,fontWeight:700}}>{TI[modal.type].emoji} {getSessionTypeLabel(modal.type)}</span>
                {(() => {
                  const effLog = { ...(logs[modal.id] || {}), ...form, assignedRun: logs[modal.id]?.assignedRun };
                  const st = getSessionStatusTone(effLog, TI[modal.type].col);
                  return (
                    <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:st.background,color:st.color,fontWeight:700,border:`1px solid ${st.border}`}}>
                      {getSessionStatusLabel(effLog)}
                    </span>
                  );
                })()}
                {logs[modal.id]?.assignedRun?.runId ? (
                  <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#7dd3fc",fontWeight:700}}>Apple Health · {logs[modal.id].assignedRun.distanceKm} km</span>
                ) : null}
                {modal.km > 0 && <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(56,189,248,0.14)",color:"#38bdf8",fontWeight:700}}>Ziel: {modal.km} km</span>}
                {modal.pace && <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:"rgba(168,85,247,0.14)",color:"#c084fc",fontWeight:700}}>Pace: {modal.pace}</span>}
                {modalMilestones.map((milestone)=>(
                  <span key={milestone.label} style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:`${milestone.color}1f`,color:milestone.color,fontWeight:700}}>
                    {milestone.emoji} {milestone.label}
                  </span>
                ))}
              </div>

              <DetailBlock title="Warum diese Einheit?">
                <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.7}}>{getSessionWhy(modal, modalWeek)}</div>
              </DetailBlock>

              <DetailBlock title="Workout-Struktur">
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#38bdf8",marginBottom:4}}>Warm-up</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.warmup}</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#f59e0b",marginBottom:4}}>Main Set</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.mainSet}</div>
                  </div>
                  <div>
                    <div style={{fontSize:12,fontWeight:700,color:"#10b981",marginBottom:4}}>Cool-down</div>
                    <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.6}}>{modalWorkout.cooldown}</div>
                  </div>
                </div>
              </DetailBlock>

              <DetailBlock title="Coach-Hinweis">
                <div style={{fontSize:14,color:"#e2e8f0",lineHeight:1.7}}>{getCoachHint(modal, modalWeek)}</div>
              </DetailBlock>

              {modalFuelingHints.length > 0 && (
                <DetailBlock title="Fueling-Hinweise">
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {modalFuelingHints.map((hint) => (
                      <div key={hint} style={{fontSize:13,color:"#e2e8f0",lineHeight:1.7}}>
                        {hint}
                      </div>
                    ))}
                  </div>
                </DetailBlock>
              )}

              <DetailBlock title="Letzter gespeicherter Eintrag">
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
                  <MetricCard label="Status" value={getSessionStatusLabel(modalLog)} sublabel={modalLog?.at ? formatLogTimestamp(modalLog.at) : "Noch nicht gespeichert"} accent={isSessionLogDone(modalLog) ? "#10b981" : modalLog?.skipped ? "#f87171" : "#94a3b8"} />
                  <MetricCard label="Gefühl" value={modalLog?.feeling ? `${"★".repeat(modalLog.feeling)}` : "Keine"} sublabel={modalLog?.feeling ? `${modalLog.feeling}/5` : "Noch kein Rating"} accent="#f59e0b" />
                  <MetricCard label="Gelaufene km" value={modalLog?.assignedRun?.distanceKm != null ? String(modalLog.assignedRun.distanceKm) : modalLog?.actualKm || "—"} sublabel={modal.km > 0 ? `Ziel: ${modal.km} km` : "Keine Distanz geplant"} accent="#38bdf8" />
                  <MetricCard label="Notizen" value={modalLog?.notes ? "Vorhanden" : "Keine"} sublabel={modalLog?.notes || "Noch keine Notiz gespeichert"} accent="#c084fc" />
                </div>
              </DetailBlock>

              <DetailBlock title="Dein Eintrag">
                {modal.km>0&&(
                  <div style={{marginBottom:14}}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Tatsächliche km</label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder={`Ziel: ${modal.km} km`}
                      value={form.actualKm}
                      onChange={e=>setForm(f=>({...f,actualKm:e.target.value}))}
                      style={{width:"100%",background:"#070b16",border:"1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:14,boxSizing:"border-box"}}
                    />
                  </div>
                )}

                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8}}>Gefühl</label>
                  <div style={{display:"flex",gap:8}}>
                    {[1,2,3,4,5].map(n=>(
                      <button key={n} onClick={()=>setForm(f=>({...f,feeling:n}))} style={{flex:1,background:form.feeling>=n?"rgba(245,158,11,0.2)":"#070b16",border:`1px solid ${form.feeling>=n?"#f59e0b":"rgba(148,163,184,0.14)"}`,borderRadius:12,padding:"10px 0",cursor:"pointer",fontSize:18}}>
                        ⭐
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:12,color:"#94a3b8",textAlign:"center",marginTop:8}}>
                    {["","😓 Sehr schwer","😕 Schlecht","😐 Okay","😊 Gut","🔥 Fantastisch!"][form.feeling]}
                  </div>
                </div>

                <div style={{marginBottom:14}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:"#7c8aa5",textTransform:"uppercase",letterSpacing:".08em",marginBottom:6}}>Notizen</label>
                  <textarea
                    placeholder="Wie lief's? Besonderheiten? Stimmung?"
                    value={form.notes}
                    onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                    style={{width:"100%",background:"#070b16",border:"1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"12px 14px",color:"#e2e8f0",fontSize:13,boxSizing:"border-box",minHeight:92,resize:"vertical"}}
                  />
                </div>

                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"#e2e8f0",marginBottom:10}}>
                  <input type="checkbox" checked={form.done} onChange={e=>setForm(f=>({...f,done:e.target.checked,skipped:e.target.checked?false:f.skipped}))} style={{width:18,height:18,accentColor:"#10b981"}}/>
                  Als abgeschlossen markieren
                </label>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",fontSize:14,color:"#e2e8f0"}}>
                  <input type="checkbox" checked={form.skipped} onChange={e=>setForm(f=>({...f,skipped:e.target.checked,done:e.target.checked?false:f.done}))} style={{width:18,height:18,accentColor:"#f87171"}}/>
                  Als ausgelassen markieren
                </label>
              </DetailBlock>
            </div>

            <div style={{position:"sticky",bottom:0,padding:16,background:"linear-gradient(180deg,rgba(9,13,24,0) 0%, rgba(9,13,24,0.94) 18%, rgba(9,13,24,1) 100%)",borderTop:"1px solid rgba(148,163,184,0.08)"}}>
              <div style={{display:"flex",gap:10}}>
                <button onClick={closeModal} style={{flex:1,background:"#0b1220",border:"1px solid rgba(148,163,184,0.12)",color:"#94a3b8",borderRadius:14,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:600}}>Abbrechen</button>
                <button onClick={saveModal} style={{flex:1.4,background:"linear-gradient(135deg,#10b981,#3b82f6)",border:"none",color:"#fff",borderRadius:14,padding:"13px",cursor:"pointer",fontSize:14,fontWeight:700}}>Speichern</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
