<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { Button, Card, CardSelect, Notification, Select, Spinner, Steps } from '@thekestongroup/ui'
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Download, Printer, RotateCcw } from '@lucide/vue'
import PrinterDiagram from './PrinterDiagram.vue'
import SheetDiagram from './SheetDiagram.vue'
import { downloadBytes, printPdf } from '../../lib/files'
import { duplexPlan, type ExitTop, type FlipEdge } from './lib/flip'
import { inspectPdf, PdfError, splitForDuplex, type PdfInfo, type SplitResult } from './lib/split'

/**
 * Print a PDF on both sides with a printer that can't: split it into fronts and backs, print each,
 * and turn the paper round in between. The PDF comes from the editor (the edited document, or a
 * booklet); the settings are the editor's, so they are kept in its address.
 */
export interface DuplexSettings {
  edge: FlipEdge
  exit: ExitTop
  rotate: 'auto' | 'on' | 'off'
  reverse: boolean
}
const props = defineProps<{
  bytes: Uint8Array
  /** Used to name the two PDFs. */
  name: string
  settings: DuplexSettings
  /** A booklet always flips on the short edge, so there is nothing to choose. */
  fixedEdge?: FlipEdge
}>()
const emit = defineEmits<{ close: [] }>()

const NUMBER = new Intl.NumberFormat('en-GB')
const s = props.settings

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

const steps = ['Check the settings', 'Print the fronts', 'Reinsert the paper', 'Print the backs', 'Done']
const step = ref(0)
const info = ref<PdfInfo | null>(null)
const result = shallowRef<SplitResult | null>(null)
const busy = ref(false)
const error = ref('')

const edge = computed<FlipEdge>(() => props.fixedEdge ?? s.edge)
const baseName = computed(() => props.name.replace(/\.pdf$/i, '') || 'document')
const plan = computed(() => duplexPlan({ edge: edge.value, landscape: info.value?.landscape ?? false, exitTop: s.exit }))
const rotateBacks = computed(() => (s.rotate === 'auto' ? plan.value.rotateBacks : s.rotate === 'on'))

async function inspect() {
  result.value = null
  step.value = 0
  try {
    info.value = await inspectPdf(props.bytes)
  } catch (e) {
    info.value = null
    error.value = e instanceof PdfError ? e.message : 'This file could not be read.'
  }
}
onMounted(inspect)
watch(() => props.bytes, inspect)

async function build() {
  busy.value = true
  error.value = ''
  try {
    result.value = await splitForDuplex(props.bytes, { rotateBacks: rotateBacks.value, reverseBacks: s.reverse })
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

const printing = ref<'fronts' | 'backs' | null>(null)
const printFailed = ref(false)
function print(bytes: Uint8Array, which: 'fronts' | 'backs') {
  printFailed.value = false
  printing.value = which
  printPdf(bytes, {
    done: () => (printing.value = null),
    failed: () => {
      printing.value = null
      printFailed.value = true
    }
  })
}
const download = (bytes: Uint8Array, name: string) => downloadBytes(bytes, name, 'application/pdf')
const frontName = computed(() => `${baseName.value} - 1 of 2 (print first).pdf`)
const backName = computed(() => `${baseName.value} - 2 of 2 (print second).pdf`)

// Printing the backs went wrong: change the setting, rebuild, and start the print runs again on fresh paper.
async function fixBacks(change: 'rotate' | 'order') {
  if (change === 'rotate') s.rotate = rotateBacks.value ? 'off' : 'on'
  else s.reverse = !s.reverse
  await build()
  step.value = 1
}

const topFacing = computed(() => s.exit)
const sheets = computed(() => result.value?.sheets ?? 0)
</script>

<template>
  <div class="flex flex-col gap-6">
    <Steps :steps="steps" :step="step" label="Print on both sides by hand" />

    <!-- 1. Check the settings -->
    <template v-if="step === 0">
      <Card title="How will you flip the paper?" :description="fixedEdge ? 'A booklet is always flipped on the short edge of the landscape sheet, like turning the page of a book.' : undefined">
        <div class="flex flex-col gap-4">
          <p v-if="info" class="text-sm" data-testid="file-info">
            <strong>{{ name }}</strong>
            <span class="text-ink/70"> · {{ NUMBER.format(info.pages) }} {{ info.pages === 1 ? 'page' : 'pages' }} · {{ info.landscape ? 'landscape' : 'portrait' }}</span>
          </p>
          <CardSelect v-if="!fixedEdge" v-model="s.edge" label="Flip on" hide-label :options="edgeOptions" :columns="2" />
          <details class="rounded px-1">
            <summary class="cursor-pointer rounded px-1 py-1 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-focus">
              If your printer does things differently
            </summary>
            <div class="mt-4 grid gap-4 px-1 pb-1 sm:grid-cols-2">
              <Select
                v-model="s.exit"
                label="Printed sheets land in the output tray with"
                helper="Print one page and look. Most HP inkjets push the top of the page out first, towards you."
                :options="exitOptions"
              />
              <Select v-model="s.rotate" label="Back pages" :options="rotateOptions" />
            </div>
          </details>
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

      <div class="flex justify-between gap-2">
        <Button @click="emit('close')">
          <ArrowLeft aria-hidden="true" />
          Back to the editor
        </Button>
        <Button variant="primary" :disabled="!info || busy" data-testid="split" @click="start">
          <Spinner v-if="busy" size="sm" />
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
              <Button variant="primary" size="lg" data-testid="print-fronts" :disabled="printing !== null" @click="print(result.fronts, 'fronts')">
                <Spinner v-if="printing === 'fronts'" size="sm" />
                <Printer v-else aria-hidden="true" />
                Print PDF 1 of 2
              </Button>
              <Button size="lg" data-testid="download-fronts" @click="download(result.fronts, frontName)">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </div>
            <p class="text-sm text-ink/70">{{ frontName }}</p>
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
              <Button variant="primary" size="lg" data-testid="print-backs" :disabled="printing !== null" @click="print(result.backs, 'backs')">
                <Spinner v-if="printing === 'backs'" size="sm" />
                <Printer v-else aria-hidden="true" />
                Print PDF 2 of 2
              </Button>
              <Button size="lg" data-testid="download-backs" @click="download(result.backs, backName)">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </div>
            <p class="text-sm text-ink/70">{{ backName }}</p>
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
            <li>Page 2 prints on the back of the first sheet, page 4 on the back of the second, and so on.</li>
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
          <p class="text-sm text-ink/70">
            Either one remakes PDF 2 and takes you back to the first print run, to start again on fresh paper. Printers pick the stack up in different ways, so this only needs sorting
            out once: you can save the fix with "Save these options as my defaults" in the editor.
          </p>
        </div>
      </Card>
      <div class="flex justify-between gap-2">
        <Button @click="step = 3">
          <ArrowLeft aria-hidden="true" />
          Back
        </Button>
        <Button variant="primary" @click="emit('close')">Back to the editor</Button>
      </div>
    </template>
  </div>
</template>
