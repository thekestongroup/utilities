<script setup lang="ts">
import { computed } from 'vue'

/**
 * Looking down on one sheet before and after turning the stack over. `you` are
 * at the bottom. The thick bar is the edge that goes into the printer first
 * (the top of the page); the dashed line is what you turn the stack over around.
 */
const props = defineProps<{
  /** Which way the top edge points now: towards you, or towards the printer. */
  top: 'you' | 'printer'
}>()

const W = 64
const H = 90
const cy = 74

function sheet(cx: number, top: 'you' | 'printer') {
  const x = cx - W / 2
  const y = cy - H / 2
  const barY = top === 'printer' ? y : y + H
  const lineYs = top === 'printer' ? [y + 16, y + 26, y + 36] : [y + H - 16, y + H - 26, y + H - 36]
  return { x, y, barY, lineYs, mark: top === 'printer' ? y + 54 : y + H - 54 }
}
// Turning sideways swaps left and right but not near and far, so the top edge stays where it is.
const left = computed(() => sheet(80, props.top))
const right = computed(() => sheet(280, props.top))
</script>

<template>
  <svg viewBox="0 0 360 160" role="img" class="h-auto w-full max-w-md text-black" aria-label="The stack before and after turning it over sideways, left to right">
    <defs>
      <marker id="sd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" class="fill-primary" />
      </marker>
    </defs>

    <!-- before: printed side up -->
    <rect :x="left.x" :y="left.y" :width="W" :height="H" class="fill-white stroke-current" stroke-width="1.5" />
    <line v-for="y in left.lineYs" :key="y" :x1="left.x + 9" :x2="left.x + W - 9" :y1="y" :y2="y" class="stroke-current" stroke-width="2" opacity="0.5" />
    <text :x="80" :y="left.mark + 6" text-anchor="middle" class="fill-current" font-size="22" font-weight="700">1</text>
    <line :x1="left.x" :x2="left.x + W" :y1="left.barY" :y2="left.barY" class="stroke-primary" stroke-width="5" />
    <line x1="80" y1="18" x2="80" y2="130" class="stroke-primary" stroke-width="1.5" stroke-dasharray="4 3" />
    <text x="80" y="12" text-anchor="middle" class="fill-current" font-size="10">printed side up</text>

    <!-- the move -->
    <path d="M150 70 L 210 70" fill="none" class="stroke-primary" stroke-width="2.5" marker-end="url(#sd-arrow)" />
    <text x="180" y="58" text-anchor="middle" class="fill-primary" font-size="10" font-weight="700">turn over</text>

    <!-- after: blank side up -->
    <rect :x="right.x" :y="right.y" :width="W" :height="H" class="fill-white stroke-current" stroke-width="1.5" stroke-dasharray="3 3" />
    <text x="280" y="78" text-anchor="middle" class="fill-current" font-size="11" opacity="0.7">blank</text>
    <line :x1="right.x" :x2="right.x + W" :y1="right.barY" :y2="right.barY" class="stroke-primary" stroke-width="5" />
    <text x="280" y="12" text-anchor="middle" class="fill-current" font-size="10">blank side up</text>

    <!-- you -->
    <text x="80" y="156" text-anchor="middle" class="fill-current" font-size="10" opacity="0.7">▼ you</text>
    <text x="280" y="156" text-anchor="middle" class="fill-current" font-size="10" opacity="0.7">▼ you</text>
  </svg>
</template>
