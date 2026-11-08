import { computed, reactive } from 'vue'
import type {
  InputMap,
  ModuleId,
  ModuleResult,
  ModuleStatus,
  ReportPayload,
} from '@/types/report'
import {
  MODULE_DEFS,
  buildMockResult,
  buildReportMarkdown,
  defaultInputs,
} from '@/data/reportMock'

interface ReportState {
  inputs: Record<ModuleId, InputMap>
  status: Record<ModuleId, ModuleStatus>
  results: Record<ModuleId, ModuleResult | null>
  /** 各模块最近一次执行耗时 ms */
  elapsed: Record<ModuleId, number | null>
  generating: boolean
  /** "大模型"流式输出的报告 markdown */
  reportMd: string
  reportDone: boolean
  generatedAt: string | null
  /** 报告预览中正在流式追加（用于光标动画） */
  streaming: boolean
  /** 模块数据变更后，已生成的报告与当前 JSON 不一致 */
  stale: boolean
}

function initState(): ReportState {
  const inputs = {} as Record<ModuleId, InputMap>
  const status = {} as Record<ModuleId, ModuleStatus>
  const results = {} as Record<ModuleId, ModuleResult | null>
  const elapsed = {} as Record<ModuleId, number | null>
  for (const def of MODULE_DEFS) {
    inputs[def.id] = defaultInputs(def)
    status[def.id] = 'idle'
    results[def.id] = null
    elapsed[def.id] = null
  }
  return {
    inputs,
    status,
    results,
    elapsed,
    generating: false,
    reportMd: '',
    reportDone: false,
    generatedAt: null,
    streaming: false,
    stale: false,
  }
}

const state = reactive(initState())

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------ getters ------------------------------ */

const completedCount = computed(
  () => MODULE_DEFS.filter((d) => state.status[d.id] === 'done').length,
)

/** 四个取数模块全部完成，才允许生成报告 */
const allModulesDone = computed(() => completedCount.value === MODULE_DEFS.length)

/** 整合给"大模型"的完整 JSON */
const finalJson = computed<ReportPayload | null>(() => {
  if (!allModulesDone.value) return null
  const periods = new Set<string>()
  for (const def of MODULE_DEFS) {
    for (const f of def.fields) {
      if (f.type === 'daterange') {
        const v = state.inputs[def.id][f.key] as [string, string] | null
        if (v && v[0] && v[1]) periods.add(`${v[0]} ~ ${v[1]}`)
      }
    }
  }
  const modules = Object.fromEntries(
    MODULE_DEFS.map((d) => [
      d.id,
      { params: { ...state.inputs[d.id] }, data: state.results[d.id]! },
    ]),
  ) as ReportPayload['modules']
  return {
    report: {
      title: '机队运行综合分析报告',
      type: '定期运行分析',
      period: [...periods].join('；') || '—',
      generatedAt: state.generatedAt ?? new Date().toLocaleString('zh-CN'),
    },
    modules,
  }
})

const finalJsonText = computed(() =>
  finalJson.value ? JSON.stringify(finalJson.value, null, 2) : '',
)

/* ------------------------------ actions ------------------------------ */

/** 更新某模块输入（v-model 直接改 reactive 对象） */
function setInput(id: ModuleId, key: string, value: unknown) {
  state.inputs[id][key] = value as InputMap[string]
}

/** 重置单个模块：清结果、按 schema 恢复默认输入 */
function resetModule(id: ModuleId) {
  const def = MODULE_DEFS.find((d) => d.id === id)
  if (def) state.inputs[id] = defaultInputs(def)
  state.status[id] = 'idle'
  state.results[id] = null
  state.elapsed[id] = null
  invalidateReport()
}

/** 模拟一次取数：延迟 0.7~1.4s，写入 mock 结果 */
async function runModule(id: ModuleId) {
  if (state.status[id] === 'running') return
  state.status[id] = 'running'
  const t0 = performance.now()
  await sleep(700 + Math.random() * 700)
  state.results[id] = buildMockResult(id, state.inputs[id])
  state.elapsed[id] = Math.round(performance.now() - t0)
  state.status[id] = 'done'
  invalidateReport()
}

let genToken = 0

/** 报告内容失效：模块数据变化后，已生成的报告标记为过期 */
function invalidateReport() {
  if (state.reportDone) state.stale = true
}

/**
 * 模拟"把 JSON 传给大模型 → 流式返回报告"：
 * 前端不做真实请求，按打字机节奏把模板 markdown 逐段吐出。
 */
async function generateReport() {
  const payload = finalJson.value
  if (!payload || state.generating) return

  state.generatedAt = new Date().toLocaleString('zh-CN')
  const full = buildReportMarkdown(payload)

  state.generating = true
  state.streaming = true
  state.reportDone = false
  state.stale = false
  state.reportMd = ''

  // 模拟大模型首 token 延迟
  await sleep(600)
  const token = ++genToken

  // 按"词块"流式追加，模拟 LLM 输出节奏（全文约 3 秒吐完）
  let i = 0
  while (i < full.length) {
    if (token !== genToken) return // 被重新生成打断
    const step = 8 + Math.floor(Math.random() * 10)
    state.reportMd += full.slice(i, i + step)
    i += step
    await sleep(10 + Math.random() * 14)
  }

  state.streaming = false
  state.reportDone = true
  state.generating = false
}

function resetAll() {
  genToken += 1
  Object.assign(state, initState())
}

export const reportStore = {
  state,
  completedCount,
  allModulesDone,
  finalJson,
  finalJsonText,
  setInput,
  runModule,
  resetModule,
  generateReport,
  resetAll,
}

export type ReportStore = typeof reportStore
