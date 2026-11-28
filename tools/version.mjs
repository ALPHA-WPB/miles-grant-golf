// The app's version number: MAJOR.CHANGES, e.g. 3.145.
//   MAJOR    the owner's version of the app (1 = first drawings, 2 = satellite view, 3 = the 3D course). He says when it moves.
//   CHANGES  how many changes to the app have been made since that version began: commits from `since` on that touch what
//            players get (APP_PATHS). Notes-only commits (the graphics log, the backlog) are not changes and do not count.
// version.json holds the number, so a build with no git history (the host builds from a shallow copy) still knows it.
// Whoever makes a change to the app runs `node tools/version.mjs bump` before committing and commits version.json with it.
// A build that does have the full history counts again and shows whichever is higher.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

export const APP_PATHS = ["src", "public", "worker", "index.html", "migrations", "package.json", "vite.config.js", "wrangler.jsonc"];
const FILE = new URL("../version.json", import.meta.url);
const git = (...a) => execFileSync("git", a, { cwd: new URL("..", import.meta.url), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

export function readVersion() { return JSON.parse(readFileSync(FILE, "utf8")); }
// changes counted from git, or null when the history is not there to count
export function countChanges(since) {
  try {
    if (git("rev-parse", "--is-shallow-repository") === "true") return null;
    return +git("rev-list", "--count", `${since}^..HEAD`, "--", ...APP_PATHS);
  } catch { return null; }
}
export function appVersion() {
  const v = readVersion(), n = Math.max(v.changes, countChanges(v.since) ?? 0);
  return { major: v.major, changes: n, text: `${v.major}.${n}` };
}

// `node tools/version.mjs bump`: run by hand before committing a change to the app
if (process.argv[2] === "bump") {
  const v = readVersion(), counted = countChanges(v.since);
  v.changes = counted == null ? v.changes + 1 : counted + 1;      // + 1: the commit about to be made
  writeFileSync(FILE, JSON.stringify(v, null, 2) + "\n");
  console.log(`version ${v.major}.${v.changes}`);
}
