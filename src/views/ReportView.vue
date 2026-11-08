<script setup lang="ts">
import { computed } from 'vue'
import { MODULE_DEFS } from '@/data/reportMock'
import { reportStore } from '@/store/report'
import ModuleCard from '@/components/report/ModuleCard.vue'
import GenerateModule from '@/components/report/GenerateModule.vue'

const g = reportStore

/** 顶部步骤条：4 个取数模块 + 报告生成 */
const steps = computed(() => [
  ...MODULE_DEFS.map((d) => ({
    key: d.id,
    title: d.title,
    done: g.state.status[d.id] === 'done',
  })),
  { key: 'generate', title: '报告生成', done: g.state.reportDone },
])
</script>

<template>
  <div class="report-page">
    <header class="page-head">
      <div class="head-text">
        <h1 class="page-title">报告生成工作台</h1>
        <p class="page-sub">
          五个模块依次执行：各模块输入参数并获取数据 → 数据整合为完整 JSON → 提交大模型生成 Word 报告（demo：取数与模型输出均为模拟）。
        </p>
      </div>
      <el-button text :icon="RefreshRight" @click="g.resetAll()">全部重置</el-button>
    </header>

    <!-- 步骤进度 -->
    <div class="steps-bar">
      <template v-for="(s, i) in steps" :key="s.key">
        <div class="step" :class="{ 'is-done': s.done }">
          <span class="step-dot">
            <el-icon v-if="s.done"><Check /></el-icon>
            <template v-else>{{ i + 1 }}</template>
          </span>
          <span class="step-title">{{ s.title }}</span>
        </div>
        <span v-if="i < steps.length - 1" class="step-line" :class="{ 'is-done': s.done }" />
      </template>
    </div>

    <!-- 模块流 -->
    <main class="module-flow">
      <ModuleCard v-for="def in MODULE_DEFS" :key="def.id" :module-id="def.id" />
      <GenerateModule />
    </main>
  </div>
</template>

<script lang="ts">
import { Check, RefreshRight } from '@element-plus/icons-vue'
export default { name: 'ReportView', components: { Check, RefreshRight } }
</script>

<style scoped>
.report-page {
  min-height: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 20px 24px 48px;
}

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.page-title {
  margin: 0 0 6px;
  font-size: 19px;
}

.page-sub {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-2);
  line-height: 1.7;
  max-width: 640px;
}

/* 步骤条 */
.steps-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 18px 0 20px;
  padding: 12px 16px;
  background: #fff;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
}

.step {
  display: flex;
  align-items: center;
  gap: 7px;
  flex: none;
}

.step-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  color: var(--text-2);
  background: #eef1f6;
  border: 1px solid var(--line-strong);
  transition: all 0.2s ease;
}

.step.is-done .step-dot {
  color: #fff;
  background: var(--brand);
  border-color: var(--brand);
}

.step-title {
  font-size: 12px;
  color: var(--text-2);
}

.step.is-done .step-title {
  color: var(--text-1);
  font-weight: 500;
}

.step-line {
  flex: 1;
  height: 1px;
  background: var(--line-strong);
  min-width: 12px;
}

.step-line.is-done {
  background: #9db9f5;
}

.module-flow {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
