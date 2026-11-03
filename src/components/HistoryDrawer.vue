<script setup lang="ts">
import { computed } from 'vue'
import { Clock, RefreshLeft, RefreshRight, Delete } from '@element-plus/icons-vue'
import type { HistoryAction } from '@/types/gantt'
import { useGantt } from '@/store/gantt'
import { formatMD, formatHM } from '@/utils/time'

const drawerOpen = defineModel<boolean>('modelValue', { default: false })

const { state, canUndo, canRedo, undo, redo, clearHistory, select } = useGantt()

const ACTION_META: Record<
  HistoryAction,
  { label: string; type: 'primary' | 'success' | 'info' | 'warning' | 'danger' }
> = {
  move: { label: '移动', type: 'primary' },
  'resize-start': { label: '改开始', type: 'warning' },
  'resize-end': { label: '改结束', type: 'warning' },
  edit: { label: '编辑', type: 'info' },
  create: { label: '新建', type: 'success' },
  delete: { label: '删除', type: 'danger' },
}

const logs = computed(() => state.logs)

function timeText(ts: number) {
  return `${formatMD(ts)} ${formatHM(ts)}`
}

function focusTask(taskId: string) {
  const exists = state.tasks.some((t) => t.id === taskId)
  if (exists) select(taskId)
}
</script>

<template>
  <el-drawer
    v-model="drawerOpen"
    title="操作记录"
    size="380px"
    append-to-body
    :modal="false"
    :lock-scroll="false"
    class="history-drawer"
  >
    <template #header>
      <div class="drawer-head">
        <div class="drawer-title">
          <el-icon><Clock /></el-icon>
          <span>操作记录</span>
          <el-tag v-if="logs.length" size="small" type="info" effect="plain" round>
            {{ logs.length }}
          </el-tag>
        </div>
        <div class="drawer-actions">
          <el-tooltip content="撤销上一步" placement="bottom" :show-after="400">
            <el-button size="small" :disabled="!canUndo" @click="undo()">
              <el-icon><RefreshLeft /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="重做" placement="bottom" :show-after="400">
            <el-button size="small" :disabled="!canRedo" @click="redo()">
              <el-icon><RefreshRight /></el-icon>
            </el-button>
          </el-tooltip>
          <el-popconfirm title="清空全部操作记录？" @confirm="clearHistory()">
            <template #reference>
              <el-button size="small" :icon="Delete" :disabled="!logs.length" />
            </template>
          </el-popconfirm>
        </div>
      </div>
    </template>

    <div v-if="!logs.length" class="empty-wrap">
      <el-empty description="还没有任何操作记录" :image-size="88" />
    </div>

    <div v-else class="log-list">
      <div
        v-for="log in logs"
        :key="log.id"
        class="log-item"
        :class="{ 'is-undone': log.undone }"
        @click="focusTask(log.taskId)"
      >
        <span class="log-dot" :class="`dot-${ACTION_META[log.action].type}`" />
        <div class="log-main">
          <div class="log-top">
            <el-tag size="small" :type="ACTION_META[log.action].type" effect="light" round>
              {{ ACTION_META[log.action].label }}
            </el-tag>
            <span class="log-task">{{ log.taskLabel }}</span>
            <span class="log-time">{{ timeText(log.time) }}</span>
          </div>
          <p class="log-detail">{{ log.detail || '无描述' }}</p>
          <p v-if="log.undone" class="log-undone">已被撤销</p>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.drawer-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.drawer-actions {
  display: flex;
  gap: 6px;
  margin-right: 8px;
}

.empty-wrap {
  padding-top: 48px;
}

.log-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.log-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding: 10px 8px 10px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;
}

.log-item:hover {
  background: #f6f8fb;
}

.log-item.is-undone {
  opacity: 0.55;
}

.log-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin-top: 7px;
  border-radius: 50%;
  background: var(--text-3);
}

.log-dot.dot-primary {
  background: #3b82f6;
}

.log-dot.dot-success {
  background: #10b981;
}

.log-dot.dot-warning {
  background: #f59e0b;
}

.log-dot.dot-danger {
  background: #ef4444;
}

.log-dot.dot-info {
  background: #64748b;
}

.log-main {
  min-width: 0;
  flex: 1;
}

.log-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.log-task {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-time {
  margin-left: auto;
  flex: none;
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.log-detail {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-2);
  word-break: break-all;
}

.log-undone {
  margin: 3px 0 0;
  font-size: 11px;
  color: #ef4444;
}

.log-item.is-undone .log-detail {
  text-decoration: line-through;
}
</style>
