<script setup lang="ts">
import { computed } from 'vue'
import {
  Clock,
  Delete,
  Plus,
  QuestionFilled,
  RefreshLeft,
  RefreshRight,
  Search,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import { SNAP_OPTIONS, TASK_STATUS_META, TASK_TYPE_LIST } from '@/constants/task'
import type { TaskStatus, TaskType } from '@/types/gantt'
import { useGantt } from '@/store/gantt'
import { addDays } from '@/utils/time'

const emit = defineEmits<{
  (e: 'create'): void
  (e: 'open-history'): void
}>()

const g = useGantt()
const {
  state,
  canUndo,
  canRedo,
  stats,
  undo,
  redo,
  zoom,
  shiftRange,
  goToday,
  reset,
} = g

const statusOptions = (Object.keys(TASK_STATUS_META) as TaskStatus[]).map((value) => ({
  value,
  label: TASK_STATUS_META[value].label,
}))

const dateRange = computed({
  get: () =>
    [
      new Date(state.rangeStart),
      new Date(addDays(state.rangeStart, state.days - 1)),
    ] as [Date, Date],
  set: (value: [Date, Date]) => {
    if (!value || !value[0] || !value[1]) return
    g.setRangeByDates(value[0].getTime(), value[1].getTime())
  },
})

const shortcuts = [
  { keys: '← / →', desc: '按吸附粒度移动选中块' },
  { keys: 'Shift + ← / →', desc: '按 6 小时移动' },
  { keys: 'Alt + ← / →', desc: '调整块结束时间(改时长)' },
  { keys: '↑ / ↓', desc: '切换上/下一行的任务' },
  { keys: 'Enter', desc: '打开编辑面板' },
  { keys: 'Delete', desc: '删除选中块' },
  { keys: 'Ctrl + Z / Shift + Z', desc: '撤销 / 重做' },
  { keys: 'Esc', desc: '取消选中' },
]
</script>

<template>
  <div class="toolbar">
    <div class="toolbar-head">
      <div class="head-title">
        <span class="logo-dot" />
        <h1>机队排班甘特图</h1>
        <span class="head-sub">Fleet Schedule</span>
      </div>

      <div class="head-stats">
        <span class="stat"><b>{{ stats.rows }}</b> 架机位</span>
        <span class="stat-divider" />
        <span class="stat"><b>{{ stats.total }}</b> 个任务</span>
        <span class="stat-divider" />
        <span class="stat"><b>{{ stats.flight }}</b> 航班</span>
        <span class="stat-divider" />
        <span class="stat" :class="{ 'is-warn': stats.conflict > 0 }">
          <b>{{ stats.conflict }}</b> 个冲突块
        </span>
      </div>

      <div class="head-actions">
        <el-popover placement="bottom-end" :width="300" trigger="click">
          <template #reference>
            <el-tooltip content="键盘快捷键" placement="bottom" :show-after="400">
              <el-button :icon="QuestionFilled" />
            </el-tooltip>
          </template>
          <div class="shortcut-panel">
            <div v-for="item in shortcuts" :key="item.keys" class="shortcut-row">
              <kbd>{{ item.keys }}</kbd>
              <span>{{ item.desc }}</span>
            </div>
          </div>
        </el-popover>

        <el-popconfirm title="重置为初始演示数据？当前修改会丢失" @confirm="reset()">
          <template #reference>
            <el-tooltip content="重置数据" placement="bottom" :show-after="400">
              <el-button :icon="Delete" />
            </el-tooltip>
          </template>
        </el-popconfirm>

        <span class="head-divider" />

        <el-tooltip content="撤销 (Ctrl+Z)" placement="bottom" :show-after="400">
          <el-button :disabled="!canUndo" @click="undo()">
            <el-icon><RefreshLeft /></el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="重做 (Ctrl+Shift+Z)" placement="bottom" :show-after="400">
          <el-button :disabled="!canRedo" @click="redo()">
            <el-icon><RefreshRight /></el-icon>
          </el-button>
        </el-tooltip>
        <el-button @click="emit('open-history')">
          <el-icon><Clock /></el-icon>
          <span>操作记录</span>
          <el-tag v-if="state.logs.length" size="small" type="info" effect="plain" round>
            {{ state.logs.length }}
          </el-tag>
        </el-button>
        <el-button type="primary" @click="emit('create')">
          <el-icon><Plus /></el-icon>
          <span>新建任务</span>
        </el-button>
      </div>
    </div>

    <div class="toolbar-filters">
      <div class="fgroup">
        <el-input
          v-model="state.keyword"
          class="filter-search"
          placeholder="搜索机型 / 尾号 / 基地"
          clearable
          :prefix-icon="Search"
        />

        <el-select
          v-model="state.typeFilter"
          class="filter-select"
          placeholder="任务类型"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
        >
          <el-option
            v-for="item in TASK_TYPE_LIST"
            :key="item.value"
            :label="item.label"
            :value="item.value as TaskType"
          />
        </el-select>

        <el-select
          v-model="state.statusFilter"
          class="filter-select filter-select--sm"
          placeholder="状态"
          multiple
          collapse-tags
          clearable
        >
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </div>

      <div class="fgroup">
        <el-date-picker
          v-model="dateRange"
          class="filter-range"
          type="daterange"
          range-separator="→"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :clearable="false"
          unlink-panels
        />

        <el-button-group class="shift-group">
          <el-button @click="shiftRange(-1)">前一天</el-button>
          <el-button @click="goToday()">今天</el-button>
          <el-button @click="shiftRange(1)">后一天</el-button>
        </el-button-group>
      </div>

      <div class="fgroup">
        <div class="zoom-box">
          <el-tooltip content="缩小时间刻度" placement="bottom" :show-after="400">
            <el-button text :icon="ZoomOut" @click="zoom(-4)" />
          </el-tooltip>
          <span class="zoom-value">{{ state.hourWidth }}px/h</span>
          <el-tooltip content="放大时间刻度" placement="bottom" :show-after="400">
            <el-button text :icon="ZoomIn" @click="zoom(4)" />
          </el-tooltip>
        </div>

        <el-tooltip content="拖拽与方向键的吸附粒度" placement="bottom" :show-after="400">
          <el-select v-model="state.snapMinutes" class="filter-select filter-select--xs">
            <el-option
              v-for="item in SNAP_OPTIONS"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </el-tooltip>
      </div>

      <div class="fgroup fgroup--switch">
        <el-checkbox v-model="state.showWeekend" label="周末" size="small" />
        <el-checkbox v-model="state.showNight" label="夜间时段" size="small" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  flex: none;
  background: #fff;
  border-bottom: 1px solid var(--line);
  padding: 10px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toolbar-head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.head-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.logo-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  align-self: center;
}

