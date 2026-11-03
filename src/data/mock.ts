import type { GanttRow, GanttTask, TaskStatus, TaskType } from '@/types/gantt'
import { HOUR, addDays, startOfDay } from '@/utils/time'

export const MOCK_ROWS: GanttRow[] = [
  { id: 'r1', aircraftType: 'B737-800', tailNumber: 'B-1234', base: 'PEK' },
  { id: 'r2', aircraftType: 'B737-800', tailNumber: 'B-5678', base: 'PEK' },
  { id: 'r3', aircraftType: 'A320neo', tailNumber: 'B-2233', base: 'SHA' },
  { id: 'r4', aircraftType: 'A320neo', tailNumber: 'B-2244', base: 'SHA' },
  { id: 'r5', aircraftType: 'A330-300', tailNumber: 'B-3001', base: 'CAN' },
  { id: 'r6', aircraftType: 'A330-300', tailNumber: 'B-3002', base: 'CAN' },
  { id: 'r7', aircraftType: 'B787-9', tailNumber: 'B-1168', base: 'PEK' },
  { id: 'r8', aircraftType: 'ARJ21-700', tailNumber: 'B-6201', base: 'CTU' },
]

const AIRLINES = ['MU', 'CA', 'CZ', 'HU', 'ZH', '3U', 'MF', 'SC']

interface SpecialSeed {
  startHour: number
  hours: number
  type: TaskType
  title: string
}

/** 特殊安排：key = `${rowIndex}-${dayOffset}`，命中后不再生成当天常规航班 */
const SPECIAL: Record<string, SpecialSeed[]> = {
  '0-3': [{ startHour: 9, hours: 4, type: 'maintenance', title: '发动机孔探' }],
  '2-1': [{ startHour: 21, hours: 3, type: 'maintenance', title: 'A 检 · 航后' }],
  '5-2': [{ startHour: 7, hours: 8, type: 'parking', title: '停场 · C 检准备' }],
  '7-0': [{ startHour: 14.5, hours: 2, type: 'delay', title: '延误 · 流量控制' }],
  '3-1': [{ startHour: 10, hours: 2, type: 'maintenance', title: '客舱改装 · 与航班重叠' }],
}

function statusOf(day: number, hour: number, now: number): TaskStatus {
  const dayStart = startOfDay(now)
  if (day < 0) return 'done'
  if (day > 0) return 'plan'
  return hour * HOUR + dayStart < now ? 'active' : 'plan'
}

/**
 * 以“今天”为基准生成演示数据。
 * 任务分布在 [-1, +6] 天，默认视图覆盖 [今天-1, 今天+5]。
 */
export function createMockTasks(now = Date.now()): GanttTask[] {
  const todayStart = startOfDay(now)
  const tasks: GanttTask[] = []
  let seed = 0

  const push = (
    row: GanttRow,
    rowIndex: number,
    day: number,
    startHour: number,
    hours: number,
    type: TaskType,
    title: string,
  ) => {
    const dayStart = addDays(todayStart, day)
    const start = dayStart + startHour * HOUR
    seed += 1
    tasks.push({
      id: `${row.id}_${day}_${seed}`,
      rowId: row.id,
      title,
      type,
      status: statusOf(day, startHour, now),
      start,
      end: start + hours * HOUR,
      remark: type === 'maintenance' ? '需机务放行签字' : undefined,
    })
    void rowIndex
  }

  MOCK_ROWS.forEach((row, ri) => {
    const airline = AIRLINES[ri % AIRLINES.length]
    for (let day = -1; day <= 6; day += 1) {
      const special = SPECIAL[`${ri}-${day}`]
      if (special) {
        // 冲突演示行保留常规航班，其余跳过
        const keepFlights = `${ri}-${day}` === '3-1'
        if (!keepFlights) {
          special.forEach((s) => push(row, ri, day, s.startHour, s.hours, s.type, s.title))
          continue
        }
      }

      const startA = 6 + (ri % 4) * 0.5
      const durA = 2.5 + (ri % 2) * 0.5
      push(row, ri, day, startA, durA, 'flight', `航班 ${airline}${1200 + ri * 37 + day * 3}`)

      const startB = startA + durA + 1.5 + (ri % 3) * 0.5
      const durB = 2 + (ri % 2) * 0.5
      push(row, ri, day, startB, durB, 'flight', `航班 ${airline}${1300 + ri * 41 + day * 5}`)

      if ((ri + day) % 3 === 0) {
        push(row, ri, day, 19, 1.5, 'cleaning', '客舱深度清洁')
      }
      if (special) {
        special.forEach((s) => push(row, ri, day, s.startHour, s.hours, s.type, s.title))
      }
    }
  })

  return tasks
}

/** 默认视图起点：今天 - 1 天 */
export function defaultRangeStart(now = Date.now()): number {
  return addDays(startOfDay(now), -1)
}
