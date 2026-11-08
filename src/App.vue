<script setup lang="ts">
import { useRoute } from 'vue-router'
import { Calendar, Document } from '@element-plus/icons-vue'

const route = useRoute()
</script>

<template>
  <div class="app-shell">
    <nav class="app-nav">
      <span class="app-brand">CrewOps Demo</span>
      <div class="nav-tabs">
        <RouterLink to="/" class="nav-tab" :class="{ active: route.name === 'gantt' }">
          <el-icon><Calendar /></el-icon>
          <span>排班甘特图</span>
        </RouterLink>
        <RouterLink to="/report" class="nav-tab" :class="{ active: route.name === 'report' }">
          <el-icon><Document /></el-icon>
          <span>报告生成</span>
        </RouterLink>
      </div>
    </nav>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.app-nav {
  flex: none;
  height: 44px;
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  background: #fff;
  border-bottom: 1px solid var(--line-strong);
}

.app-brand {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  letter-spacing: 0.3px;
}

.nav-tabs {
  display: flex;
  gap: 4px;
  height: 100%;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  font-size: 13px;
  color: var(--text-2);
  text-decoration: none;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.nav-tab:hover {
  color: var(--text-1);
  background: #f1f4f9;
}

.nav-tab.active {
  color: var(--brand);
  font-weight: 500;
  background: #eef3fe;
}

.app-main {
  flex: 1;
  min-height: 0;
}
</style>
