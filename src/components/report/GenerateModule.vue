<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { CopyDocument, Download, MagicStick } from '@element-plus/icons-vue'
import { marked } from 'marked'
import { reportStore } from '@/store/report'

const g = reportStore

const jsonExpanded = ref(false)
const copied = ref(false)

const hasReport = computed(() => g.state.reportMd.length > 0)
const rendered = computed(() => marked.parse(g.state.reportMd) as string)

const generateTooltip = computed(() =>
  g.allModulesDone.value
    ? '把整合 JSON 提交给大模型，流式生成报告'
    : '请先完成上方 4 个模块的数据获取',
)

async function copyJson() {
  try {
    await navigator.clipboard.writeText(g.finalJsonText.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    ElMessage.warning('复制失败，请手动选择文本复制')
  }
}

/** 下载报告：demo 用 HTML 包装的 .doc（Word 可直接打开） */
function downloadReport() {
  if (!hasReport.value) return
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${g.finalJson.value?.report.title ?? '报告'}</title>
<style>
  body { font-family: 'Microsoft YaHei', sans-serif; font-size: 12pt; line-height: 1.8; }
  h1 { font-size: 20pt; text-align: center; }
  h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #999; padding: 5px 9px; font-size: 10.5pt; }
  th { background: #f0f2f5; }
  blockquote { color: #666; border-left: 3px solid #ccc; margin: 0; padding-left: 12px; }
</style></head><body>${rendered.value}</body></html>`
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `机队运行综合分析报告_${new Date().toISOString().slice(0, 10)}.doc`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="gen-card" :class="{ 'is-ready': g.allModulesDone.value }">
    <header class="card-head">
      <div class="card-index">5</div>
      <div class="card-title-wrap">
        <h3 class="card-title">
          报告生成
          <span class="card-subtitle">Report Generation</span>
        </h3>
        <p class="card-desc">
          汇总前四个模块的入参与结果，整合为完整 JSON 提交给大模型，流式生成 Word 报告。
        </p>
      </div>
      <div class="card-status">
        <el-tag
          :type="g.allModulesDone.value ? 'success' : 'info'"
          effect="light"
          round
          size="small"
        >
          {{ g.completedCount.value }}/4 模块就绪
        </el-tag>
      </div>
    </header>

    <!-- 整合 JSON -->
    <div class="json-block">
      <div class="json-head">
        <span class="json-title">整合 JSON（提交给大模型的完整载荷）</span>
        <div class="json-tools">
          <el-button text size="small" :icon="CopyDocument" @click="copyJson">
            {{ copied ? '已复制' : '复制' }}
          </el-button>
          <el-button text size="small" @click="jsonExpanded = !jsonExpanded">
            {{ jsonExpanded ? '收起' : '展开' }}
          </el-button>
        </div>
      </div>
      <pre v-if="g.finalJson.value" class="json-pre" :class="{ expanded: jsonExpanded }">{{ g.finalJsonText.value }}</pre>
      <el-empty
        v-else
        description="完成上方 4 个模块的数据获取后，这里会展示整合 JSON"
        :image-size="60"
        class="json-empty"
      />
    </div>

    <!-- 生成动作 -->
    <div class="gen-actions">
      <el-tooltip :content="generateTooltip" placement="top" :show-after="300">
        <el-button
          type="primary"
          size="large"
          :icon="MagicStick"
          :disabled="!g.allModulesDone.value"
          :loading="g.state.generating"
          @click="g.generateReport()"
        >
          {{ g.state.generating ? '生成中…' : g.state.reportDone ? '重新生成报告' : '生成报告' }}
        </el-button>
      </el-tooltip>
      <el-button
        size="large"
        :icon="Download"
        :disabled="!g.state.reportDone"
        @click="downloadReport"
      >
        下载 Word
      </el-button>
      <span class="gen-note">数据变更后需重新生成，报告与 JSON 版本自动对齐</span>
    </div>

    <!-- 报告预览 -->
    <div class="report-block">
      <div class="report-head">
        <span class="report-title">报告预览</span>
        <span class="report-meta">
          <template v-if="g.state.reportDone">
            {{ g.state.generatedAt }} · 由大模型基于整合 JSON 生成
            <el-tag v-if="g.state.stale" type="warning" size="small" effect="light" class="stale-tag">
              数据已变更，建议重新生成
            </el-tag>
          </template>
        </span>
      </div>
      <div v-if="hasReport" class="report-body">
        <div class="markdown" :class="{ streaming: g.state.streaming }" v-html="rendered" />
        <span v-if="g.state.streaming" class="cursor">▌</span>
      </div>
      <el-empty
        v-else
        description="点击「生成报告」后，这里将实时展示大模型的流式输出"
        :image-size="72"
      />
    </div>
  </section>
</template>

<script lang="ts">
export default { name: 'GenerateModule' }
</script>

<style scoped>
.gen-card {
  background: #fff;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 16px 18px 18px;
}

.gen-card.is-ready {
  border-color: #b7ccf8;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.07);
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.card-index {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: linear-gradient(135deg, #7c3aed, #a78bfa);
}

.card-title-wrap {
  flex: 1;
  min-width: 0;
}

.card-title {
  margin: 2px 0 3px;
  font-size: 15px;
  line-height: 1.2;
}

.card-subtitle {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
  letter-spacing: 0.4px;
}

.card-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
}

.card-status {
  flex: none;
  padding-top: 3px;
}

/* JSON 块 */
.json-block {
  margin-top: 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.json-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: #f6f8fb;
  border-bottom: 1px solid var(--line);
}

.json-title {
  font-size: 12px;
  color: var(--text-2);
  font-weight: 500;
}

.json-tools {
  display: flex;
  gap: 2px;
}

.json-pre {
  margin: 0;
  padding: 10px 12px;
  max-height: 120px;
  overflow: auto;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 11px;
  line-height: 1.6;
  color: #334155;
  background: #fcfdfe;
  white-space: pre;
}

.json-pre.expanded {
  max-height: 460px;
}

.json-empty {
  padding: 18px 0;
}

/* 动作区 */
.gen-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}

.gen-note {
  font-size: 11px;
  color: var(--text-3);
}

/* 报告预览 */
.report-block {
  margin-top: 16px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}

.report-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f6f8fb;
  border-bottom: 1px solid var(--line);
}

.report-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

.report-meta {
  font-size: 11px;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 8px;
}

.stale-tag {
  margin-left: 2px;
}

.report-body {
  position: relative;
  padding: 14px 20px;
  max-height: 520px;
  overflow: auto;
}

.cursor {
  color: var(--brand);
  animation: blink 0.8s step-end infinite;
  font-size: 14px;
}

@keyframes blink {
  50% { opacity: 0; }
}

/* markdown 渲染样式 */
.markdown :deep(h1) {
  margin: 4px 0 10px;
  font-size: 19px;
  text-align: center;
}

.markdown :deep(h2) {
  margin: 18px 0 8px;
  font-size: 14px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--line);
}

.markdown :deep(p) {
  margin: 6px 0;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.markdown :deep(ul) {
  margin: 6px 0;
  padding-left: 20px;
}

.markdown :deep(li) {
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-2);
}

.markdown :deep(blockquote) {
  margin: 8px 0;
  padding: 6px 12px;
  border-left: 3px solid #c3d4fa;
  background: #f6f8fb;
  color: var(--text-2);
  font-size: 12px;
  border-radius: 0 6px 6px 0;
}

.markdown :deep(blockquote p) {
  margin: 0;
}

.markdown :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 10px 0;
  font-size: 12px;
}

.markdown :deep(th),
.markdown :deep(td) {
  border: 1px solid var(--line-strong);
  padding: 6px 10px;
  text-align: left;
}

.markdown :deep(th) {
  background: #f6f8fb;
  color: var(--text-2);
  font-weight: 500;
}

.markdown :deep(strong) {
  color: var(--text-1);
}
</style>
