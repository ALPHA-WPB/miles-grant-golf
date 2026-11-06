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
- [x] 6. (b6156a4) Trace hole 8.
- [x] 7. (68a3092) Trace hole 9.
- [x] 8. (f927a05) Trace hole 10.
- [x] 9. (620baf5) Trace hole 11.
- [x] 10. (db859a5) Trace hole 12.
- [x] 11. (f2fb319) Trace hole 13.
- [x] 12. (e4e0a1f) Trace hole 14.
- [x] 13. (4fdd990) Trace hole 15.
- [x] 14. (b9c4d64) Trace hole 16.
- [x] 15. (6b715c8) Trace hole 17.
- [x] 16. (be3fbe8) Trace hole 18.
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
- [ ] 22. WATER: the lakes along hole 17 (and the one between holes 17/18 and the clubhouse ponds) are not in the OSM water data build.py uses (only one lake, lng −80.1725…−80.1709, is), so in 3D they render as grass. Trace the lake outlines from the photo (add a `water` list to traced.json + build.py support) and check every hole for missing water.

## Log
- 2026-11-06: owner request (14a8d5b): club housing. OSM lacked the club's condos and lakeside homes, so the area between the holes was empty grey. houses_kit.py (detect + edit) found 149 tile-roof condo sections inside the club perimeter (Miles Grant Rd / Cove Rd loop, stored as traced.json clubPerimeter) and 21 shingle-roof homes plus the condo by the clubhouse were traced by hand (house roof colours come from the photo in build.py). Homes outside that road loop are deliberately left out. course.json now 1.63 MB raw / 0.44 MB gzip. Uncertain: a few condo sections are split into 2–3 boxes where units are staggered, and small gaps between staggered units are left out.
- 2026-11-06: item 16 (be3fbe8): hole 18 traced (par 5) — elongated green (~17×9 m, NW–SE) between its left and back-right bunkers, back tee strip (~24×6 m) by the bridge, round forward tee on the peninsula tip, fairway (~15–24 m) down the land strip between the lakes and then SW to the green, routed on the open side of the two palm rows (a first try dropped 13 real palms; final version drops only a small shrub beside a kept palm at ~(944,817)). All 18 holes are now traced. Same caveat as hole 17: the lakes render as grass until item 22. Note for the owner: phones that already have the app may keep showing '3D soon' on new holes until the service worker refreshes its cached course.json (seen in the local preview).
- 2026-11-06: item 15 (6b715c8): hole 17 traced (par 4) — big round green (~20×22 m) right of its front-left bunker, tee strip (~20×6 m) south of the road, fairway (~19–27 m) from the cart-path crossing NE between the wavy road-side bunkers and the lake, ending short of the green-side bunker (nudged south at x≈934 to keep a real palm; one false 'palm' on the tee edge dropped). Two problems found, NOT fixed: (1) the lake right of this fairway is missing from the water data (new item 22); (2) the long wavy fairway-bunker chain along the road (~560–845, 665–790 hole17 px) is not detected as sand at all — item 18 must add it. Local preview tip: the PWA service worker serves a stale course.json; unregister it / clear caches before checking a new hole.
- 2026-11-06: item 14 (b9c4d64): hole 16 traced (par 3, no fairway) — green oval (~15×18 m) between the left, right and front bunkers, two tee boxes (west ~21×7 m with the two back markers, east ~12×6 m with the forward marker) following the mowed strip between the tree clumps. No paved cart path on the line of play (the paved lane north of the tee is a road). Previewed in 3D, no errors.
- 2026-11-06: item 13 (4fdd990): hole 15 traced (par 3, no fairway) — green oval (~19×13 m, tilted down to the east) just below its back-right bunker, one long tee strip (~24×7 m) between the tree line and the paved cart path (path added). Previewed in 3D, no errors.
- 2026-11-06: item 12 (e4e0a1f): hole 14 traced (par 4) — green oval (~16×19 m) inside its ring of four bunkers, back tee strip (~24×7 m, two markers) beside the hedge, forward tee oval, paved cart path behind the back tee. Fairway (~13–21 m wide) follows the mowed band NORTH of the palm row (the straight tee→green line runs through the palms), ending short of the green's front-left bunker. Fairway width/position is the least certain part — owner please compare. course.json is now 1.52 MB raw (over the old 1.5 MB guide; gzip ~0.42 MB) — 4 holes left.
- 2026-11-06: item 11 (f2fb319): hole 13 traced (par 3, no fairway) — round green (~16×17 m) just south of the left and back bunkers (the green's edge is faint on the photo; owner may want to check its position against Google 3D), one tee strip (~25×6 m) along the road holding all three markers. No paved cart path on this hole. course.json is now 1.49 MB (guide was <1.5 MB) — 5 more holes will push it to ~1.55 MB; a later run should raise the terrain grid spacing or trim precision if the size matters.
- 2026-11-06: item 10 (db859a5): hole 12 traced (par 3, no fairway) — green oval (~13×19 m, leaning NE) between its two right-side bunkers, one tee strip (~26×6 m) with all three markers, cart path from the tee toward the condos. The tee dropped a false tree on the shadow of the real tree south of the tee (that tree stays). For item 18: the 'bunker' at ~(670,570) hole12 px west of the tee is bare dirt, not sand. Previewed in 3D, no errors.
- 2026-11-06: item 9 (620baf5): hole 11 traced (par 3, no fairway) — tall green oval (~16×22 m) between the left and right bunkers, one diagonal tee strip (~20×6 m) holding all three markers, paved cart paths behind the tee and short of the green. For item 18: small sand patch at ~(575,516) hole11 px by the tee-side planter is probably a planter bed, not a bunker. Previewed in 3D, no errors.
- 2026-11-06: item 8 (f927a05): hole 10 traced (par 4) — green oval (~14×19 m) between the back-right and front-right bunkers, forward tee oval, back tee strip (~27×8 m, both back markers) along the paved cart path (path added from the forward tee past the back tee toward the clubhouse). Fairway winds between the tree groups (narrow, ~13 m, at x≈740 hole10 px where trees close in on both sides; nudged north at x≈1415 to keep a real tree). The north cart path near (1600–1720, 180–320) was not added (off this hole's line). Previewed in 3D, no errors.
- 2026-11-06: item 7 (68a3092): hole 9 traced (par 4) — green oval (~23×15 m) between the front-left and right bunkers, 3 separate tee ovals, fairway (~20–28 m wide) from just past the tee-side trees (x≈900 hole9 px) to the green front, kept clear of the real oak at ~(932,506) and of the palms along the south edge. Fairway edges are faint on the photo between x 1300–1500 (narrow gap between trees) — owner may want to eyeball its width there. Previewed in 3D, no errors.
- 2026-11-06: item 6 (b6156a4): hole 8 traced (par 3, no fairway) — elongated green (~25×11 m, tilted down to the right) fitted between the back bunker and the two front bunkers; one long diagonal tee strip (~27×6 m) through the tree pocket holding all three markers (middle part is under tree shadow, so its edges are estimated). The traced green also dropped a false "bunker" the color detector had placed on the green (67→66 bunkers; DEM tiles changed slightly with it). Previewed in 3D, no app errors.
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
