import puppeteer from 'puppeteer-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 950 },
})
const page = await browser.newPage()
const errs = []
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errs.push('console: ' + m.text())
})

await page.goto('http://127.0.0.1:5178/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 700))

// ---------- 注入大数据 ----------
await page.evaluate(() => {
  const g = window.__gantt
  const HOUR = 3600e3
  const dayStart = (d) => {
    const t = new Date()
    t.setHours(0, 0, 0, 0)
    return t.getTime() + d * 24 * HOUR
  }
  const rows = []
  for (let i = 0; i < 48; i += 1) {
    rows.push({ id: `r${i}`, aircraftType: 'B737-800', tailNumber: `B-${1000 + i}`, base: 'PEK' })
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
          title: `任务 ${k}`,
          type: k === 4 ? 'maintenance' : 'flight',
          status: 'plan',
          start,
          end: start + 2.2 * HOUR,
        })
      }
    }
  }
  g.state.rows = rows
  g.state.tasks = tasks
  g.state.rangeStart = dayStart(-1)
  g.state.days = 31
  g.state.hourWidth = 24
  g.state.selectedId = null
})
await new Promise((r) => setTimeout(r, 900))

const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** 只挑视口内完整可见的块，避免拿到缓冲区里滚出屏幕的块 */
const pickVisibleBar = () =>
  page.evaluate(() => {
    // 表头是 sticky 的，块的上半部分可能被盖住，只选完全在表头以下的块
    const headBottom = document.querySelector('.gantt-head').getBoundingClientRect().bottom
    const el = [...document.querySelectorAll('.gantt-bar')].find((b) => {
      const r = b.getBoundingClientRect()
      return r.x > 320 && r.x + r.width < 1500 && r.y > headBottom + 4
    })
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { id: el.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })

// ---------- 1. 视口裁剪生效 ----------
let m = await page.evaluate(() => ({
  rows: document.querySelectorAll('.gantt-row').length,
  bars: document.querySelectorAll('.gantt-bar').length,
  hours: document.querySelectorAll('.tl-hour').length,
  days: document.querySelectorAll('.tl-day').length,
}))
check('裁剪后只渲染视口内行/块', m.rows < 48 && m.bars < 2000, `行 ${m.rows}/48 · 块 ${m.bars}`)
check('表头只渲染可视日期', m.days <= 6 && m.hours <= 200, `日 ${m.days} · 时格 ${m.hours}`)

// ---------- 2. 点选 + 方向键微调 + 历史 ----------
m = await pickVisibleBar()
await page.mouse.click(m.x, m.y)
await sleep(250)
let before = await page.evaluate((id) => {
  const t = window.__gantt.state.tasks.find((x) => x.id === id)
  return { start: t.start, end: t.end, logs: window.__gantt.state.logs.length }
}, m.id)
await page.keyboard.press('ArrowRight')
await sleep(300)
let after = await page.evaluate((id) => {
  const t = window.__gantt.state.tasks.find((x) => x.id === id)
  return { start: t.start, end: t.end, logs: window.__gantt.state.logs.length }
}, m.id)
check(
  '方向键移动并记录历史',
  after.start === before.start + 3600e3 && after.logs === before.logs + 1,
  `start +${(after.start - before.start) / 3600e3}h · 日志 ${before.logs}→${after.logs}`,
)

// 撤销
await page.keyboard.down('Control')
await page.keyboard.press('z')
await page.keyboard.up('Control')
await sleep(250)
after = await page.evaluate((id) => window.__gantt.state.tasks.find((x) => x.id === id).start, m.id)
check('Ctrl+Z 撤销移动', after === before.start)

// ---------- 3. 鼠标拖拽 ----------
const bar = await pickVisibleBar()
before = await page.evaluate((id) => window.__gantt.state.tasks.find((x) => x.id === id).start, bar.id)
await page.mouse.move(bar.x, bar.y)
await page.mouse.down()
await page.mouse.move(bar.x + 96, bar.y, { steps: 6 })
await page.mouse.up()
await sleep(300)
after = await page.evaluate((id) => window.__gantt.state.tasks.find((x) => x.id === id).start, bar.id)
check('拖拽块体改时间', after === before + 4 * 3600e3, `+${(after - before) / 3600e3}h`)

// ---------- 4. 纵向虚拟化：跳到最后一行仍能渲染与选中 ----------
m = await page.evaluate(() => {
  const g = window.__gantt
  const last = g.state.tasks.find((t) => t.rowId === 'r47')
  g.select(last.id) // revealTask 会把行滚进视口
  return { id: last.id }
})
await sleep(600)
m = await page.evaluate((id) => {
  const el = document.querySelector(`[data-id="${id}"]`)
  const g = window.__gantt
  return {
    rendered: !!el,
    rows: document.querySelectorAll('.gantt-row').length,
    selected: g.state.selectedId,
    sideText: [...document.querySelectorAll('.gantt-row .row-tail')].map((x) => x.textContent).slice(-1)[0],
  }
}, m.id)
check('跨行选中触发纵向窗口更新', m.rendered && m.selected !== null, `尾行 ${m.sideText} · 当前行数 ${m.rows}`)

// ---------- 5. 横向远距离滚动：表头与块同步 ----------
m = await page.evaluate(async () => {
  const el = document.querySelector('.gantt-stage')
  el.scrollLeft = 24 * 24 * 20 // 滚到第 20 天
  await new Promise((r) => setTimeout(r, 500))
  const g = window.__gantt
  const dayIdx = g.winStartDay.value ?? null
  return {
    firstDayLabel: document.querySelector('.tl-day .tl-day-label')?.textContent,
    bars: document.querySelectorAll('.gantt-bar').length,
    gapWidth: document.querySelector('.tl-gap')?.getBoundingClientRect().width,
  }
})
check('横向滚动后表头/块跟随', !!m.firstDayLabel && m.bars > 0, `首日 ${m.firstDayLabel} · 块 ${m.bars} · 偏移 ${Math.round(m.gapWidth)}px`)

// ---------- 6. 双击编辑 ----------
m = await pickVisibleBar()
await page.mouse.move(m.x, m.y)
await sleep(80)
await page.mouse.down({ clickCount: 1 })
await page.mouse.up({ clickCount: 1 })
await sleep(60)
await page.mouse.down({ clickCount: 2 })
await page.mouse.up({ clickCount: 2 })
await sleep(800)
m = await page.evaluate(() => ({
  dialog: !!document.querySelector('.el-dialog'),
  selected: window.__gantt.state.selectedId,
}))
check('双击打开编辑弹窗', m.dialog, `选中 ${m.selected}`)
await page.keyboard.press('Escape')
await sleep(300)

// ---------- 7. 拖拽跨出窗口再拖回，块不丢失 ----------
m = await pickVisibleBar()
await page.evaluate((id) => { window.__gantt.state.selectedId = id }, m.id)
const beforeDrag = await page.evaluate((id) => {
  const t = window.__gantt.state.tasks.find((x) => x.id === id)
  return { start: t.start, bars: document.querySelectorAll('.gantt-bar').length }
}, m.id)
await page.mouse.move(m.x, m.y)
await page.mouse.down()
await page.mouse.move(m.x - 500, m.y, { steps: 10 })
await page.mouse.up()
await sleep(400)
m = await page.evaluate((id) => {
  const t = window.__gantt.state.tasks.find((x) => x.id === id)
  const el = document.querySelector(`[data-id="${id}"]`)
  return { start: t.start, rendered: !!el }
}, m.id)
check(
  '拖出可视窗口后块仍存在',
  m.rendered,
  `start ${(m.start - beforeDrag.start) / 3600e3}h`,
)

// ---------- 8. 缩放与范围切换后窗口重算 ----------
m = await page.evaluate(async () => {
  const g = window.__gantt
  g.setHourWidth(48)
  await new Promise((r) => setTimeout(r, 500))
  const w1 = document.querySelectorAll('.tl-hour').length
  g.setRangeByDates(new Date().getTime() - 86400e3, new Date().getTime() + 29 * 86400e3)
  await new Promise((r) => setTimeout(r, 500))
  return {
    hoursAt48: w1,
    dayCount: document.querySelectorAll('.tl-day').length,
    dayWidth: document.querySelector('.tl-day').getBoundingClientRect().width,
  }
})
check('缩放后刻度重建', m.dayCount > 0 && Math.round(m.dayWidth) === 48 * 24, `日宽 ${Math.round(m.dayWidth)}px`)

// ---------- 9. 小数据回归（默认演示数据） ----------
m = await page.evaluate(async () => {
  const g = window.__gantt
  document.querySelector('.gantt-stage').scrollLeft = 0
  document.querySelector('.gantt-stage').scrollTop = 0
  await new Promise((r) => setTimeout(r, 300))
  g.reset()
  await new Promise((r) => setTimeout(r, 600))
  const ids = [...document.querySelectorAll('.gantt-bar')].map((b) => b.dataset.id)
  const storeBars = [...g.visibleTasksByRow.value.values()].reduce((a, b) => a + b.length, 0)
  return {
    bars: ids.length,
    unique: new Set(ids).size,
    rows: document.querySelectorAll('.gantt-row').length,
    total: g.state.tasks.length,
    rowTotal: g.state.rows.length,
    storeBars,
  }
})
check(
  'reset 后渲染与 store 可视集合一致',
  m.bars === m.storeBars && m.unique === m.bars && m.bars > 0 && m.rows <= m.rowTotal,
  `DOM ${m.bars} = store ${m.storeBars} · 总任务 ${m.total} · 行 ${m.rows}/${m.rowTotal}`,
)

console.log('')
console.log('异常:', errs.length ? errs : 'none')
console.log('结果:', results.filter((r) => r.ok).length + '/' + results.length, '通过')
await browser.close()
process.exit(results.every((r) => r.ok) && errs.length === 0 ? 0 : 1)
