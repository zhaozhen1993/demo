import type {
  InputMap,
  InputValue,
  ModuleDef,
  ModuleId,
  ModuleResult,
} from '@/types/report'

/* ------------------------------ 模块定义（schema 驱动） ------------------------------ */

export const MODULE_DEFS: ModuleDef[] = [
  {
    id: 'retrieval',
    index: 1,
    title: '数据检索',
    subtitle: 'Data Retrieval',
    description: '按数据源、时间范围与机型范围检索运行数据，作为报告的数据底座。',
    fields: [
      {
        key: 'dataSource',
        label: '数据源',
        type: 'select',
        span: 1,
        options: [
          { label: '运行监控数据', value: 'ops' },
          { label: '维修记录', value: 'maintenance' },
          { label: '航材消耗', value: 'material' },
          { label: '航班计划', value: 'schedule' },
        ],
        default: 'ops',
      },
      {
        key: 'dateRange',
        label: '数据时间范围',
        type: 'daterange',
        span: 1,
      },
      {
        key: 'aircraftTypes',
        label: '机型范围',
        type: 'multi-select',
        span: 2,
        options: [
          { label: 'B737-800', value: 'B737-800' },
          { label: 'B737 MAX8', value: 'B737 MAX8' },
          { label: 'A320neo', value: 'A320neo' },
          { label: 'A321neo', value: 'A321neo' },
          { label: 'B787-9', value: 'B787-9' },
        ],
        default: ['B737-800', 'A320neo'],
      },
      {
        key: 'keyword',
        label: '关键字过滤（可选）',
        type: 'input',
        span: 2,
        placeholder: '如：空调、起落架、发动机',
      },
    ],
  },
  {
    id: 'prediction',
    index: 2,
    title: '预测分析',
    subtitle: 'Prediction',
    description: '基于检索数据运行预测算法，输出故障率与可用度趋势。',
    fields: [
      {
        key: 'horizon',
        label: '预测周期',
        type: 'select',
        span: 1,
        options: [
          { label: '未来 7 天', value: '7' },
          { label: '未来 14 天', value: '14' },
          { label: '未来 30 天', value: '30' },
        ],
        default: '14',
      },
      {
        key: 'algorithm',
        label: '预测算法',
        type: 'select',
        span: 1,
        options: [
          { label: 'LSTM 时序模型', value: 'lstm' },
          { label: 'Prophet', value: 'prophet' },
          { label: 'XGBoost 回归', value: 'xgb' },
        ],
        default: 'lstm',
      },
      {
        key: 'confidence',
        label: '置信水平',
        type: 'select',
        span: 1,
        options: [
          { label: '90%', value: '0.90' },
          { label: '95%', value: '0.95' },
          { label: '99%', value: '0.99' },
        ],
        default: '0.95',
      },
      {
        key: 'targetRate',
        label: '目标可用度（%）',
        type: 'number',
        span: 1,
        default: 92,
        min: 80,
        max: 100,
        suffix: '%',
      },
    ],
  },
  {
    id: 'risk',
    index: 3,
    title: '风险评估',
    subtitle: 'Risk Assessment',
    description: '对运行、维修等维度做风险扫描，输出风险项清单与等级分布。',
    fields: [
      {
        key: 'dimensions',
        label: '评估维度',
        type: 'multi-select',
        span: 2,
        options: [
          { label: '飞行安全', value: 'safety' },
          { label: '维修保障', value: 'maintenance' },
          { label: '运行准点', value: 'operation' },
          { label: '合规审计', value: 'compliance' },
        ],
        default: ['safety', 'maintenance'],
      },
      {
        key: 'threshold',
        label: '纳入阈值',
        type: 'select',
        span: 1,
        options: [
          { label: '中风险及以上', value: 'medium' },
          { label: '高风险及以上', value: 'high' },
        ],
        default: 'medium',
      },
      {
        key: 'lookback',
        label: '回溯窗口（天）',
        type: 'number',
        span: 1,
        default: 30,
        min: 7,
        max: 90,
        suffix: '天',
      },
    ],
  },
  {
    id: 'resource',
    index: 4,
    title: '资源盘点',
    subtitle: 'Resource Review',
    description: '汇总基地机队规模、人力与航材保障情况，为结论提供资源口径。',
    fields: [
      {
        key: 'bases',
        label: '基地范围',
        type: 'multi-select',
        span: 2,
        options: [
          { label: '北京 PEK', value: 'PEK' },
          { label: '上海 SHA', value: 'SHA' },
          { label: '深圳 SZX', value: 'SZX' },
          { label: '成都 CTU', value: 'CTU' },
        ],
        default: ['PEK', 'SZX'],
      },
      {
        key: 'scope',
        label: '统计口径',
        type: 'select',
        span: 1,
        options: [
          { label: '全机队', value: 'all' },
          { label: '在役', value: 'active' },
          { label: '含停场维修', value: 'with-grounded' },
        ],
        default: 'all',
      },
      {
        key: 'unit',
        label: '人力口径',
        type: 'select',
        span: 1,
        options: [
          { label: '机械师人次', value: 'mechanic' },
          { label: '放行人员', value: 'release' },
          { label: '全部技术人力', value: 'all-tech' },
        ],
        default: 'mechanic',
      },
    ],
  },
]

