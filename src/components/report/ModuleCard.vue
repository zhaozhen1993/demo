<script setup lang="ts">
import { computed } from 'vue'
import { RefreshRight, VideoPlay } from '@element-plus/icons-vue'
import type { ModuleId } from '@/types/report'
import { MODULE_DEFS } from '@/data/reportMock'
import { reportStore } from '@/store/report'

const props = defineProps<{ moduleId: ModuleId }>()

const g = reportStore
const MODULE_DEFS_MAP = Object.fromEntries(MODULE_DEFS.map((d) => [d.id, d]))
const def = computed(() => MODULE_DEFS_MAP[props.moduleId])

const inputs = computed(() => g.state.inputs[props.moduleId])
const status = computed(() => g.state.status[props.moduleId])
const result = computed(() => g.state.results[props.moduleId])
const elapsed = computed(() => g.state.elapsed[props.moduleId])

/** 等级/指标色调映射到 Element tag 类型 */
const toneTag = (tone?: string) =>
  tone === 'good' ? 'success' : tone === 'warn' ? 'warning' : tone === 'bad' ? 'danger' : 'info'

const riskTag = (level: string) =>
  level === '高' ? 'danger' : level === '中' ? 'warning' : 'success'
</script>

<template>
  <section class="module-card">
    <header class="card-head">
      <div class="card-index" :class="{ 'is-done': status === 'done' }">
        {{ def.index }}
      </div>
      <div class="card-title-wrap">
        <h3 class="card-title">
          {{ def.title }}
          <span class="card-subtitle">{{ def.subtitle }}</span>
        </h3>
        <p class="card-desc">{{ def.description }}</p>
      </div>
      <div class="card-status">
        <el-tag v-if="status === 'done'" type="success" effect="light" round size="small">
          已完成
        </el-tag>
        <el-tag v-else-if="status === 'running'" type="warning" effect="light" round size="small">
          执行中…
        </el-tag>
        <el-tag v-else type="info" effect="plain" round size="small">待执行</el-tag>
      </div>
    </header>

    <!-- 入参表单（schema 驱动） -->
    <el-form class="module-form" label-position="top" @submit.prevent>
      <el-row :gutter="14">
        <el-col
          v-for="field in def.fields"
          :key="field.key"
          :span="field.span === 2 ? 24 : 12"
        >
          <el-form-item :label="field.label">
            <el-date-picker
              v-if="field.type === 'daterange'"
              :model-value="inputs[field.key]"
              type="daterange"
              range-separator="→"
              start-placeholder="开始"
              end-placeholder="结束"
              value-format="YYYY-MM-DD"
              style="width: 100%"
              @update:model-value="(v: unknown) => g.setInput(moduleId, field.key, v)"
            />
            <el-select
              v-else-if="field.type === 'multi-select'"
              :model-value="inputs[field.key]"
              multiple
              collapse-tags
              collapse-tags-tooltip
              clearable
              :placeholder="field.placeholder"
              style="width: 100%"
              @update:model-value="(v: unknown) => g.setInput(moduleId, field.key, v)"
            >
              <el-option
                v-for="opt in field.options"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-select
              v-else-if="field.type === 'select'"
              :model-value="inputs[field.key]"
              :placeholder="field.placeholder"
              style="width: 100%"
              @update:model-value="(v: unknown) => g.setInput(moduleId, field.key, v)"
            >
              <el-option
                v-for="opt in field.options"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-input-number
              v-else-if="field.type === 'number'"
              :model-value="inputs[field.key]"
              :min="field.min"
              :max="field.max"
              controls-position="right"
              style="width: 160px"
              @update:model-value="(v: unknown) => g.setInput(moduleId, field.key, v)"
            />
            <el-input
              v-else
              :model-value="inputs[field.key]"
              :placeholder="field.placeholder"
              clearable
              style="width: 100%"
              @update:model-value="(v: unknown) => g.setInput(moduleId, field.key, v)"
            />
            <span v-if="field.suffix" class="field-suffix">{{ field.suffix }}</span>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <footer class="card-actions">
      <el-button
        type="primary"
        :icon="VideoPlay"
        :loading="status === 'running'"
        @click="g.runModule(moduleId)"
      >
        {{ status === 'done' ? '重新获取数据' : '获取数据' }}
      </el-button>
      <el-button
        v-if="status === 'done'"
        :icon="RefreshRight"
        text
        @click="g.resetModule(moduleId)"
      >
        重置
      </el-button>
      <span v-if="elapsed" class="elapsed">耗时 {{ elapsed }} ms</span>
    </footer>

    <!-- 结果区 -->
    <transition name="fade">
      <div v-if="result" class="card-result">
        <div class="metrics">
          <div v-for="m in result.metrics" :key="m.label" class="metric">
            <span class="metric-label">{{ m.label }}</span>
            <span class="metric-value" :class="`tone-${m.tone ?? 'none'}`">
              {{ m.value }}<small v-if="m.hint" class="metric-hint"> {{ m.hint }}</small>
            </span>
          </div>
        </div>

        <el-table
          v-if="result.table"
          :data="result.table.rows"
          size="small"
          border
          class="result-table"
        >
          <el-table-column
            v-for="col in result.table.columns"
            :key="col.prop"
            :prop="col.prop"
            :label="col.label"
            :min-width="col.label.length > 4 ? 120 : 90"
          >
            <template v-if="col.prop === 'level'" #default="{ row }">
              <el-tag :type="riskTag(row.level)" size="small" effect="light">
                {{ row.level }}风险
              </el-tag>
            </template>
          </el-table-column>
        </el-table>

        <p class="result-summary">{{ result.summary }}</p>
      </div>
    </transition>
  </section>
</template>

<script lang="ts">
export default { name: 'ModuleCard' }
</script>

<style scoped>
.module-card {
  background: #fff;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  padding: 16px 18px 18px;
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
  background: linear-gradient(135deg, #64748b, #94a3b8);
}

.card-index.is-done {
  background: linear-gradient(135deg, #2563eb, #4f7cf0);
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

.module-form {
  margin-top: 14px;
}

.module-form :deep(.el-form-item) {
  margin-bottom: 10px;
}

.module-form :deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--text-2);
  padding-bottom: 4px;
}

.field-suffix {
  margin-left: 6px;
  color: var(--text-3);
  font-size: 12px;
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.elapsed {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* 结果区 */
.card-result {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line-strong);
}

.metrics {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.metric {
  flex: 1 1 130px;
  min-width: 120px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: #fafbfd;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 11px;
  color: var(--text-3);
}

.metric-value {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-1);
}

.metric-value.tone-good { color: #16a34a; }
.metric-value.tone-warn { color: #d97706; }
.metric-value.tone-bad { color: #dc2626; }

.metric-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}

.result-table {
  margin-top: 10px;
}

.result-summary {
  margin: 10px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-2);
  background: #f6f8fb;
  border-radius: 6px;
  padding: 8px 12px;
}

.fade-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
</style>
