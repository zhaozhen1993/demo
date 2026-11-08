import puppeteer from 'puppeteer-core'
const EDGE = 'C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1440, height: 1000 } })
const page = await browser.newPage()
await page.goto('http://127.0.0.1:5178/#/report', { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 800))
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 拦截 createObjectURL 捕获下载内容
await page.evaluate(() => {
  window.__blobs = []
  const orig = URL.createObjectURL.bind(URL)
  URL.createObjectURL = (blob) => {
    window.__lastBlob = blob
    return orig(blob)
  }
  // a.click 也能触发，无需拦截
})

for (let i = 0; i < 4; i++) {
  await page.$$eval('.module-card', (cards, i) => {
    const b = cards[i].querySelector('.card-actions button'); b.scrollIntoView({block:'center'}); b.click()
  }, i)
  await sleep(1700)
}
await page.$eval('.gen-actions .el-button--primary', el => { el.scrollIntoView({block:'center'}); el.click() })
await sleep(4500)

const res = await page.evaluate(async () => {
  const btns = [...document.querySelectorAll('.gen-actions button')]
  btns.find(b => b.textContent.includes('下载')).click()
  await new Promise(r => setTimeout(r, 300))
  const blob = window.__lastBlob
  if (!blob) return { ok: false }
  const text = await blob.text()
  return {
    ok: true,
    size: blob.size,
    type: blob.type,
    hasTitle: text.includes('机队运行综合分析报告'),
    hasTable: text.includes('<table'),
    hasUtf8Bom: text.charCodeAt(0) === 0xFEFF,
  }
})
console.log('下载验证:', res)
await browser.close()
