import { computed, reactive, shallowRef } from 'vue'
import type { ComputedRef } from 'vue'
import type {
  GanttRow,
  GanttTask,
  HistoryAction,
  HistoryEntry,
  TaskStatus,
  TaskType,
} from '@/types/gantt'
import { MIN_TASK_HOURS, TASK_STATUS_META, TASK_TYPE_META } from '@/constants/task'
import { MOCK_ROWS, createMockTasks, defaultRangeStart } from '@/data/mock'
import {
  DAY,
  HOUR,
  addDays,
  formatDateTime,
  formatDuration,
  formatMD,
  formatRange,
  isWeekend,
  startOfDay,
  uid,
  weekdayOf,
} from '@/utils/time'

/** 表头总高度(日期行 + 小时行)，需与 CSS 中 --header-h 保持一致 */
export const HEADER_HEIGHT = 56

export interface TimelineDay {
  index: number
  start: number
  end: number
  label: string
  weekday: string
  weekend: boolean
  isToday: boolean
}

export interface CommitPayload {
  action: HistoryAction
  taskId: string
  taskLabel: string
  before: GanttTask | null
  after: GanttTask | null
  index: number
  mergeKey?: string
}

interface DragSession {
  mode: 'move' | 'left' | 'right'
  taskId: string
  startX: number
  origStart: number
  origEnd: number
  hourWidth: number
  changed: boolean
}

