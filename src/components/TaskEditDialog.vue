<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import type { GanttTask, TaskStatus, TaskType } from '@/types/gantt'
import { TASK_STATUS_META, TASK_TYPE_LIST } from '@/constants/task'
import { useGantt } from '@/store/gantt'
import { HOUR, formatYMD, parseDateTime } from '@/utils/time'

const props = defineProps<{
  modelValue: boolean
  task: GanttTask | null
  mode: 'create' | 'edit'
  defaultStart?: number
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (
    e: 'submit',
    payload: { id?: string; data: Omit<GanttTask, 'id'> },
  ): void
  (e: 'remove', id: string): void
}>()

const { state } = useGantt()
const formRef = ref<FormInstance>()

interface FormModel {
  rowId: string
  title: string
  type: TaskType
  status: TaskStatus
  range: [string, string]
  remark: string
}

const form = reactive<FormModel>({
  rowId: '',
  title: '',
  type: 'flight',
  status: 'plan',
  range: ['', ''],
  remark: '',
})

const rules: FormRules<FormModel> = {
  rowId: [{ required: true, message: '请选择机位', trigger: 'change' }],
  title: [{ required: true, message: '请输入任务名称', trigger: 'blur' }],
  range: [
    {
      validator: (_rule, value: [string, string], callback) => {
        if (!value || !value[0] || !value[1]) {
          callback(new Error('请选择起止时间'))
          return
        }
        if (parseDateTime(value[1]) <= parseDateTime(value[0])) {
          callback(new Error('结束时间必须晚于开始时间'))
          return
        }
        callback()
      },
      trigger: 'change',
    },
  ],
}

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const title = computed(() => (props.mode === 'create' ? '新建排班任务' : '编辑排班任务'))

const rowOptions = computed(() =>
  state.rows.map((row) => ({
    value: row.id,
    label: `${row.aircraftType} · ${row.tailNumber}`,
    base: row.base,
  })),
)

function toRange(start: number, end: number): [string, string] {
  const fmt = (ts: number) => {
    const d = new Date(ts)
    const hh = `${d.getHours()}`.padStart(2, '0')
    const mm = `${d.getMinutes()}`.padStart(2, '0')
    return `${formatYMD(ts)} ${hh}:${mm}`
  }
  return [fmt(start), fmt(end)]
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    formRef.value?.clearValidate()
    if (props.mode === 'edit' && props.task) {
      form.rowId = props.task.rowId
      form.title = props.task.title
      form.type = props.task.type
      form.status = props.task.status
      form.range = toRange(props.task.start, props.task.end)
      form.remark = props.task.remark ?? ''
    } else {
      const start = props.defaultStart ?? state.now
      form.rowId = state.rows[0]?.id ?? ''
      form.title = '航班 '
      form.type = 'flight'
      form.status = 'plan'
      form.range = toRange(start, start + 2 * HOUR)
      form.remark = ''
    }
  },
)

async function submit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  const [startStr, endStr] = form.range
  emit('submit', {
    id: props.mode === 'edit' ? props.task?.id : undefined,
    data: {
      rowId: form.rowId,
      title: form.title.trim(),
      type: form.type,
      status: form.status,
      start: parseDateTime(startStr),
      end: parseDateTime(endStr),
      remark: form.remark.trim() || undefined,
    },
  })
  visible.value = false
}

function remove() {
  if (!props.task) return
  emit('remove', props.task.id)
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    width="540px"
    align-center
    append-to-body
    destroy-on-close
    class="task-dialog"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="82px" label-position="right">
      <el-form-item label="机位" prop="rowId">
        <el-select v-model="form.rowId" filterable placeholder="选择机型与尾号" style="width: 100%">
          <el-option v-for="item in rowOptions" :key="item.value" :label="item.label" :value="item.value">
            <span>{{ item.label }}</span>
            <span class="option-base">{{ item.base }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="任务名称" prop="title">
        <el-input v-model="form.title" maxlength="40" show-word-limit placeholder="如 航班 MU5101" />
      </el-form-item>

      <el-form-item label="类型">
        <el-radio-group v-model="form.type">
          <el-radio-button v-for="item in TASK_TYPE_LIST" :key="item.value" :value="item.value">
            {{ item.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="状态">
        <el-select v-model="form.status" style="width: 160px">
          <el-option
            v-for="(meta, key) in TASK_STATUS_META"
            :key="key"
            :label="meta.label"
            :value="key"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="起止时间" prop="range">
        <el-date-picker
          v-model="form.range"
          type="datetimerange"
          value-format="YYYY-MM-DD HH:mm"
          format="MM-DD HH:mm"
          range-separator="→"
          start-placeholder="开始"
          end-placeholder="结束"
          :time-picker-options="{ step: '00:15' }"
          style="width: 100%"
        />
      </el-form-item>

      <el-form-item label="备注">
        <el-input
          v-model="form.remark"
          type="textarea"
          :rows="2"
          maxlength="120"
          show-word-limit
          placeholder="可选"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button v-if="mode === 'edit'" type="danger" plain @click="remove">删除任务</el-button>
        <span class="footer-spacer" />
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="submit">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.option-base {
  float: right;
  color: var(--text-3);
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.footer-spacer {
  flex: 1;
}

:deep(.el-radio-button__inner) {
  padding: 8px 12px;
}
</style>
