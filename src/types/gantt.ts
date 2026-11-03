/** 任务类型 */
export type TaskType = 'flight' | 'maintenance' | 'cleaning' | 'parking' | 'delay'

/** 任务状态 */
export type TaskStatus = 'plan' | 'active' | 'done'

/** 机型 + 尾号行 */
export interface GanttRow {
  id: string
  /** 机型，如 B737-800 */
  aircraftType: string
  /** 尾号，如 B-1234 */
  tailNumber: string
  /** 基地 */
  base: string
}

/** 甘特任务块 */
export interface GanttTask {
  id: string
  rowId: string
  title: string
  type: TaskType
  status: TaskStatus
  /** 开始时间戳(ms) */
  start: number
  /** 结束时间戳(ms) */
  end: number
  remark?: string
}

/** 历史记录动作 */
export type HistoryAction =
  | 'move'
  | 'resize-start'
  | 'resize-end'
  | 'edit'
  | 'create'
  | 'delete'

/** 一条历史记录 = 一次可回滚的操作 */
export interface HistoryEntry {
  id: string
  /** 操作时间戳 */
  time: number
  action: HistoryAction
  taskId: string
  /** 冗余的任务展示名，任务被删除后仍可读 */
  taskLabel: string
  /** 人类可读描述 */
  detail: string
  /** 操作前快照，null 表示操作前不存在(新建) */
  before: GanttTask | null
  /** 操作后快照，null 表示操作后不存在(删除) */
  after: GanttTask | null
  /** 任务在列表中的原始下标，用于删除后恢复层级 */
  index: number
  /** 连续同类操作的合并键(键盘微调时合并成一条) */
  mergeKey?: string
  /** 是否已被撤销 */
  undone: boolean
}

/** 拖拽模式 */
export type DragMode = 'move' | 'left' | 'right'
