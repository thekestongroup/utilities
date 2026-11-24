<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { AppShell, type SidebarItem } from '@thekestongroup/ui'
import { House } from '@lucide/vue'
import { tools } from './tools'

const route = useRoute()

// The footer's name, version and build; the last two are put in at build time (see vite.config.ts).
const footer = { appName: 'Keston Utilities', version: __APP_VERSION__, build: __APP_BUILD__ || undefined }

const sections = computed(() => [
  {
    items: [{ label: 'All utilities', icon: House, to: '/', active: route.path === '/' }] satisfies SidebarItem[]
  },
  {
    label: 'Tools',
    items: tools.map((tool): SidebarItem => {
      if (tool.pages) {
        return {
          label: tool.title,
          icon: tool.icon,
          children: tool.pages.map((page) => ({ label: page.title, icon: page.icon, to: page.path, active: route.path === page.path }))
        }
      }
      return { label: tool.title, icon: tool.icon, to: tool.path, active: route.path === tool.path }
    })
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
    :footer="footer"
  >
    <RouterView />
  </AppShell>
</template>
