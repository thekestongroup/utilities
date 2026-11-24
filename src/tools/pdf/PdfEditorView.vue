<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Badge, Button, Card, CardSelect, Notification, PageHeader, Select, Spinner, Switch } from '@thekestongroup/ui'
import { ArrowLeft, ArrowRight, BookCopy, Download, FileUp, Files, Plus, Printer, RotateCw, Trash2 } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { downloadBytes, printPdf, readFile } from '../../lib/files'
import { serializeOptions } from '../../lib/options'
import { useUrlOptions } from '../../lib/useUrlOptions'
import DuplexWizard, { type DuplexSettings } from './DuplexWizard.vue'
import PageThumb from './PageThumb.vue'
import { Thumbnails } from './thumbnails'
import { deleteProject, loadProject, saveProject, type SavedProject } from './store'
import { assemble, blankItem, bookletPlan, itemsFor, makeBooklet, move, openSource, turnBy, type PageItem, type SourceFile } from './lib/pages'
import { PdfError } from './lib/split'

const route = useRoute()
const NUMBER = new Intl.NumberFormat('en-GB')

// Everything except the PDFs themselves is kept in the address and can be saved as defaults.
const builtIn = { layout: 'normal', print: 'auto', bind: 'left', sheet: 'a4', edge: 'long', exit: 'you', rotate: 'auto', reverse: false, keep: false }
const { state, apply } = useUrlOptions({ routeName: 'pdf', tool: 'pdf', builtIn, saveable: Object.keys(builtIn) })
// Links from the old "manual duplex printing" page.
if (route.query.mode === 'duplex') state.print = 'manual'

const layoutOptions = [
  { title: 'Pages as they are', value: 'normal', description: 'One page per sheet side, in the order shown above.' },
  { title: 'Booklet', value: 'booklet', description: 'Two pages to a landscape sheet, in the right order to fold and staple.' }
]
const printOptions = [
  { title: 'My printer prints both sides', value: 'auto', description: 'Print or save it, and choose double-sided in the print dialog.' },
  { title: 'I print both sides by hand', value: 'manual', description: 'Print the fronts, turn the paper round, print the backs. A step-by-step guide.' }
]
const bindOptions = [
  { label: 'On the left (most languages)', value: 'left' },
  { label: 'On the right (right-to-left languages)', value: 'right' }
]
const sheetOptions = [
  { label: 'A4', value: 'a4' },
  { label: 'US Letter', value: 'letter' }
]

// ── The document ────────────────────────────────────────────────────────────
const sources = shallowRef(new Map<string, SourceFile>())
const items = ref<PageItem[]>([])
const thumbs = new Map<string, Thumbnails>()
const busy = ref(false)
const error = ref('')
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()

function addSource(source: SourceFile, list: PageItem[]) {
  sources.value = new Map(sources.value).set(source.id, source)
  thumbs.set(source.id, new Thumbnails(source.bytes))
  items.value = [...items.value, ...list]
}

