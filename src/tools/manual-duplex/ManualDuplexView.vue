<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Button, Card, CardSelect, Notification, PageHeader, Select, Spinner, Steps } from '@thekestongroup/ui'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Download, FileUp, Printer, RotateCcw } from '@lucide/vue'
import PrinterDiagram from './PrinterDiagram.vue'
import SheetDiagram from './SheetDiagram.vue'
import { duplexPlan, type ExitTop, type FlipEdge } from './lib/flip'
import { inspectPdf, PdfError, splitForDuplex, type PdfInfo, type SplitResult } from './lib/split'

const route = useRoute()
const router = useRouter()
const NUMBER = new Intl.NumberFormat('en-GB')

// ── Settings (kept in the address, like the other tools; the PDF never is) ──
type Override = 'auto' | 'on' | 'off'
const q = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const settings = reactive({
  edge: (q(route.query.edge) === 'short' ? 'short' : 'long') as FlipEdge,
  exit: (q(route.query.exit) === 'printer' ? 'printer' : 'you') as ExitTop,
  rotate: (['on', 'off'].includes(String(q(route.query.rotate))) ? q(route.query.rotate) : 'auto') as Override,
  reverse: q(route.query.reverse) === '1'
})
watch(settings, () => {
  const query: Record<string, string> = { edge: settings.edge }
  if (settings.exit !== 'you') query.exit = settings.exit
  if (settings.rotate !== 'auto') query.rotate = settings.rotate
  if (settings.reverse) query.reverse = '1'
  if (route.name === 'manual-duplex') router.replace({ query })
})
onMounted(() => router.replace({ query: { ...route.query, edge: settings.edge } }))

const edgeOptions = [
  { title: 'Long edge', value: 'long', icon: BookOpen, description: 'Like turning the page of a book. The usual choice for portrait documents.' },
  { title: 'Short edge', value: 'short', icon: CalendarDays, description: 'Like flipping a notepad or a wall calendar. For documents that open from the top.' }
]
const exitOptions = [
  { label: 'The top of the page faces me (most HP inkjets)', value: 'you' },
  { label: 'The top of the page faces the printer', value: 'printer' }
]
const rotateOptions = [
  { label: 'Automatic', value: 'auto' },
  { label: 'Always turn the back pages upside down', value: 'on' },
  { label: 'Never turn the back pages', value: 'off' }
]

// ── The PDF ─────────────────────────────────────────────────────────────────
const steps = ['Choose a PDF', 'Print the fronts', 'Reinsert the paper', 'Print the backs', 'Done']
const step = ref(0)
const source = shallowRef<Uint8Array | null>(null)
const fileName = ref('')
const info = ref<PdfInfo | null>(null)
const result = shallowRef<SplitResult | null>(null)
const busy = ref(false)
const error = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

const baseName = computed(() => fileName.value.replace(/\.pdf$/i, '') || 'document')
const plan = computed(() => duplexPlan({ edge: settings.edge, landscape: info.value?.landscape ?? false, exitTop: settings.exit }))
const rotateBacks = computed(() => (settings.rotate === 'auto' ? plan.value.rotateBacks : settings.rotate === 'on'))

async function loadFile(file: File | undefined) {
  if (!file) return
  error.value = ''
  result.value = null
  busy.value = true
  try {
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new PdfError('Choose a PDF file.')
    const bytes = new Uint8Array(await file.arrayBuffer())
    info.value = await inspectPdf(bytes)
    source.value = bytes
    fileName.value = file.name
  } catch (e) {
    source.value = null
    info.value = null
    error.value = e instanceof PdfError ? e.message : 'This file could not be read.'
  } finally {
    busy.value = false
  }
}
const onPick = (event: Event) => loadFile((event.target as HTMLInputElement).files?.[0])
function onDrop(event: DragEvent) {
  dragging.value = false
  loadFile(event.dataTransfer?.files[0])
}

async function build() {
  if (!source.value) return
  busy.value = true
  error.value = ''
  try {
    result.value = await splitForDuplex(source.value, { rotateBacks: rotateBacks.value, reverseBacks: settings.reverse })
  } catch (e) {
    error.value = e instanceof PdfError ? e.message : 'Could not split this file.'
    result.value = null
  } finally {
    busy.value = false
  }
}
async function start() {
  await build()
  if (result.value) step.value = 1
}

