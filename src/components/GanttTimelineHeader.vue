<script setup lang="ts">
import { computed } from 'vue'
import { MoreFilled } from '@element-plus/icons-vue'
import type { TimelineDay } from '@/store/gantt'
import { useGantt } from '@/store/gantt'
import { pad2 } from '@/utils/time'

const emit = defineEmits<{
  (e: 'action', payload: { command: string; day: TimelineDay }): void
}>()

const { state, timelineWidth, dayList, hourLabelStep } = useGantt()

const dayWidth = computed(() => 24 * state.hourWidth)

function onCommand(command: string, day: TimelineDay) {
  emit('action', { command, day })
}
</script>

<template>
  <div class="tl-header" :style="{ width: `${timelineWidth}px` }">
    <div class="tl-days">
      <div
        v-for="day in dayList"
        :key="day.start"
        class="tl-day"
        :class="{ 'is-weekend': day.weekend, 'is-today': day.isToday }"
        :style="{ width: `${dayWidth}px` }"
      >
        <span class="tl-day-inner">
          <span class="tl-day-label">{{ day.label }}</span>
          <span class="tl-day-week">{{ day.weekday }}</span>
        </span>
        <el-dropdown
          trigger="click"
          size="small"
          placement="bottom-start"
          @command="(cmd: string) => onCommand(cmd, day)"
        >
          <span class="tl-day-more" @click.stop>
            <el-icon><MoreFilled /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="start">{{ day.label }} 设为视图起点</el-dropdown-item>
              <el-dropdown-item command="only">只看 {{ day.label }} 这一天</el-dropdown-item>
              <el-dropdown-item command="create" divided>在此日新建任务</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <div class="tl-hours">
      <div
        v-for="day in dayList"
        :key="day.start"
        class="tl-hour-group"
        :class="{ 'is-weekend': day.weekend }"
        :style="{ width: `${dayWidth}px` }"
      >
        <div
          v-for="hour in 24"
          :key="hour"
          class="tl-hour"
          :class="{ 'is-major': (hour - 1) % hourLabelStep === 0 }"
          :style="{ width: `${state.hourWidth}px` }"
        >
          <span v-if="(hour - 1) % hourLabelStep === 0" class="tl-hour-label">
            {{ pad2(hour - 1) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tl-header {
  position: sticky;
  top: 0;
  z-index: 6;
  background: #fff;
  border-bottom: 1px solid var(--line-strong);
  will-change: transform;
}

.tl-days {
  display: flex;
  height: 30px;
}

.tl-day {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0 10px;
  border-left: 1px solid var(--line-strong);
  border-bottom: 1px solid var(--line);
  background: #fbfcfe;
}

.tl-day-inner {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding-right: 6px;
}

.tl-day.is-weekend {
  background: #f6f7fb;
}

.tl-day.is-today {
  background: #eff6ff;
}

.tl-day-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1);
  font-variant-numeric: tabular-nums;
}

.tl-day-week {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

.tl-day.is-today .tl-day-week {
  color: var(--brand);
  font-weight: 600;
}

.tl-day-more {
  position: absolute;
  right: 4px;
  top: 50%;
  translate: 0 -50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.tl-day:hover .tl-day-more {
  opacity: 1;
}

.tl-day-more:hover {
  background: rgba(15, 23, 42, 0.08);
  color: var(--text-1);
}

.tl-hours {
  display: flex;
  height: 26px;
}

.tl-hour-group {
  display: flex;
  border-left: 1px solid var(--line-strong);
}

.tl-hour-group.is-weekend {
  background: #fafbfd;
}

.tl-hour {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-left: 1px solid var(--line);
  font-size: 10px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.tl-hour:first-child {
  border-left: none;
}

.tl-hour.is-major {
  border-left-color: rgba(15, 23, 42, 0.14);
}

.tl-hour-label {
  transform: translateX(0);
  pointer-events: none;
  white-space: nowrap;
}
</style>
