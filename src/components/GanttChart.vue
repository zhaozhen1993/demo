<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Edit, Delete, CopyDocument } from '@element-plus/icons-vue'
import type { GanttTask } from '@/types/gantt'
import type { TimelineDay } from '@/store/gantt'
import { TASK_TYPE_LIST, TASK_TYPE_META } from '@/constants/task'
import { HEADER_HEIGHT, useGantt } from '@/store/gantt'
import { HOUR, formatRange, startOfDay } from '@/utils/time'
import GanttToolbar from './GanttToolbar.vue'
import GanttTimelineHeader from './GanttTimelineHeader.vue'
import GanttBar from './GanttBar.vue'
import TaskEditDialog from './TaskEditDialog.vue'
import HistoryDrawer from './HistoryDrawer.vue'

const g = useGantt()
const {
  state,
  scrollEl,
  timelineWidth,
  canvasWidth,
  dayList,
  filteredRows,
  tasksByRow,
  selectedTask,
  timeToX,
  select,
  clearSelection,
  nudge,
  selectAdjacentRow,
  deleteTask,
  updateTask,
  createTask,
  undo,
  redo,
  setRange,
  fitToView,
  scrollToNow,
} = g

const stageRef = ref<HTMLElement | null>(null)
const historyOpen = ref(false)
const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const dialogTask = ref<GanttTask | null>(null)
const dialogStart = ref<number>(Date.now())

/** 横向滚动位置，用于计算视图左缘落在哪一天 */
const scrollLeft = ref(0)
const visibleDay = computed(() => {
  const dayWidth = 24 * state.hourWidth
  const index = Math.floor(scrollLeft.value / dayWidth)
  return dayList.value[Math.min(Math.max(index, 0), dayList.value.length - 1)]
})

const draggingRowId = computed(
  () => state.tasks.find((t) => t.id === state.draggingId)?.rowId ?? null,
)

function onScroll() {
  scrollLeft.value = stageRef.value?.scrollLeft ?? 0
}

/* ------------------------------ 样式变量 ------------------------------ */

const canvasStyle = computed(() => ({
  width: `${canvasWidth.value}px`,
  '--hour-w': `${state.hourWidth}px`,
  '--row-h': `${state.rowHeight}px`,
  '--side-w': `${state.sideWidth}px`,
  '--header-h': `${HEADER_HEIGHT}px`,
}))

const timelineStyle = computed(() => ({
  left: `${state.sideWidth}px`,
  width: `${timelineWidth.value}px`,
}))

/* ------------------------------ 网格装饰 ------------------------------ */

/** 非工作时段（00:00-08:00 / 18:00-24:00） */
const nightBands = computed(() => {
  if (!state.showNight) return []
  const hw = state.hourWidth
  const bands: { left: number; width: number }[] = []
  dayList.value.forEach((day) => {
    const base = day.index * 24 * hw
    bands.push({ left: base, width: 8 * hw })
    bands.push({ left: base + 18 * hw, width: 6 * hw })
  })
  return bands
})

const weekendBands = computed(() => {
  if (!state.showWeekend) return []
  const hw = state.hourWidth
  return dayList.value
    .filter((d) => d.weekend)
    .map((d) => ({ left: d.index * 24 * hw, width: 24 * hw }))
})

const dayDividers = computed(() =>
  dayList.value.map((d) => ({ left: d.index * 24 * state.hourWidth, today: d.isToday })),
)

/** 当前时间竖线位置（相对时间轴） */
const nowX = computed(() => {
  const x = timeToX(state.now)
  if (x < 0 || x > timelineWidth.value) return null
  return x
})

/* ------------------------------ 交互 ------------------------------ */

function onStageClick(event: MouseEvent) {
  const target = event.target as HTMLElement
  if (target.closest('.gantt-bar') || target.closest('.row-side')) return
  clearSelection()
}

