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
page.on('pageerror', (e) => errs.push(e.message))
await page.goto('http://127.0.0.1:5178/#/', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 900))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let pass = 0
let fail = 0
function check(name, ok, detail = '') {
  if (ok) {
    pass += 1
    console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

/** 取视口内、表头以下、分布在不同行的块 */
const pickBars = (n = 2) =>
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
      const key = Math.round(b.y)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(b)
      if (out.length >= count) break
    }
    return out
  }, n)

/** 重新取某个块当前的中心坐标（多次操作后位置会变） */
const centerOf = (id) =>
  page.evaluate((id) => {
    const el = document.querySelector(`.gantt-bar[data-id="${id}"]`)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, id)

const snapshot = (ids) =>
  page.evaluate(
    (ids) =>
      ids.map((id) => {
        const t = window.__gantt.state.tasks.find((x) => x.id === id)
        return { id, start: t.start, end: t.end, rowId: t.rowId }
      }),
    ids,
  )

const rowIndexOf = (ids) =>
  page.evaluate(
    (ids) =>
      ids.map((id) => {
        const t = window.__gantt.state.tasks.find((x) => x.id === id)
        return window.__gantt.filteredRows.value.findIndex((r) => r.id === t.rowId)
      }),
    ids,
  )

const logCount = () => page.evaluate(() => window.__gantt.state.logs.length)
const lastLog = () =>
  page.evaluate(() => {
    const l = window.__gantt.state.logs[0]
    return l ? { action: l.action, detail: l.detail, n: l.items?.length ?? 0, label: l.taskLabel } : null
  })

/* ---------------- 1. Ctrl+点击多选 ---------------- */
console.log('\n[1] Ctrl+点击多选')
let bars = await pickBars(3)
check('取到 3 个不同行的块', bars.length === 3, bars.map((b) => b.id).join(', '))

await page.mouse.click(bars[0].x, bars[0].y)
await sleep(150)
await page.keyboard.down('Control')
await page.mouse.click(bars[1].x, bars[1].y)
await sleep(120)
await page.mouse.click(bars[2].x, bars[2].y)
await page.keyboard.up('Control')
await sleep(250)

const sel = await page.evaluate(() => ({
  ids: [...window.__gantt.state.selectedIds],
  primary: window.__gantt.state.selectedId,
  domSelected: document.querySelectorAll('.gantt-bar.is-selected').length,
  multi: document.querySelectorAll('.gantt-bar.is-multi').length,
}))
check('选中集合含 3 项', sel.ids.length === 3, sel.ids.join(', '))
check('锚点为最后点击的块', sel.primary === bars[2].id, sel.primary)
check('DOM 高亮数量一致', sel.domSelected === 3, String(sel.domSelected))
check('多选块使用虚线样式', sel.multi === 3, String(sel.multi))
await page.screenshot({ path: 'shots/m1-multiselect.png' })

/* ---------------- 2. Ctrl+点击取消 ---------------- */
console.log('\n[2] Ctrl+点击取消选中')
await page.keyboard.down('Control')
await page.mouse.click(bars[1].x, bars[1].y)
await page.keyboard.up('Control')
await sleep(200)
const ids2 = await page.evaluate(() => [...window.__gantt.state.selectedIds])
check('取消后剩 2 项', ids2.length === 2, ids2.join(', '))
check('被取消的块不在集合内', !ids2.includes(bars[1].id))

/* ---------------- 3. 整组水平拖动 ---------------- */
console.log('\n[3] 整组水平拖动（+3h）')
const before2 = await snapshot(ids2)
const c3 = await centerOf(ids2[0])
await page.mouse.move(c3.x, c3.y)
await page.mouse.down()
await page.mouse.move(c3.x + 72, c3.y, { steps: 8 })
await sleep(150)
const tip = await page.$eval('.bar-drag-tip', (el) => el.textContent.trim()).catch(() => '')
await page.mouse.up()
await sleep(350)
const after2 = await snapshot(ids2)
const deltas = after2.map((t, i) => (t.start - before2[i].start) / 3600e3)
check('两块都后移 3 小时', deltas.every((d) => Math.abs(d - 3) < 1e-6), deltas.map((d) => d.toFixed(1) + 'h').join(', '))
check('拖拽提示含项数', tip.includes('2 项'), tip)
const log3 = await lastLog()
check('整组拖动只记 1 条历史', log3?.n === 2, `action=${log3?.action}, items=${log3?.n}`)
check('历史描述含"共 2 项"', (log3?.detail ?? '').includes('共 2 项'), log3?.detail)

/* ---------------- 4. 整组纵向换行 ---------------- */
console.log('\n[4] 整组纵向拖动换行（下移 2 行）')
const before3 = await snapshot(ids2)
const rowIdxBefore = await rowIndexOf(ids2)
const c4 = await centerOf(ids2[0])
await page.mouse.move(c4.x, c4.y)
await page.mouse.down()
await page.mouse.move(c4.x, c4.y + 54 * 2, { steps: 10 })
await sleep(200)
const tipRow = await page.$eval('.bar-drag-tip', (el) => el.textContent.trim()).catch(() => '')
await page.screenshot({ path: 'shots/m2-row-drag.png' })
await page.mouse.up()
await sleep(350)
const after3 = await snapshot(ids2)
const rowIdxAfter = await rowIndexOf(ids2)
const rowDeltas = rowIdxAfter.map((v, i) => v - rowIdxBefore[i])
check('两块都下移 2 行', rowDeltas.every((d) => d === 2), rowDeltas.join(', '))
check('换行不改变时间', after3.every((t, i) => t.start === before3[i].start), '')
check('拖拽提示含行位移', /下移 2 行/.test(tipRow), tipRow)
const log4 = await lastLog()
check('换行记 1 条整组历史', log4?.n === 2 && /换行/.test(log4?.detail ?? ''), log4?.detail)

/* ---------------- 5. 撤销整组换行 ---------------- */
console.log('\n[5] 撤销整组换行')
await page.keyboard.down('Control')
await page.keyboard.press('z')
await page.keyboard.up('Control')
await sleep(400)
const rowIdxUndo = await rowIndexOf(ids2)
check('一次 Ctrl+Z 整组回到原行', rowIdxUndo.every((v, i) => v === rowIdxBefore[i]), rowIdxUndo.join(', '))

/* ---------------- 6. 多选下方向键（连按合并） ---------------- */
console.log('\n[6] 多选下方向键')
const beforeKb = await snapshot(ids2)
const logsBeforeKb = await logCount()
await page.keyboard.press('ArrowRight')
await sleep(120)
await page.keyboard.press('ArrowRight')
await sleep(300)
const afterKb = await snapshot(ids2)
const kbDeltas = afterKb.map((t, i) => (t.start - beforeKb[i].start) / 3600e3)
check('→ 整组后移 2 小时', kbDeltas.every((d) => Math.abs(d - 2) < 1e-6), kbDeltas.join(', '))
const logsAfterKb = await logCount()
check('连按合并为 1 条历史', logsAfterKb - logsBeforeKb === 1, `新增 ${logsAfterKb - logsBeforeKb} 条`)

/* ---------------- 7. 多选下 ↑ ↓ 整组换行 ---------------- */
console.log('\n[7] 多选下 ↓ 整组换行')
const rowBeforeKey = await rowIndexOf(ids2)
await page.keyboard.press('ArrowDown')
await sleep(300)
const rowAfterKey = await rowIndexOf(ids2)
check('↓ 整组下移 1 行', rowAfterKey.every((v, i) => v === rowBeforeKey[i] + 1), rowAfterKey.join(', '))
await page.keyboard.press('ArrowUp')
await sleep(300)

/* ---------------- 8. 单击单个块后拖动只动单块 ---------------- */
console.log('\n[8] 单击后拖动只动单块')
await page.keyboard.press('Escape')
await sleep(150)
const single = (await pickBars(1))[0]
await page.mouse.click(single.x, single.y)
await sleep(180)
const singleBefore = await page.evaluate(
  (id) => window.__gantt.state.tasks.find((t) => t.id === id).start,
  single.id,
)
const othersBefore = await snapshot(ids2.filter((id) => id !== single.id))
const c8 = await centerOf(single.id)
await page.mouse.move(c8.x, c8.y)
await page.mouse.down()
await page.mouse.move(c8.x + 48, c8.y, { steps: 6 })
await page.mouse.up()
await sleep(300)
const singleAfter = await page.evaluate(
  (id) => window.__gantt.state.tasks.find((t) => t.id === id).start,
  single.id,
)
const othersAfter = await snapshot(ids2.filter((id) => id !== single.id))
check(
  '单块拖动生效（+2h）',
  Math.abs((singleAfter - singleBefore) / 3600e3 - 2) < 1e-6,
  `${((singleAfter - singleBefore) / 3600e3).toFixed(1)}h`,
)
check('其他块未跟随移动', othersAfter.every((t, i) => t.start === othersBefore[i].start), '')
check('单块拖动后选中集合只剩 1 项', (await page.evaluate(() => window.__gantt.state.selectedIds.length)) === 1)

/* ---------------- 9. 多选批量删除 + 撤销 ---------------- */
console.log('\n[9] 多选批量删除')
const beforeDel = await page.evaluate(() => window.__gantt.state.tasks.length)
const pick2 = await pickBars(2)
await page.mouse.click(pick2[0].x, pick2[0].y)
await sleep(120)
await page.keyboard.down('Control')
await page.mouse.click(pick2[1].x, pick2[1].y)
await page.keyboard.up('Control')
await sleep(200)
await page.keyboard.press('Delete')
await sleep(400)
const delState = await page.evaluate(() => {
  const l = window.__gantt.state.logs[0]
  return {
    n: window.__gantt.state.tasks.length,
    sel: window.__gantt.state.selectedIds.length,
    itemsLen: Array.isArray(l?.items) ? l.items.length : 0,
    detail: l?.detail ?? '',
  }
})
check('删除了 2 个任务', beforeDel - delState.n === 2, `${beforeDel} → ${delState.n}`)
check('删除后清空选择', delState.sel === 0)
check('删除记 1 条批量历史', delState.itemsLen === 2, delState.detail)

await page.keyboard.down('Control')
await page.keyboard.press('z')
await page.keyboard.up('Control')
await sleep(400)
const restored = await page.evaluate(() => window.__gantt.state.tasks.length)
check('撤销恢复 2 个任务', restored === beforeDel, `${restored}/${beforeDel}`)
check('撤销后自动选中恢复的任务', (await page.evaluate(() => window.__gantt.state.selectedIds.length)) >= 1)
await page.screenshot({ path: 'shots/m3-after.png' })

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`)
console.log('页面错误:', errs.length ? errs : 'none')
await browser.close()
process.exit(fail ? 1 : 0)
