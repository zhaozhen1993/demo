<script setup lang="ts">
import { computed } from 'vue'
import type { GanttTask } from '@/types/gantt'
import { TASK_TYPE_META } from '@/constants/task'
import { useGantt } from '@/store/gantt'
import { formatHM, formatRange } from '@/utils/time'

const props = defineProps<{ task: GanttTask }>()
const emit = defineEmits<{
  (e: 'edit', task: GanttTask): void
  (e: 'contextmenu', task: GanttTask, event: MouseEvent): void
}>()

const { state, rowConflicts, timeToX, beginDrag } = useGantt()

const selected = computed(() => state.selectedId === props.task.id)
const dragging = computed(() => state.draggingId === props.task.id)
// 只订阅所在行的冲突分片：其他行的任务变动不会触发本块重渲染
const conflict = computed(() => rowConflicts(props.task.rowId).has(props.task.id))

const left = computed(() => timeToX(props.task.start))
const width = computed(() => Math.max(6, timeToX(props.task.end) - timeToX(props.task.start)))

/** 依据宽度决定信息密度 */
const density = computed(() => {
  const w = width.value
  if (w >= 160) return 'full'
  if (w >= 96) return 'medium'
  if (w >= 44) return 'small'
  return 'tiny'
})

const rangeLabel = computed(() => `${formatHM(props.task.start)} - ${formatHM(props.task.end)}`)

const barStyle = computed(() => {
  const meta = TASK_TYPE_META[props.task.type]
  return {
    left: `${left.value}px`,
    width: `${width.value}px`,
    '--bar-color': meta.color,
    '--bar-color-deep': meta.colorDeep,
  }
})

const tooltip = computed(
  () =>
    `${props.task.title}\n${formatRange(props.task.start, props.task.end)}${
      conflict.value ? '\n⚠ 与其他任务时间重叠' : ''
    }`,
)

function onDrag(mode: 'move' | 'left' | 'right', event: MouseEvent) {
  beginDrag(event, props.task, mode)
}
</script>

<template>
  <div
    class="gantt-bar"
    :data-id="task.id"
    :class="[
      `density-${density}`,
      {
        'is-selected': selected,
        'is-dragging': dragging,
        'is-conflict': conflict,
        'is-done': task.status === 'done',
        'is-active': task.status === 'active',
      },
    ]"
    :style="barStyle"
    :title="tooltip"
    @mousedown.stop="onDrag('move', $event)"
    @dblclick.stop="emit('edit', task)"
    @contextmenu.prevent.stop="emit('contextmenu', task, $event)"
  >
    <span class="bar-handle bar-handle--left" @mousedown.stop="onDrag('left', $event)" />

    <span class="bar-body">
      <span class="bar-title">{{ task.title }}</span>
      <span v-if="density === 'full'" class="bar-time">{{ rangeLabel }}</span>
    </span>

    <span class="bar-handle bar-handle--right" @mousedown.stop="onDrag('right', $event)" />

    <span v-if="dragging" class="bar-drag-tip">{{ rangeLabel }}</span>
  </div>
</template>

<style scoped>
.gantt-bar {
  position: absolute;
  top: 7px;
  height: calc(var(--row-h) - 14px);
  display: flex;
  align-items: center;
  border-radius: 6px;
  background: linear-gradient(135deg, var(--bar-color), var(--bar-color-deep));
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: 12px;
  line-height: 1.2;
  cursor: grab;
  user-select: none;
  overflow: visible;
  transition: box-shadow 0.12s ease, filter 0.12s ease, transform 0.06s ease;
  z-index: 2;
}

.gantt-bar:active {
  cursor: grabbing;
}

.gantt-bar:hover {
  filter: brightness(1.06);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  z-index: 3;
}

.gantt-bar.is-selected {
  outline: 2px solid #0f172a;
  outline-offset: 1px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25);
  z-index: 5;
}

.gantt-bar.is-dragging {
  filter: brightness(1.08);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.3);
  z-index: 6;
  transition: none;
}

.gantt-bar.is-done {
  opacity: 0.72;
}

.gantt-bar.is-active::after {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 8px;
  border: 1px dashed rgba(255, 255, 255, 0.75);
  animation: bar-pulse 1.8s ease-in-out infinite;
  pointer-events: none;
}

@keyframes bar-pulse {
  0%,
  100% {
    opacity: 0.35;
  }
  50% {
    opacity: 0.9;
  }
}

.gantt-bar.is-conflict {
  background-image:
    repeating-linear-gradient(
      -45deg,
      rgba(239, 68, 68, 0.55) 0 5px,
      transparent 5px 11px
    ),
    linear-gradient(135deg, var(--bar-color), var(--bar-color-deep));
  box-shadow: 0 0 0 1px #ef4444, inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.bar-body {
  flex: 1;
  min-width: 0;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  white-space: nowrap;
  pointer-events: none;
}

.bar-title {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.bar-time {
  flex: none;
  font-size: 11px;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}

.density-tiny .bar-body,
.density-small .bar-body {
  padding: 0 4px;
}

.density-tiny .bar-title,
.density-small .bar-title {
  font-size: 11px;
}

.density-tiny .bar-title {
  display: none;
}

.bar-handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  opacity: 0;
  background: rgba(255, 255, 255, 0.55);
  transition: opacity 0.12s ease;
}

.bar-handle--left {
  left: 0;
  border-radius: 6px 0 0 6px;
}

.bar-handle--right {
  right: 0;
  border-radius: 0 6px 6px 0;
}

.gantt-bar:hover .bar-handle,
.gantt-bar.is-selected .bar-handle {
  opacity: 0.9;
}

.bar-drag-tip {
  position: absolute;
  top: 50%;
  left: calc(100% + 8px);
  translate: 0 -50%;
  padding: 2px 7px;
  border-radius: 4px;
  background: #0f172a;
  color: #fff;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.25);
  pointer-events: none;
  z-index: 10;
}
</style>