export const MODULE_MAP: Record<ModuleId, ModuleDef> = Object.fromEntries(
  MODULE_DEFS.map((m) => [m.id, m]),
) as Record<ModuleId, ModuleDef>

/** 各模块输入的默认值（由 schema 推导） */
export function defaultInputs(def: ModuleDef): InputMap {
  const map: InputMap = {}
  for (const f of def.fields) {
    if (f.type === 'daterange') {
      const end = new Date()
      const start = new Date(end.getTime() - 30 * 86400e3)
      const fmt = (d: Date) => d.toISOString().slice(0, 10)
      map[f.key] = [fmt(start), fmt(end)]
    } else {
      map[f.key] = (f.default ?? null) as InputValue
    }
  }
  return map
}

/* ------------------------------ Mock 结果生成 ------------------------------ */

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const randInt = (min: number, max: number) => Math.round(rand(min, max))
const pick = <T,>(arr: T[]) => arr[randInt(0, arr.length - 1)]
const fmtDate = (iso?: string | null) => (iso ? iso.slice(5).replace('-', '/') : '—')

/** 模拟一次模块取数：输入不同结果会有差异，带少量随机扰动 */
export function buildMockResult(id: ModuleId, inputs: InputMap): ModuleResult {
  switch (id) {
    case 'retrieval': {
      const types = (inputs.aircraftTypes as string[] | null)?.length
        ? (inputs.aircraftTypes as string[])
        : ['B737-800']
      const [s, e] = (inputs.dateRange as [string, string]) || ['', '']
      const sourceLabel =
        MODULE_MAP.retrieval.fields[0].options!.find(
          (o) => o.value === inputs.dataSource,
        )?.label ?? '运行监控数据'
      const total = randInt(1200, 4800)
      return {
        summary: `在「${sourceLabel}」中检索 ${fmtDate(s)} – ${fmtDate(e)} 期间 ${types.join('、')} 的数据，命中 ${total} 条记录，数据完整率良好，可用于后续分析。`,
        metrics: [
          { label: '命中记录', value: String(total), hint: '条' },
          { label: '覆盖机型', value: String(types.length), hint: '个' },
          {
            label: '数据完整率',
            value: `${rand(92, 99.5).toFixed(1)}%`,
            tone: 'good',
          },
          {
            label: '最新记录',
            value: `${fmtDate(e)} ${randInt(0, 23)}:${String(randInt(0, 59)).padStart(2, '0')}`,
          },
        ],
        table: {
          columns: [
            { prop: 'type', label: '机型' },
            { prop: 'records', label: '记录数' },
            { prop: 'ratio', label: '占比' },
            { prop: 'completeness', label: '完整率' },
          ],
          rows: types.map((t) => ({
            type: t,
            records: randInt(200, 1800),
            ratio: `${rand(15, 60).toFixed(1)}%`,
            completeness: `${rand(90, 99.8).toFixed(1)}%`,
          })),
        },
      }
    }

    case 'prediction': {
      const days = Number(inputs.horizon) || 14
      const conf = `${Math.round(Number(inputs.confidence) * 100 || 95)}%`
      const target = Number(inputs.targetRate) || 92
      const fault = rand(1.2, 3.6)
      const avail = rand(target - 2.5, target + 2.2)
      const algoLabel =
        MODULE_MAP.prediction.fields[1].options!.find(
          (o) => o.value === inputs.algorithm,
        )?.label ?? 'LSTM'
      return {
        summary: `采用 ${algoLabel} 对未来 ${days} 天进行预测（置信水平 ${conf}）：预测故障率 ${fault.toFixed(2)} 次/百飞行小时，机队可用度 ${avail.toFixed(1)}%，${avail >= target ? '高于' : '低于'}目标值 ${target}%。`,
        metrics: [
          {
            label: '预测故障率',
            value: fault.toFixed(2),
            hint: '次/百飞行小时',
            tone: fault > 3 ? 'warn' : 'good',
          },
          {
            label: '预测可用度',
            value: `${avail.toFixed(1)}%`,
            tone: avail >= target ? 'good' : 'bad',
          },
          { label: '置信水平', value: conf },
          {
            label: '备用机需求',
            value: `${randInt(1, 4)} 架`,
            hint: `峰值日`,
          },
        ],
        table: {
          columns: [
            { prop: 'date', label: '时间点' },
            { prop: 'faultRate', label: '故障率预测' },
            { prop: 'avail', label: '可用度预测' },
            { prop: 'lower', label: `置信下界 (${conf})` },
          ],
          rows: Array.from({ length: Math.min(6, Math.ceil(days / 2)) }, (_, i) => ({
            date: `D+${(i + 1) * 2}天`,
            faultRate: (fault + rand(-0.4, 0.5)).toFixed(2),
            avail: `${(avail + rand(-1.2, 1)).toFixed(1)}%`,
            lower: `${(avail - 1.8).toFixed(1)}%`,
          })),
        },
      }
    }

    case 'risk': {
      const dimLabel: Record<string, string> = {
        safety: '飞行安全',
        maintenance: '维修保障',
        operation: '运行准点',
        compliance: '合规审计',
      }
      const dims = (inputs.dimensions as string[] | null)?.length
        ? (inputs.dimensions as string[])
        : ['safety']
      const items = dims.flatMap((d) => {
        const n = randInt(1, 3)
        return Array.from({ length: n }, () => {
          const level = pick(['高', '中', '中', '低'])
          return {
            dim: dimLabel[d],
            level,
            prob: `${randInt(8, 45)}%`,
            impact: pick(['严重', '较大', '一般']),
            desc: pick([
              '部件老化趋势明显，维修间隔偏长',
              '极端天气窗口与排班高峰重叠',
              '航材周转库存低于安全水位',
              '人员排班连续工时接近上限',
              '重复故障间隔缩短，需专项排查',
            ]),
          }
        })
      })
      const count = (lv: string) => items.filter((i) => i.level === lv).length
      return {
        summary: `对 ${dims.map((d) => dimLabel[d]).join('、')} 等 ${dims.length} 个维度完成风险扫描（回溯 ${inputs.lookback} 天），共识别 ${items.length} 项风险：高风险 ${count('高')} 项、中风险 ${count('中')} 项、低风险 ${count('低')} 项。`,
        metrics: [
          { label: '高风险', value: String(count('高')), tone: 'bad' },
          { label: '中风险', value: String(count('中')), tone: 'warn' },
          { label: '低风险', value: String(count('低')), tone: 'good' },
          { label: '评估维度', value: String(dims.length) },
        ],
        table: {
          columns: [
            { prop: 'dim', label: '维度' },
            { prop: 'level', label: '等级' },
            { prop: 'prob', label: '发生概率' },
            { prop: 'impact', label: '影响程度' },
            { prop: 'desc', label: '描述' },
          ],
          rows: items,
        },
      }
    }

    case 'resource': {
      const baseLabel: Record<string, string> = {
        PEK: '北京',
        SHA: '上海',
        SZX: '深圳',
        CTU: '成都',
      }
      const bases = (inputs.bases as string[] | null)?.length
        ? (inputs.bases as string[])
        : ['PEK']
      const total = bases.length * randInt(14, 26)
      const availRate = rand(86, 97)
      return {
        summary: `盘点 ${bases.map((b) => baseLabel[b]).join('、')} 等 ${bases.length} 个基地：机队规模 ${total} 架，可用率 ${availRate.toFixed(1)}%，航材满足率 ${rand(90, 99).toFixed(1)}%${availRate < 90 ? '，人力存在缺口需跨基地支援' : '，人力配置基本满足需求'}。`,
        metrics: [
          { label: '机队规模', value: `${total}`, hint: '架' },
          {
            label: '可用率',
            value: `${availRate.toFixed(1)}%`,
            tone: availRate >= 90 ? 'good' : 'warn',
          },
          {
            label: '人力缺口',
            value: `${randInt(0, 6)} 人`,
            tone: 'warn',
          },
          { label: '航材满足率', value: `${rand(90, 99).toFixed(1)}%` },
        ],
        table: {
          columns: [
            { prop: 'base', label: '基地' },
            { prop: 'fleet', label: '机队（架）' },
            { prop: 'grounded', label: '停场维修' },
            { prop: 'mechanic', label: '机械师' },
            { prop: 'material', label: '航材满足率' },
          ],
          rows: bases.map((b) => ({
            base: `${baseLabel[b]} ${b}`,
            fleet: randInt(10, 28),
            grounded: randInt(0, 3),
            mechanic: randInt(30, 90),
            material: `${rand(88, 99).toFixed(1)}%`,
          })),
        },
      }
    }
  }
}

