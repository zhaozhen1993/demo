import type { TaskStatus, TaskType } from '@/types/gantt'

export interface TaskTypeMeta {
  label: string
  /** 主色(块底色渐变起点) */
  color: string
  /** 深色(渐变终点) */
  colorDeep: string
  /** 浅色背景(用于图例/标签) */
  light: string
}

export const TASK_TYPE_META: Record<TaskType, TaskTypeMeta> = {
  flight: {
    label: '航班',
    color: '#3b82f6',
    colorDeep: '#2563eb',
    light: '#dbeafe',
  },
  maintenance: {
    label: '检修',
    color: '#f59e0b',
    colorDeep: '#d97706',
    light: '#fef3c7',
  },
  cleaning: {
    label: '清洁',
    color: '#10b981',
    colorDeep: '#059669',
    light: '#d1fae5',
  },
  parking: {
    label: '停场',
    color: '#8b5cf6',
    colorDeep: '#7c3aed',
    light: '#ede9fe',
  },
  delay: {
    label: '延误',
    color: '#f43f5e',
    colorDeep: '#e11d48',
    light: '#ffe4e6',
  },
}

export const TASK_STATUS_META: Record<TaskStatus, { label: string; type: 'info' | 'primary' | 'success' }> = {
  plan: { label: '计划', type: 'info' },
  active: { label: '执行中', type: 'primary' },
  done: { label: '已完成', type: 'success' },
}

export const TASK_TYPE_LIST = (Object.keys(TASK_TYPE_META) as TaskType[]).map((value) => ({
  value,
  label: TASK_TYPE_META[value].label,
}))

export const SNAP_OPTIONS = [
  { value: 15, label: '15 分钟' },
  { value: 30, label: '30 分钟' },
  { value: 60, label: '1 小时' },
  { value: 120, label: '2 小时' },
  { value: 240, label: '4 小时' },
]

/** 甘特块最短时长(小时) */
export const MIN_TASK_HOURS = 0.25

export const HOUR_WIDTH_MIN = 8
export const HOUR_WIDTH_MAX = 72
