// @ts-nocheck
import { useState, useEffect, useRef } from "react";
import BackupControls from "./BackupControls";
import {
  getConsistencyStats,
  getJumpTargets,
  getPredictionReadiness,
  getShareSummary,
  getTodayNextSession,
  parseSessionDateLabel,
  parseTargetTimeToSeconds,
  safeParseJSON,
} from "./appSmartFeatures";
import { getMarathonPrediction } from "./marathonPrediction";
import { readRemoteStorage, writeRemoteStorage } from "./storage";

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

const ALL_SESSIONS = PLAN.flatMap((week) => week.s);
const ACTIVE_SESSIONS = ALL_SESSIONS.filter((session) => session.type !== "rest");
const LONG_RUN_SESSIONS = ACTIVE_SESSIONS.filter((session) => session.type === "long" && session.km > 0);
const LONGEST_LONG_RUN_KM = LONG_RUN_SESSIONS.reduce((max, session) => Math.max(max, session.km || 0), 0);
const FIRST_30K_ID = LONG_RUN_SESSIONS.find((session) => session.km >= 30)?.id;

const PHASE_ORDER = Object.keys(PI);
const VIEW_ORDER = ["home","week","performance","overview","settings"];

function clampPct(value){
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function getLoggedKm(session, log){
  if(!log?.done)return 0;
  return parseFloat(log.actualKm) || session.km || 0;
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
  if(log?.done)return "done";
  if(log?.skipped)return "skipped";
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
    const doneCount = activeSessions.filter((session) => logs[session.id]?.done).length;
    const skippedCount = activeSessions.filter((session) => logs[session.id]?.skipped).length;
    const avgFeeling = activeSessions
      .filter((session) => logs[session.id]?.done && logs[session.id]?.feeling)
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

function matchesWeekFilter(session, log, filter){
  if(filter === "all")return true;
  if(filter === "open")return getSessionStatus(log) === "open";
  if(filter === "hard")return ["interval","tempo","race"].includes(session.type);
  if(filter === "milestones")return session.type === "race" || (session.type === "long" && session.km >= 28);
  return true;
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

function getSessionWeight(session){
  if(session.type === "race" && session.km >= 42)return 12;
  if(session.type === "race" && session.km >= 21)return 9;
  if(session.type === "long" && session.km >= 30)return 10;
  if(session.type === "long" && session.km >= 24)return 8;
  if(session.type === "interval")return 7;
  if(session.type === "tempo")return 6;
  if(session.type === "easy")return 3;
  if(session.type === "bike" || session.type === "strength")return 2;
  return 0;
}

function getMomentumWeight(session, log){
  const baseWeight = getSessionWeight(session);

  if(log?.skipped){
    return -(baseWeight * 0.4);
  }

  if(!log?.done){
    return 0;
  }

  const feelingModifier = log.feeling === 5
    ? 1.25
    : log.feeling === 4
      ? 1.15
      : log.feeling === 2
        ? 0.85
        : log.feeling === 1
          ? 0.75
          : 1;

  return baseWeight * feelingModifier;
}

function buildProgressGraph(plan, logs){
  const sessions = plan.flatMap((week) => week.s);
  let planned = 0;
  let actual = 0;

  const cumulative = sessions.map((session, index) => {
    planned += getSessionWeight(session);
    actual += getMomentumWeight(session, logs[session.id]);

    return { index, planned, actual };
  });

  const values = cumulative.flatMap((item) => [item.planned, item.actual, 0]);
  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const range = Math.max(1, maxValue - minValue);
  const count = Math.max(1, cumulative.length - 1);

  return cumulative.map((item) => ({
    x: (item.index / count) * 100,
    plannedY: 100 - (((item.planned - minValue) / range) * 100),
    actualY: 100 - (((item.actual - minValue) / range) * 100),
  }));
}

function getFormScore(plan, logs){
  const sessions = plan.flatMap((week) => week.s);
  const plannedFinal = sessions.reduce((sum, session) => sum + getSessionWeight(session), 0);
  const actualFinal = sessions.reduce((sum, session) => sum + getMomentumWeight(session, logs[session.id]), 0);
  const rawScore = plannedFinal > 0 ? ((actualFinal - plannedFinal) / plannedFinal) * 100 : 0;
  const score = Math.round(rawScore);

  if(score > 10){
    return { score, label: "Sehr stark", color: "#34d399", arrow: "↑" };
  }
  if(score >= 3){
    return { score, label: "Im Flow", color: "#34d399", arrow: "↑" };
  }
  if(score >= -3){
    return { score, label: "Im Plan", color: "#60a5fa", arrow: "→" };
  }
  if(score >= -10){
    return { score, label: "Leicht hinter Plan", color: "#f87171", arrow: "↓" };
  }
  return { score, label: "Aufholen nötig", color: "#f87171", arrow: "↓" };
}

function buildSmoothPath(points, key){
  if(!points.length)return "";
  if(points.length === 1)return `M ${points[0].x} ${points[0][key]}`;

  let path = `M ${points[0].x} ${points[0][key]}`;

  for(let index = 0; index < points.length - 1; index += 1){
    const current = points[index];
    const next = points[index + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current[key] + next[key]) / 2;
    path += ` Q ${current.x} ${current[key]} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` T ${last.x} ${last[key]}`;
  return path;
}

function buildAreaPath(points, key){
  if(!points.length)return "";
  const linePath = buildSmoothPath(points, key);
  const last = points[points.length - 1];
  const first = points[0];
  return `${linePath} L ${last.x} 100 L ${first.x} 100 Z`;
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

function SurfaceCard({ children, style }){
  return (
    <div
      style={{
        background:"linear-gradient(160deg,rgba(18,18,36,0.98),rgba(11,16,28,0.94))",
        borderRadius:20,
        padding:16,
        border:"1px solid rgba(148,163,184,0.1)",
        ...style,
      }}
    >
      {children}
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
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({feeling:0,actualKm:"",notes:"",done:false,skipped:false});
  const [view,setView]=useState(DEFAULT_VIEW);
  const [weekFilter,setWeekFilter]=useState("all");
  const [overviewPhaseFilter,setOverviewPhaseFilter]=useState("all");
  const [preferences,setPreferences]=useState(() => safeParseJSON(localStorage.getItem("marathonPreferences"), {
    targetTime: "2:49:50",
  }));
  const [shareFeedback,setShareFeedback]=useState("");
  const [graphReady,setGraphReady]=useState(false);
  const [viewMotionDir,setViewMotionDir]=useState(0);
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

  useEffect(() => {
    const timer = window.setTimeout(() => setGraphReady(true), 60);
    return () => window.clearTimeout(timer);
  }, []);

  const save=async(newLogs)=>{
    setLogs(newLogs);
    await writeRemoteStorage("mwaw26-logs", JSON.stringify(newLogs));
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
    await save({...logs,[modal.id]:{...form,at:new Date().toISOString()}});
    setModal(null);
  };

  const w=PLAN[wIdx];
  const ph=PI[w.phase];
  const totalSess=ACTIVE_SESSIONS.length;
  const totalTargetKm=PLAN.reduce((sum, week) => sum + week.km, 0);
  const doneSessions = ACTIVE_SESSIONS.filter((session) => logs[session.id]?.done);
  const doneSess=doneSessions.length;
  const loggedKm=ACTIVE_SESSIONS.reduce((sum, session) => sum + getLoggedKm(session, logs[session.id]), 0);
  const wLoggedKm=w.s.reduce((sum, session) => sum + getLoggedKm(session, logs[session.id]), 0);
  const pct=totalSess>0?Math.round((doneSess/totalSess)*100):0;
  const kmPct=totalTargetKm>0?Math.round((loggedKm/totalTargetKm)*100):0;
  const longRuns = LONG_RUN_SESSIONS.length;
  const doneLongRuns = LONG_RUN_SESSIONS.filter((session) => logs[session.id]?.done).length;
  const hardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type)).length;
  const doneHardSessions = ACTIVE_SESSIONS.filter((session) => ["interval","tempo","race"].includes(session.type) && logs[session.id]?.done).length;
  const completedSessionRatio = totalSess > 0 ? doneSess / totalSess : 0;
  const avgFeeling = doneSessions.length
    ? doneSessions.reduce((sum, session) => sum + (logs[session.id]?.feeling || 3), 0) / doneSessions.length
    : 3;
  const recentRecoverySessions = ACTIVE_SESSIONS
    .filter((session) => logs[session.id]?.done)
    .slice(-5)
    .map((session) => ({ session, log: logs[session.id] }));
  const recoveryState = getRecoveryState(recentRecoverySessions, completedSessionRatio);
  const weeklyFatigue = getWeeklyFatigue(w);
  const qualityLongRunScore = LONG_RUN_SESSIONS.filter((session) => logs[session.id]?.done).length
    ? LONG_RUN_SESSIONS.filter((session) => logs[session.id]?.done).reduce((sum, session, _, arr) => {
      const log = logs[session.id];
      const actualKm = parseFloat(log?.actualKm) || session.km || 0;
      const distanceScore = session.km >= 28 ? Math.min(1, actualKm / session.km) : 0.75;
      const feelingScore = log?.feeling ? Math.max(0.45, log.feeling / 5) : 0.65;
      return sum + ((distanceScore * 0.65) + (feelingScore * 0.35)) / arr.length;
    }, 0)
    : 0.4;
  const halfMarathonRace = ACTIVE_SESSIONS.find((session) => session.type === "race" && session.km >= 21 && session.km < 42 && logs[session.id]?.done);
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
  const marathonPrediction = getMarathonPrediction({
    plan: PLAN,
    logs,
    targetSeconds,
    now: new Date(),
  });
  const recoveryHistory = getRecoveryHistory(PLAN, logs);
  const consistencyStats = getConsistencyStats(PLAN, logs);
  const nextKeySession = ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open" && getSessionMilestones(session, PLAN.find((week) => week.s.some((item) => item.id === session.id)) || w).length > 0)
    || ACTIVE_SESSIONS.find((session) => getSessionStatus(logs[session.id]) === "open");
  const currentPhaseIndex = PHASE_ORDER.indexOf(w.phase);
  const currentPhaseProgress = Math.round(((currentPhaseIndex + 1) / PHASE_ORDER.length) * 100);
  const phaseStatus = pct >= currentPhaseProgress + 10 ? "Voraus" : pct >= currentPhaseProgress - 10 ? "Im Plan" : "Aufholen";
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
  const visibleWeekSessions = w.s.filter((session) => matchesWeekFilter(session, logs[session.id], weekFilter));
  const visibleOverviewPhases = overviewPhaseFilter === "all" ? Object.keys(PI) : [overviewPhaseFilter];
  const todayNextSession = getTodayNextSession(ACTIVE_SESSIONS, logs);
  const firstTrainingSession = ACTIVE_SESSIONS[0] || null;
  const firstTrainingDate = firstTrainingSession ? parseSessionDateLabel(firstTrainingSession.date) : null;
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const firstTrainingStart = firstTrainingDate ? new Date(firstTrainingDate.getFullYear(), firstTrainingDate.getMonth(), firstTrainingDate.getDate()) : null;
  const isPreStart = !!(firstTrainingStart && todayStart < firstTrainingStart);
  const blockStartLabel = firstTrainingDate
    ? firstTrainingDate.toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })
    : "";
  const dashboardSession = todayNextSession?.session || null;
  const dashboardType = dashboardSession ? TI[dashboardSession.type] : { label: "Keine Einheit geplant", emoji: "😴", col: "#64748b" };
  const dashboardGlow = dashboardSession ? `${dashboardType.col}77` : "rgba(100,116,139,0.42)";
  const dashboardProgressPoints = buildProgressGraph(PLAN, logs);
  const formScore = getFormScore(PLAN, logs);
  const plannedProgressPath = buildSmoothPath(dashboardProgressPoints, "plannedY");
  const actualProgressPath = buildSmoothPath(dashboardProgressPoints, "actualY");
  const dashboardMetric = getDashboardMetric(dashboardSession);
  const homeTabLabel = getHomeTabLabel(dashboardSession, isPreStart);
  const jumpTargets = getJumpTargets(PLAN);
  const shareSummary = getShareSummary({ pct, week: w, nextKeySession, recoveryState, consistencyStats });
  const viewTransitionStyle = viewMotionDir === 0
    ? {}
    : { animation: `${viewMotionDir > 0 ? "viewSlideNext" : "viewSlidePrev"} .34s cubic-bezier(0.22, 1, 0.36, 1)` };
  const activeView = VIEW_ORDER.includes(view) ? view : DEFAULT_VIEW;

  return(
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
      style={{minHeight:"100vh",background:"radial-gradient(circle at top, #1a1f44 0%, #0b0b15 40%, #070912 100%)",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:14,WebkitTapHighlightColor:"transparent",paddingBottom:"calc(108px + env(safe-area-inset-bottom, 0px))"}}
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
        <div style={{padding:"28px 18px 18px",display:"flex",flexDirection:"column",gap:28,position:"relative",overflow:"hidden",...viewTransitionStyle}}>
          <div style={{position:"absolute",inset:"-40px 0 auto",height:620,pointerEvents:"none"}}>
            <div style={{position:"absolute",left:"50%",top:0,width:360,height:360,transform:`translateX(-50%) scale(${graphReady ? 1 : 0.92})`,background:`radial-gradient(circle at center, ${dashboardGlow} 0%, rgba(11,11,21,0) 72%)`,filter:"blur(68px)",opacity:graphReady ? 0.95 : 0.42,transition:"transform 1.2s ease, opacity 1.2s ease"}} />
            <div style={{position:"absolute",left:"50%",top:150,width:440,height:320,transform:`translateX(-50%) scale(${graphReady ? 1 : 0.9})`,background:`radial-gradient(circle at center, ${dashboardGlow} 0%, rgba(11,11,21,0) 76%)`,filter:"blur(82px)",opacity:graphReady ? 0.52 : 0.2,transition:"transform 1.25s ease, opacity 1.25s ease"}} />
          </div>

          <div style={{position:"relative",paddingTop:10,textAlign:"center",display:"flex",flexDirection:"column",alignItems:"center",gap:14}}>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.2em",color:"rgba(148,163,184,0.6)",fontWeight:700}}>MyRace</div>
            {isPreStart ? (
              <>
                <div style={{fontSize:34,fontWeight:800,color:"#fff",lineHeight:1.05,letterSpacing:"-0.04em",maxWidth:320}}>
                  Training startet noch nicht
                </div>
                <div style={{fontSize:14,color:"rgba(226,232,240,0.62)",lineHeight:1.7,maxWidth:340}}>
                  Dein Marathonblock beginnt am {blockStartLabel}. Vorher gibt es noch keinen aktiven Trainingsverlauf.
                </div>
              </>
            ) : (
              <>
                <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.16em",color:"rgba(148,163,184,0.52)",fontWeight:700}}>
                  {todayNextSession?.mode === "today" ? "Heute" : dashboardSession ? "Nächste Einheit" : "Heute"}
                </div>
                <div style={{fontSize:38,fontWeight:800,color:"#fff",lineHeight:1.02,letterSpacing:"-0.04em",maxWidth:320}}>
                  {getHeroTitle(dashboardSession)}
                </div>
                <div style={{fontSize:14,color:"rgba(226,232,240,0.54)",fontWeight:600}}>
                  {dashboardSession ? dashboardType.label : "Keine Einheit geplant"}
                </div>
              </>
            )}
          </div>

          {isPreStart ? (
            <div style={{position:"relative",padding:"10px 0 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:12,textAlign:"center"}}>
              <div style={{width:"100%",maxWidth:420,height:180,position:"relative",opacity:0.9}}>
                <div style={{position:"absolute",inset:"24px 0 0",background:"linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0))",borderRadius:28}} />
                <div style={{position:"absolute",left:"8%",right:"8%",top:"55%",height:1,background:"linear-gradient(90deg,rgba(148,163,184,0),rgba(148,163,184,0.25),rgba(148,163,184,0))"}} />
              </div>
              <div style={{fontSize:13,color:"rgba(226,232,240,0.54)",lineHeight:1.6,maxWidth:320}}>
                Momentum und Form Score erscheinen automatisch, sobald dein Trainingsblock aktiv startet.
              </div>
            </div>
          ) : (
            <>
            <div style={{position:"relative",paddingTop:6}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,gap:16,flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.14em",color:"rgba(148,163,184,0.5)",fontWeight:700,marginBottom:4}}>Momentum</div>
                  <div style={{fontSize:13,color:"rgba(226,232,240,0.52)",fontWeight:600}}>Plan gegen Form</div>
                </div>
                <div style={{textAlign:"right",minWidth:112}}>
                  <div style={{fontSize:28,fontWeight:800,color:formScore.color,letterSpacing:"-0.03em",lineHeight:1}}>
                    {formScore.score > 0 ? "+" : ""}{formScore.score}%
                  </div>
                  <div style={{fontSize:12,color:"rgba(226,232,240,0.64)",fontWeight:700,marginTop:6}}>
                    {formScore.arrow} {formScore.label}
                  </div>
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"flex-end",alignItems:"center",marginBottom:16,gap:14,flexWrap:"wrap"}}>
                <div style={{display:"flex",gap:14,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"rgba(148,163,184,0.56)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em"}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:"rgba(148,163,184,0.55)",display:"inline-block"}} />
                    Plan
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"rgba(226,232,240,0.82)",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em"}}>
                    <span style={{width:10,height:10,borderRadius:"50%",background:dashboardSession ? dashboardType.col : "#f8fafc",display:"inline-block"}} />
                    Ist
                  </div>
                </div>
              </div>

              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{width:"100%",height:214,display:"block",overflow:"visible"}}>
              <defs>
                <linearGradient id="actualProgressStroke" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={dashboardSession ? dashboardType.col : "#f8fafc"} stopOpacity="0.72" />
                  <stop offset="100%" stopColor={dashboardSession ? dashboardType.col : "#f8fafc"} stopOpacity="1" />
                </linearGradient>
                <linearGradient id="actualProgressFill" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={dashboardSession ? dashboardType.col : "#f8fafc"} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={dashboardSession ? dashboardType.col : "#f8fafc"} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d={buildAreaPath(dashboardProgressPoints, "actualY")}
                fill="url(#actualProgressFill)"
                style={{transition:"opacity .8s ease",opacity:graphReady ? 1 : 0}}
              />
              <path
                d={plannedProgressPath}
                fill="none"
                stroke="rgba(148,163,184,0.28)"
                strokeWidth="1.6"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray="100"
                strokeDashoffset={graphReady ? 0 : 100}
                style={{transition:"stroke-dashoffset 1s ease, opacity .6s ease",opacity:graphReady ? 1 : 0.18}}
              />
              <path
                d={actualProgressPath}
                fill="none"
                stroke="url(#actualProgressStroke)"
                strokeWidth="3.6"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray="100"
                strokeDashoffset={graphReady ? 0 : 100}
                style={{transition:"stroke-dashoffset 1.1s ease .08s, opacity .6s ease",opacity:graphReady ? 1 : 0.28}}
              />
              {dashboardProgressPoints.length > 0 && (
                <circle
                  cx={dashboardProgressPoints[dashboardProgressPoints.length - 1].x}
                  cy={dashboardProgressPoints[dashboardProgressPoints.length - 1].actualY}
                  r="3"
                  fill={dashboardSession ? dashboardType.col : "#f8fafc"}
                  style={{transition:"opacity .45s ease",opacity:graphReady ? 1 : 0}}
                />
              )}
              </svg>

              <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:10,marginTop:20}}>
                <button
                  className="dashboard-action"
                  onClick={()=>dashboardSession && openModal(dashboardSession)}
                  disabled={!dashboardSession}
                  style={{background:"rgba(255,255,255,0.06)",border:"1px solid rgba(148,163,184,0.1)",color:dashboardSession ? "#e2e8f0" : "#64748b",borderRadius:999,padding:"13px 10px",cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:13,fontWeight:700,boxShadow:"0 12px 24px rgba(2,6,23,0.14)"}}
                >
                  ⓘ Info
                </button>
                <button
                  className="dashboard-action"
                  onClick={()=>dashboardSession && quickCompleteSession(dashboardSession)}
                  disabled={!dashboardSession}
                  style={{background:"rgba(16,185,129,0.28)",border:"1px solid rgba(16,185,129,0.4)",color:dashboardSession ? "#ecfdf5" : "#4b5563",borderRadius:999,padding:"13px 10px",cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:13,fontWeight:700,boxShadow:"0 14px 30px rgba(16,185,129,0.14)"}}
                >
                  Done
                </button>
                <button
                  className="dashboard-action"
                  onClick={()=>dashboardSession && quickSkipSession(dashboardSession)}
                  disabled={!dashboardSession}
                  style={{background:"rgba(239,68,68,0.24)",border:"1px solid rgba(248,113,113,0.36)",color:dashboardSession ? "#fee2e2" : "#4b5563",borderRadius:999,padding:"13px 10px",cursor:dashboardSession ? "pointer" : "not-allowed",fontSize:13,fontWeight:700,boxShadow:"0 14px 30px rgba(239,68,68,0.12)"}}
                >
                  Skip
                </button>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:16,marginTop:22}}>
                <div style={{textAlign:"left"}}>
                  <div style={{fontSize:22,fontWeight:800,color:"#fff",letterSpacing:"-0.02em"}}>{dashboardMetric}</div>
                </div>
                <div style={{textAlign:"right",display:"inline-flex",alignItems:"center",justifyContent:"center",borderRadius:999,padding:"8px 12px",background:"rgba(255,255,255,0.05)",color:dashboardSession ? dashboardType.col : "#94a3b8",fontSize:12,fontWeight:700}}>
                  <div>
                    {dashboardSession ? (todayNextSession?.mode === "today" ? "Heute dran" : "Als Nächstes") : "Ruhetag"}
                  </div>
                </div>
              </div>
            </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:12}}>
            {[
              { label: "Fortschritt", value: `${pct}%`, detail: `${doneSess}/${totalSess} Einheiten`, color: "#10b981" },
              { label: "Kilometer", value: `${Math.round(loggedKm)}`, detail: `${kmPct}% von ${totalTargetKm} km`, color: "#38bdf8" },
              { label: "Long Runs", value: `${doneLongRuns}/${longRuns}`, detail: "abgeschlossen", color: "#f59e0b" },
              { label: "Harte Einheiten", value: `${doneHardSessions}/${hardSessions}`, detail: "Intervall, Tempo, Rennen", color: "#fb7185" },
            ].map((metric)=>(
              <div key={metric.label} style={{padding:"10px 12px 8px",background:"rgba(255,255,255,0.03)",borderRadius:18}}>
                <div style={{fontSize:10,textTransform:"uppercase",letterSpacing:"0.12em",color:"rgba(148,163,184,0.52)",fontWeight:700,marginBottom:8}}>{metric.label}</div>
                <div style={{fontSize:22,fontWeight:800,color:metric.color,letterSpacing:"-0.03em",lineHeight:1}}>{metric.value}</div>
                <div style={{fontSize:11,color:"rgba(226,232,240,0.54)",marginTop:7,lineHeight:1.45}}>{metric.detail}</div>
              </div>
            ))}
          </div>

          <SurfaceCard style={{ marginTop: 2 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "#7c8aa5", fontWeight: 700, marginBottom: 10 }}>
              Marathon-Prognose · letzte 42 Tage
            </div>
            {marathonPrediction.ready ? (
              <>
                <div style={{ fontSize: 30, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em", lineHeight: 1.1 }}>
                  {marathonPrediction.predictedTime}
                </div>
                <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8, fontWeight: 600 }}>
                  Spanne {marathonPrediction.rangeLabel}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Consistency</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#38bdf8" }}>{marathonPrediction.consistencyScore}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Sub-3</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#34d399" }}>{marathonPrediction.sub3ProbabilityPercent}%</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "#94a3b8", lineHeight: 1.65 }}>
                {marathonPrediction.message}
              </div>
            )}
          </SurfaceCard>
          </>
          )}
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
                  <div style={{fontSize:12,color:"#7c8aa5",marginTop:4}}>{w.dates} · Ziel: {w.km} km</div>
                  <div style={{fontSize:12,color:"#cbd5e1",marginTop:8,lineHeight:1.5}}>{w.focus}</div>
                </div>
                <button onClick={()=>setWIdx(i=>Math.min(PLAN.length-1,i+1))} disabled={wIdx===PLAN.length-1} style={{background:wIdx===PLAN.length-1?"rgba(15,23,42,0.7)":"#1e293b",border:"1px solid rgba(148,163,184,0.12)",color:"#cbd5e1",width:38,height:38,borderRadius:12,cursor:wIdx===PLAN.length-1?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
              </div>

              <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginTop:16}}>
                <MetricCard label="Wochenziel" value={`${w.km}`} sublabel="geplante Kilometer" accent="#38bdf8" />
                <MetricCard label="Ist-Stand" value={wLoggedKm.toFixed(1)} sublabel={`${Math.round(clampPct(w.km > 0 ? (wLoggedKm / w.km) * 100 : 0))}% der Woche`} accent="#10b981" />
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

              <div style={{marginTop:14,padding:"12px 14px",borderRadius:16,background:"rgba(10,14,26,0.72)",border:`1px solid ${weeklyFatigue.color}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div>
                    <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Wochenlast</div>
                    <div style={{fontSize:18,fontWeight:800,color:weeklyFatigue.color}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
                  </div>
                  <div style={{fontSize:12,color:"#94a3b8",maxWidth:260,lineHeight:1.5}}>{weeklyFatigue.note}</div>
                </div>
              </div>

              <div style={{marginTop:12,padding:"12px 14px",borderRadius:16,background:"rgba(10,14,26,0.72)",border:`1px solid ${coachingHint.color}33`}}>
                <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Coach Signal</div>
                <div style={{fontSize:17,fontWeight:800,color:coachingHint.color,marginBottom:6}}>{coachingHint.title}</div>
                <div style={{fontSize:12,color:"#cbd5e1",lineHeight:1.6}}>{coachingHint.body}</div>
              </div>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {jumpTargets.map((target)=>(
                <button
                  key={target.label}
                  onClick={()=>setWIdx(Math.max(0, PLAN.findIndex((week)=>week.wn === target.weekNumber)))}
                  style={{background:"rgba(15,23,42,0.82)",color:"#cbd5e1",border:"1px solid rgba(148,163,184,0.12)",borderRadius:999,padding:"8px 12px",cursor:"pointer",fontSize:12,fontWeight:700,transition:"transform .18s ease, border-color .18s ease"}}
                >
                  {target.label}
                </button>
              ))}
              <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(15,23,42,0.82)",border:"1px solid rgba(148,163,184,0.12)",borderRadius:999,padding:"8px 12px"}}>
                <span style={{fontSize:12,color:"#94a3b8",fontWeight:700}}>Woche</span>
                <input
                  type="number"
                  min="1"
                  max={PLAN.length}
                  value={w.wn}
                  onChange={(e)=>{
                    const nextWeek = Number(e.target.value);
                    const idx = PLAN.findIndex((week)=>week.wn === nextWeek);
                    if(idx >= 0)setWIdx(idx);
                  }}
                  style={{width:44,background:"transparent",border:"none",color:"#fff",fontSize:12,fontWeight:700}}
                />
              </div>
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {[
                { key: "all", label: "Alle" },
                { key: "open", label: "Nur offen" },
                { key: "hard", label: "Harte Einheiten" },
                { key: "milestones", label: "Milestones" },
              ].map((item)=>(
                <FilterChip key={item.key} active={weekFilter===item.key} onClick={()=>setWeekFilter(item.key)}>
                  {item.label}
                </FilterChip>
              ))}
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {visibleWeekSessions.length === 0 && (
                <div style={{background:"rgba(11,16,28,0.94)",border:"1px solid rgba(148,163,184,0.1)",borderRadius:18,padding:18,fontSize:13,color:"#94a3b8",lineHeight:1.6}}>
                  Für diesen Filter gibt es in der aktuellen Woche gerade keine passenden Einheiten.
                </div>
              )}
              {visibleWeekSessions.map(session=>{
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
                          {hasHint && <div style={{fontSize:11,color:isDone?"#86efac":isSkipped?"#fca5a5":"#7c8aa5",fontWeight:700,whiteSpace:"nowrap"}}>{isDone||isSkipped?"Status bearbeiten":"Tippen für Details"}</div>}
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
                        <div style={{marginTop:12,padding:"10px 12px",borderRadius:14,background:"rgba(15,23,42,0.55)",border:"1px solid rgba(148,163,184,0.1)"}}>
                          <div style={{fontSize:11,color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Letzter Log</div>
                          <div style={{fontSize:12,color:"#f8fafc",lineHeight:1.6}}>
                            Status: {getSessionStatusLabel(log)}
                            {" · "}
                            Gefühl: {log.feeling > 0 ? `${"★".repeat(log.feeling)} (${log.feeling}/5)` : "nicht bewertet"}
                            {log.actualKm ? ` · ${log.actualKm} km` : ""}
                            {log.notes ? ` · ${log.notes.substring(0, 70)}${log.notes.length > 70 ? "…" : ""}` : ""}
                          </div>
                        </div>
                      ) : (
                        <div style={{marginTop:12,padding:"10px 12px",borderRadius:14,background:"rgba(15,23,42,0.42)",border:"1px dashed rgba(148,163,184,0.12)",fontSize:12,color:"#7c8aa5",lineHeight:1.6}}>
                          Noch kein Log. Du kannst die Einheit direkt mit ✓ abhaken oder Details öffnen.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{display:"flex",justifyContent:"center",gap:8,padding:"4px 2px 6px",flexWrap:"wrap"}}>
              {PLAN.map((week,i)=>{
                const weekDone=week.s.filter(session=>logs[session.id]?.done).length;
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
          <SurfaceCard style={{ border: "1px solid rgba(56,189,248,0.22)", boxShadow: "0 24px 48px rgba(2,6,23,0.35)" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#7c8aa5", fontWeight: 700, marginBottom: 8 }}>
              Marathon-Prognose (42-Tage-Fenster)
            </div>
            {marathonPrediction.ready ? (
              <>
                <div style={{ fontSize: 34, fontWeight: 800, color: "#fff", letterSpacing: "-0.04em", marginBottom: 6 }}>
                  {marathonPrediction.predictedTime}
                </div>
                <div style={{ fontSize: 15, color: "#cbd5e1", marginBottom: 14, fontWeight: 600 }}>
                  Realistische Spanne: <span style={{ color: "#e2e8f0" }}>{marathonPrediction.rangeLabel}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                  <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 14, padding: "12px 10px", border: "1px solid rgba(148,163,184,0.12)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Consistency</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#38bdf8", marginTop: 4 }}>{marathonPrediction.consistencyScore}</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>Erledigt, km-Treue, Wochen-Streak</div>
                  </div>
                  <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 14, padding: "12px 10px", border: "1px solid rgba(148,163,184,0.12)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Sub-3</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#34d399", marginTop: 4 }}>{marathonPrediction.sub3ProbabilityPercent}%</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>geschätzte Chance</div>
                  </div>
                  <div style={{ background: "rgba(9,11,26,0.85)", borderRadius: 14, padding: "12px 10px", border: "1px solid rgba(148,163,184,0.12)" }}>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "#64748b", fontWeight: 700 }}>Sub-2:50</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#fbbf24", marginTop: 4 }}>{marathonPrediction.sub250ProbabilityPercent}%</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6, lineHeight: 1.4 }}>optional</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 14, lineHeight: 1.55 }}>
                  Heuristik aus gewichteten Einheiten, Ist-km vs. Plan und ausgefallenen Sessions — kein Labortest.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.7 }}>
                {marathonPrediction.message}
                {marathonPrediction.consistencyScore != null && (
                  <div style={{ marginTop: 12, fontSize: 13, color: "#94a3b8" }}>
                    Consistency (vorläufig): <span style={{ color: "#38bdf8", fontWeight: 800 }}>{marathonPrediction.consistencyScore}</span>
                  </div>
                )}
              </div>
            )}
          </SurfaceCard>

          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10}}>
            <SurfaceCard>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Recovery</div>
              <div style={{fontSize:22,fontWeight:800,color:recoveryState.tone,marginBottom:8}}>{recoveryState.label}</div>
              <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.65}}>{recoveryState.detail}</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Wochenlast</div>
              <div style={{fontSize:22,fontWeight:800,color:weeklyFatigue.color,marginBottom:8}}>{weeklyFatigue.icon} {weeklyFatigue.label}</div>
              <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.65}}>{weeklyFatigue.note}</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>Konstanz</div>
              <div style={{fontSize:22,fontWeight:800,color:"#fff",marginBottom:8}}>{consistencyStats.sessionStreak} Einheiten</div>
              <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.65}}>{consistencyStats.weeklyStreak} Wochen in Folge vollständig geloggt.</div>
            </SurfaceCard>
            <SurfaceCard>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:8}}>{marathonPrediction.ready ? "Schnellprognose (Gesamtplan)" : "Formprognose"}</div>
              <div style={{fontSize:22,fontWeight:800,color:predictionReadiness.ready ? "#fff" : "#cbd5e1",marginBottom:8}}>{performancePrediction.predictedTime}</div>
              <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.65}}>
                {marathonPrediction.ready ? "Kurzmodell über alle Wochen — Detail siehe 42-Tage-Karte oben." : performancePrediction.trend}
                {predictionReadiness.ready && !marathonPrediction.ready ? ` · Sicherheit ${performancePrediction.confidence}` : ""}
              </div>
            </SurfaceCard>
          </div>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:8}}>Aktuelle Lesart</div>
            <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.7}}>{recommendedAction}</div>
          </SurfaceCard>
        </div>
      ):activeView==="overview"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
          {doneSess === 0 && (
            <div style={{background:"linear-gradient(160deg,rgba(16,19,39,0.96),rgba(12,15,28,0.92))",border:"1px solid rgba(148,163,184,0.1)",borderRadius:20,padding:16}}>
              <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:6}}>Dein Log startet hier</div>
              <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.7}}>
                Sobald du ein paar Einheiten speicherst, werden Fortschritt, Formprognose und Recovery deutlich belastbarer. Für den Einstieg reicht schon ein schneller Haken in der Wochenansicht.
              </div>
            </div>
          )}

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:8}}>Planübersicht</div>
            <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.7,marginBottom:8}}>
              Diese Ansicht konzentriert sich bewusst auf Phasen, Wochenstruktur und Rennstrategie statt auf tägliche Statuswerte.
            </div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>
              Aktuelle Phase: <span style={{color:ph.col,fontWeight:700}}>{ph.label}</span>
              {" · "}
              {nextKeySession ? `Nächster Fokus: ${nextKeySession.title}` : "Alle Schlüsselreize geloggt"}
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:12}}>Race Strategy</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:10,marginBottom:12}}>
              <MetricCard label="Marathon Zielzeit" value={targetTimeDisplay} sublabel="Aggressiv, aber kontrollierbar" accent="#10b981" />
              <MetricCard label="Marathon Pace" value={targetPaceDisplay} sublabel="Ruhig anlaufen, dann stabilisieren" accent="#38bdf8" />
            </div>
            <div style={{fontSize:13,color:"#e2e8f0",lineHeight:1.7}}>
              <div><b>Erste Hälfte:</b> 1:25 low bis 1:25:30, bewusst entspannt und ohne unnötige Peaks.</div>
              <div><b>Zweite Hälfte:</b> Ab km 25 Rhythmus halten, ab km 32 in kleine Abschnitte denken und kontrolliert nachschärfen.</div>
              <div><b>Mental:</b> Früh geduldig bleiben, Mitte effizient arbeiten, Ende in Aid-Station zu Aid-Station denken.</div>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginTop:12}}>
              Optionaler Halbmarathon-Check: 3:56-3:59/km anlaufen, erste 5 km konservativ, danach auf sauberen Druck gehen.
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
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginTop:12}}>
              Der Verlauf kombiniert Gefühl, erledigte Einheiten, ausgelassene Sessions und harte Reize zu einem leichten Wochenindikator.
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
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:10}}>Trainingsplan-Übersicht</div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,marginBottom:16}}>
              📊 <b>Pyramidal→Polarized</b>: Base-Phase pyramidal (~80% easy, 15% Schwelle, 5% HIT) → Build-Phase polarisiert (80% easy, 15-20% HIT).<br/>
              🚴 <b>Rennrad</b> als gelenkschonendes Volumen und aktive Regeneration.<br/>
              📈 <b>Peak</b> vor dem Rennen mit anschließender Taper-Entlastung.<br/>
              🏔️ <b>Längster Lauf</b>: {LONGEST_LONG_RUN_KM} km als Schlüsseleinheit der Vorbereitung.
            </div>

            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:16}}>
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
                      const weekDone=week.s.filter(session=>logs[session.id]?.done).length;
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
                            <div style={{fontSize:11,color:"#7c8aa5",marginTop:4}}>{week.dates} · {week.km} km Ziel</div>
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
      ):activeView==="settings"?(
        <div style={{padding:"16px 16px 40px",display:"flex",flexDirection:"column",gap:14,...viewTransitionStyle}}>
          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:8}}>Einstellungen</div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:14}}>
              Nur das Nötigste: Zielzeit und sichere Backup-Funktionen für deine Logs.
            </div>
            <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"#7c8aa5",fontWeight:700,marginBottom:6}}>Zielzeit</div>
            <input
              type="text"
              value={preferences.targetTime}
              onChange={(e)=>setPreferences((prev)=>({...prev,targetTime:e.target.value}))}
              placeholder="2:49:50"
              style={{width:"100%",background:"#070b16",border:"1px solid rgba(148,163,184,0.14)",borderRadius:12,padding:"11px 12px",color:"#e2e8f0",fontSize:14,boxSizing:"border-box",marginBottom:10}}
            />
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>
              Format `hh:mm:ss`. Die Zielzeit beeinflusst nur Strategie und Prognose-Anzeige, nicht deinen Plan.
            </div>
          </SurfaceCard>

          <SurfaceCard>
            <div style={{fontSize:16,fontWeight:800,color:"#fff",marginBottom:8}}>Logs sichern</div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.6,marginBottom:2}}>
              Exportiere deinen Stand als JSON oder importiere ein vorhandenes Backup.
            </div>
            <BackupControls logs={logs} onImportSuccess={setLogs} />
          </SurfaceCard>
        </div>
      ):null}

      <div style={{position:"fixed",left:12,right:12,bottom:"calc(12px + env(safe-area-inset-bottom, 0px))",zIndex:90}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,minmax(0,1fr))",gap:6,background:"rgba(9,12,22,0.72)",border:"1px solid rgba(148,163,184,0.08)",borderRadius:24,padding:"10px 8px 11px",boxShadow:"0 20px 50px rgba(2,6,23,0.32)",backdropFilter:"blur(22px)"}}>
          {[
            { key: "home", label: homeTabLabel, icon: null },
            { key: "week", label: "Woche", icon: "▤" },
            { key: "performance", label: "Leistung", icon: "◔" },
            { key: "overview", label: "Übersicht", icon: "◎" },
            { key: "settings", label: "Einst.", icon: "⚙" },
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
                  padding:"10px 6px 8px",
                  cursor:"pointer",
                  display:"flex",
                  flexDirection:"column",
                  alignItems:"center",
                  gap:4,
                  minHeight:56
                }}
                aria-label={`${item.label} öffnen`}
              >
                {item.icon && <span style={{fontSize:16,lineHeight:1,opacity:active ? 1 : 0.82}}>{item.icon}</span>}
                <span style={{fontSize:item.key === "home" ? 11 : 10,fontWeight:800,opacity:active ? 1 : 0.7,letterSpacing:item.key === "home" ? "0.08em" : "0"}}>{item.label}</span>
                <span style={{width:4,height:4,borderRadius:"50%",background:active ? "#fff" : "transparent",marginTop:2,boxShadow:active ? "0 0 10px rgba(255,255,255,0.5)" : "none"}} />
              </button>
            );
          })}
        </div>
      </div>

      {modal&&modalWeek&&modalWorkout&&(
        <div onClick={closeModal} style={{position:"fixed",inset:0,background:"rgba(2,6,23,0.82)",display:"flex",alignItems:"stretch",justifyContent:"center",padding:0,zIndex:1000}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"linear-gradient(180deg,#0c1020 0%, #090d18 100%)",width:"100%",maxWidth:720,height:"100%",overflowY:"auto",borderLeft:"1px solid rgba(148,163,184,0.12)",borderRight:"1px solid rgba(148,163,184,0.12)"}}>
            <div style={{padding:"18px 16px 140px",display:"flex",flexDirection:"column",gap:14}}>
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
                <span style={{fontSize:11,padding:"5px 10px",borderRadius:999,background:form.done?"rgba(16,185,129,0.16)":form.skipped?"rgba(248,113,113,0.14)":"rgba(148,163,184,0.12)",color:form.done?"#86efac":form.skipped?"#fca5a5":"#94a3b8",fontWeight:700}}>
                  {form.done ? "Erledigt" : form.skipped ? "Ausgelassen" : "Offen"}
                </span>
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
                  <MetricCard label="Status" value={getSessionStatusLabel(modalLog)} sublabel={modalLog?.at ? formatLogTimestamp(modalLog.at) : "Noch nicht gespeichert"} accent={modalLog?.done ? "#10b981" : modalLog?.skipped ? "#f87171" : "#94a3b8"} />
                  <MetricCard label="Gefühl" value={modalLog?.feeling ? `${"★".repeat(modalLog.feeling)}` : "Keine"} sublabel={modalLog?.feeling ? `${modalLog.feeling}/5` : "Noch kein Rating"} accent="#f59e0b" />
                  <MetricCard label="Gelaufene km" value={modalLog?.actualKm || "—"} sublabel={modal.km > 0 ? `Ziel: ${modal.km} km` : "Keine Distanz geplant"} accent="#38bdf8" />
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
