// Illustrated course data (built by tools/course3d/build.py, split per hole by tools/course3d/split.mjs).
// Kept out of the 3D map chunk so the app can learn which holes have graphics without loading MapLibre.
// The phone only ever downloads and holds ONE hole's part of the property: loading the whole property
// at once ran iPhones out of memory a couple of holes into a round.
let pending = null;
export function loadCourse3d() {
  if (!pending) {
    pending = fetch('/course3d/index.json')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(err => { pending = null; throw err; });
  }
  return pending;
}

// One hole's data. Only the most recent hole is kept, so the previous hole's data can be freed.
let last = { n: null, p: null };
export function loadHole3d(n) {
  if (last.n !== n || !last.p) {
    const p = fetch(`/course3d/hole/${n}.json`)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(err => { if (last.p === p) last = { n: null, p: null }; throw err; });
    last = { n, p };
  }
  return last.p;
}
