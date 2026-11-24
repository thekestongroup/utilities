<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Thumbnails } from './thumbnails'

/** One page's preview: drawn when it scrolls into view, and turned with CSS. */
const props = defineProps<{ thumbs?: Thumbnails; index: number; blank?: boolean; turn: number }>()

const canvas = ref<HTMLCanvasElement>()
const host = ref<HTMLElement>()
const state = ref<'waiting' | 'drawn' | 'failed'>('waiting')
let observer: IntersectionObserver | undefined
let token = 0

async function draw() {
  const id = ++token
  if (props.blank || !props.thumbs) return
  const bitmap = await props.thumbs.render(props.index)
  if (id !== token || !canvas.value) return
  if (!bitmap) {
    state.value = 'failed'
    return
  }
  canvas.value.width = bitmap.width
  canvas.value.height = bitmap.height
  canvas.value.getContext('2d')?.drawImage(bitmap, 0, 0)
  state.value = 'drawn'
}

onMounted(() => {
  if (props.blank) {
    state.value = 'drawn'
    return
  }
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer?.disconnect()
        void draw()
      }
    },
    { rootMargin: '300px' }
  )
  if (host.value) observer.observe(host.value)
})
onBeforeUnmount(() => {
  token++
  observer?.disconnect()
})
watch(() => [props.thumbs, props.index], () => {
  state.value = 'waiting'
  void draw()
})
</script>

<template>
  <div ref="host" class="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded bg-surface">
    <canvas
      v-show="!blank && state === 'drawn'"
      ref="canvas"
      class="size-full bg-white object-contain shadow-sm transition-transform"
      :style="{ transform: `rotate(${turn}deg)` }"
    ></canvas>
    <div
      v-if="blank"
      class="flex aspect-[1/1.414] h-full items-center justify-center border border-black/20 bg-white text-xs text-black/60 transition-transform"
      :style="{ transform: `rotate(${turn}deg)` }"
    >
      Blank
    </div>
    <p v-else-if="state !== 'drawn'" class="absolute text-xs text-black/60">{{ state === 'failed' ? 'No preview' : '…' }}</p>
  </div>
</template>
