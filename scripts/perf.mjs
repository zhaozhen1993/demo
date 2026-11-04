import puppeteer from 'puppeteer-core'
import { createHash } from 'node:crypto'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = 'http://127.0.0.1:5178/'

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 950 },
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push(e.message))

await page.goto(URL, { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 600))

// ---------- 注入大数据：48 架机位 × 45 天 × 5 条 ≈ 10800 条任务 ----------
const size = await page.evaluate(() => {
  const g = window.__gantt
  const HOUR = 3600e3
  const dayStart = (d) => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t.getTime() + d * 24 * HOUR
  }
  const AIR = ['B737-800', 'A320neo', 'A330-300', 'B787-9', 'ARJ21-700']
  const BASES = ['PEK', 'SHA', 'CAN', 'CTU', 'SZX']
  const rows = []
  for (let i = 0; i < 48; i += 1) {
    rows.push({
      id: `r${i}`,
      aircraftType: AIR[i % AIR.length],
      tailNumber: `B-${1000 + i}`,
      base: BASES[i % BASES.length],
    })
  }
  const tasks = []
  let n = 0
  for (let i = 0; i < 48; i += 1) {
    for (let d = 0; d < 45; d += 1) {
      for (let k = 0; k < 5; k += 1) {
        const start = dayStart(d - 3) + (5 + k * 3.6) * HOUR
        tasks.push({
          id: `t${n++}`,
          rowId: `r${i}`,
          title: k === 4 ? '航后检查' : `航班 MU${200 + k}`,
          type: k === 4 ? 'maintenance' : 'flight',
          status: 'plan',
          start,
          end: start + 2.2 * HOUR,
        })
      }
    }
  }
  const t0 = performance.now()
  g.state.rows = rows
  g.state.tasks = tasks
  g.state.rangeStart = dayStart(-1)
  g.state.days = 31
  g.state.hourWidth = 24
  g.state.selectedId = null
  return { rows: rows.length, tasks: tasks.length, injectMs: Math.round(performance.now() - t0) }
})

/** 等两帧 + 固定延时，让 Vue 把渲染与绘制做完 */
const settle = async (ms = 900) => {
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
  )
  await new Promise((r) => setTimeout(r, ms))
}

/** 统计 DOM 规模 */
const domStats = () =>
  page.evaluate(() => ({
    total: document.querySelectorAll('*').length,
    stage: document.querySelectorAll('.gantt-stage *').length,
    rows: document.querySelectorAll('.gantt-row').length,
    bars: document.querySelectorAll('.gantt-bar').length,
    dayCells: document.querySelectorAll('.tl-day').length,
    hourCells: document.querySelectorAll('.tl-hour').length,
  }))

/** 滚动 40 步，记录每帧间隔（反映主线程在滚动时是否被阻塞） */
const scrollSweep = () =>
  page.evaluate(async () => {
    const el = document.querySelector('.gantt-stage')
    el.scrollLeft = 0
    await new Promise((r) => requestAnimationFrame(r))
    await new Promise((r) => requestAnimationFrame(r))
    const gaps = []
    let last = performance.now()
    for (let i = 0; i < 40; i += 1) {
      el.scrollLeft += 240
      await new Promise((r) => requestAnimationFrame(r))
      const now = performance.now()
      gaps.push(now - last)
      last = now
    }
    gaps.sort((a, b) => a - b)
    const sum = gaps.reduce((a, b) => a + b, 0)
    return {
      p50: Math.round(gaps[Math.floor(gaps.length / 2)]),
      p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]),
      max: Math.round(gaps[gaps.length - 1]),
      avg: Math.round(sum / gaps.length),
    }
  })

/** 一次完整重排 + 重绘的耗时（换行高强制同步布局） */
const relayoutCost = () =>
  page.evaluate(() => {
    const el = document.querySelector('.gantt-stage')
    const t0 = performance.now()
    el.scrollLeft += 120
    document.querySelector('.gantt-canvas').getBoundingClientRect()
    return Math.round(performance.now() - t0)
  })

await settle()
const opt = { dom: await domStats(), fps: await scrollSweep(), layoutMs: await relayoutCost() }
await page.screenshot({ path: 'shots/perf-1-optimized.png' })

// 同一位置截图，用于和“全量渲染”做像素级比对
await page.evaluate(() => {
  document.querySelector('.gantt-stage').scrollLeft = 3012
})
await settle(400)
const shotOpt = await page.screenshot({ path: 'shots/perf-same-opt.png' })

// ---------- 关闭裁剪：把视口设成无限大，等价于改动前的全量渲染 ----------
await page.evaluate(() => {
  window.__gantt.viewport.width = 1e6
  window.__gantt.viewport.height = 1e6
})
await settle(2500)
const full = { dom: await domStats(), fps: await scrollSweep(), layoutMs: await relayoutCost() }
await page.screenshot({ path: 'shots/perf-2-full.png' })

// 回到同一滚动位置再截图，保证两张图可比
await page.evaluate(() => {
  document.querySelector('.gantt-stage').scrollLeft = 3012
})
await settle(600)
const shotFull = await page.screenshot({ path: 'shots/perf-same-full.png' })
const same = createHash('sha1').update(shotOpt).digest('hex') === createHash('sha1').update(shotFull).digest('hex')

const pct = (a, b) => (b === 0 ? 0 : Math.round(((a - b) / b) * 100))

console.log('数据规模:', JSON.stringify(size))
console.log('')
console.log('指标                全量渲染      裁剪后      变化')
console.log('------------------------------------------------------')
const row = (name, a, b) => console.log(`${name.padEnd(14)}${String(a).padStart(10)}${String(b).padStart(12)}${(pct(b, a) + '%').padStart(10)}`)
row('DOM 节点', full.dom.total, opt.dom.total)
row('stage 内节点', full.dom.stage, opt.dom.stage)
row('甘特块', full.dom.bars, opt.dom.bars)
row('小时格', full.dom.hourCells, opt.dom.hourCells)
row('渲染行', full.dom.rows, opt.dom.rows)
console.log('------------------------------------------------------')
row('滚动帧 p50(ms)', full.fps.p50, opt.fps.p50)
row('滚动帧 p95(ms)', full.fps.p95, opt.fps.p95)
row('滚动帧 max(ms)', full.fps.max, opt.fps.max)
row('同步布局(ms)', full.layoutMs, opt.layoutMs)
console.log('')
console.log('同位置截图字节完全一致:', same ? '是（视觉无差异）' : '否（需检查）')
console.log('页面错误:', errs.length ? errs : 'none')

await browser.close()
