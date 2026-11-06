# 3D course build-out backlog

Worked by an hourly background Claude session (scheduled task `mgg-3d-buildout`). Each run does
**one** unchecked item from the top, verifies it, commits it as its own commit (so the owner can
revert any single change), pushes to `main` (Cloudflare Workers Builds deploys automatically), ticks
the box here with the commit hash, and adds a line to the log at the bottom. If the item can't be
finished and verified in one run, leave it unchecked, note what's left in the log, and push nothing
broken.

## Owner's standing requirements (from feedback — do not regress)
- Accuracy first: every shape must match the Esri satellite photo. The owner compares against Google
  Maps 3D. Never ship a hole without looking at `trace_kit.py check N` images and fixing mismatches.
- No trees on tee boxes, greens or fairways unless a real tree is there. Shadows are NOT trees (sun is
  to the south; shadows fall north). Big oaks are single wide trees, not clusters.
- Tee boxes are ovals/rounded rectangles traced from the photo (often one long strip holding several
  tee markers). Greens are traced ovals (often elongated), never overlapping bunkers.
- Terrain at true scale (exaggeration 1). The course is FLAT. Never exaggerate or invent hills.
- The 3D view defaults on; satellite (SAT) must keep working. 2D stays the fallback for untraced holes.
- Keep the phone fast: check frame rate stays reasonable; don't add heavy assets casually.
- Questions to the owner are one at a time, multiple choice — but background runs must not block on
  questions: make the conservative choice and note it in the log.

## Environment
- Repo: `/Users/wpbit/Desktop/New Folder With Items 3/miles-grant-golf` (if moved: `mdfind -name miles-grant-golf`).
- Node: `/Applications/Codex.app/Contents/Resources/cua_node/bin/{node,npx}` (no system Node).
  Build: `npx vite build`; lint changed files: `npx eslint <files>` (App.jsx has 8 old known issues).
- Python for course data: `tools/course3d/.venv/bin/python` (numpy, opencv, shapely, tifffile).
  Rebuild data: `tools/course3d/.venv/bin/python tools/course3d/build.py` (writes public/course3d/*).
- Tracing: `tools/course3d/trace_kit.py crop N` → gridded photos in `tools/course3d/.work/`;
  write a shapes JSON in those pixel coords; `trace_kit.py add N shapes.json`; run build.py;
  `trace_kit.py check N` and LOOK at the check images; iterate until they match the photo.
  New holes appear in 3D automatically once `traced.json` has them (`course.holes`).
- Local preview: `rm -rf /private/tmp/claude-501/mgg-dist && cp -R dist /private/tmp/claude-501/mgg-dist`,
  then preview server "miles-grant-golf (preview)" (python http.server on 4173, config in
  /Users/wpbit/Downloads/.claude/launch.json). Guest sign-in → Start on Hole. `/api/*` 404s locally are expected.
- Deploy check: after `git push origin main`, poll `https://www.milesgrant.golf/` until the index-*.js
  hash matches `dist/index.html`.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Items
- [ ] 1. Whole-course imagery: change `traced.json` `regions` to ONE bbox covering the whole course
  (about S 27.1442, W -80.1856, N 27.1528, E -80.1712) so bunkers/trees are detected for all 18 holes
  without duplicates. Verify holes 1–3 still look the same (`check 1..3`), tree/bunker counts sane,
  course.json size reasonable (<1.5 MB; raise terrain grid spacing to 4 m if needed).
- [ ] 2. Trace hole 4 (green, tees, fairway spine, cart paths visible on the photo).
- [ ] 3. Trace hole 5.
- [ ] 4. Trace hole 6.
- [ ] 5. Trace hole 7.
- [ ] 6. Trace hole 8.
- [ ] 7. Trace hole 9.
- [ ] 8. Trace hole 10.
- [ ] 9. Trace hole 11.
- [ ] 10. Trace hole 12.
- [ ] 11. Trace hole 13.
- [ ] 12. Trace hole 14.
- [ ] 13. Trace hole 15.
- [ ] 14. Trace hole 16.
- [ ] 15. Trace hole 17.
- [ ] 16. Trace hole 18.
- [ ] 17. Tree audit, holes 1–18: numbered `check` images; remove false trees (shadows, shrubs on
  tees/greens) with `treeEdits.remove` [lng, lat, radius_m]; add obviously missing big trees.
- [ ] 18. Bunker audit, holes 1–18: missing bunkers, cart-path/pool false positives (`bunkerEdits.remove`).
- [x] 19. (done 2026-11-06 for the whole course; owner reviews holes 1–3 first) TOPOGRAPHY — was blocked until the owner's ChatGPT LiDAR markdown existed (look in
  `tools/course3d/lidar/`, `~/Downloads`, `~/Desktop` for a recent .md about LiDAR/elevation for
  Miles Grant / Martin County / NOAA). Only then: read it, fetch the best source it lists, rebuild
  terrain at TRUE scale, compare against the current USGS 3DEP data, keep fairways flat.
- [ ] 20. Plays-like distance (wind) on the 3D press-and-hold yardage label, like the 2D To Pin box.
- [ ] 21. Graphics detail setting (Low/High) in Me/profile or the MAP box, Low = fewer leaves/no shadows.

## Log
- 2026-11-06: TERRAIN now from the owner's Martin County QL1 LiDAR (tools/course3d/lidar/, 0.76 m, aligns with the traced greens/bunkers at zero shift; the old USGS 3DEP data scored ~0 = blurred/misaligned). True scale, light 0.8 m smoothing, minimal bunker deepening. The .tif is git-ignored (16 MB) — keep it in tools/course3d/lidar/ for rebuilds. Fly-through rebuilt: starts 130 m behind the back tee at ~15 m, pre-computed and Gaussian-smoothed track (heading/tilt/height), centerClampedToGround off during custom camera paths. Flags white with hole number, waving.
- 2026-11-06: fly-through now starts high behind the farthest-back tee (whole-hole shot) and a real 3D flagstick stands on the green (DOM flag icon only for distant views); swing button = 2-phase ball/button flash, plain ball with red NO GPS when no GPS.
- 2026-11-06: backlog created; holes 1–3 traced and verified by hand; graphics: ez-tree oaks, leaflet palms,
  granular sand, high-res turf (commit e9ce5d3).
