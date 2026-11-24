<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Card, CardSelect, CheckboxGroup, Input, InputTextArea, Notification, PageHeader, Progress, Switch } from '@thekestongroup/ui'
import { Copy, FileUp } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { serializeOptions } from '../../lib/options'
import { ALGORITHMS, hashFile, hashText, parseExpected, type HashAlgorithm } from './hash'

// The options are kept in the address and can be saved as defaults. The text or file being
// hashed never is.
const builtIn = { mode: 'text', algs: 'md5,sha1,sha256,sha512', upper: false }
const { state, apply } = useUrlOptions({ routeName: 'hash', tool: 'hash', builtIn, saveable: Object.keys(builtIn) })

const modeOptions = [
  { title: 'Text', value: 'text', description: 'Type or paste something.' },
  { title: 'File', value: 'file', description: 'Choose a file. It is read here and never uploaded.' }
]
const algorithmOptions = ALGORITHMS.map((a) => ({ label: a.name, value: a.id, description: a.note }))
const selected = computed<HashAlgorithm[]>({
  get: () => state.algs.split(',').filter((a): a is HashAlgorithm => ALGORITHMS.some((x) => x.id === a)),
  set: (value) => (state.algs = value.join(','))
})

const text = ref('')
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement>()
const dragging = ref(false)
const expected = ref('')
const results = ref<Record<string, string>>({})
const progress = ref(0)
const working = ref(false)
const error = ref('')

const parsedExpected = computed(() => parseExpected(expected.value))
/** What to compute: the chosen algorithms, and the one the pasted checksum needs. */
const wanted = computed<HashAlgorithm[]>(() => {
  const list = new Set<HashAlgorithm>(selected.value)
  if (parsedExpected.value) list.add(parsedExpected.value.algorithm)
  return ALGORITHMS.map((a) => a.id).filter((id) => list.has(id))
})

let runId = 0
let timer: ReturnType<typeof setTimeout> | undefined
async function compute() {
  const id = ++runId
  error.value = ''
  if (!wanted.value.length || (state.mode === 'text' && !text.value) || (state.mode === 'file' && !file.value)) {
    results.value = {}
    working.value = false
    return
  }
  working.value = true
  progress.value = 0
  try {
    const out = state.mode === 'text' ? await hashText(wanted.value, text.value) : await hashFile(wanted.value, file.value!, (f) => id === runId && (progress.value = f))
    if (id === runId) results.value = out
  } catch {
    if (id === runId) {
      results.value = {}
      error.value = 'This could not be hashed here. Very large files may be too big for the SHA algorithms: try MD5 or CRC-32.'
    }
  } finally {
    if (id === runId) working.value = false
  }
}
watch([text, file, wanted, () => state.mode], () => {
  clearTimeout(timer)
  timer = setTimeout(compute, 150)
})

function onPick(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] ?? null
}
function onDrop(event: DragEvent) {
  dragging.value = false
  file.value = event.dataTransfer?.files[0] ?? null
}

const shown = (hex: string) => (state.upper ? hex.toUpperCase() : hex)
const rows = computed(() => ALGORITHMS.filter((a) => results.value[a.id] !== undefined && selected.value.includes(a.id)))

const verdict = computed(() => {
  if (!expected.value.trim()) return undefined
  const found = parsedExpected.value
  if (!found) return { type: 'warning' as const, title: "That doesn't look like a checksum", text: 'Paste just the checksum, or a line from a checksum file.' }
  const actual = results.value[found.algorithm]
  if (actual === undefined) return { type: 'info' as const, title: 'Checking…', text: '' }
  const name = ALGORITHMS.find((a) => a.id === found.algorithm)!.name
  return actual === found.hash
    ? { type: 'success' as const, title: `Matches (${name})`, text: 'The checksum you pasted is the same as the one worked out here.' }
    : { type: 'error' as const, title: `Does not match (${name})`, text: 'The file or text is different from what the checksum was made from.' }
})

const copied = ref('')
async function copy(id: string) {
  try {
    await navigator.clipboard.writeText(shown(results.value[id] ?? ''))
    copied.value = id
    setTimeout(() => (copied.value = ''), 1500)
  } catch {
    copied.value = ''
  }
}
const saveable = computed(() => serializeOptions(state))
const savedKeys = Object.keys(builtIn)
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Hash & checksum"
      description="Work out the checksum of some text or a file, and check it against the one you were given. Done in your browser: nothing is uploaded."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'Hash & checksum' }]"
      link-component="a"
    />

    <Card title="What to hash">
      <div class="flex flex-col gap-4">
        <CardSelect v-model="state.mode" label="Hash" hide-label :options="modeOptions" :columns="2" />
        <InputTextArea v-if="state.mode === 'text'" v-model="text" label="Text" helper="Spaces and line breaks count." />
        <div
          v-else
          class="flex flex-col items-center gap-3 rounded-md border-2 border-dashed p-8 text-center transition"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-black/25'"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <FileUp class="size-8 text-primary" aria-hidden="true" />
          <p v-if="file" class="font-bold" data-testid="file-info">{{ file.name }} <span class="font-normal text-black/70">· {{ file.size.toLocaleString('en-GB') }} bytes</span></p>
          <p v-else class="text-sm text-black/70">Drop a file here, or choose one.</p>
          <input ref="fileInput" type="file" class="sr-only" tabindex="-1" aria-hidden="true" @change="onPick" />
          <Button @click="fileInput?.click()">{{ file ? 'Choose a different file' : 'Choose a file' }}</Button>
        </div>
      </div>
    </Card>

    <Card title="Checksums">
      <div class="flex flex-col gap-4">
        <Progress v-if="working && state.mode === 'file'" :value="Math.round(progress * 100)" label="Reading the file" />
        <Notification v-if="error" type="error" title="Could not hash this" :description="error" @dismiss="error = ''" />
        <p v-if="!rows.length && !working && !error" class="text-sm text-black/70">Add some text or a file and the checksums appear here.</p>
        <ul class="flex flex-col gap-3" data-testid="hashes">
          <li v-for="row in rows" :key="row.id" class="flex flex-col gap-1">
            <p class="text-sm font-bold">{{ row.name }} <span v-if="row.note" class="font-normal text-black/60">· {{ row.note }}</span></p>
            <div class="flex items-center gap-2">
              <code class="min-w-0 flex-1 break-all rounded border border-black/15 bg-surface px-3 py-2 font-mono text-sm" :data-testid="`hash-${row.id}`">{{ shown(results[row.id]!) }}</code>
              <Button square :aria-label="`Copy ${row.name}`" :status="copied === row.id ? 'success' : 'idle'" success-text="Copied" @click="copy(row.id)">
                <Copy aria-hidden="true" />
              </Button>
            </div>
          </li>
        </ul>
      </div>
    </Card>

    <Card title="Check against a checksum" description="Paste the one you were given. The algorithm is worked out from its length.">
      <div class="flex flex-col gap-4">
        <Input v-model="expected" label="Expected checksum" autocomplete="off" />
        <Notification v-if="verdict" :type="verdict.type" :title="verdict.title" :description="verdict.text || undefined" :dismissible="false" data-testid="verdict" />
      </div>
    </Card>

    <Card title="Options">
      <div class="flex flex-col gap-4">
        <CheckboxGroup v-model="selected" label="Show" :options="algorithmOptions" />
        <Switch v-model="state.upper" label="Upper case letters (A–F)" />
        <DefaultsBar tool="hash" :allowed="savedKeys" :current="saveable" @apply="apply" />
      </div>
    </Card>
  </div>
</template>
