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
- Bunkers must look like the owner's Google 3D photo: warm tan sand, soft darker grass lip, and baked shading
  (`bshade` sun-side shadow, `blit` lit far face, from build.py). Never go back to pale flat cutouts with dark outlines.
- Keep the phone fast: check frame rate stays reasonable; don't add heavy assets casually.
- Questions to the owner are one at a time, multiple choice — but background runs must not block on
  questions: make the conservative choice and note it in the log.

## Environment
- Repo: `/Users/wpbit/Desktop/New Folder With Items 3/miles-grant-golf` (if moved: `mdfind -name miles-grant-golf`).
- Node: `N=/Applications/Codex.app/Contents/Resources/cua_node/bin; $N/npx …` — do NOT put that folder on PATH (vite's native rolldown module then fails its code-signature check).
  Build: `npx vite build`; lint changed files: `npx eslint <files>` (App.jsx has 8 old known issues).
- Python for course data: `tools/course3d/.venv/bin/python` (numpy, opencv, shapely, tifffile).
  Rebuild data: `tools/course3d/.venv/bin/python tools/course3d/build.py` (writes public/course3d/*).
- Tracing: `tools/course3d/trace_kit.py crop N` → gridded photos in `tools/course3d/.work/`;
  write a shapes JSON in those pixel coords; `trace_kit.py add N shapes.json`; run build.py;
  `trace_kit.py check N` and LOOK at the check images; iterate until they match the photo.
  New holes appear in 3D automatically once `traced.json` has them (`course.holes`).
- Local preview: `rsync -a --delete dist/ /private/tmp/claude-501/mgg-dist/` (rm -rf is blocked),
  then preview server "miles-grant-golf (preview)" (python http.server on 4173, config in
  /Users/wpbit/Downloads/.claude/launch.json). Guest sign-in → Start on Hole. `/api/*` 404s locally are expected.
- Deploy check: after `git push origin main`, poll `https://www.milesgrant.golf/` until the index-*.js
  hash matches `dist/index.html`.
- Commit message trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Items
- [x] 1. (467afbb) Whole-course imagery: change `traced.json` `regions` to ONE bbox covering the whole course
  (about S 27.1442, W -80.1856, N 27.1528, E -80.1712) so bunkers/trees are detected for all 18 holes
  without duplicates. Verify holes 1–3 still look the same (`check 1..3`), tree/bunker counts sane,
  course.json size reasonable (<1.5 MB; raise terrain grid spacing to 4 m if needed).
- [x] 2. (89e28e6) Trace hole 4 (green, tees, fairway spine, cart paths visible on the photo).
- [x] 3. (31e9bf0) Trace hole 5.
- [x] 4. (5cdba10) Trace hole 6.
- [x] 5. (5d07388) Trace hole 7.
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
- [ ] 17. Tree audit, holes 1–18 (hole 1 done 2026-11-06): numbered `check` images; remove false trees (shadows, shrubs on
  tees/greens, 'palms' sitting inside the dark shadow masses that oaks cast north onto the grass, duplicates midway
  along a palm's trunk shadow) with `treeEdits.remove` [lng, lat, radius_m]; ADD missing palms — thin palms in and
  beside fairways are often missed; the owner wants them (they block the pin). A palm belongs at the SOUTH end of its
  shadow (trunk base), never on the dark crown shadow. Add with `treeEdits.add` [lng, lat, r, 'palm', tag, height_m];
  hand-added trees skip the fairway/no-tree filters.
- [ ] 18. Bunker audit, holes 1–18: missing bunkers, cart-path/pool false positives (`bunkerEdits.remove`).
- [x] 19. (done 2026-11-06 for the whole course; owner reviews holes 1–3 first) TOPOGRAPHY — was blocked until the owner's ChatGPT LiDAR markdown existed (look in
  `tools/course3d/lidar/`, `~/Downloads`, `~/Desktop` for a recent .md about LiDAR/elevation for
  Miles Grant / Martin County / NOAA). Only then: read it, fetch the best source it lists, rebuild
  terrain at TRUE scale, compare against the current USGS 3DEP data, keep fairways flat.
- [ ] 20. Plays-like distance (wind) on the 3D press-and-hold yardage label, like the 2D To Pin box.
- [ ] 21. Graphics detail setting (Low/High) in Me/profile or the MAP box, Low = fewer leaves/no shadows.

## Log
- 2026-11-06: item 5 (5d07388): hole 7 traced (par 3, no fairway) — green oval (~17×20 m, clear of the back-left and front-right bunkers), round back tee (~9×8 m), forward tee strip (~24×6 m) holding the two forward markers, partly under the planter trees' north shadow. Previewed in 3D, no app errors (only expected local /api 404s). For item 18: the bunker behind the green at ~(810,353) hole7 px is only half detected (west part). Session switched to Auto permission mode at the owner's request.
- 2026-11-06: owner feedback (Google 3D photo of hole 1's three traps): detected bunker outlines already match the photo; the look was the problem (pale white, flat, dark outline, brown smudge). Now warm tan sand texture, blurred grass lip under the sand, and baked crescents: `bshade` (2 steps, 0.6/1.4 m, south edge) and `blit` (0.9 m, north edge), 10 cm precision; course.json +130 KB raw (+28 KB gzip). Same session: removed the first-launch "Tap the big gold button" overlay, shorter instructions (6 cards incl. 3D fly-over, lightning, today's pin), help button now "? HELP".
- 2026-11-06: item 4 (5cdba10): hole 6 traced — green oval (~18×20 m) between the left and front bunkers, long back-tee strip (~26×8 m) and forward tee oval, fairway (~26 m wide) along the mowed band from past the forward tee to the green's front-left. No paved cart path (only worn dirt tracks), so none added. Not previewed in the browser this run (preview server permission declined in the background session); data-only change, build OK, live course.json confirmed. For item 17: tree #2423 at ~(500,812) hole6 px sits on a dark wet patch in the rough — likely not a tree. Note: deploy check for data-only changes must compare course.json (the index-*.js name doesn't change).
- 2026-11-06: hedges (a031889): new `hedges` list in traced.json ({tag, h, w, line}) → `hedge` features → rounded shrub wall in realScene. Hole 5: behind the tee along the back yards (3.8 m) and behind the green outside the road (4.2 m), so the houses show roofs only. Add hedges on other holes the same way where the photo shows thick shrub lines in front of houses.
- 2026-11-06: owner feedback on hole 5 (61c0d9b): palms re-placed by hand at trunk bases (9, tag h5-palms; heights from shadow length — the two tall ones 15–16.5 m); removed the mid-fairway "palm" (tall palm's shadow) and duplicate palms along trunk shadows (one palm by the bunker, not two). Hole 5 got a fairway (tee → green, north of the bunker). All greens now have a ~4.5 m first-cut collar ring outside the fringe (`collar` kind, build.py + HoleMap3D). Point label / View button, yardage arcs, tee dots, GPS and shot tags no longer fade when terrain "covers" them. Item 17 (tree audit) for hole 5 is effectively done.
- 2026-11-06: item 3 (31e9bf0): hole 5 traced — green oval (~20×24 m, clear of the right bunker), 2 tee ovals (west one partly under a tree canopy, edges estimated). Par 3, no fairway (like holes 2–3). The paved loop is an OSM road, so no cart path added. For item 18: small sand ring around a shrub just south of the back tee (~937,440 in hole5 px) is not a bunker in the data — may be a planter. Untracked MilesGrantGolf-Architecture.pdf (Oct 18) in the repo root left alone.
- 2026-11-06: item 2 (89e28e6): hole 4 traced — green oval, 3 tee ovals, fairway along the mowed corridor (no paved cart path visible on this hole). Owner may want to eyeball the fairway width (~26 m) in 3D.
- 2026-11-06: item 1 (467afbb): one whole-course detection region; holes 1–3 unchanged (29 bunkers, 311 palms, +1 real oak at the old edge); 1,912 trees / 67 bunkers course-wide (bunker count looks low for 18 holes — item 18 audit should check for missed bunkers); course.json 1.2 MB.
- 2026-11-06: hole 1 palms: owner flagged missing palms (group of 3 short of the green, others along the south side) — 10 added by hand at trunk bases; build.py now follows each palm's trunk shadow south to its base (381 of 618 palms course-wide were sitting on their crown shadows, ~4–12 m too far north) and turns small 'oaks' with a trunk shadow into palms; 4 false shadow-trees removed on hole 1.
- 2026-11-06: TERRAIN now from the owner's Martin County QL1 LiDAR (tools/course3d/lidar/, 0.76 m, aligns with the traced greens/bunkers at zero shift; the old USGS 3DEP data scored ~0 = blurred/misaligned). True scale, light 0.8 m smoothing, minimal bunker deepening. The .tif is git-ignored (16 MB) — keep it in tools/course3d/lidar/ for rebuilds. Fly-through rebuilt: starts 130 m behind the back tee at ~15 m, pre-computed and Gaussian-smoothed track (heading/tilt/height), centerClampedToGround off during custom camera paths. Flags white with hole number, waving.
- 2026-11-06: fly-through now starts high behind the farthest-back tee (whole-hole shot) and a real 3D flagstick stands on the green (DOM flag icon only for distant views); swing button = 2-phase ball/button flash, plain ball with red NO GPS when no GPS.
- 2026-11-06: backlog created; holes 1–3 traced and verified by hand; graphics: ez-tree oaks, leaflet palms,
  granular sand, high-res turf (commit e9ce5d3).
