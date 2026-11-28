#!/bin/sh
# Triangle budget check WITHOUT a browser: bundles src/components/realScene.js for Node, stubs the canvas, builds the
# scene for every hole on GFX HIGH and LOW and prints window.__mggSceneStats.triangles (same numbers as the app).
# usage (from the repo root): sh tools/course3d/tri_count/run.sh
H=$(cd "$(dirname "$0")" && pwd); R=$(cd "$H/../../.." && pwd); N=/Applications/Codex.app/Contents/Resources/cua_node/bin
[ -x "$N/node" ] || N=$(dirname "$(command -v node)")   # any node will do when the Codex one is not there
OUT="${TMPDIR:-/tmp}/mgg-scene.mjs"
"$R/node_modules/.bin/esbuild" "$R/src/components/realScene.js" --bundle --format=esm --platform=node --outfile="$OUT" \
  --alias:maplibre-gl="$H/shim-maplibre.js" --loader:.jpg=dataurl --loader:.png=dataurl --log-level=error || exit 1
SCENE="$OUT" COURSE="$R/public/course3d/course.json" APP="$R/src/App.jsx" "$N/node" "$H/count.mjs"