function onHeaderAction(payload: { command: string; day: TimelineDay }) {
  const { command, day } = payload
  if (command === 'start') setRange(day.start, state.days)
  if (command === 'only') {
    setRange(day.start, 1)
    fitToView(28)
  }
  if (command === 'create') openCreate(day.start + 9 * HOUR)
}

function selectRowFirst(rowId: string) {
  const list = tasksByRow.value.get(rowId)
  if (list && list.length) select(list[0].id)
}

function openCreate(defaultStart?: number) {
  dialogMode.value = 'create'
  dialogTask.value = null
  dialogStart.value = defaultStart ?? Math.ceil(state.now / HOUR) * HOUR
  dialogVisible.value = true
}

function openEdit(task: GanttTask) {
  dialogMode.value = 'edit'
  dialogTask.value = task
  dialogVisible.value = true
}

function onDialogSubmit(payload: { id?: string; data: Omit<GanttTask, 'id'> }) {
  if (payload.id) {
    updateTask(payload.id, payload.data)
    ElMessage.success('任务已更新')
  } else {
    createTask(payload.data)
    ElMessage.success('任务已创建')
  }
}

function onDialogRemove(id: string) {
  deleteTask(id)
  ElMessage.success('任务已删除，可 Ctrl+Z 撤销')
}

function duplicateTask(task: GanttTask) {
  const start = task.start + 24 * HOUR
  createTask({
    rowId: task.rowId,
    title: task.title,
    type: task.type,
    status: 'plan',
    start,
    end: start + (task.end - task.start),
    remark: task.remark,
  })
  ElMessage.success('已复制到次日')
}

/* ------------------------------ 右键菜单 ------------------------------ */

const menu = ref<{ visible: boolean; x: number; y: number; task: GanttTask | null }>({
  visible: false,
  x: 0,
  y: 0,
  task: null,
})

function onBarContextMenu(task: GanttTask, event: MouseEvent) {
  select(task.id, false)
  menu.value = { visible: true, x: event.clientX, y: event.clientY, task }
}

function closeMenu() {
  menu.value.visible = false
}

function menuAction(action: 'edit' | 'duplicate' | 'delete') {
  const task = menu.value.task
  closeMenu()
  if (!task) return
  if (action === 'edit') openEdit(task)
  if (action === 'duplicate') duplicateTask(task)
  if (action === 'delete') {
    deleteTask(task.id)
    ElMessage.success('任务已删除，可 Ctrl+Z 撤销')
  }
}

/* ------------------------------ 键盘控制 ------------------------------ */

function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null
  if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return

  const mod = event.ctrlKey || event.metaKey
  const key = event.key

  if (mod && key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return
  }
  if (mod && key.toLowerCase() === 'y') {
    event.preventDefault()
    redo()
    return
  }

  const step = state.snapMinutes / 60

  switch (key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (!selectedTask.value) return
      nudge(event.shiftKey ? -6 : -step, event.altKey ? 'end' : 'both')
      break
    case 'ArrowRight':
      event.preventDefault()
      if (!selectedTask.value) return
      nudge(event.shiftKey ? 6 : step, event.altKey ? 'end' : 'both')
      break
    case 'ArrowUp':
      event.preventDefault()
      selectAdjacentRow(-1)
      break
    case 'ArrowDown':
      event.preventDefault()
      selectAdjacentRow(1)
      break
    case 'Enter':
      if (selectedTask.value) {
        event.preventDefault()
        openEdit(selectedTask.value)
      }
      break
    case 'Delete':
    case 'Backspace':
      if (selectedTask.value) {
        event.preventDefault()
        deleteTask(selectedTask.value.id)
      }
      break
    case 'Escape':
      clearSelection()
      closeMenu()
      break
    default:
      break
  }
}

/* ------------------------------ 生命周期 ------------------------------ */

let timer: number | undefined

onMounted(() => {
  scrollEl.value = stageRef.value
  stageRef.value?.focus({ preventScroll: true })
  window.addEventListener('click', closeMenu)
  timer = window.setInterval(() => g.tick(), 30_000)
  requestAnimationFrame(() => scrollToNow(0.3))
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeMenu)
  if (timer) window.clearInterval(timer)
})

