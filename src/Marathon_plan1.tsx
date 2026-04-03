// @ts-nocheck
import { useState, useEffect } from "react";

const PI = {
  MINI:  { label:"Mini-Prep",         emoji:"🔄", col:"#6366f1", bg:"rgba(99,102,241,0.12)" },
  BASE:  { label:"Basisaufbau",        emoji:"🌱", col:"#10b981", bg:"rgba(16,185,129,0.12)" },
  DEV:   { label:"Entwicklung",        emoji:"📈", col:"#3b82f6", bg:"rgba(59,130,246,0.12)" },
  BUILD: { label:"Aufbau & Peak",      emoji:"🔥", col:"#ef4444", bg:"rgba(239,68,68,0.12)" },
  SPEC:  { label:"Wettkampfspez.",     emoji:"🎯", col:"#f59e0b", bg:"rgba(245,158,11,0.12)" },
  TAPER: { label:"Taper",             emoji:"⚡", col:"#a855f7", bg:"rgba(168,85,247,0.12)" },
};
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

export default function App(){
  const [wIdx,setWIdx]=useState(0);
  const [logs, setLogs] = useState(() => {
  const saved = localStorage.getItem("marathonLogs");
  return saved ? JSON.parse(saved) : {};
});
  const [modal,setModal]=useState(null);
  const [form,setForm]=useState({feeling:0,actualKm:"",notes:"",done:false});
  const [view,setView]=useState("week");
  const [loaded,setLoaded]=useState(false);
useEffect(() => {
  localStorage.setItem("marathonLogs", JSON.stringify(logs));
}, [logs]);

  useEffect(()=>{
    (async()=>{
      try{const r=await window.storage.get("mwaw26-logs");if(r)setLogs(JSON.parse(r.value));}catch(e){}
      setLoaded(true);
    })();
  },[]);

  const save=async(newLogs)=>{
    setLogs(newLogs);
    try{await window.storage.set("mwaw26-logs",JSON.stringify(newLogs));}catch(e){}
  };

  const openModal=(ss)=>{
    const ex=logs[ss.id]||{};
    setForm({feeling:ex.feeling||0,actualKm:ex.actualKm||"",notes:ex.notes||"",done:ex.done||false});
    setModal(ss);
  };

  const saveModal=async()=>{
    await save({...logs,[modal.id]:{...form,at:new Date().toISOString()}});
    setModal(null);
  };

  const w=PLAN[wIdx];
  const ph=PI[w.phase];
  const allAct=PLAN.flatMap(x=>x.s).filter(x=>x.type!=="rest");
  const totalSess=allAct.length;
  const doneSess=Object.values(logs).filter(l=>l.done).length;
  const totalTargetKm=PLAN.reduce((a,x)=>a+x.km,0);
  const loggedKm=Object.entries(logs).reduce((a,[id,l])=>{
    if(!l.done)return a;
    const ss=PLAN.flatMap(x=>x.s).find(x=>x.id===id);
    return a+(parseFloat(l.actualKm)||ss?.km||0);
  },0);
  const wLoggedKm=w.s.reduce((a,ss)=>{
    const l=logs[ss.id];
    if(!l||!l.done)return a;
    return a+(parseFloat(l.actualKm)||ss.km||0);
  },0);
  const pct=totalSess>0?Math.round((doneSess/totalSess)*100):0;

  if(!loaded)return <div style={{minHeight:"100vh",background:"#0b0b15",display:"flex",alignItems:"center",justifyContent:"center",color:"#aaa",fontFamily:"system-ui"}}>Lade Plan…</div>;

  return(
    <div style={{minHeight:"100vh",background:"#0b0b15",color:"#e2e8f0",fontFamily:"'Segoe UI',system-ui,sans-serif",fontSize:14}}>
      {/* HEADER */}
      <div style={{background:"linear-gradient(135deg,#0f0f23,#1a1040)",padding:"14px 16px",borderBottom:"1px solid #1e1e3a"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
          <div>
            <div style={{fontSize:17,fontWeight:700,color:"#fff"}}>🏃 Sub-2:50 Marathonplan</div>
            <div style={{fontSize:11,color:"#64748b",marginTop:2}}>Warschau · 27.09.2026 · Zieltempo 4:01/km</div>
          </div>
          <div style={{display:"flex",gap:14,textAlign:"center"}}>
            <div><div style={{fontSize:20,fontWeight:800,color:"#10b981"}}>{pct}%</div><div style={{fontSize:10,color:"#64748b"}}>erledigt</div></div>
            <div><div style={{fontSize:20,fontWeight:800,color:"#3b82f6"}}>{Math.round(loggedKm)}</div><div style={{fontSize:10,color:"#64748b"}}>km ✓</div></div>
            <div><div style={{fontSize:20,fontWeight:800,color:"#a855f7"}}>{doneSess}</div><div style={{fontSize:10,color:"#64748b"}}>Einh. ✓</div></div>
          </div>
        </div>
        <div style={{marginTop:10,height:4,background:"#1e1e3a",borderRadius:2}}>
          <div style={{height:"100%",background:"linear-gradient(90deg,#10b981,#3b82f6,#a855f7)",borderRadius:2,width:`${pct}%`,transition:"width .4s"}}/>
        </div>
      </div>

      {/* TABS */}
      <div style={{display:"flex",background:"#0b0b15",borderBottom:"1px solid #1a1a2e",padding:"0 16px"}}>
        {["week","overview"].map(v=>(
          <button key={v} onClick={()=>setView(v)} style={{background:"none",border:"none",color:view===v?"#10b981":"#4b5563",padding:"10px 14px",cursor:"pointer",fontSize:13,borderBottom:view===v?"2px solid #10b981":"2px solid transparent",fontWeight:view===v?600:400}}>
            {v==="week"?"📅 Wochenplan":"📊 Übersicht"}
          </button>
        ))}
      </div>

      {view==="week"?(
        <>
          {/* WEEK NAV */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",background:"#0f0f1e"}}>
            <button onClick={()=>setWIdx(i=>Math.max(0,i-1))} disabled={wIdx===0} style={{background:wIdx===0?"#111":"#1e1e3a",border:"none",color:"#94a3b8",width:34,height:34,borderRadius:8,cursor:wIdx===0?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
            <div style={{flex:1,textAlign:"center"}}>
              <span style={{display:"inline-block",padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,background:ph.bg,color:ph.col,marginBottom:4}}>{ph.emoji} {ph.label}</span>
              <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>{w.label}</div>
              <div style={{fontSize:11,color:"#475569"}}>{w.dates} · Ziel: {w.km} km</div>
              <div style={{fontSize:11,color:"#64748b",fontStyle:"italic",marginTop:2}}>{w.focus}</div>
            </div>
            <button onClick={()=>setWIdx(i=>Math.min(PLAN.length-1,i+1))} disabled={wIdx===PLAN.length-1} style={{background:wIdx===PLAN.length-1?"#111":"#1e1e3a",border:"none",color:"#94a3b8",width:34,height:34,borderRadius:8,cursor:wIdx===PLAN.length-1?"not-allowed":"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
          </div>

          {/* KM BAR */}
          <div style={{padding:"8px 16px",background:"#0f0f1e",borderBottom:"1px solid #1a1a2e"}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"#4b5563",marginBottom:4}}>
              <span>Wochenziel: {w.km} km</span>
              <span style={{color:"#10b981"}}>Gelaufen: {wLoggedKm.toFixed(1)} km</span>
            </div>
            <div style={{height:5,background:"#1a1a2e",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",background:"linear-gradient(90deg,#10b981,#3b82f6)",borderRadius:3,width:`${Math.min(100,w.km>0?(wLoggedKm/w.km)*100:0)}%`,transition:"width .3s"}}/>
            </div>
          </div>

          {/* SESSIONS */}
          <div style={{padding:"10px 14px",display:"flex",flexDirection:"column",gap:7}}>
            {w.s.map(ss=>{
              const ti=TI[ss.type];
              const lg=logs[ss.id];
              const isDone=lg?.done;
              return(
                <div key={ss.id} onClick={()=>ss.type!=="rest"&&openModal(ss)}
                  style={{background:isDone?"rgba(16,185,129,0.05)":"#121224",borderRadius:10,padding:"10px 12px",display:"flex",gap:10,alignItems:"flex-start",borderLeft:`3px solid ${isDone?"#10b981":ti.col}`,cursor:ss.type==="rest"?"default":"pointer",opacity:ss.type==="rest"?0.6:1,border:`1px solid ${isDone?"rgba(16,185,129,0.2)":"#1e1e3a"}`,borderLeft:`3px solid ${isDone?"#10b981":ti.col}`}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#475569",width:22,flexShrink:0,paddingTop:2,textTransform:"uppercase"}}>{ss.day}</div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontSize:10,padding:"1px 7px",borderRadius:10,background:`${ti.col}22`,color:ti.col,fontWeight:600}}>{ti.emoji} {ti.label}</span>
                      {isDone&&<span style={{color:"#10b981",fontSize:12,fontWeight:700}}>✓</span>}
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:"#e2e8f0",marginBottom:2}}>{ss.title}</div>
                    {ss.km>0&&<div style={{fontSize:11,color:"#3b82f6",fontWeight:500,marginBottom:3}}>{ss.km} km{ss.pace?` · ${ss.pace}`:""}</div>}
                    <div style={{fontSize:11,color:"#475569",lineHeight:1.4}}>{ss.desc}</div>
                    {lg?.feeling > 0 && (
  <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>
    {"★".repeat(lg.feeling)}
    {lg.actualKm ? ` · ${lg.actualKm} km` : ""}
    {lg.notes ? ` · ${lg.notes.substring(0, 45)}${lg.notes.length > 45 ? "…" : ""}` : ""}
  </div>
)}
                  </div>
                  {ss.type!=="rest"&&<div style={{color:isDone?"#10b981":"#374151",fontSize:16,flexShrink:0}}>{isDone?"📝":"＋"}</div>}
                </div>
              );
            })}
          </div>

          {/* WEEK NAV BOTTOM */}
          <div style={{display:"flex",justifyContent:"center",gap:8,padding:"8px 16px 20px"}}>
            {PLAN.map((_,i)=>{
              const wDone=PLAN[i].s.filter(ss=>logs[ss.id]?.done).length;
              const wTot=PLAN[i].s.filter(ss=>ss.type!=="rest").length;
              const full=wTot>0&&wDone===wTot;
              return(
                <div key={i} onClick={()=>setWIdx(i)} style={{width:9,height:9,borderRadius:"50%",cursor:"pointer",background:i===wIdx?"#fff":full?"#10b981":wDone>0?"#3b82f6":"#1e1e3a",transition:"background .2s"}}/>
              );
            })}
          </div>
        </>
      ):(
        /* OVERVIEW */
        <div style={{padding:"14px 14px 40px",display:"flex",flexDirection:"column",gap:14}}>
          <div style={{fontSize:15,fontWeight:700,color:"#fff"}}>Trainingsplan-Übersicht</div>
          <div style={{background:"#121224",borderRadius:10,padding:14,border:"1px solid #1e1e3a"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#64748b",marginBottom:8}}>WISSENSCHAFTLICHE GRUNDLAGE</div>
            <div style={{fontSize:11,color:"#94a3b8",lineHeight:1.6}}>
              📊 <b>Pyramidal→Polarized</b>: Base-Phase pyramidal (~80% easy, 15% Schwelle, 5% HIT) → Build-Phase polarisiert (80% easy, 15-20% HIT). Laut PMC-Studie beste Leistungsgewinne.<br/>
              🚴 <b>Rennrad</b> eingeplant: Jede Crosstraining-Einheit verbessert laut Daten von 119k Läufern die Zeit um ~6min.<br/>
              📈 <b>Peak</b> Woche 4-5 vor dem Rennen (90km), dann 3-Wochen-Taper mit 41-60% Volumenreduktion (Intensität bleibt!).<br/>
              🏔️ <b>Längster Lauf</b>: 34km (Woche 18) – optimal laut Springer-Analyse (30-32km Spanne).
            </div>
          </div>
          {Object.keys(PI).map(pk=>{
            const pWeeks=PLAN.filter(x=>x.phase===pk);
            const p=PI[pk];
            return(
              <div key={pk} style={{borderLeft:`3px solid ${p.col}`,paddingLeft:12}}>
                <div style={{fontSize:12,fontWeight:700,color:p.col,marginBottom:8}}>{p.emoji} {p.label}</div>
                {pWeeks.map(pw=>{
                  const idx=PLAN.indexOf(pw);
                  const wd=pw.s.filter(ss=>logs[ss.id]?.done).length;
                  const wt=pw.s.filter(ss=>ss.type!=="rest").length;
                  return(
                    <div key={pw.wn} onClick={()=>{setWIdx(idx);setView("week");}} style={{background:"#121224",borderRadius:8,padding:"9px 12px",marginBottom:6,display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",border:"1px solid #1a1a2e"}}>
                      <div>
                        <div style={{fontSize:12,fontWeight:600,color:"#e2e8f0"}}>{pw.label}</div>
                        <div style={{fontSize:10,color:"#475569"}}>{pw.dates} · {pw.km} km Ziel</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:50,height:4,background:"#0b0b15",borderRadius:2,overflow:"hidden"}}>
                          <div style={{height:"100%",background:p.col,borderRadius:2,width:wt>0?`${Math.round((wd/wt)*100)}%`:"0%"}}/>
                        </div>
                        <div style={{fontSize:11,fontWeight:600,color:p.col,minWidth:28,textAlign:"right"}}>{wd}/{wt}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {modal&&(
        <div onClick={()=>setModal(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.8)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,zIndex:1000}}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#141428",borderRadius:16,padding:20,width:"100%",maxWidth:420,border:"1px solid #1e1e3a",maxHeight:"90vh",overflowY:"auto"}}>
            <div style={{marginBottom:14}}>
              <div style={{fontSize:16,fontWeight:700,color:"#fff"}}>{modal.title}</div>
              <div style={{fontSize:11,color:"#475569"}}>{modal.day}, {modal.date} · {modal.km>0?`${modal.km} km Ziel`:""}</div>
              {modal.pace&&<div style={{fontSize:11,color:"#3b82f6",marginTop:2}}>⏱ {modal.pace}</div>}
              <div style={{fontSize:11,color:"#64748b",marginTop:6,lineHeight:1.4}}>{modal.desc}</div>
            </div>

            {modal.km>0&&(
              <div style={{marginBottom:14}}>
                <label style={{display:"block",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:5}}>Tatsächliche km</label>
                <input type="number" step="0.1" placeholder={`Ziel: ${modal.km} km`} value={form.actualKm} onChange={e=>setForm(f=>({...f,actualKm:e.target.value}))}
                  style={{width:"100%",background:"#0b0b15",border:"1px solid #1e1e3a",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:13,boxSizing:"border-box"}}/>
              </div>
            )}

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Wie war's?</label>
              <div style={{display:"flex",gap:6,marginBottom:4}}>
                {[1,2,3,4,5].map(n=>(
                  <button key={n} onClick={()=>setForm(f=>({...f,feeling:n}))} style={{flex:1,background:form.feeling>=n?"#f59e0b22":"#0b0b15",border:`1px solid ${form.feeling>=n?"#f59e0b":"#1e1e3a"}`,borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:16}}>⭐</button>
                ))}
              </div>
              <div style={{fontSize:11,color:"#64748b",textAlign:"center"}}>
                {["","😓 Sehr schwer","😕 Schlecht","😐 Okay","😊 Gut","🔥 Fantastisch!"][form.feeling]}
              </div>
            </div>

            <div style={{marginBottom:14}}>
              <label style={{display:"block",fontSize:10,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".05em",marginBottom:5}}>Notizen</label>
              <textarea placeholder="Wie lief's? Besonderheiten? Stimmung?" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}
                style={{width:"100%",background:"#0b0b15",border:"1px solid #1e1e3a",borderRadius:8,padding:"9px 12px",color:"#e2e8f0",fontSize:12,boxSizing:"border-box",minHeight:72,resize:"vertical"}}/>
            </div>

            <div style={{marginBottom:16}}>
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#e2e8f0"}}>
                <input type="checkbox" checked={form.done} onChange={e=>setForm(f=>({...f,done:e.target.checked}))} style={{width:17,height:17,accentColor:"#10b981"}}/>
                Als abgeschlossen markieren ✓
              </label>
            </div>

            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setModal(null)} style={{flex:1,background:"#0b0b15",border:"1px solid #1e1e3a",color:"#64748b",borderRadius:10,padding:"11px",cursor:"pointer",fontSize:13}}>Abbrechen</button>
              <button onClick={saveModal} style={{flex:2,background:"linear-gradient(135deg,#10b981,#3b82f6)",border:"none",color:"#fff",borderRadius:10,padding:"11px",cursor:"pointer",fontSize:13,fontWeight:600}}>Speichern 💾</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
