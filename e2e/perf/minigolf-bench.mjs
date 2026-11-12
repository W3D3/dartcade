// The minigolf 3D benchmark (#/admin/minigolf?bench=1) run in Chromium at several window sizes,
// pixel ratios and CPU slowdowns; prints a table and writes every run's JSON. Not part of any test
// suite or CI: run by hand (DEVELOPMENT.md, "Minigolf 3D performance").
//
//   node perf/minigolf-bench.mjs [--origin http://localhost:5174] [--gpu] [--chrome /path/to/chrome]
//     [--sizes 1920x1080,3840x2160] [--dpr 1,2] [--throttle 1,4] [--query 'quality=low;quality=high'] [--runs 1] [--out file.json]
//
// Signs in as BENCH_EMAIL / BENCH_PASSWORD (an admin). Without --gpu Chromium draws with SwiftShader,
// its software GL: a worst-case stand-in for a weak GPU, not a measure of any real one.
import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: opt } = parseArgs({
  options: {
    origin: { type: 'string', default: `http://localhost:${process.env.E2E_FRONTEND_PORT ?? 5174}` },
    gpu: { type: 'boolean', default: false },
    chrome: { type: 'string' },
    sizes: { type: 'string', default: '1920x1080' },
    dpr: { type: 'string', default: '1' },
    throttle: { type: 'string', default: '1' },
    query: { type: 'string', default: '' },
    runs: { type: 'string', default: '1' },
    out: { type: 'string', default: 'minigolf-bench.json' },
  },
})
const list = s => s.split(',').filter(Boolean)
const email = process.env.BENCH_EMAIL ?? 'visual@test.local'
const password = process.env.BENCH_PASSWORD ?? 'VisualPass1!'

// Held to 60 Hz as on a real screen: unthrottled, requestAnimationFrame runs ahead of the GPU and
// its intervals stop being frames shown. The headroom under 60 fps shows in the cpu and gpu times.
const args = opt.gpu
  ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=gl']
  : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
const browser = await chromium.launch({ args, executablePath: opt.chrome })
const runs = []
for (const size of list(opt.sizes)) {
  const [width, height] = size.split('x').map(Number)
  for (const dpr of list(opt.dpr).map(Number)) {
    for (const throttle of list(opt.throttle).map(Number)) {
      for (const query of opt.query.split(';')) {
        for (let run = 0; run < Number(opt.runs); run++) {
          // A window of `size` CSS px at `dpr`: the canvas is size × dpr device px
          const context = await browser.newContext({ viewport: { width: width / dpr, height: height / dpr }, deviceScaleFactor: dpr })
          const page = await context.newPage()
          const signIn = await page.request.post(`${opt.origin}/api/auth/sign-in/email`, {
            headers: { Origin: opt.origin },
            data: { email, password },
          })
          if (!signIn.ok()) throw new Error(`sign-in failed: ${signIn.status()}`)
          const cdp = await context.newCDPSession(page)
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle })
          await page.goto(`${opt.origin}/#/admin/minigolf?bench=1${query ? `&${query}` : ''}`)
          await page.waitForFunction(() => window.__minigolfBench, null, { timeout: 180_000, polling: 1000 })
          const report = await page.evaluate(() => window.__minigolfBench)
          runs.push({ size, dpr, throttle, query, run, report })
          const a = report.all
          console.log(
            [
              `${size} css/${dpr}`.padEnd(16),
              `cpu×${throttle}`.padEnd(6),
              (query || '-').padEnd(18),
              `${a.fps} fps`.padEnd(11),
              `1%low ${a.low1Fps}`.padEnd(12),
              `p50 ${a.frameMs.p50}`.padEnd(10),
              `p95 ${a.frameMs.p95}`.padEnd(10),
              `cpu ${a.cpuMs.p50}`.padEnd(10),
              `${report.device.canvas}`,
              report.device.gpu,
            ].join(' '),
          )
          await context.close()
        }
      }
    }
  }
}
await browser.close()
writeFileSync(opt.out, JSON.stringify(runs, null, 2))
console.log(`wrote ${opt.out}`)
