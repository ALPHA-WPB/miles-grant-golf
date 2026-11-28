import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { splitCourse } from './tools/course3d/split.mjs'

// 3D course data: public/course3d/course.json (the whole property) is cut into one file per hole
// (/course3d/hole/<n>.json) plus /course3d/index.json, so phones load only the hole being played.
function course3dPerHole() {
  let split = null
  const get = () => (split ??= splitCourse(JSON.parse(readFileSync('public/course3d/course.json', 'utf8'))))
  return {
    name: 'course3d-per-hole',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const m = req.url?.match(/^\/course3d\/(?:index|hole\/(\d+))\.json/)
        if (!m) return next()
        split = null                               // re-read in dev, in case build.py just rewrote course.json
        const body = m[1] ? get().holes[m[1]] : get().index
        if (!body) { res.statusCode = 404; return res.end() }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(body))
      })
    },
    generateBundle() {
      const { index, holes } = get()
      this.emitFile({ type: 'asset', fileName: 'course3d/index.json', source: JSON.stringify(index) })
      for (const [n, data] of Object.entries(holes))
        this.emitFile({ type: 'asset', fileName: `course3d/hole/${n}.json`, source: JSON.stringify(data) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), course3dPerHole()],
})
