<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Card, PageHeader } from '@thekestongroup/ui'
import { ShieldCheck } from '@lucide/vue'
import { tools } from '../tools'
</script>

<template>
  <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Keston Utilities"
      description="Small tools that run entirely in your browser. Nothing is sent anywhere."
    />
    <div class="grid gap-4 sm:grid-cols-2">
      <template v-for="tool in tools" :key="tool.id">
        <RouterLink
          v-if="tool.path"
          :to="tool.path"
          class="rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Card :title="tool.title" :description="tool.description" class="h-full transition hover:brightness-95">
            <component :is="tool.icon" class="size-6 text-primary-fg" aria-hidden="true" />
          </Card>
        </RouterLink>
        <Card v-else :title="tool.title" :description="tool.description" class="h-full">
          <div class="flex flex-col gap-2">
            <component :is="tool.icon" class="size-6 text-primary-fg" aria-hidden="true" />
            <ul class="flex flex-col gap-1">
              <li v-for="page in tool.pages" :key="page.path">
                <RouterLink :to="page.path" class="inline-flex items-center gap-2 rounded text-sm font-bold text-primary-fg underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus">
                  <component :is="page.icon" class="size-4" aria-hidden="true" />
                  {{ page.title }}
                </RouterLink>
              </li>
            </ul>
          </div>
        </Card>
      </template>
    </div>
    <p class="flex items-start gap-2 text-sm text-ink/70">
      <ShieldCheck class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      Every tool here is fully client-side: no server, no API, no analytics, and no network requests after the page loads.
    </p>
  </div>
</template>