function createGanttStore() {
  const now = Date.now()

  const state = reactive({
    rows: MOCK_ROWS as GanttRow[],
    tasks: createMockTasks(now) as GanttTask[],

    /** 当前选中的甘特块(键盘操作目标) */
    selectedId: null as string | null,
    /** 正在拖拽的块 */
    draggingId: null as string | null,

    /** 每小时像素宽 */
    hourWidth: 24,
    rowHeight: 54,
    sideWidth: 268,
    /** 视图起点(某天 00:00) */
    rangeStart: defaultRangeStart(now),
    /** 视图天数 */
    days: 7,
    /** 拖拽/键盘吸附粒度(分钟) */
    snapMinutes: 60,

    keyword: '',
    typeFilter: [] as TaskType[],
    statusFilter: [] as TaskStatus[],

    showWeekend: true,
    showNight: true,

    now,

    undoStack: [] as HistoryEntry[],
    redoStack: [] as HistoryEntry[],
    logs: [] as HistoryEntry[],
  })

  const scrollEl = shallowRef<HTMLElement | null>(null)
  let dragSession: DragSession | null = null

  /* ------------------------------------------------------------------ */
  /* 时间轴计算                                                          */
  /* ------------------------------------------------------------------ */

  const timelineWidth = computed(() => state.days * 24 * state.hourWidth)
  const canvasWidth = computed(() => state.sideWidth + timelineWidth.value)

  const dayList = computed<TimelineDay[]>(() => {
    const todayStart = startOfDay(state.now)
    const list: TimelineDay[] = []
    for (let i = 0; i < state.days; i += 1) {
      const start = addDays(state.rangeStart, i)
      list.push({
        index: i,
        start,
        end: addDays(start, 1),
        label: formatMD(start),
        weekday: weekdayOf(start),
        weekend: isWeekend(start),
        isToday: start === todayStart,
      })
    }
    return list
  })

  /** 小时刻度标签密度：保证相邻标签间距 >= 26px */
  const hourLabelStep = computed(() => {
    const steps = [1, 2, 3, 4, 6, 8, 12]
    return steps.find((s) => state.hourWidth * s >= 26) ?? 12
  })

  /** 时间戳 → 相对时间轴左边缘的像素 */
  function timeToX(ts: number): number {
    return ((ts - state.rangeStart) / HOUR) * state.hourWidth
  }

  /** 相对时间轴左边缘的像素 → 时间戳 */
  function xToTime(x: number): number {
    return state.rangeStart + (x / state.hourWidth) * HOUR
  }

  function snapMs(ms: number): number {
    const step = state.snapMinutes * 60_000
    return Math.round(ms / step) * step
  }

  /* ------------------------------------------------------------------ */
  /* 过滤与派生数据                                                       */
  /* ------------------------------------------------------------------ */

  const filteredRows = computed(() => {
    const kw = state.keyword.trim().toLowerCase()
    if (!kw) return state.rows
    return state.rows.filter(
      (r) =>
        r.aircraftType.toLowerCase().includes(kw) ||
        r.tailNumber.toLowerCase().includes(kw) ||
        r.base.toLowerCase().includes(kw),
    )
  })

  const tasksByRow = computed(() => {
    const map = new Map<string, GanttTask[]>()
    for (const task of state.tasks) {
      if (state.typeFilter.length && !state.typeFilter.includes(task.type)) continue
      if (state.statusFilter.length && !state.statusFilter.includes(task.status)) continue
      const arr = map.get(task.rowId)
      if (arr) arr.push(task)
      else map.set(task.rowId, [task])
    }
    return map
  })

  /** 不带筛选的按行任务索引：冲突检测必须基于全量数据，过滤不应影响冲突判定 */
  const tasksByRowAll = computed(() => {
    const map = new Map<string, GanttTask[]>()
    for (const task of state.tasks) {
      const arr = map.get(task.rowId)
      if (arr) arr.push(task)
      else map.set(task.rowId, [task])
    }
    return map
  })

  /*
   * 冲突检测按行分片：每行一个惰性 computed，只跟踪该行任务的 start/end。
   * 拖拽时只有被拖块所在行失效并重算（一行内排序 O(k log k)），
   * 其余行保持缓存 —— 万级任务下单次 mousemove 的重算从全量 ~25ms 降到 <1ms。
   */
  const rowConflictCache = new Map<string, ComputedRef<Set<string>>>()

  function rowConflicts(rowId: string): Set<string> {
    let comp = rowConflictCache.get(rowId)
    if (!comp) {
      comp = computed(() => {
        const list = tasksByRowAll.value.get(rowId)
        const set = new Set<string>()
        if (!list || list.length < 2) return set
        const sorted = [...list].sort((a, b) => a.start - b.start)
        let cursor = sorted[0]
        for (let i = 1; i < sorted.length; i += 1) {
          const task = sorted[i]
          if (task.start < cursor.end) {
            set.add(task.id)
            set.add(cursor.id)
          }
          if (task.end > cursor.end) cursor = task
        }
        return set
      })
      rowConflictCache.set(rowId, comp)
    }
    return comp.value
  }

  /** 全量冲突 id 集合，由各行分片汇总而来 */
  const conflictIds = computed(() => {
    const set = new Set<string>()
    for (const row of state.rows) {
      for (const id of rowConflicts(row.id)) set.add(id)
    }
    return set
  })

  const selectedTask = computed(
    () => state.tasks.find((t) => t.id === state.selectedId) ?? null,
  )

  const canUndo = computed(() => state.undoStack.length > 0)
  const canRedo = computed(() => state.redoStack.length > 0)

  /**
   * 类型计数与冲突计数拆开：类型计数只在任务增删/改类型时失效，
   * 冲突计数只在某行冲突分片失效时重算。拖拽（改 start/end）只影响后者，
   * 避免每次 mousemove 都遍历全量任务。
   */
  const taskCounts = computed(() => {
    let flight = 0
    let maintenance = 0
    for (const t of state.tasks) {
      if (t.type === 'flight') flight += 1
      else if (t.type === 'maintenance') maintenance += 1
    }
    return { flight, maintenance }
  })

  const conflictCount = computed(() => {
    let conflict = 0
    for (const row of state.rows) conflict += rowConflicts(row.id).size
    return conflict
  })

  const stats = computed(() => ({
    total: state.tasks.length,
    rows: state.rows.length,
    flight: taskCounts.value.flight,
    maintenance: taskCounts.value.maintenance,
    conflict: conflictCount.value,
  }))

  /* ------------------------------------------------------------------ */
  /* 视口虚拟化                                                           */
  /* ------------------------------------------------------------------ */
  /*
   * 一个月 = 720 个单元格 + 全部任务块；几十架机位时节点数轻松破万。
   * 这里只保留「视口 ± 缓冲」内的日期、行与任务块参与渲染，
   * 其余交给布局占位（spacer）撑住滚动高度。
   *
   * 关键点：窗口边界一律用「整数」计算属性表达（winStartDay / winEndDay /
   * winStartRow / winEndRow）。滚动时这些数值绝大多数帧不变，Vue 对
   * computed 做值比较，不变就不会通知下游，因此滚动过程几乎不触发重渲染，
   * 只在跨日/跨行时更新一次。
   */

  const viewport = reactive({
    // 首帧先给个近似值，避免初次渲染就展开全量数据，onMounted 后立即校正
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : Math.max(320, window.innerHeight - 140),
    scrollLeft: 0,
    scrollTop: 0,
  })

  /** 横向缓冲：前后各多渲染 1 天 */
  const BUFFER_DAYS = 1
  /** 纵向缓冲：上下各多渲染 4 行 */
  const BUFFER_ROWS = 4

  function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max)
  }

  /** 视口左缘在「时间轴坐标系」中的位置（扣掉左侧固定列） */
  function viewLeftPx() {
    return viewport.scrollLeft - state.sideWidth
  }

  const winStartDay = computed(() => {
    if (!viewport.width || !state.days) return 0
    const dayW = 24 * state.hourWidth
    return clamp(Math.floor(viewLeftPx() / dayW) - BUFFER_DAYS, 0, state.days - 1)
  })

  const winEndDay = computed(() => {
    if (!viewport.width || !state.days) return state.days
    const dayW = 24 * state.hourWidth
    const last = Math.ceil((viewLeftPx() + viewport.width) / dayW) + BUFFER_DAYS
    return clamp(last, winStartDay.value + 1, state.days)
  })

  /** 真正贴住左栏的那一天（不含缓冲），用于左上角的日期标识 */
  const visibleDayIndex = computed(() => {
    if (!viewport.width) return 0
    const dayW = 24 * state.hourWidth
    return clamp(Math.floor(viewLeftPx() / dayW), 0, Math.max(state.days - 1, 0))
  })

  const visibleDay = computed<TimelineDay | undefined>(() => dayList.value[visibleDayIndex.value])

  const visibleDays = computed(() => dayList.value.slice(winStartDay.value, winEndDay.value))

  /** 渲染区相对时间轴原点的左偏移，用占位块补齐 */
  const dayLeadPx = computed(() => winStartDay.value * 24 * state.hourWidth)

  const winStartRow = computed(() => {
    const total = filteredRows.value.length
    if (!viewport.height || !total) return 0
    // 行区在内容坐标中从表头下沿开始
    const top = viewport.scrollTop - HEADER_HEIGHT
    return clamp(Math.floor(top / state.rowHeight) - BUFFER_ROWS, 0, total - 1)
  })

  const winEndRow = computed(() => {
    const total = filteredRows.value.length
    if (!viewport.height || !total) return total
    const bottom = viewport.scrollTop + viewport.height - HEADER_HEIGHT
    const last = Math.ceil(bottom / state.rowHeight) + BUFFER_ROWS
    return clamp(last, winStartRow.value + 1, total)
  })

  const visibleRows = computed(() => filteredRows.value.slice(winStartRow.value, winEndRow.value))

  /** 渲染区相对行区顶部的上偏移 */
  const rowLeadPx = computed(() => winStartRow.value * state.rowHeight)

  /**
   * 只保留「与可视时间段有交集」的任务块。
   * 注意用重叠判断而不是包含判断：跨月的长任务起点在窗口左侧也必须渲染。
   */
  const visibleTasksByRow = computed(() => {
    const map = new Map<string, GanttTask[]>()
    const rows = filteredRows.value
    const startPx = dayLeadPx.value
    const endPx = winEndDay.value * 24 * state.hourWidth
    const t0 = xToTime(startPx)
    const t1 = xToTime(endPx)

    for (let i = winStartRow.value; i < winEndRow.value; i += 1) {
      const row = rows[i]
      if (!row) continue
      const all = tasksByRow.value.get(row.id)
      if (!all || !all.length) continue
      const hit: GanttTask[] = []
      for (const task of all) {
        if (task.end >= t0 && task.start <= t1) hit.push(task)
      }
      map.set(row.id, hit)
    }

    // 选中块与拖拽块必须保住 DOM：拖拽中被卸载会直接中断拖拽会话
    for (const id of [state.draggingId, state.selectedId]) {
      if (!id) continue
      const task = state.tasks.find((t) => t.id === id)
      if (!task) continue
      const list = map.get(task.rowId)
      if (list && !list.some((t) => t.id === id)) list.push(task)
    }

    return map
  })

  /** 滚动时只读取偏移量（不读 clientWidth，避免强制同步布局） */
  function syncScroll() {
    const el = scrollEl.value
    if (!el) return
    viewport.scrollLeft = el.scrollLeft
    viewport.scrollTop = el.scrollTop
  }

  /** 尺寸变化时重新量取视口 */
  function measureViewport() {
    const el = scrollEl.value
    if (!el) return
    viewport.width = el.clientWidth
    viewport.height = el.clientHeight
    syncScroll()
  }

  /* ------------------------------------------------------------------ */
  /* 选中 / 滚动跟随                                                      */
  /* ------------------------------------------------------------------ */

  function select(id: string | null, reveal = true) {
    state.selectedId = id
    if (!id) return
    // 拖拽/点选时会 preventDefault，焦点不会自动回到画布，
    // 这里显式收回，保证方向键等快捷键立即可用
    scrollEl.value?.focus({ preventScroll: true })
    if (reveal) revealTask(id)
  }

  function clearSelection() {
    state.selectedId = null
  }

  function revealTask(id: string) {
    const el = scrollEl.value
    const task = state.tasks.find((t) => t.id === id)
    if (!el || !task) return

    const left = timeToX(task.start)
    const right = timeToX(task.end)
    const pad = 48

    if (left < el.scrollLeft) {
      el.scrollLeft = Math.max(0, left - pad)
    } else if (state.sideWidth + right > el.scrollLeft + el.clientWidth - pad) {
      el.scrollLeft = state.sideWidth + right - el.clientWidth + pad
    }

    const rowIndex = filteredRows.value.findIndex((r) => r.id === task.rowId)
    if (rowIndex < 0) return
    const rowTop = HEADER_HEIGHT + rowIndex * state.rowHeight
    const viewTop = el.scrollTop + HEADER_HEIGHT
    const viewBottom = el.scrollTop + el.clientHeight - 16
    if (rowTop < viewTop) {
      el.scrollTop = Math.max(0, rowTop - HEADER_HEIGHT - 8)
    } else if (rowTop + state.rowHeight > viewBottom) {
      el.scrollTop = rowTop + state.rowHeight - el.clientHeight + 16
    }
  }

  /* ------------------------------------------------------------------ */
  /* 历史记录                                                             */
  /* ------------------------------------------------------------------ */

  function buildDetail(
    action: HistoryAction,
    before: GanttTask | null,
    after: GanttTask | null,
  ): string {
    if (action === 'create' && after) {
      return `新建 · ${formatRange(after.start, after.end)}`
    }
    if (action === 'delete' && before) {
      return `删除 · ${formatRange(before.start, before.end)}`
    }
    if (!before || !after) return ''

    const parts: string[] = []
    if (before.title !== after.title) parts.push(`标题「${before.title}」→「${after.title}」`)
    if (before.rowId !== after.rowId) parts.push('调整所属机位')
    if (before.type !== after.type) {
      parts.push(`类型 ${TASK_TYPE_META[before.type].label} → ${TASK_TYPE_META[after.type].label}`)
    }
    if (before.status !== after.status) {
      parts.push(`状态 ${TASK_STATUS_META[before.status].label} → ${TASK_STATUS_META[after.status].label}`)
    }

    const dStart = after.start - before.start
    const dEnd = after.end - before.end
    if (dStart === dEnd && dStart !== 0) {
      parts.push(`${dStart > 0 ? '后移' : '前移'} ${formatDuration(Math.abs(dStart))}`)
    } else if (dStart !== 0 || dEnd !== 0) {
      if (dStart !== 0) {
        parts.push(`开始 ${formatDateTime(before.start)} → ${formatDateTime(after.start)}`)
      }
      if (dEnd !== 0) {
        parts.push(`结束 ${formatDateTime(before.end)} → ${formatDateTime(after.end)}`)
      }
    }
    return parts.join('；') || '调整时间'
  }

  function commit(payload: CommitPayload) {
    const entry: HistoryEntry = {
      id: uid('h'),
      time: Date.now(),
      action: payload.action,
      taskId: payload.taskId,
      taskLabel: payload.taskLabel,
      detail: buildDetail(payload.action, payload.before, payload.after),
      before: payload.before,
      after: payload.after,
      index: payload.index,
      mergeKey: payload.mergeKey,
      undone: false,
    }

    // 连续同类操作(键盘连按)合并为一条，避免历史面板被刷屏
    const last = state.undoStack[state.undoStack.length - 1]
    if (
      payload.mergeKey &&
      last &&
      last.mergeKey === payload.mergeKey &&
      !last.undone &&
      Date.now() - last.time < 900
    ) {
      last.after = payload.after
      last.time = entry.time
      // 描述必须基于合并前的快照重算，否则只反映最后一次微调
      last.detail = buildDetail(payload.action, last.before, payload.after)
      return
    }

    state.undoStack.push(entry)
    state.redoStack = []
    state.logs.unshift(entry)
    if (state.logs.length > 200) state.logs.length = 200
  }

  function applySnapshot(taskId: string, snapshot: GanttTask | null, index: number) {
    const i = state.tasks.findIndex((t) => t.id === taskId)
    if (snapshot) {
      const copy = { ...snapshot }
      if (i > -1) state.tasks.splice(i, 1, copy)
      else state.tasks.splice(Math.min(index, state.tasks.length), 0, copy)
    } else if (i > -1) {
      state.tasks.splice(i, 1)
    }
  }

  function undo() {
    const entry = state.undoStack.pop()
    if (!entry) return
    applySnapshot(entry.taskId, entry.before, entry.index)
    entry.undone = true
    state.redoStack.push(entry)
    state.selectedId = entry.before ? entry.taskId : null
  }

  function redo() {
    const entry = state.redoStack.pop()
    if (!entry) return
    applySnapshot(entry.taskId, entry.after, entry.index)
    entry.undone = false
    state.undoStack.push(entry)
    state.selectedId = entry.after ? entry.taskId : null
  }

  function clearHistory() {
    state.undoStack = []
    state.redoStack = []
    state.logs = []
  }

  /* ------------------------------------------------------------------ */
  /* 任务增删改                                                           */
  /* ------------------------------------------------------------------ */

  function taskLabel(task: GanttTask): string {
    const row = state.rows.find((r) => r.id === task.rowId)
    return `${row ? row.tailNumber : '未知机位'} · ${task.title}`
  }

  function updateTask(id: string, patch: Partial<Omit<GanttTask, 'id'>>) {
    const task = state.tasks.find((t) => t.id === id)
    if (!task) return
    const before: GanttTask = { ...task }
    Object.assign(task, patch)
    if (task.end - task.start < MIN_TASK_HOURS * HOUR) {
      task.end = task.start + MIN_TASK_HOURS * HOUR
    }
    commit({
      action: 'edit',
      taskId: id,
      taskLabel: taskLabel(task),
      before,
      after: { ...task },
      index: state.tasks.findIndex((t) => t.id === id),
    })
  }

  function createTask(input: Omit<GanttTask, 'id'>) {
    const task: GanttTask = { ...input, id: uid('t') }
    const index = state.tasks.length
    state.tasks.push(task)
    commit({
      action: 'create',
      taskId: task.id,
      taskLabel: taskLabel(task),
      before: null,
      after: { ...task },
      index,
    })
    select(task.id)
  }

  function deleteTask(id: string) {
    const index = state.tasks.findIndex((t) => t.id === id)
    if (index < 0) return
    const task = state.tasks[index]
    const before: GanttTask = { ...task }
    state.tasks.splice(index, 1)
    commit({
      action: 'delete',
      taskId: id,
      taskLabel: taskLabel(before),
      before,
      after: null,
      index,
    })
    state.selectedId = null
  }

  /* ------------------------------------------------------------------ */
  /* 拖拽：整体平移 / 左右边缘拉伸                                         */
  /* ------------------------------------------------------------------ */

  function beginDrag(event: MouseEvent, task: GanttTask, mode: DragSession['mode']) {
    if (event.button !== 0) return
    event.preventDefault()
    select(task.id, false)
    dragSession = {
      mode,
      taskId: task.id,
      startX: event.clientX,
      origStart: task.start,
      origEnd: task.end,
      hourWidth: state.hourWidth,
      changed: false,
    }
    state.draggingId = task.id
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize'
  }

  function onDragMove(event: MouseEvent) {
    if (!dragSession) return
    const session = dragSession
    const task = state.tasks.find((t) => t.id === session.taskId)
    if (!task) return

    const deltaPx = event.clientX - session.startX
    const step = state.snapMinutes / 60
    const snappedHours = Math.round(deltaPx / session.hourWidth / step) * step
    const deltaMs = snappedHours * HOUR
    const minMs = MIN_TASK_HOURS * HOUR

    if (session.mode === 'move') {
      task.start = session.origStart + deltaMs
      task.end = session.origEnd + deltaMs
    } else if (session.mode === 'left') {
      task.start = Math.min(session.origStart + deltaMs, task.end - minMs)
    } else {
      task.end = Math.max(session.origEnd + deltaMs, task.start + minMs)
    }

    session.changed = task.start !== session.origStart || task.end !== session.origEnd
  }

  function onDragEnd() {
    window.removeEventListener('mousemove', onDragMove)
    window.removeEventListener('mouseup', onDragEnd)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    const session = dragSession
    dragSession = null
    state.draggingId = null
    if (!session || !session.changed) return

    const task = state.tasks.find((t) => t.id === session.taskId)
    if (!task) return

    const before: GanttTask = { ...task, start: session.origStart, end: session.origEnd }
    const action: HistoryAction =
      session.mode === 'move' ? 'move' : session.mode === 'left' ? 'resize-start' : 'resize-end'

    commit({
      action,
      taskId: task.id,
      taskLabel: taskLabel(task),
      before,
      after: { ...task },
      index: state.tasks.findIndex((t) => t.id === task.id),
    })
  }

  /* ------------------------------------------------------------------ */
  /* 键盘微调                                                             */
  /* ------------------------------------------------------------------ */

  /**
   * @param hours 偏移小时(可为小数)
   * @param edge  作用边界：both 整体平移 / start 改开始 / end 改结束
   */
  function nudge(hours: number, edge: 'both' | 'start' | 'end' = 'both') {
    const task = selectedTask.value
    if (!task) return
    const before: GanttTask = { ...task }
    const deltaMs = hours * HOUR
    const minMs = MIN_TASK_HOURS * HOUR

    if (edge === 'both') {
      task.start += deltaMs
      task.end += deltaMs
    } else if (edge === 'start') {
      task.start = Math.min(task.start + deltaMs, task.end - minMs)
    } else {
      task.end = Math.max(task.end + deltaMs, task.start + minMs)
    }

    commit({
      action: edge === 'both' ? 'move' : edge === 'start' ? 'resize-start' : 'resize-end',
      taskId: task.id,
      taskLabel: taskLabel(task),
      before,
      after: { ...task },
      index: state.tasks.findIndex((t) => t.id === task.id),
      mergeKey: `nudge:${task.id}:${edge}`,
    })
    revealTask(task.id)
  }

  /** 上下切换到相邻行的任务(优先同列最近的块) */
  function selectAdjacentRow(direction: -1 | 1) {
    const current = selectedTask.value
    if (!current) {
      const first = filteredRows.value[0]
      const t = first && tasksByRow.value.get(first.id)?.[0]
      if (t) select(t.id)
      return
    }
    const rows = filteredRows.value
    const startIndex = rows.findIndex((r) => r.id === current.rowId)
    if (startIndex < 0) return

    for (let i = startIndex + direction; i >= 0 && i < rows.length; i += direction) {
      const list = tasksByRow.value.get(rows[i].id)
      if (!list || !list.length) continue
      const center = (current.start + current.end) / 2
      const next = [...list].sort(
        (a, b) =>
          Math.abs((a.start + a.end) / 2 - center) - Math.abs((b.start + b.end) / 2 - center),
      )[0]
      select(next.id)
      return
    }
  }

  /* ------------------------------------------------------------------ */
  /* 视图控制                                                             */
  /* ------------------------------------------------------------------ */

  function setRange(startTs: number, days: number) {
    state.rangeStart = startOfDay(startTs)
    state.days = Math.max(1, Math.min(60, days))
  }

  function setRangeByDates(start: number, end: number) {
    const s = startOfDay(start)
    const e = startOfDay(end)
    const days = Math.max(1, Math.round((e - s) / DAY) + 1)
    setRange(s, days)
  }

  function shiftRange(days: number) {
    state.rangeStart = addDays(state.rangeStart, days)
  }

  function zoom(delta: number) {
    const next = Math.min(72, Math.max(8, state.hourWidth + delta))
    state.hourWidth = next
  }

  function setHourWidth(width: number) {
    state.hourWidth = Math.min(72, Math.max(8, width))
  }

  /** 按当前视口宽度自动适配刻度，让时间轴刚好铺满 */
  function fitToView(minWidth = 12) {
    const el = scrollEl.value
    const avail = (el ? el.clientWidth : 1400) - state.sideWidth - 8
    const width = Math.round(avail / (state.days * 24))
    setHourWidth(Math.max(minWidth, width))
  }

  function goToday() {
    const todayStart = startOfDay(state.now)
    const rangeEnd = addDays(state.rangeStart, state.days)
    if (todayStart < state.rangeStart || todayStart >= rangeEnd) {
      setRange(addDays(todayStart, -1), 7)
    }
    scrollToNow()
  }

  /** 把“当前时间”滚动到视口左侧 ratio 比例处 */
  function scrollToNow(ratio = 0.35) {
    const el = scrollEl.value
    if (!el) return
    const x = timeToX(state.now)
    el.scrollLeft = Math.max(0, x - (el.clientWidth - state.sideWidth) * ratio)
  }

  function tick() {
    state.now = Date.now()
    for (const task of state.tasks) {
      if (task.status === 'plan' && task.start <= state.now && task.end > state.now) {
        task.status = 'active'
      }
    }
  }

  function reset() {
    const n = Date.now()
    state.now = n
    state.tasks = createMockTasks(n)
    state.rangeStart = defaultRangeStart(n)
    state.days = 7
    state.hourWidth = 24
    state.selectedId = null
    state.keyword = ''
    state.typeFilter = []
    state.statusFilter = []
    clearHistory()
  }

  return {
    state,
    scrollEl,
    // 派生
    timelineWidth,
    canvasWidth,
    dayList,
    hourLabelStep,
    filteredRows,
    tasksByRow,
    selectedTask,
    canUndo,
    canRedo,
    stats,
    // 虚拟化窗口
    viewport,
    visibleDay,
    visibleDays,
    visibleRows,
    visibleTasksByRow,
    dayLeadPx,
    rowLeadPx,
    winStartDay,
    winEndDay,
    winStartRow,
    winEndRow,
    syncScroll,
    measureViewport,
    // 换算
    timeToX,
    xToTime,
    snapMs,
    // 冲突（按行分片）
    tasksByRowAll,
    rowConflicts,
    conflictIds,
    // 选中
    select,
    clearSelection,
    revealTask,
    // 历史
    undo,
    redo,
    clearHistory,
    // 增删改
    updateTask,
    createTask,
    deleteTask,
    // 交互
    beginDrag,
    nudge,
    selectAdjacentRow,
    // 视图
    setRange,
    setRangeByDates,
    shiftRange,
    zoom,
    setHourWidth,
    fitToView,
    goToday,
    scrollToNow,
    tick,
    reset,
  }
}

export const gantt = createGanttStore()

// 仅开发环境：挂到 window 便于性能压测与控制台调试（生产构建会被裁剪）
if (import.meta.env.DEV) {
  ;(window as unknown as { __gantt: typeof gantt }).__gantt = gantt
}

export function useGantt() {
  return gantt
}
