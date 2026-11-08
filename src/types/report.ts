/** 报告生成 demo 的类型定义 */

/** 取数模块 id（第 5 个"报告生成"是汇聚模块，不在此列） */
export type ModuleId = 'retrieval' | 'prediction' | 'risk' | 'resource'

/** 模块执行状态 */
export type ModuleStatus = 'idle' | 'running' | 'done'

/** 单个表单字段的选项 */
export interface FieldOption {
  label: string
  value: string
}

/** 表单字段 schema，驱动通用模块卡的表单渲染 */
export interface FieldSchema {
  key: string
  label: string
  type: 'input' | 'select' | 'multi-select' | 'number' | 'daterange'
  options?: FieldOption[]
  default?: InputValue
  placeholder?: string
  /** 栅格占比：1 = 半行，2 = 整行 */
  span?: 1 | 2
  /** number 输入的单位后缀 */
  suffix?: string
  min?: number
  max?: number
}

/** 指标卡数据 */
export interface MetricItem {
  label: string
  value: string
  hint?: string
  tone?: 'good' | 'warn' | 'bad'
}

/** 结果表格数据 */
export interface ResultTable {
  columns: { prop: string; label: string }[]
  rows: Record<string, string | number>[]
}

/** 模块执行后的 mock 结果 */
export interface ModuleResult {
  summary: string
  metrics: MetricItem[]
  table?: ResultTable
}

/** 取数模块定义 */
export interface ModuleDef {
  id: ModuleId
  index: number
  title: string
  subtitle: string
  /** 一句话说明模块职责 */
  description: string
  fields: FieldSchema[]
}

/** 表单输入值 */
export type InputValue = string | number | string[] | [string, string] | null

/** 一个模块的输入集合 */
export type InputMap = Record<string, InputValue>

/** 整合后传给"大模型"的完整 JSON 结构 */
export interface ReportPayload {
  report: {
    title: string
    type: string
    period: string
    generatedAt: string
  }
  modules: Record<
    ModuleId,
    {
      params: InputMap
      data: ModuleResult
    }
  >
}