// 视图范围变化后确保选中块仍在可视范围
watch(
  () => [state.rangeStart, state.days, state.hourWidth],
  () => {
    if (selectedTask.value) g.revealTask(selectedTask.value.id)
  },
)

function jumpToTask(task: GanttTask) {
  const visibleStart = state.rangeStart
  const visibleEnd = visibleStart + state.days * 24 * HOUR
  if (task.start < visibleStart || task.start >= visibleEnd) {
    setRange(startOfDay(task.start), state.days)
  }
  select(task.id)
}
</script>

<template>
  <div class="gantt">
    <GanttToolbar @create="openCreate()" @open-history="historyOpen = true" />

    <div
      ref="stageRef"
      class="gantt-stage"
      tabindex="0"
      @keydown="onKeydown"
      @scroll.passive="onScroll"
      @click="onStageClick"
    >
      <div class="gantt-canvas" :style="canvasStyle">
        <!-- 表头：左侧机位列 + 右侧时间刻度 -->
        <div class="gantt-head">
          <div class="head-side" :style="{ width: `${state.sideWidth}px` }">
            <div class="head-side-title">
              <span>机型 / 尾号</span>
              <span class="head-side-sub">{{ filteredRows.length }} 架</span>
            </div>
            <span class="head-side-day" :class="{ 'is-weekend': visibleDay?.weekend }">
              {{ visibleDay ? `${visibleDay.label} ${visibleDay.weekday}` : '' }}
            </span>
          </div>
          <GanttTimelineHeader @action="onHeaderAction" />
        </div>

        <!-- 主体 -->
        <div class="gantt-body">
          <!-- 网格层 -->
          <div class="grid-layer" :style="timelineStyle">
            <div
              v-for="(band, i) in weekendBands"
              :key="`w${i}`"
              class="band-weekend"
              :style="{ left: `${band.left}px`, width: `${band.width}px` }"
            />
            <div
              v-for="(band, i) in nightBands"
              :key="`n${i}`"
              class="band-night"
              :style="{ left: `${band.left}px`, width: `${band.width}px` }"
            />
            <div
              v-for="(line, i) in dayDividers"
              :key="`d${i}`"
              class="divider-day"
              :class="{ 'is-today': line.today }"
              :style="{ left: `${line.left}px` }"
            />
            <div v-if="nowX !== null" class="now-line" :style="{ left: `${nowX}px` }">
              <span class="now-flag">现在</span>
            </div>
          </div>

          <!-- 行 -->
          <div class="rows-wrap">
            <div
              v-for="row in filteredRows"
              :key="row.id"
              class="gantt-row"
              :class="{
                'is-row-selected': selectedTask?.rowId === row.id,
                'is-row-dragging': draggingRowId === row.id,
              }"
            >
              <div
                class="row-side"
                :style="{ width: `${state.sideWidth}px` }"
                @click="selectRowFirst(row.id)"
              >
                <div class="row-side-main">
                  <span class="row-type">{{ row.aircraftType }}</span>
                  <span class="row-tail">{{ row.tailNumber }}</span>
                </div>
                <div class="row-side-meta">
                  <span class="row-base">{{ row.base }}</span>
                  <span class="row-count">{{ (tasksByRow.get(row.id) || []).length }} 项</span>
                </div>
              </div>

              <div class="row-track" :style="{ width: `${timelineWidth}px` }">
                <GanttBar
                  v-for="task in tasksByRow.get(row.id) || []"
                  :key="task.id"
                  :task="task"
                  @edit="openEdit"
                  @contextmenu="onBarContextMenu"
                />
              </div>
            </div>
          </div>

          <!-- 空白行填充，让网格铺满视口 -->
          <div class="rows-filler" :style="{ '--side-w': `${state.sideWidth}px` }">
            <div class="filler-side" :style="{ width: `${state.sideWidth}px` }" />
          </div>

          <div v-if="!filteredRows.length" class="empty-body">
            <el-empty description="没有匹配的机型 / 尾号" :image-size="80" />
          </div>
        </div>
      </div>
    </div>

    <!-- 底部图例与选中信息 -->
    <div class="gantt-footer">
      <div class="legend">
        <span v-for="item in TASK_TYPE_LIST" :key="item.value" class="legend-item">
          <i class="legend-dot" :style="{ background: TASK_TYPE_META[item.value].color }" />
          {{ item.label }}
        </span>
        <span class="legend-item legend-item--night">
          <i class="legend-swatch" />
          非工作时段
        </span>
      </div>

      <div v-if="selectedTask" class="selection-info">
        <span class="sel-tag">已选中</span>
        <b>{{ selectedTask.title }}</b>
        <span class="sel-time">
          {{ formatRange(selectedTask.start, selectedTask.end) }}
        </span>
        <span class="sel-hint">← → 微调 · Alt+← → 改时长 · Enter 编辑</span>
        <el-button text size="small" @click="jumpToTask(selectedTask)">定位</el-button>
      </div>
      <div v-else class="selection-info selection-info--empty">
        点击甘特块或按 ↑ ↓ 选中任务，方向键可微调时间
      </div>
    </div>

    <TaskEditDialog
      v-model="dialogVisible"
      :mode="dialogMode"
      :task="dialogTask"
      :default-start="dialogStart"
      @submit="onDialogSubmit"
      @remove="onDialogRemove"
    />

    <HistoryDrawer v-model="historyOpen" />

    <!-- 右键菜单 -->
    <Teleport to="body">
      <div
        v-if="menu.visible"
        class="ctx-menu"
        :style="{ left: `${menu.x}px`, top: `${menu.y}px` }"
        @click.stop
      >
        <div class="ctx-item" @click="menuAction('edit')">
          <el-icon><Edit /></el-icon>编辑任务
        </div>
        <div class="ctx-item" @click="menuAction('duplicate')">
          <el-icon><CopyDocument /></el-icon>复制到次日
        </div>
        <div class="ctx-divider" />
        <div class="ctx-item is-danger" @click="menuAction('delete')">
          <el-icon><Delete /></el-icon>删除任务
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.gantt {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  background: #fff;
}

