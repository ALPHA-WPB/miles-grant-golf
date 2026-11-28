/* global __APP_VERSION__, __APP_CHANGES__ */
// The app's version: 3.<number of changes since the 3D course began>, worked out when the app is built
// (tools/version.mjs). The owner names the versions; he says when it becomes version 4.
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "3";
export const APP_CHANGES = typeof __APP_CHANGES__ === "number" ? __APP_CHANGES__ : 0;

// Newest first. `changes` is how many changes that version had; the current one shows the live count.
export const VERSION_HISTORY = [
  {
    n: 3, name: "The 3D course", when: "November 5, 2026 to today", current: true,
    text: "The whole course rebuilt in 3D from the satellite photo and a height survey of the ground. Every hole opens with a fly-over. You can look round, walk the fairway, and see the palms, oaks, houses, lakes and bunkers where they really are.",
  },
  {
    n: 2, name: "Satellite view", when: "June 14 to November 4, 2026", changes: 75,
    text: "The drawings were replaced with a real satellite photo of Miles Grant. This version added shot distances, score keeping, playing as a guest, spoken distances, wind, weather and rain radar, and press-and-hold to measure to any spot.",
  },
  {
    n: 1, name: "First drawings", when: "Up to June 14, 2026", changes: 2,
    text: "Where it started: a simple drawn picture of each hole with a dot for where you stood and the yards to the green. It worked, but it did not look like Miles Grant.",
  },
];
