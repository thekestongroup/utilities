<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { Badge, Button, Card, InputNumber, PageHeader, Spinner } from '@thekestongroup/ui'
import { Download, EyeOff, FileUp } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { downloadBytes, readFile } from '../../lib/files'
import { serializeOptions } from '../../lib/options'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { EXTENSION, MIME, cleanImage } from './image'
import { RISK_LABEL, detectKind, inspect, stripPdf, type FileKind, type Finding, type Risk } from './metadata'

// Only the JPEG quality is an option. The files themselves never leave this page.
const builtIn = { q: 92 }
const { state, apply } = useUrlOptions({ routeName: 'metadata', tool: 'metadata', builtIn, saveable: Object.keys(builtIn) })

interface Item {
  id: number
  file: File
  kind: FileKind
  findings: Finding[]
  error: string
  cleaned?: { blob: Blob; name: string }
}
const items = ref<Item[]>([])
const busy = ref(false)
const dragging = ref(false)
const fileInput = ref<HTMLInputElement>()
let nextId = 1

async function addFiles(list: FileList | File[] | null | undefined) {
  if (!list) return
  busy.value = true
  for (const file of Array.from(list)) {
    const item: Item = { id: nextId++, file, kind: detectKind(file.name, file.type), findings: [], error: '' }
    if (item.kind === 'other') item.error = 'This type of file isn’t supported. Use a JPEG, PNG, WebP or PDF.'
    else {
      try {
        item.findings = await inspect(item.kind, await readFile(file))
      } catch {
        item.error = 'This file could not be read.'
      }
    }
    items.value = [...items.value, item]
  }
  busy.value = false
}
const onPick = (event: Event) => addFiles((event.target as HTMLInputElement).files)
function onDrop(event: DragEvent) {
  dragging.value = false
  addFiles(event.dataTransfer?.files)
}

const cleanName = (file: File, kind: FileKind) => `${file.name.replace(/\.[^.]+$/, '')}-clean.${kind === 'other' ? 'bin' : EXTENSION[kind]}`

async function clean() {
  busy.value = true
  items.value = await Promise.all(
    items.value.map(async (item) => {
      if (item.error || item.kind === 'other' || item.cleaned) return item
      try {
        const blob =
          item.kind === 'pdf'
            ? new Blob([(await stripPdf(await readFile(item.file))) as BlobPart], { type: 'application/pdf' })
            : await cleanImage(item.file, MIME[item.kind], Math.min(1, Math.max(0.5, state.q / 100)))
        return { ...item, cleaned: { blob, name: cleanName(item.file, item.kind) } }
      } catch {
        return { ...item, error: 'This file could not be cleaned.' }
      }
    })
  )
  busy.value = false
}

const download = (item: Item) => item.cleaned && downloadBytes(item.cleaned.blob, item.cleaned.name)
function downloadAll() {
  items.value.forEach((item, i) => setTimeout(() => download(item), i * 300))
}
const remove = (id: number) => (items.value = items.value.filter((item) => item.id !== id))
const clearAll = () => (items.value = [])
onBeforeUnmount(clearAll)

const byRisk = (findings: Finding[]) => {
  const groups = new Map<Risk, Finding[]>()
  for (const finding of findings) groups.set(finding.risk, [...(groups.get(finding.risk) ?? []), finding])
  return [...groups.entries()]
}
const size = (bytes: number) => (bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(0)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
const anyToClean = computed(() => items.value.some((i) => !i.error && !i.cleaned))
const anyCleaned = computed(() => items.value.some((i) => i.cleaned))
const hasImages = computed(() => items.value.some((i) => i.kind === 'jpeg' || i.kind === 'webp'))
const current = computed(() => serializeOptions(state))
const savedKeys = Object.keys(builtIn)
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Metadata stripper"
      description="See what photos and PDFs give away (where you were, what camera, who made it) and remove it. Your files stay on this device."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'Metadata stripper' }]"
      link-component="a"
    />

    <Card title="Choose files">
      <div
        class="flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition"
        :class="dragging ? 'border-primary bg-primary/5' : 'border-ink/25'"
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <FileUp class="size-8 text-primary-fg" aria-hidden="true" />
        <p class="text-sm text-ink/70">Drop JPEG, PNG, WebP or PDF files here, or choose them.</p>
        <input ref="fileInput" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPick" />
        <Button :disabled="busy" @click="fileInput?.click()">
          <Spinner v-if="busy" size="sm" />
          Choose files
        </Button>
      </div>
    </Card>

    <Card v-if="items.length" title="What was found">
      <ul class="flex flex-col divide-y divide-ink/10" data-testid="files">
        <li v-for="item in items" :key="item.id" class="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="min-w-0 break-all font-bold">{{ item.file.name }} <span class="font-normal text-ink/70">· {{ size(item.file.size) }}</span></p>
            <div class="flex items-center gap-2">
              <Badge v-if="item.cleaned" color="green">Cleaned</Badge>
              <Button v-if="item.cleaned" size="sm" variant="primary" @click="download(item)">
                <Download aria-hidden="true" />
                Download ({{ size(item.cleaned.blob.size) }})
              </Button>
              <Button size="sm" variant="ghost" @click="remove(item.id)">Remove</Button>
            </div>
          </div>
          <p v-if="item.error" class="text-sm text-red-fg">{{ item.error }}</p>
          <p v-else-if="!item.findings.length" class="text-sm text-ink/70" data-testid="nothing">No personal details found{{ item.kind === 'pdf' ? ' in the document information' : '' }}.</p>
          <div v-else class="flex flex-col gap-2" data-testid="findings">
            <div v-for="[risk, list] in byRisk(item.findings)" :key="risk">
              <p class="text-xs font-bold uppercase tracking-wide text-ink/60">{{ RISK_LABEL[risk] }}</p>
              <ul class="text-sm">
                <li v-for="finding in list" :key="finding.label + finding.value"><span class="text-ink/70">{{ finding.label }}:</span> {{ finding.value }}</li>
              </ul>
            </div>
          </div>
        </li>
      </ul>
      <div class="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" :disabled="busy || !anyToClean" data-testid="clean" @click="clean">
          <EyeOff aria-hidden="true" />
          Remove the metadata
        </Button>
        <Button v-if="anyCleaned" @click="downloadAll">
          <Download aria-hidden="true" />
          Download all
        </Button>
        <Button variant="ghost" @click="clearAll">Clear the list</Button>
      </div>
    </Card>

    <Card title="Good to know">
      <ul class="flex list-disc flex-col gap-2 pl-5 text-sm">
        <li>Photos are cleaned by drawing them again, so only the picture is kept: location, camera, dates, thumbnails and colour profile all go. JPEGs and WebPs are re-compressed, so they change slightly in quality and size.</li>
        <li>PDFs lose their title, author, tool names, dates and XMP block. A PDF can still carry identifying things in its pages: comments and annotations with names, hidden layers, and embedded files are left alone.</li>
        <li>This only covers what is stored in the file. A face, a street sign or a letterhead in the picture is still there.</li>
      </ul>
      <div v-if="hasImages" class="mt-4 max-w-xs">
        <InputNumber v-model="state.q" label="JPEG / WebP quality" :min="50" :max="100" helper="Higher keeps more detail and makes a bigger file." />
      </div>
      <div class="mt-4">
        <DefaultsBar tool="metadata" :allowed="savedKeys" :current="current" @apply="apply" />
      </div>
    </Card>

  </div>
</template>
