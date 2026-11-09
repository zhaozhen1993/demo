import puppeteer from 'puppeteer-core'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: 'new',
  args: ['--no-sandbox'],
  defaultViewport: { width: 1600, height: 950 },
})
const page = await browser.newPage()
await page.goto('http://127.0.0.1:5178/#/', { waitUntil: 'networkidle0' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await sleep(900)

const pick = (n) =>
  page.evaluate((count) => {
    const headBottom = document.querySelector('.gantt-head').getBoundingClientRect().bottom
    const bars = [...document.querySelectorAll('.gantt-bar')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { id: el.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2, y0: r.y }
      })
      .filter((b) => b.x > 320 && b.x < 1500 && b.y0 > headBottom + 4)
    const seen = new Set()
    const out = []
    for (const b of bars) {
      const k = Math.round(b.y)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(b)
      if (out.length >= count) break
    }
    return out
  }, n)

const snap = (ids) =>
  page.evaluate(
    (ids) =>
      ids.map((id) => {
        const t = window.__gantt.state.tasks.find((x) => x.id === id)
        return { id, start: t.start, h: (t.start - window.__t0) / 0, rowId: t.rowId }
      }),
    ids,
  )

const starts = (ids) =>
  page.evaluate(
    (ids) => ids.map((id) => window.__gantt.state.tasks.find((x) => x.id === id).start),
    ids,
  )

const selInfo = () =>
  page.evaluate(() => ({
    ids: [...window.__gantt.state.selectedIds],
    dragging: window.__gantt.state.draggingId,
    tip: window.__gantt.state.dragTip,
  }))

/* 场景 A：按住 Ctrl 不放，直接拖动已选中的块 */
console.log('\n=== A. 按住 Ctrl 拖动（用户很可能这么操作） ===')
const bars = await pick(3)
await page.mouse.click(bars[0].x, bars[0].y)
await sleep(150)
await page.keyboard.down('Control')
await page.mouse.click(bars[1].x, bars[1].y)
await sleep(120)
await page.mouse.click(bars[2].x, bars[2].y)
await sleep(150)
const ids = (await selInfo()).ids
console.log('  选中集合:', ids.length)
const before = await starts(ids)
const c = await page.evaluate((id) => {
  const r = document.querySelector(`.gantt-bar[data-id="${id}"]`).getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, ids[0])
await page.mouse.move(c.x, c.y)
await page.mouse.down()
await page.mouse.move(c.x + 96, c.y, { steps: 10 })
await sleep(120)
const midA = await selInfo()
await page.mouse.up()
await page.keyboard.up('Control')
await sleep(300)
const after = await starts(ids)
console.log('  拖动中 draggingId =', midA.dragging, '| 选中数量 =', midA.ids.length)
console.log('  位移(小时):', after.map((s, i) => ((s - before[i]) / 3600e3).toFixed(1)).join(', '))
console.log('  结论:', after.every((s, i) => s === before[i]) ? '❌ 没有移动' : '✅ 有移动')

/* 场景 B：Ctrl+点击后立刻（不松手）拖动 */
console.log('\n=== B. Ctrl 按住，从一块直接拖到另一块（不松 Ctrl） ===')
await page.keyboard.press('Escape')
await sleep(150)
const b2 = await pick(2)
await page.mouse.click(b2[0].x, b2[0].y)
await sleep(120)
const beforeB = await starts([b2[0].id, b2[1].id])
await page.keyboard.down('Control')
await page.mouse.move(b2[1].x, b2[1].y)
await page.mouse.down()
await page.mouse.move(b2[1].x + 96, b2[1].y, { steps: 10 })
await page.mouse.up()
await page.keyboard.up('Control')
await sleep(300)
const afterB = await starts([b2[0].id, b2[1].id])
console.log('  位移(小时):', afterB.map((s, i) => ((s - beforeB[i]) / 3600e3).toFixed(1)).join(', '))
console.log('  结论:', afterB[1] === beforeB[1] ? '❌ 被拖的块没动' : '✅ 有移动')

/* 场景 C：正常多选后拖（对照） */
console.log('\n=== C. 正常多选后（松开 Ctrl）拖动 ===')
await page.keyboard.press('Escape')
await sleep(150)
const b3 = await pick(2)
await page.mouse.click(b3[0].x, b3[0].y)
await page.keyboard.down('Control')
await page.mouse.click(b3[1].x, b3[1].y)
await page.keyboard.up('Control')
await sleep(200)
const ids3 = (await selInfo()).ids
const beforeC = await starts(ids3)
const c3 = await page.evaluate((id) => {
  const r = document.querySelector(`.gantt-bar[data-id="${id}"]`).getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}, ids3[0])
await page.mouse.move(c3.x, c3.y)
await page.mouse.down()
await page.mouse.move(c3.x + 96, c3.y, { steps: 10 })
await sleep(120)
await page.screenshot({ path: 'shots/repro-c.png' })
await page.mouse.up()
await sleep(300)
const afterC = await starts(ids3)
console.log('  位移(小时):', afterC.map((s, i) => ((s - beforeC[i]) / 3600e3).toFixed(1)).join(', '))
console.log('  结论:', afterC.every((s, i) => s === beforeC[i]) ? '❌ 没有移动' : '✅ 有移动')

await browser.close()
