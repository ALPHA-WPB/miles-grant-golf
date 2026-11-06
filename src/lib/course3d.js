// Illustrated course data (built by tools/course3d/build.py). Kept out of the 3D map
// chunk so the app can learn which holes have graphics without loading MapLibre.
let pending = null;
export function loadCourse3d() {
  if (!pending) {
    pending = fetch('/course3d/course.json')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .catch(err => { pending = null; throw err; });
  }
  return pending;
}