.gantt-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: auto;
  outline: none;
  background: #fff;
  scrollbar-width: thin;
}

.gantt-stage:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(59, 130, 246, 0.35);
}

.gantt-canvas {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* -------------------------------- 表头 -------------------------------- */

.gantt-head {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  height: var(--header-h);
  background: #fff;
  box-shadow: 0 1px 0 var(--line-strong), 0 4px 10px -6px rgba(15, 23, 42, 0.18);
}

.head-side {
  position: sticky;
  left: 0;
  z-index: 22;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 14px;
  background: #fbfcfe;
  border-right: 1px solid var(--line-strong);
}

.head-side-title {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
}

.head-side-sub {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-3);
}

.head-side-hint {
  font-size: 11px;
  color: var(--text-3);
}

.head-side-day {
  padding: 1px 7px;
  border-radius: 4px;
  background: #eef4ff;
  color: var(--brand);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.head-side-day.is-weekend {
  background: #f1f5f9;
  color: var(--text-2);
}

.gantt-head :deep(.tl-header) {
  position: static;
  flex: none;
}

/* -------------------------------- 主体 -------------------------------- */

.gantt-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.grid-layer {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 0;
  pointer-events: none;
  background-image: repeating-linear-gradient(
    to right,
    var(--line) 0 1px,
    transparent 1px var(--hour-w)
  );
}

.band-weekend {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(100, 116, 139, 0.05);
}

.band-night {
  position: absolute;
  top: 0;
  bottom: 0;
  background: repeating-linear-gradient(
    -45deg,
    rgba(100, 116, 139, 0.07) 0 3px,
    rgba(100, 116, 139, 0.02) 3px 7px
  );
}

.divider-day {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--line-strong);
}

.divider-day.is-today {
  width: 2px;
  background: rgba(59, 130, 246, 0.28);
}

