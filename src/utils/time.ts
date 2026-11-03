export const MINUTE = 60_000
export const HOUR = 60 * MINUTE
export const DAY = 24 * HOUR

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

/** 当天 00:00 */
export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** 按自然日加法，避免跨月/夏令时误差 */
export function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

export function addHours(ts: number, hours: number): number {
  return ts + hours * HOUR
}

export function weekdayOf(ts: number): string {
  return WEEKDAYS[new Date(ts).getDay()]
}

export function isWeekend(ts: number): boolean {
  const day = new Date(ts).getDay()
  return day === 0 || day === 6
}

export function isSameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

/** 11-03 */
export function formatMD(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 2026-11-03 */
export function formatYMD(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 08:30 */
export function formatHM(ts: number): string {
  const d = new Date(ts)
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/** 11-03 08:30 */
export function formatDateTime(ts: number): string {
  return `${formatMD(ts)} ${formatHM(ts)}`
}

/** 3.5 小时 / 1 天 3 小时 */
export function formatDuration(ms: number): string {
  const hours = ms / HOUR
  if (hours < 24) {
    const fixed = Math.round(hours * 10) / 10
    return `${fixed} 小时`
  }
  const days = Math.floor(hours / 24)
  const rest = Math.round((hours - days * 24) * 10) / 10
  return rest > 0 ? `${days} 天 ${rest} 小时` : `${days} 天`
}

/** 时间区间简写：11-03 08:00 → 11-03 11:30 */
export function formatRange(start: number, end: number): string {
  return `${formatDateTime(start)} → ${isSameDay(start, end) ? formatHM(end) : formatDateTime(end)}`
}

/** 解析 yyyy-MM-dd HH:mm 字符串为时间戳 */
export function parseDateTime(value: string): number {
  const [datePart, timePart = '00:00'] = value.split(' ')
  const [y, m, d] = datePart.split('-').map(Number)
  const [hh, mm] = timePart.split(':').map(Number)
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0).getTime()
}

let seq = 0
export function uid(prefix = 'id'): string {
  seq += 1
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}`
}
