import { createRouter, createWebHashHistory } from 'vue-router'
import GanttChart from '@/components/GanttChart.vue'
import ReportView from '@/views/ReportView.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'gantt', component: GanttChart, meta: { title: '机队排班甘特图' } },
    { path: '/report', name: 'report', component: ReportView, meta: { title: '报告生成工作台' } },
  ],
})