.head-title h1 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.2px;
  color: var(--text-1);
}

.head-sub {
  font-size: 11px;
  color: var(--text-3);
  letter-spacing: 0.6px;
  text-transform: uppercase;
}

.head-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-2);
}

.stat b {
  color: var(--text-1);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat.is-warn b {
  color: #ef4444;
}

.stat-divider {
  width: 1px;
  height: 10px;
  background: var(--line-strong);
}

.head-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

.head-actions :deep(.el-button) {
  margin-left: 0;
}

.head-actions :deep(.el-button:not(.is-circle)) {
  gap: 4px;
}

.toolbar-filters {
  display: flex;
  align-items: center;
  gap: 8px 20px;
  flex-wrap: wrap;
}

.fgroup {
  display: flex;
  align-items: center;
  gap: 8px;
}

.fgroup--switch {
  gap: 2px;
}

.filter-search {
  width: 178px;
}

.filter-select {
  width: 116px;
}

.filter-select--sm {
  width: 100px;
}

.filter-select--xs {
  width: 96px;
}

.filter-range {
  width: 214px !important;
}

.shift-group :deep(.el-button) {
  padding: 8px 10px;
  font-size: 12px;
}

.zoom-box {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  height: 30px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: #fbfcfe;
}

.zoom-value {
  font-size: 12px;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
  min-width: 54px;
  text-align: center;
}

.head-divider {
  width: 1px;
  height: 18px;
  margin: 0 2px;
  background: var(--line-strong);
}

.shortcut-panel {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.shortcut-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}

.shortcut-row kbd {
  flex: none;
  min-width: 112px;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--line-strong);
  border-bottom-width: 2px;
  background: #fbfcfe;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  color: var(--text-1);
  text-align: center;
}

:deep(.el-checkbox) {
  margin-right: 6px;
}

:deep(.el-checkbox__label) {
  font-size: 12px;
  padding-left: 6px;
}
</style>
