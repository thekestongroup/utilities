<script setup lang="ts">
/**
 * Side view of a printer with a paper holder at the back and an output tray at
 * the front (left is the back, right is the front, where you stand). `focus`
 * says which part this step is about.
 */
defineProps<{ focus: 'output' | 'rear' | 'both'; farEdge?: 'up' | 'down' }>()
</script>

<template>
  <svg viewBox="0 0 360 180" role="img" class="h-auto w-full max-w-md text-ink" aria-label="Side view of the printer: paper holder at the back, output tray at the front">
    <defs>
      <marker id="pd-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" class="fill-primary" />
      </marker>
    </defs>

    <!-- body -->
    <rect x="70" y="84" width="220" height="62" rx="8" class="fill-surface stroke-current" stroke-width="2" />
    <rect x="96" y="100" width="70" height="8" rx="2" class="fill-ink/15" />

    <!-- rear paper holder: a slanted tray at the back -->
    <g transform="rotate(-18 92 84)">
      <rect x="82" y="24" width="14" height="62" rx="2" :class="['fill-white', focus !== 'output' ? 'stroke-primary' : 'stroke-current']" :stroke-width="focus !== 'output' ? 3 : 2" />
      <line x1="86" y1="30" x2="86" y2="80" class="stroke-current" stroke-width="1" opacity="0.4" />
      <line x1="90" y1="30" x2="90" y2="80" class="stroke-current" stroke-width="1" opacity="0.4" />
    </g>

    <!-- which end of the stack is the edge that was furthest from you -->
    <g v-if="farEdge" transform="rotate(-18 92 84)">
      <rect x="80" :y="farEdge === 'up' ? 18 : 74" width="18" height="6" rx="1" class="fill-primary" />
    </g>
    <text v-if="farEdge" x="118" :y="farEdge === 'up' ? 26 : 70" class="fill-primary" font-size="11" font-weight="700">far edge</text>

    <!-- output tray at the front -->
    <rect x="200" y="146" width="140" height="8" rx="2" :class="['fill-white', focus !== 'rear' ? 'stroke-primary' : 'stroke-current']" :stroke-width="focus !== 'rear' ? 3 : 2" />
    <rect x="228" y="136" width="84" height="10" rx="1.5" class="fill-white stroke-current" stroke-width="1.5" />
    <line x1="232" y1="141" x2="308" y2="141" class="stroke-current" stroke-width="1" opacity="0.5" />

    <!-- the way the stack travels -->
    <path d="M300 126 C 318 30, 150 4, 112 38" fill="none" class="stroke-primary" stroke-width="2.5" stroke-dasharray="6 5" marker-end="url(#pd-arrow)" />

    <!-- labels -->
    <text x="270" y="172" text-anchor="middle" class="fill-current" font-size="11">Output tray (front)</text>
    <text x="68" y="22" text-anchor="middle" class="fill-current" font-size="11">Paper holder (back)</text>
    <text x="330" y="106" text-anchor="middle" class="fill-current" font-size="11" opacity="0.7">you</text>
  </svg>
</template>
