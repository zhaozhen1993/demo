import puppeteer from 'puppeteer-core'
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 1000 } })
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(e.message))
await page.goto('http://127.0.0.1:5178/#/report', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 900))
const sleep = ms => new Promise(r => setTimeout(r, ms))

console.log('模块卡数量:', await page.$$eval('.module-card', els => els.length))
console.log('初始 JSON 空状态:', await page.$$eval('.json-empty', els => els.length))
const genDisabled = await page.$eval('.gen-actions .el-button--primary', el => el.disabled)
console.log('生成按钮初始禁用:', genDisabled)

await page.screenshot({ path: 'shots/r1-initial.png' })

// 依次执行 4 个模块（按卡片定位，避免"重置"按钮加入后索引错位）
for (let i = 0; i < 4; i++) {
  await page.$$eval('.module-card', (cards, i) => {
    const btn = cards[i].querySelector('.card-actions button')
    btn.scrollIntoView({ block: 'center' })
    btn.click()
  }, i)
  await sleep(1800)
}
const doneTags = await page.$$eval('.module-card .card-head .el-tag', els => els.map(e => e.textContent.trim()))
console.log('模块状态:', doneTags)
console.log('就绪标签:', await page.$eval('.gen-card .card-status .el-tag', e => e.textContent.trim()))
console.log('JSON 展示:', (await page.$eval('.json-pre', e => e.textContent.slice(0, 80))) + '...')
await page.screenshot({ path: 'shots/r2-modules-done.png' })

// 生成报告（流式，观察中间态）
await page.$eval('.gen-actions .el-button--primary', el => { el.scrollIntoView({ block: 'center' }); el.click() })
await sleep(1200)
console.log('流式中预览内容长度:', await page.$$eval('.markdown', els => els.length) ? await page.$eval('.markdown', e => e.textContent.length) : 0)
await page.screenshot({ path: 'shots/r3-streaming.png' })
await sleep(3000)
console.log('报告完成标记:', await page.$eval('.report-meta', e => e.textContent.trim()).catch(() => 'NO META'))
const mdLen = await page.$eval('.markdown', e => e.textContent.length)
console.log('最终报告长度:', mdLen)
console.log('表格数量:', await page.$$eval('.markdown table', els => els.length))
console.log('下载按钮可用:', await page.$eval('.gen-actions button:nth-child(2)', el => !el.disabled))

// 测试下载
const client = await page.createCDPSession()
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: 'C://Users//95663//Desktop//demo//shots' })
await page.$eval('.gen-actions button:nth-child(2)', el => el.click())
await sleep(1200)

// 修改数据后报告失效检查
await page.$$eval('.module-card', cards => { const b = cards[0].querySelector('.card-actions button'); b.scrollIntoView({block:'center'}); b.click() })
await sleep(1600)
console.log('重新取数后过期提示:', await page.$$eval('.stale-tag', els => els.length) ? '显示' : '未显示')

// 回甘特图确认路由无回归
await page.goto('http://127.0.0.1:5178/#/', { waitUntil: 'networkidle0' })
await sleep(600)
console.log('甘特图渲染:', await page.$$eval('.gantt-row', els => els.length), '行,', await page.$$eval('.gantt-bar', els => els.length), '块')
console.log('页面错误:', errs.length ? errs : 'none')
await browser.close()