// Printing: the PDF is opened in a hidden frame and its print dialog is shown, so there's no need
// to open the file first. Download is the fallback for browsers that won't print from a frame.
const printing = ref<'fronts' | 'backs' | null>(null)
const printFailed = ref(false)
function printPdf(bytes: Uint8Array, which: 'fronts' | 'backs') {
  printFailed.value = false
  printing.value = which
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.title = 'PDF to print'
  for (const [key, value] of Object.entries({ position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', border: '0', opacity: '0', pointerEvents: 'none' })) {
    frame.style.setProperty(key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`), value)
  }
  const cleanup = () => {
    frame.remove()
    URL.revokeObjectURL(url)
    if (printing.value === which) printing.value = null
  }
  // Safety net if the browser never reports finishing.
  const timer = setTimeout(cleanup, 10 * 60 * 1000)
  frame.addEventListener('load', () => {
    try {
      const target = frame.contentWindow
      if (!target) throw new Error('no window')
      target.focus()
      target.addEventListener('afterprint', () => { clearTimeout(timer); cleanup() }, { once: true })
      target.print()
      // Browsers that print without telling us: let go of the button after a moment.
      setTimeout(() => { if (printing.value === which) printing.value = null }, 4000)
    } catch {
      printFailed.value = true
      clearTimeout(timer)
      cleanup()
    }
  }, { once: true })
  frame.addEventListener('error', () => { printFailed.value = true; cleanup() }, { once: true })
  frame.src = url
  document.body.append(frame)
}

function download(bytes: Uint8Array, name: string) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
const frontName = computed(() => `${baseName.value} - 1 of 2 (print first).pdf`)
const backName = computed(() => `${baseName.value} - 2 of 2 (print second).pdf`)

// Printing the backs went wrong: change the setting, rebuild, and start the print runs again on fresh paper.
async function fixBacks(change: 'rotate' | 'order') {
  if (change === 'rotate') settings.rotate = rotateBacks.value ? 'off' : 'on'
  else settings.reverse = !settings.reverse
  await build()
  step.value = 1
}

function startOver() {
  source.value = null
  info.value = null
  result.value = null
  fileName.value = ''
  error.value = ''
  step.value = 0
  if (fileInput.value) fileInput.value.value = ''
}
const clear = () => startOver()
onMounted(() => window.addEventListener('pagehide', clear))
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', clear)
  startOver()
})

const topFacing = computed(() => settings.exit)
const sheets = computed(() => result.value?.sheets ?? 0)
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Print on both sides by hand"
      description="For printers that can't print on both sides. Splits a PDF in two, then shows you how to turn the paper round between the two print runs."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'Manual duplex printing' }]"
      link-component="a"
    />

    <Steps :steps="steps" :step="step" label="Print on both sides" />

    <!-- 1. Choose a PDF -->
    <template v-if="step === 0">
      <Card title="Choose your PDF" description="It stays on this device. Nothing is uploaded.">
        <div class="flex flex-col gap-4">
          <div
            class="flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition"
            :class="dragging ? 'border-primary bg-primary/5' : 'border-black/25'"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <FileUp class="size-8 text-primary" aria-hidden="true" />
            <p v-if="info" class="font-bold" data-testid="file-info">
              {{ fileName }}
              <span class="font-normal text-black/70">
                · {{ NUMBER.format(info.pages) }} {{ info.pages === 1 ? 'page' : 'pages' }} · {{ info.landscape ? 'landscape' : 'portrait' }}
              </span>
            </p>
            <p v-else class="text-sm text-black/70">Drop a PDF here, or choose one.</p>
            <input ref="fileInput" type="file" accept="application/pdf,.pdf" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPick" />
            <Button :disabled="busy" @click="fileInput?.click()">
              <Spinner v-if="busy" size="sm" />
              {{ info ? 'Choose a different PDF' : 'Choose a PDF' }}
            </Button>
          </div>
          <Notification v-if="error" type="error" title="Can't use this file" :description="error" @dismiss="error = ''" />
          <Notification
            v-if="info && info.pages === 1"
            type="info"
            title="One page needs no flipping"
            description="Everything fits on a single side. You can still carry on: the second PDF will just be a blank page."
            :dismissible="false"
          />
        </div>
      </Card>

      <Card title="How will you flip the paper?">
        <div class="flex flex-col gap-4">
          <CardSelect v-model="settings.edge" label="Flip on" hide-label :options="edgeOptions" :columns="2" />
          <details class="rounded px-1">
            <summary class="cursor-pointer rounded px-1 py-1 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-focus">
              If your printer does things differently
            </summary>
            <div class="mt-4 grid gap-4 px-1 pb-1 sm:grid-cols-2">
              <Select
                v-model="settings.exit"
                label="Printed sheets land in the output tray with"
                helper="Print one page and look. Most HP inkjets push the top of the page out first, towards you."
                :options="exitOptions"
              />
              <Select v-model="settings.rotate" label="Back pages" :options="rotateOptions" />
            </div>
          </details>
        </div>
      </Card>

      <Card v-if="info" title="What will happen">
        <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
          <li>
            <strong>PDF 1</strong>: pages 1, 3, 5 and so on ({{ NUMBER.format(Math.ceil(info.pages / 2)) }} {{ Math.ceil(info.pages / 2) === 1 ? 'page' : 'pages' }}, one for each sheet).
          </li>
          <li>
            <strong>PDF 2</strong>: pages 2, 4, 6 and so on<template v-if="info.pages % 2 === 1">, plus a blank page at the end</template>.
            <template v-if="rotateBacks"> They're turned upside down so they read the right way up after you flip the sheets.</template>
          </li>
          <li>You'll need <strong>{{ NUMBER.format(Math.ceil(info.pages / 2)) }}</strong> sheets of paper.</li>
        </ul>
      </Card>

      <div class="flex justify-end">
        <Button variant="primary" :disabled="!info || busy" @click="start">
          Split the PDF
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </template>

    <!-- 2. Print the fronts -->
    <template v-else-if="step === 1 && result">
      <Card title="Print this one first" :description="`${NUMBER.format(sheets)} ${sheets === 1 ? 'sheet' : 'sheets'}: the odd pages (1, 3, 5 …), which go on the front of each sheet.`">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" data-testid="print-fronts" :disabled="printing !== null" @click="printPdf(result.fronts, 'fronts')">
                <Spinner v-if="printing === 'fronts'" size="sm" />
                <Printer v-else aria-hidden="true" />
                Print PDF 1 of 2
              </Button>
              <Button size="lg" data-testid="download-fronts" @click="download(result.fronts, frontName)">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </div>
            <p class="text-sm text-black/70">{{ frontName }}</p>
            <Notification
              v-if="printFailed"
              type="warning"
              title="Couldn't open the print dialog"
              description="This browser won't print from the page. Download the PDF and print it from your PDF viewer instead."
              @dismiss="printFailed = false"
            />
          </div>
          <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Put {{ NUMBER.format(sheets) }} {{ sheets === 1 ? 'sheet' : 'sheets' }} of blank A4 paper in the paper holder at the back, the way you normally do.</li>
            <li>Press <strong>Print</strong> and, in the print dialog, choose <strong>single-sided</strong> (not "print on both sides"), <strong>A4</strong>, and a scale of <strong>100%</strong> / actual size.</li>
            <li>Wait until every sheet has come out into the output tray at the front.</li>
          </ol>
        </div>
      </Card>
      <div class="flex justify-between gap-2">
        <Button @click="step = 0">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button variant="primary" @click="step = 2">
          I've printed it
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </template>

    <!-- 3. Reinsert -->
    <template v-else-if="step === 2 && result">
      <Card title="1. Take the stack out of the output tray" description="At the front, underneath.">
        <div class="flex flex-col items-center gap-3 sm:flex-row">
          <PrinterDiagram focus="output" class="shrink-0 sm:w-72" />
          <p class="text-sm">
            Lift out all {{ NUMBER.format(sheets) }} {{ sheets === 1 ? 'sheet' : 'sheets' }} together and keep them in the same order. Don't shuffle or fan them. The printed side is facing up, and the
            last page is on top.
          </p>
        </div>
      </Card>

      <Card title="2. Turn the whole stack over sideways">
        <div class="flex flex-col items-center gap-3 sm:flex-row">
          <SheetDiagram :top="topFacing" class="shrink-0 sm:w-80" data-testid="sheet-diagram" />
          <div class="flex flex-col gap-2 text-sm">
            <p>
              Standing in front of the printer, flip the stack over <strong>sideways</strong>, so the <strong>left side of the sheets ends up on your right</strong>. The edge nearest you stays
              nearest you.
            </p>
            <p>Now the <strong>blank side is facing up</strong> and the first sheet is on top. The thick bar marks the top of the page.</p>
          </div>
        </div>
      </Card>

      <Card title="3. Lift it into the paper holder at the back" description="Like blank paper.">
        <div class="flex flex-col items-center gap-3 sm:flex-row">
          <PrinterDiagram focus="rear" :far-edge="plan.farEdge" class="shrink-0 sm:w-72" data-testid="rear-diagram" />
          <div class="flex flex-col gap-2 text-sm">
            <p>
              Lift the stack up into the paper holder at the back <strong>exactly as you loaded the blank paper</strong>, but keep the <strong>edge furthest from you {{ plan.farEdge === 'up' ? 'up' : 'down' }}</strong>.
            </p>
            <p v-if="plan.feed === 'same-edge'">That puts the <strong>same edge in first</strong> as the first time.</p>
            <p v-else>That puts the <strong>opposite edge in first</strong> to the first time, so the stack goes in upside down compared with before.</p>
          </div>
        </div>
      </Card>

      <div class="flex justify-between gap-2">
        <Button @click="step = 1">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button variant="primary" @click="step = 3">
          It's in
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </template>

    <!-- 4. Print the backs -->
    <template v-else-if="step === 3 && result">
      <Card title="Now print this one" :description="`The even pages (2, 4, 6 …) for the back of each sheet${result.addedBlank ? ', with a blank page at the end because your PDF has an odd number of pages' : ''}.`">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <div class="flex flex-wrap gap-2">
              <Button variant="primary" size="lg" data-testid="print-backs" :disabled="printing !== null" @click="printPdf(result.backs, 'backs')">
                <Spinner v-if="printing === 'backs'" size="sm" />
                <Printer v-else aria-hidden="true" />
                Print PDF 2 of 2
              </Button>
              <Button size="lg" data-testid="download-backs" @click="download(result.backs, backName)">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </div>
            <p class="text-sm text-black/70">{{ backName }}</p>
            <Notification
              v-if="printFailed"
              type="warning"
              title="Couldn't open the print dialog"
              description="This browser won't print from the page. Download the PDF and print it from your PDF viewer instead."
              @dismiss="printFailed = false"
            />
          </div>
          <ol class="flex list-decimal flex-col gap-2 pl-5 text-sm">
            <li>Press <strong>Print</strong> and use the same settings: <strong>single-sided</strong>, <strong>A4</strong>, <strong>100%</strong>.</li>
            <li>
              Page 2 prints on the back of the first sheet, page 4 on the back of the second, and so on.
            </li>
          </ol>
        </div>
      </Card>
      <div class="flex justify-between gap-2">
        <Button @click="step = 2">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button variant="primary" @click="step = 4">
          I've printed it
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </template>

    <!-- 5. Done -->
    <template v-else-if="step === 4">
      <Card title="All done" description="Take the sheets out and check the first one: page 1 on the front, page 2 on the back.">
        <div class="flex flex-col gap-4">
          <p class="text-sm font-bold">Something not right?</p>
          <div class="flex flex-col gap-3 sm:flex-row">
            <Button @click="fixBacks('rotate')">
              <RotateCcw aria-hidden="true" />
              The backs are upside down
            </Button>
            <Button @click="fixBacks('order')">
              <RotateCcw aria-hidden="true" />
              The backs are in the wrong order
            </Button>
          </div>
          <p class="text-sm text-black/70">
            Either one remakes PDF 2 and takes you back to the first print run, to start again on fresh paper. Printers pick the stack up in different ways, so this only needs sorting
            out once: the fix is kept in the page's address, so bookmark it afterwards.
          </p>
        </div>
      </Card>
      <div class="flex justify-between gap-2">
        <Button @click="step = 3">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button variant="primary" @click="startOver">Print another PDF</Button>
      </div>
    </template>
  </div>
</template>