async function addFiles(list: FileList | File[] | null | undefined) {
  if (!list) return
  busy.value = true
  error.value = ''
  for (const file of Array.from(list)) {
    try {
      if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') throw new PdfError(`${file.name} isn't a PDF.`)
      const source = await openSource(file.name, await readFile(file))
      addSource(source, itemsFor(source))
    } catch (e) {
      error.value = e instanceof PdfError ? e.message : `${file.name} could not be read.`
    }
  }
  busy.value = false
}
const onPick = async (event: Event) => {
  const input = event.target as HTMLInputElement
  await addFiles(input.files)
  input.value = ''
}
function onDrop(event: DragEvent) {
  dragging.value = false
  void addFiles(event.dataTransfer?.files)
}

const addBlank = () => (items.value = [...items.value, blankItem()])
const turnPage = (i: number, by: 90 | -90) => (items.value = items.value.map((item, j) => (j === i ? { ...item, turn: turnBy(item.turn, by) } : item)))
const turnAll = () => (items.value = items.value.map((item) => ({ ...item, turn: turnBy(item.turn, 90) })))
const removePage = (i: number) => (items.value = items.value.filter((_, j) => j !== i))
const reverse = () => (items.value = [...items.value].reverse())
const shift = (i: number, by: -1 | 1) => (items.value = move(items.value, i, i + by))

function reset() {
  for (const t of thumbs.values()) void t.destroy()
  thumbs.clear()
  sources.value = new Map()
  items.value = []
  wizard.value = null
  error.value = ''
}

// Drag and drop to reorder.
const dragFrom = ref<number | null>(null)
const dragOver = ref<number | null>(null)
function onDragStart(i: number, event: DragEvent) {
  dragFrom.value = i
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(i))
  }
}
function onDropOn(i: number) {
  if (dragFrom.value !== null) items.value = move(items.value, dragFrom.value, i)
  dragFrom.value = dragOver.value = null
}

const label = (item: PageItem, i: number) => {
  if (item.source === 'blank') return `Page ${i + 1}, blank`
  return `Page ${i + 1}: ${sources.value.get(item.source)?.name ?? ''}, page ${item.index + 1}`
}

// ── Finishing ───────────────────────────────────────────────────────────────
const baseName = computed(() => {
  const first = [...sources.value.values()][0]
  return (first?.name.replace(/\.pdf$/i, '') ?? 'document') + (sources.value.size > 1 ? '-merged' : '')
})
const pageCount = computed(() => items.value.length)
const sheetsNeeded = computed(() => (state.layout === 'booklet' ? bookletPlan(pageCount.value).sheets : Math.ceil(pageCount.value / 2)))
const outputName = computed(() => `${baseName.value}${state.layout === 'booklet' ? '-booklet' : '-edited'}.pdf`)

const working = ref(false)
async function finalBytes(): Promise<Uint8Array> {
  const edited = await assemble(sources.value, items.value)
  return state.layout === 'booklet' ? makeBooklet(edited, { binding: state.bind as 'left' | 'right', sheet: state.sheet as 'a4' | 'letter' }) : edited
}

const printFailed = ref(false)
async function doPrint() {
  working.value = true
  printFailed.value = false
  try {
    printPdf(await finalBytes(), { done: () => (working.value = false), failed: () => ((printFailed.value = true), (working.value = false)) })
  } catch {
    error.value = 'Could not make the PDF.'
    working.value = false
  }
}
async function doDownload() {
  working.value = true
  try {
    downloadBytes(await finalBytes(), outputName.value, 'application/pdf')
  } catch {
    error.value = 'Could not make the PDF.'
  } finally {
    working.value = false
  }
}

const wizard = ref<{ bytes: Uint8Array; name: string } | null>(null)
async function startByHand() {
  working.value = true
  try {
    wizard.value = { bytes: await finalBytes(), name: outputName.value }
  } catch {
    error.value = 'Could not make the PDF.'
  } finally {
    working.value = false
  }
}
const duplexSettings = state as unknown as DuplexSettings

// ── Keeping the PDFs on this device (optional) ──────────────────────────────
const saved = ref<SavedProject | null>(null)
const storeFailed = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  clearTimeout(saveTimer)
  if (!state.keep) return
  saveTimer = setTimeout(async () => {
    if (!items.value.length) {
      await deleteProject()
      return
    }
    const ok = await saveProject({ sources: [...sources.value.values()], items: items.value.map((i) => ({ ...i })), savedAt: Date.now() })
    storeFailed.value = !ok
  }, 600)
}
watch([items, sources, () => state.keep], scheduleSave, { deep: true })
watch(
  () => state.keep,
  async (keep) => {
    if (!keep) {
      await deleteProject()
      saved.value = null
      storeFailed.value = false
    } else scheduleSave()
  }
)

onMounted(async () => {
  if (state.keep) saved.value = (await loadProject()) ?? null
})
function restore() {
  const project = saved.value
  if (!project) return
  reset()
  for (const source of project.sources) {
    sources.value = new Map(sources.value).set(source.id, source)
    thumbs.set(source.id, new Thumbnails(source.bytes))
  }
  items.value = project.items
  saved.value = null
}
async function discard() {
  await deleteProject()
  saved.value = null
}
onBeforeUnmount(() => {
  clearTimeout(saveTimer)
  for (const t of thumbs.values()) void t.destroy()
})

const savedWhen = computed(() => (saved.value ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(saved.value.savedAt) : ''))
const current = computed(() => serializeOptions(state))
const savedKeys = Object.keys(builtIn)
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="PDF editor"
      description="Merge PDFs, reorder, rotate and delete pages, make a booklet, then print or save. Everything happens in your browser: your files are never uploaded."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'PDF editor' }]"
      link-component="a"
    />

    <!-- Printing both sides by hand -->
    <DuplexWizard v-if="wizard" :bytes="wizard.bytes" :name="wizard.name" :settings="duplexSettings" :fixed-edge="state.layout === 'booklet' ? 'short' : undefined" @close="wizard = null" />

    <template v-else>
      <Notification
        v-if="saved && !items.length"
        type="info"
        title="You have PDFs saved on this device"
        :description="`${saved.sources.length} ${saved.sources.length === 1 ? 'file' : 'files'}, ${saved.items.length} pages, saved ${savedWhen}.`"
        :dismissible="false"
      >
        <div class="mt-2 flex gap-2">
          <Button size="sm" variant="primary" data-testid="restore" @click="restore">Continue editing them</Button>
          <Button size="sm" @click="discard">Delete them</Button>
        </div>
      </Notification>

      <!-- Add files -->
      <Card :title="items.length ? 'Pages' : 'Choose your PDFs'" :description="items.length ? `${NUMBER.format(pageCount)} ${pageCount === 1 ? 'page' : 'pages'} from ${sources.size} ${sources.size === 1 ? 'file' : 'files'}. Drag pages to reorder them.` : undefined">
        <div class="flex flex-col gap-4">
          <input ref="fileInput" type="file" multiple accept="application/pdf,.pdf" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPick" />
          <div
            v-if="!items.length"
            class="flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-10 text-center transition"
            :class="dragging ? 'border-primary bg-primary/5' : 'border-black/25'"
            @dragover.prevent="dragging = true"
            @dragleave="dragging = false"
            @drop.prevent="onDrop"
          >
            <FileUp class="size-8 text-primary" aria-hidden="true" />
            <p class="text-sm text-black/70">Drop one or more PDFs here, or choose them. Add more later to merge.</p>
            <Button variant="primary" :disabled="busy" @click="fileInput?.click()">
              <Spinner v-if="busy" size="sm" />
              Choose PDFs
            </Button>
          </div>

          <template v-else>
            <div class="flex flex-wrap gap-2" role="toolbar" aria-label="Edit the whole document">
              <Button size="sm" :disabled="busy" @click="fileInput?.click()"><Plus aria-hidden="true" /> Add PDFs</Button>
              <Button size="sm" @click="addBlank"><Plus aria-hidden="true" /> Blank page</Button>
              <Button size="sm" @click="turnAll"><RotateCw aria-hidden="true" /> Turn all</Button>
              <Button size="sm" @click="reverse">Reverse order</Button>
              <Button size="sm" variant="ghost" data-testid="reset" @click="reset"><Trash2 aria-hidden="true" /> Start again</Button>
            </div>
            <ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" data-testid="pages">
              <li
                v-for="(item, i) in items"
                :key="item.id"
                draggable="true"
                class="flex flex-col gap-1 rounded-md border bg-white p-2 transition"
                :class="dragOver === i && dragFrom !== i ? 'border-primary' : 'border-black/15'"
                :aria-label="label(item, i)"
                @dragstart="onDragStart(i, $event)"
                @dragover.prevent="dragOver = i"
                @dragleave="dragOver = null"
                @drop.prevent="onDropOn(i)"
                @dragend="dragFrom = dragOver = null"
              >
                <PageThumb :thumbs="thumbs.get(item.source)" :index="item.index" :blank="item.source === 'blank'" :turn="item.turn" />
                <p class="truncate text-center text-xs font-bold">{{ i + 1 }}</p>
                <div class="flex justify-between gap-1">
                  <Button square size="sm" variant="ghost" :disabled="i === 0" :aria-label="`Move page ${i + 1} earlier`" @click="shift(i, -1)"><ArrowLeft aria-hidden="true" /></Button>
                  <Button square size="sm" variant="ghost" :aria-label="`Turn page ${i + 1} clockwise`" @click="turnPage(i, 90)"><RotateCw aria-hidden="true" /></Button>
                  <Button square size="sm" variant="ghost" :aria-label="`Delete page ${i + 1}`" @click="removePage(i)"><Trash2 aria-hidden="true" /></Button>
                  <Button square size="sm" variant="ghost" :disabled="i === items.length - 1" :aria-label="`Move page ${i + 1} later`" @click="shift(i, 1)"><ArrowRight aria-hidden="true" /></Button>
                </div>
              </li>
            </ul>
          </template>
          <Notification v-if="error" type="error" title="Can't use this file" :description="error" @dismiss="error = ''" />
        </div>
      </Card>

      <!-- Finish -->
      <Card v-if="items.length" title="Print or save">
        <div class="flex flex-col gap-5">
          <CardSelect v-model="state.layout" label="Layout" :options="layoutOptions" :columns="2" />
          <div v-if="state.layout === 'booklet'" class="grid gap-4 sm:grid-cols-2">
            <Select v-model="state.bind" label="Binding" helper="Which side the spine is on." :options="bindOptions" />
            <Select v-model="state.sheet" label="Paper" :options="sheetOptions" />
          </div>
          <Notification
            v-if="state.layout === 'booklet'"
            type="info"
            :title="`${sheetsNeeded} ${sheetsNeeded === 1 ? 'sheet' : 'sheets'} of paper, printed on both sides`"
            description="Print it double-sided, flipping on the SHORT edge. Stack the sheets in order, fold the pile in half, and staple along the fold. Blank pages are added at the end to make the count a multiple of 4."
            :dismissible="false"
          />
          <CardSelect v-model="state.print" label="Printing" :options="printOptions" :columns="2" />

          <div class="flex flex-wrap items-center gap-2">
            <template v-if="state.print === 'auto'">
              <Button variant="primary" size="lg" data-testid="print" :disabled="working" @click="doPrint">
                <Spinner v-if="working" size="sm" />
                <Printer v-else aria-hidden="true" />
                Print
              </Button>
              <Button size="lg" data-testid="download" :disabled="working" @click="doDownload">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </template>
            <template v-else>
              <Button variant="primary" size="lg" data-testid="by-hand" :disabled="working" @click="startByHand">
                <Spinner v-if="working" size="sm" />
                <Files v-else aria-hidden="true" />
                Print both sides by hand
              </Button>
              <Button size="lg" :disabled="working" @click="doDownload">
                <Download aria-hidden="true" />
                Download PDF
              </Button>
            </template>
            <Badge color="basic"><BookCopy class="size-3" aria-hidden="true" /> {{ outputName }}</Badge>
          </div>
          <Notification v-if="printFailed" type="warning" title="Couldn't open the print dialog" description="Download the PDF and print it from your PDF viewer instead." @dismiss="printFailed = false" />
        </div>
      </Card>

      <Card title="Remember things">
        <div class="flex flex-col gap-4">
          <Switch
            v-model="state.keep"
            label="Keep my PDFs on this device"
            description="Saves the files you add and your page order in this browser, so they're here next time. They are never uploaded, and turning this off deletes them."
          />
          <Notification v-if="storeFailed" type="warning" title="Couldn't keep them" description="The browser wouldn't store the files (a private window, or not enough space)." @dismiss="storeFailed = false" />
          <DefaultsBar tool="pdf" :allowed="savedKeys" :current="current" @apply="apply" />
        </div>
      </Card>
    </template>
  </div>
</template>
