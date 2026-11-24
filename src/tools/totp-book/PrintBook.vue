<script setup lang="ts">
import { computed } from 'vue'
import { layoutVolume, punchSide, type BookSettings, type PageFit, type VolumePlan } from './lib/book'
import { formatDate } from './lib/tz'
import './print.css'

/**
 * One volume of the book as pages, for printing. Only the volume being
 * printed is ever in the DOM. Each page is a single block of text (one line
 * per code, split into columns by CSS), so even a month is only a few
 * thousand elements.
 */
const props = defineProps<{
  settings: BookSettings
  volume: VolumePlan
  codes: Uint32Array
  /** Show the sheets on screen (a preview) instead of only when printing. */
  preview?: boolean
  /** With `preview`: how many body pages to show. */
  previewPages?: number
  generated: string
}>()

const layout = computed(() => layoutVolume(props.settings, props.volume, props.codes))
const pages = computed(() => (props.previewPages ? layout.value.pages.slice(0, props.previewPages) : layout.value.pages))
const sheets = computed(() => layout.value.pages.length + 2)
const wholeDay = computed(() => props.settings.edition === 'day')
const heading = computed(() => props.settings.label || 'Untitled code book')

function style(page: { fit: PageFit }) {
  const { fit } = page
  return {
    '--fs': `${fit.fontPt}pt`,
    '--lh': `${fit.lineHeightPx}px`,
    '--cols': fit.cols,
    '--rows': fit.rows,
    '--gap': `${fit.gapPx}px`,
    '--w': `${fit.widthPx}px`
  }
}

/** Class for a sheet's wider binding margin, when leaving room for a hole punch. */
const punchClass = (sheet: number) => (props.settings.punch ? `sheet--punch-${punchSide(sheet)}` : undefined)
const NUMBER = new Intl.NumberFormat('en-GB')
const firstDay = computed(() => formatDate(props.volume.startDate))
const lastDay = computed(() => formatDate(props.volume.endDate))
</script>

<template>
  <div class="book" :class="{ 'book--preview': preview }" :data-edition="settings.edition">
    <!-- Title page -->
    <section class="sheet sheet--title" :class="punchClass(1)" :aria-label="`${heading}: title page`">
      <p class="eyebrow">TOTP Code Book</p>
      <h1>{{ heading }}</h1>
      <p class="range">{{ firstDay }} <span aria-hidden="true">→</span><span class="sr-only">to</span> {{ lastDay }}</p>
      <p class="zone">Times in {{ settings.zone }}</p>
      <dl class="facts">
        <div><dt>Edition</dt><dd>{{ wholeDay ? 'Whole day per page (very small type)' : 'Half day per page (AM and PM)' }}</dd></div>
        <div><dt>Algorithm</dt><dd>{{ settings.algorithm }}</dd></div>
        <div><dt>Digits</dt><dd>{{ settings.digits }}</dd></div>
        <div><dt>Period</dt><dd>{{ settings.period }} seconds</dd></div>
        <div><dt>Codes</dt><dd>{{ NUMBER.format(volume.count) }}</dd></div>
        <div><dt>Pages</dt><dd>{{ NUMBER.format(sheets) }}</dd></div>
        <div><dt>Generated</dt><dd>{{ generated }}</dd></div>
      </dl>
      <div class="note">
        <p>
          This book contains every one-time code your authenticator app would show between the dates above. To sign in,
          find the current time, then read off the code beside it. Yes, really.
        </p>
        <p>
          It is deliberately the least practical way to back up two-factor authentication, and it is also a perfectly
          real one. It works as your 2FA for this whole period, so store it like a passport. Anyone who knows your
          password and has this book can sign in as you.
        </p>
        <p>The setup key is not printed anywhere in this book.</p>
      </div>
      <p class="foot">Page 1 of {{ sheets }}</p>
    </section>

    <!-- Code pages -->
    <section
      v-for="page in pages"
      :key="page.sheet"
      class="sheet"
      :class="punchClass(page.sheet)"
      :aria-label="`${page.day} ${page.part}`"
    >
      <header class="head">
        <p class="meta">
          <span>{{ heading }}</span>
          <span>Times in {{ settings.zone }}</span>
        </p>
        <h2>{{ page.part ? `${page.day} ${page.part}` : page.day }}</h2>
      </header>
      <p v-for="note in page.notes" :key="note" class="dst">{{ note }}</p>
      <div class="codes-wrap" :style="style(page)">
        <i v-for="k in page.fit.cols - 1" :key="k" class="vr" :style="{ '--k': k }" aria-hidden="true"></i>
        <pre class="codes"><template v-for="(part, i) in page.segments" :key="i"><b v-if="part.bold">{{ part.text }}</b><span v-else>{{ part.text }}</span></template></pre>
      </div>
      <p class="foot">Page {{ page.sheet }} of {{ sheets }}</p>
    </section>

    <!-- Index -->
    <section v-if="!previewPages" class="sheet sheet--index" :class="punchClass(sheets)" :aria-label="`${heading}: index`">
      <header class="head">
        <p class="meta">
          <span>{{ heading }}</span>
          <span>Times in {{ settings.zone }}</span>
        </p>
        <h2>Index</h2>
      </header>
      <ol class="index">
        <li v-for="entry in layout.index" :key="entry.dateKey">
          <span>{{ entry.label }}</span>
          <span class="dots" aria-hidden="true"></span>
          <span>{{ entry.first === entry.last ? `page ${entry.first}` : `pages ${entry.first}–${entry.last}` }}</span>
        </li>
      </ol>
      <p class="foot">Page {{ sheets }} of {{ sheets }}</p>
    </section>
  </div>
</template>
