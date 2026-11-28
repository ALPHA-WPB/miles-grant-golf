# Headless preview for graphics work

For when the Browser-pane preview is not available. Needs Python with `playwright`, `pillow`, `psutil` and a Chrome
binary (`CHROME=/path/to/chrome`, default `/usr/bin/google-chrome`). Chrome draws with its software renderer, so it
works on a machine with no GPU.

    npm run build && npx vite preview --port 4173 &
    python3 tools/course3d/preview/shot.py http://localhost:4173/ 3 high /tmp/out tee mid green over
    python3 tools/course3d/preview/leak.py http://localhost:4173/ low 5

- `shot.py URL HOLE GFX OUT [cams]` opens the hole in 3D as a guest, waits for the scene, and saves one screenshot per
  camera (`tee`, `teebox`, `mid`, `side`, `green`, `close`, `over`, `top`). It prints the triangle count and Chrome's
  memory. `W`, `H`, `DPR` set the viewport (default: a phone, 390x844 at 2x); `UI=1` leaves the app's buttons in.
  The aerial photo is replaced by a flat tile (the photo server is not reachable from every sandbox), so only the drawn
  course can be judged, not the ground outside it.
- `leak.py URL GFX N` walks N holes with the next-hole arrow and counts live maps, scenes and renderers after each.
  All three must stay at 1.
- `catalog.html` is the tree catalogue: every palm crown and every broadleaf form side by side, without opening a hole.
  Run `npx vite --port 5173`, then
  `python3 tools/course3d/preview/catalog.py "http://localhost:5173/tools/course3d/preview/catalog.html?view=palms&lod=0&from=0&n=6" /tmp/palms.png`.
  `view` is `palms`, `broad`, `mix` (a made-up grove placed by the real code) or `tex` (the drawn leaf textures);
  `lod` 0 = near the hole on GFX HIGH, 1 = near on LOW, 2 and 3 = the two far tiers; `el` is the camera's height angle.
