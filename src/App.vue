<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { AppShell, type SidebarItem } from '@thekestongroup/ui'
import { House } from '@lucide/vue'
import { tools } from './tools'

const route = useRoute()

const sections = computed(() => [
  {
    items: [{ label: 'All utilities', icon: House, to: '/', active: route.path === '/' }] satisfies SidebarItem[]
  },
  {
    label: 'Tools',
    items: tools.map(
      (tool): SidebarItem => ({ label: tool.title, icon: tool.icon, to: tool.path, active: route.path.startsWith(tool.path) })
    )
  }
])
</script>

<template>
  <AppShell
    title="Keston Utilities"
    title-to="/"
    :link-component="RouterLink"
    :sections="sections"
    :sign-in="false"
    :sidebar="{ label: 'Keston Utilities' }"
  >
    <RouterView />
  </AppShell>
</template>