/* ------------------------------ 报告 markdown 生成 ------------------------------ */

import type { ReportPayload } from '@/types/report'

const MODULE_SECTION: Record<ModuleId, { no: string; title: string }> = {
  retrieval: { no: '一', title: '数据检索结论' },
  prediction: { no: '二', title: '预测分析' },
  risk: { no: '三', title: '风险评估' },
  resource: { no: '四', title: '资源盘点' },
}

/** 把整合 JSON "喂给大模型"，产出报告 markdown（demo 中为模板插值） */
export function buildReportMarkdown(p: ReportPayload): string {
  const { modules } = p
  const sec = (id: ModuleId) => {
    const m = modules[id]
    const head = MODULE_SECTION[id]
    const metricLines = m.data.metrics
      .map((k) => `- **${k.label}**：${k.value}${k.hint ?? ''}`)
      .join('\n')
    let table = ''
    if (m.data.table) {
      const t = m.data.table
      const header = `| ${t.columns.map((c) => c.label).join(' | ')} |`
      const sep = `| ${t.columns.map(() => '---').join(' | ')} |`
      const rows = t.rows
        .map((r) => `| ${t.columns.map((c) => r[c.prop]).join(' | ')} |`)
        .join('\n')
      table = `\n${header}\n${sep}\n${rows}\n`
    }
    return `## ${head.no}、${head.title}\n\n${m.data.summary}\n\n${metricLines}\n${table}`
  }

  const highRisk = modules.risk.data.metrics[0]?.value ?? '0'
  const avail = modules.prediction.data.metrics[1]?.value ?? '—'
  const suggestions = [
    highRisk !== '0'
      ? '针对高风险项启动专项排查，一周内闭环'
      : '维持现有风险控制措施，按周期复评',
    '对预测故障率偏高的机型加密定检频次',
    '按备用机需求结论动态调整备份运力布局',
    '对缺口人力基地启动跨基地支援机制',
  ]

  return `# ${p.report.title}

> 报告类型：${p.report.type} ｜ 统计周期：${p.report.period} ｜ 生成时间：${p.report.generatedAt}

## 摘要

本报告整合数据检索、预测分析、风险评估与资源盘点四个模块的输出，对机队运行状态进行综合研判。预测机队可用度 **${avail}**，识别风险项共 **${modules.risk.data.metrics[0].value + modules.risk.data.metrics[1].value + modules.risk.data.metrics[2].value}** 项（其中高风险 ${highRisk} 项）。

${sec('retrieval')}
${sec('prediction')}
${sec('risk')}
${sec('resource')}

## 五、综合结论与建议

| 序号 | 建议事项 | 优先级 |
| --- | --- | --- |
${suggestions.map((s, i) => `| ${i + 1} | ${s} | ${['高', '高', '中', '中'][i]} |`).join('\n')}

## 六、数据来源说明

- 本报告数据由「数据检索 / 预测分析 / 风险评估 / 资源盘点」四个模块在 ${p.report.generatedAt} 汇总生成。
- 预测类指标为模型估算值，置信水平见对应章节；风险等级为规则引擎判定结果。
`
}