.now-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: #ef4444;
  box-shadow: 0 0 0 1px rgba(239, 68, 68, 0.12);
}

.now-flag {
  position: absolute;
  top: -1px;
  left: 50%;
  translate: -50% 0;
  padding: 1px 5px;
  border-radius: 0 0 4px 4px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  line-height: 1.4;
  white-space: nowrap;
}

.rows-wrap {
  position: relative;
  z-index: 1;
}

.rows-filler {
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0,
    transparent calc(var(--row-h) - 1px),
    var(--line) calc(var(--row-h) - 1px),
    var(--line) var(--row-h)
  );
}

.filler-side {
  position: sticky;
  left: 0;
  flex: none;
  align-self: stretch;
  background: #fff;
  border-right: 1px solid var(--line-strong);
}

.gantt-row {
  position: relative;
  z-index: 1;
  display: flex;
  height: var(--row-h);
  border-bottom: 1px solid var(--line);
}

.gantt-row:hover .row-track {
  background: rgba(59, 130, 246, 0.035);
}

.gantt-row.is-row-selected .row-track {
  background: rgba(59, 130, 246, 0.055);
}

.gantt-row.is-row-dragging {
  z-index: 9;
}

.row-side {
  position: sticky;
  left: 0;
  z-index: 3;
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  padding: 0 14px;
  background: #fff;
  border-right: 1px solid var(--line-strong);
  cursor: pointer;
  transition: background 0.12s ease;
}

.gantt-row:hover .row-side {
  background: #fbfcfe;
}

.gantt-row.is-row-selected .row-side {
  background: #f3f7ff;
  box-shadow: inset 3px 0 0 var(--brand);
}

.row-side-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.row-type {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-tail {
  font-size: 12px;
  color: var(--brand);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2px;
}

.row-side-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-3);
}

.row-base {
  padding: 0 5px;
  border-radius: 3px;
  background: #eef2f7;
  color: var(--text-2);
  font-weight: 500;
}

.row-count {
  font-variant-numeric: tabular-nums;
}

.row-track {
  position: relative;
  flex: none;
  height: 100%;
  transition: background 0.12s ease;
}

.empty-body {
  position: relative;
  z-index: 1;
  padding: 48px 0;
  background: #fff;
}

/* -------------------------------- 底部 -------------------------------- */

.gantt-footer {
  flex: none;
  display: flex;
  align-items: center;
  gap: 16px;
  height: 36px;
  padding: 0 16px;
  border-top: 1px solid var(--line);
  background: #fbfcfe;
  font-size: 12px;
  color: var(--text-2);
}

.legend {
  display: flex;
  align-items: center;
  gap: 14px;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 2px;
}

.legend-swatch {
  width: 12px;
  height: 9px;
  border-radius: 2px;
  background: repeating-linear-gradient(
    -45deg,
    rgba(100, 116, 139, 0.35) 0 3px,
    rgba(100, 116, 139, 0.1) 3px 7px
  );
}

.selection-info {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.selection-info--empty {
  color: var(--text-3);
}

.sel-tag {
  padding: 1px 6px;
  border-radius: 3px;
  background: #eef4ff;
  color: var(--brand);
  font-size: 11px;
  font-weight: 600;
}

.selection-info b {
  font-size: 12px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sel-time {
  font-variant-numeric: tabular-nums;
  color: var(--text-2);
}

.sel-hint {
  color: var(--text-3);
  font-size: 11px;
}
</style>

<style>
.ctx-menu {
  position: fixed;
  z-index: 3000;
  min-width: 150px;
  padding: 4px;
  border-radius: 8px;
  background: #fff;
  border: 1px solid var(--line);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.16);
  font-size: 12.5px;
  color: var(--text-1);
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.ctx-item:hover {
  background: #f3f6fb;
}

.ctx-item.is-danger {
  color: #ef4444;
}

.ctx-item.is-danger:hover {
  background: #fef2f2;
}

.ctx-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--line);
}
</style>
