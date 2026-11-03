/**
 * Geplante Pulsvorgabe für die UI. Die feste bpm-Tabelle ist entfallen: bpm kommen nur noch aus
 * hrZones.ts × der Max-HF des Nutzers, ohne Max-HF steht nur die Zone da.
 */
export { formatPlannedHrDisplay as formatPlannedHrZoneDisplay } from "./hrZones";
