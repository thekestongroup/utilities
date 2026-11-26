<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Button,
  Card,
  InfoTip,
  Input,
  InputNumber,
  InputPassword,
  Notification,
  PageHeader,
  Progress,
  Select,
  Spinner,
  Switch
} from '@thekestongroup/ui'
import { Copy, Eraser, Printer, SkipForward, Eye } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { loadDefaults, withDefaults, type Options } from '../../lib/defaults'
import PrintBook from './PrintBook.vue'
import type { GenerateMessage, GenerateRequest } from './generate.worker'
import { decodeBase32, validateBase32 } from './lib/base32'
import { planBook, type BookPlan, type BookSettings } from './lib/book'
import { endDateOf, formToQuery, queryToForm, type FormState } from './lib/formState'
import { looksLikeOtpauth, parseOtpauth } from './lib/otpauth'
import { ALGORITHMS, groupCode, importKey, totp } from './lib/totp'
import { allZones, browserZone, formatDate, parseDate, todayIn } from './lib/tz'

const route = useRoute()
const router = useRouter()
const numberFormat = new Intl.NumberFormat("en-GB")
const NUMBER = { format: (n: number) => numberFormat.format(n) }

// ── Settings (kept in the URL) ──────────────────────────────────────────────
const defaults = { today: todayIn(browserZone()), zone: browserZone() }
// The options that may be saved as defaults: never the setup key or the label, which belong to one account.
const SAVEABLE = ['tz', 'months', 'edition', 'punch'] as const
const savedQuery = () => withDefaults(route.query, loadDefaults('totp-book', SAVEABLE))
const state = reactive<FormState>(queryToForm(savedQuery(), defaults))

const zones = allZones()
const durationOptions = [
  { label: '1 month', value: '1' },
  { label: '2 months', value: '2' },
  { label: '3 months', value: '3' },
  { label: '6 months', value: '6' },
  { label: '12 months', value: '12' }
]
// Books start on the 1st of a month, chosen as a month and a year.
const monthOptions = Array.from({ length: 12 }, (_, i) => ({
  label: new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, i, 1))),
  value: String(i + 1).padStart(2, '0')
}))
const yearOptions = computed(() => {
  const thisYear = Number(defaults.today.slice(0, 4))
  const years = new Set(Array.from({ length: 9 }, (_, i) => thisYear - 2 + i))
  const chosen = Number(state.start.slice(0, 4))
  if (chosen) years.add(chosen)
  return [...years].sort((a, b) => a - b).map((y) => ({ label: String(y), value: String(y) }))
})
const startMonth = computed({
  get: () => state.start.slice(5, 7),
  set: (month) => (state.start = `${state.start.slice(0, 4)}-${month}-01`)
})
const startYear = computed({
  get: () => state.start.slice(0, 4),
  set: (year) => (state.start = `${year}-${state.start.slice(5, 7)}-01`)
})
const algorithmOptions = ALGORITHMS.map((value) => ({ label: value, value }))
const digitOptions = [
  { label: '6 digits', value: 6 },
  { label: '8 digits', value: 8 }
]
const editionOptions = [
  { label: 'Half day per page: AM and PM pages (about 4.4pt type)', value: 'half' },
  { label: 'Whole day per page (about 3pt type)', value: 'day' }
]

const endDate = computed(() => endDateOf(state))
const datesValid = computed(() => !!parseDate(state.start))

function settingsNow(): BookSettings {
  return {
    label: state.label.trim(),
    zone: state.zone,
    start: state.start,
    end: endDate.value,
    algorithm: state.algorithm,
    digits: state.digits,
    period: state.period,
    edition: state.edition,
    punch: state.punch
  }
}

const plan = computed<BookPlan | null>(() => (datesValid.value ? planBook(settingsNow()) : null))

const summary = computed(() => {
  if (!plan.value) return ''
  return (
    `${formatDate(state.start)} – ${formatDate(endDate.value)} · ${NUMBER.format(plan.value.totalCodes)} codes · ` +
    `${NUMBER.format(plan.value.totalPages + 2)} pages`
  )
})

/** Moves on to the next stretch of the same length, e.g. the following month. */
function nextPeriod() {
  if (datesValid.value) state.start = endDate.value
}

// ── The setup key ───────────────────────────────────────────────────────────
const keyHelper =
  "The base32 key your service shows next to its QR code, in any format, or a whole otpauth:// link."
const keyTouched = ref(false)
const notice = ref('')

const keyError = computed(() => {
  const value = state.key
  if (!value.trim()) return undefined
  if (looksLikeOtpauth(value)) {
    try {
      parseOtpauth(value)
      return undefined
    } catch (error) {
      return error instanceof Error ? error.message : 'This link could not be read.'
    }
  }
  const message = validateBase32(value)
  // "Looks incomplete" is only worth saying once they've finished typing.
  if (message && /incomplete/.test(message) && !keyTouched.value) return undefined
  return message
})
const keyValid = computed(() => !!state.key.trim() && !keyError.value && validateBase32(state.key) === undefined)

// A pasted otpauth:// link fills in the rest of the state, then only the secret is kept.
watch(
  () => state.key,
  (value) => {
    if (!looksLikeOtpauth(value)) return
    try {
      const data = parseOtpauth(value)
      const filled: string[] = []
      state.key = data.secret
      keyTouched.value = true
      if (data.label) {
        state.label = data.label
        filled.push('label')
      }
      if (data.algorithm) {
        state.algorithm = data.algorithm
        filled.push('algorithm')
      }
      if (data.digits) {
        state.digits = data.digits
        filled.push('digits')
      }
      if (data.period) {
        state.period = data.period
        filled.push('period')
      }
      notice.value = filled.length
        ? `Read the key from the otpauth:// link and filled in the ${filled.join(', ')}.`
        : 'Read the key from the otpauth:// link.'
    } catch {
      // keyError explains it.
    }
  }
)

// ── Live check ──────────────────────────────────────────────────────────────
const liveKey = shallowRef<CryptoKey | null>(null)
const liveCode = ref('')
const now = ref(Date.now())
let importToken = 0
let ticker: ReturnType<typeof setInterval> | undefined

watch(
  [() => state.key, () => state.algorithm],
  async () => {
    const token = ++importToken
    liveKey.value = null
    liveCode.value = ''
    if (!keyValid.value) return
    const bytes = decodeBase32(state.key)
    try {
      const key = await importKey(bytes, state.algorithm)
      if (token === importToken) liveKey.value = key
    } finally {
      bytes.fill(0)
    }
  },
  { immediate: true }
)

const counter = computed(() => Math.floor(now.value / 1000 / state.period))
const secondsLeft = computed(() => state.period - (Math.floor(now.value / 1000) % state.period))
watch(
  [liveKey, counter, () => state.digits],
  async ([key]) => {
    if (!key) return
    const code = await totp(key, counter.value * state.period, state.period, state.digits)
    if (key === liveKey.value) liveCode.value = groupCode(code)
  },
  { immediate: true }
)

// ── Generating ──────────────────────────────────────────────────────────────
interface Result {
  settings: BookSettings
  plan: BookPlan
  codes: Uint32Array[]
  generated: string
}
const result = shallowRef<Result | null>(null)
const working = ref(false)
const genProgress = ref({ done: 0, total: 0 })
const generateError = ref('')
const elapsed = ref(0)
// A worker is started as soon as the page opens, so its script is fetched with
// the page and nothing is requested later. It is reused for every book, and
// replaced when a job is cancelled or the key is cleared.
let worker: Worker | undefined
const startWorker = () => new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })

const canGenerate = computed(() => keyValid.value && !!plan.value && plan.value.totalCodes > 0 && !working.value)

/** Cancels any job and swaps in a fresh worker (nothing from the old one survives). */
function stopWorker(keepWarm = true) {
  worker?.terminate()
  worker = keepWarm ? startWorker() : undefined
  working.value = false
}

/** A job finished: the worker has already wiped the key, so it can be reused. */
function jobDone() {
  if (worker) worker.onmessage = worker.onerror = null
  working.value = false
}

function generate() {
  if (!canGenerate.value || !plan.value) return
  if (working.value) stopWorker()
  generateError.value = ''
  result.value = null
  printing.value = null
  previewing.value = null

  const settings = settingsNow()
  const bookPlan = plan.value
  const codes: Uint32Array[] = []
  const started = performance.now()
  genProgress.value = { done: 0, total: bookPlan.totalCodes }
  working.value = true

  const secret = decodeBase32(state.key)
  worker ??= startWorker()
  worker.onmessage = (event: MessageEvent<GenerateMessage>) => {
    const message = event.data
    if (message.type === 'progress') genProgress.value = { done: message.done, total: message.total }
    else if (message.type === 'volume') codes[message.index] = message.codes
    else if (message.type === 'done') {
      elapsed.value = (performance.now() - started) / 1000
      result.value = {
        settings,
        plan: bookPlan,
        codes,
        generated: new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: settings.zone }).format(new Date())
      }
      jobDone()
    } else {
      generateError.value = message.message
      stopWorker()
    }
  }
  worker.onerror = () => {
    generateError.value = 'Generating the codes failed.'
    stopWorker()
  }
  const request: GenerateRequest = {
    secret,
    algorithm: settings.algorithm,
    digits: settings.digits,
    volumes: bookPlan.volumes.map((v) => ({ firstCounter: v.firstCounter, count: v.count }))
  }
  worker.postMessage(request, [secret.buffer])
}

// Anything that changes the codes makes an earlier book out of date.
watch(
  () => [state.key, state.algorithm, state.digits, state.period, state.start, endDate.value, state.zone, state.edition],
  () => {
    if (working.value) stopWorker()
    result.value = null
    printing.value = null
    previewing.value = null
  }
)

// ── Printing ────────────────────────────────────────────────────────────────
const printing = ref<number | null>(null)
const previewing = ref<number | null>(null)

async function print(index: number) {
  printing.value = index
  await nextTick()
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  window.print()
}
const afterPrint = () => (printing.value = null)
const onPageHide = () => clearSecrets()

// ── Clearing ────────────────────────────────────────────────────────────────
function clearSecrets(keepWorkerWarm = true) {
  if (working.value) stopWorker(keepWorkerWarm)
  importToken++
  liveKey.value = null
  liveCode.value = ''
  result.value = null
  printing.value = null
  previewing.value = null
  state.key = ''
  keyTouched.value = false
  notice.value = ''
}

// ── Copy link ───────────────────────────────────────────────────────────────
const copyStatus = ref<'idle' | 'success' | 'error'>('idle')
async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href)
    copyStatus.value = 'success'
  } catch {
    copyStatus.value = 'error'
  }
}

// ── The URL ─────────────────────────────────────────────────────────────────
let urlTimer: ReturnType<typeof setTimeout> | undefined
const queryString = (q: Record<string, string>) => JSON.stringify(Object.entries(q).sort())

watch(
  () => formToQuery(state),
  (query) => {
    clearTimeout(urlTimer)
    urlTimer = setTimeout(() => {
      if (route.name === 'totp-book') router.replace({ query })
    }, 250)
  },
  { deep: true }
)

// Following a saved link, or Back / Forward, changes the settings.
watch(
  () => route.fullPath,
  () => {
    if (route.name !== 'totp-book') return
    const incoming = queryToForm(savedQuery(), defaults)
    if (queryString(formToQuery(incoming)) !== queryString(formToQuery(state))) Object.assign(state, incoming)
  }
)

onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 250)
  // Fetch the worker script and the book's font now, so nothing is requested later.
  worker ??= startWorker()
  void document.fonts?.load('400 1em "JetBrains Mono"')
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('afterprint', afterPrint)
  router.replace({ query: formToQuery(state) })
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  clearTimeout(urlTimer)
  window.removeEventListener('pagehide', onPageHide)
  window.removeEventListener('afterprint', afterPrint)
  clearSecrets(false)
  worker?.terminate()
  worker = undefined
})

const progressPercent = computed(() => (genProgress.value.total ? Math.round((genProgress.value.done / genProgress.value.total) * 100) : 0))
const advancedOpen = ref(false)

const defaultsToSave = computed(() => ({ tz: state.zone, months: state.duration, edition: state.edition, punch: state.punch ? '1' : '0' }))
function applyDefaults(saved: Options) {
  // Keep this book's key, label, start and other settings; take the saved length, zone, density and margin.
  const { end: _end, ...rest } = formToQuery(state)
  Object.assign(state, queryToForm({ ...rest, ...(saved.months ? {} : { end: _end }), ...saved }, defaults))
}
</script>

<template>
  <div class="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="TOTP Code Book"
      description="Print every 2FA code for a stretch of time as a book. Deliberately the least practical way to back up 2FA, and a real one."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'TOTP Tools' }, { label: 'Code book' }]"
      link-component="a"
    />

    <Notification
      type="warning"
      title="Treat the printed book like a passport"
      :dismissible="false"
    >
      <p>
        The book works as your 2FA for the whole period it covers: anyone who knows your password and has it can sign in.
        Store it somewhere safe. This page makes no network requests after it loads, so you can disconnect from the
        internet before pasting your key, and it keeps working offline once loaded.
      </p>
      <p class="mt-2">
        The setup key, and the other settings, are kept in this page's address (after the #, which is never sent to a
        server) so you can bookmark one link per account. Anyone who sees that link has the key, so keep it private.
      </p>
    </Notification>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <form class="flex min-w-0 flex-col gap-6" autocomplete="off" @submit.prevent="generate">
        <Card title="Setup key">
          <div class="flex flex-col gap-4">
            <InputPassword
              v-model="state.key"
              label="Setup key"
              :helper="keyHelper"
              autocomplete="off"
              name="totp-setup-key-not-a-password"
              :error-text="keyError"
              :status="keyValid ? 'success' : undefined"
              @blur="keyTouched = true"
            />
            <Notification v-if="notice" type="success" title="Link read" :description="notice" @dismiss="notice = ''" />
            <Input
              v-model="state.label"
              label="Label (optional)"
              helper="Used in the book's headings, e.g. Gmail — me@example.com."
              autocomplete="off"
              maxlength="80"
            />
          </div>
        </Card>

        <Card title="Period">
          <div class="grid gap-4 sm:grid-cols-2">
            <div class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4">
              <Select v-model="startMonth" label="Month" :options="monthOptions" />
              <Select v-model="startYear" label="Year" :options="yearOptions" />
            </div>
            <Select v-model="state.duration" label="Length" :options="durationOptions" />
            <p class="-mt-2 text-sm text-ink/70 sm:col-span-2">Books start at 00:00 on the 1st of the month.</p>
            <Select
              v-model="state.zone"
              class="sm:col-span-2"
              label="Time zone"
              helper="Printed times use this zone, including its daylight saving changes."
              searchable
              :options="zones"
            />
          </div>
        </Card>

        <Card padding="sm">
          <details :open="advancedOpen" class="group" @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open">
            <summary
              class="cursor-pointer rounded px-2 py-1 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-focus"
            >
              Advanced
              <span class="font-normal text-ink/70">· algorithm, digits, period, page density</span>
            </summary>
            <div class="mt-4 grid gap-4 px-2 pb-2 sm:grid-cols-2">
              <Select v-model="state.algorithm" label="Algorithm" :options="algorithmOptions" />
              <Select v-model="state.digits" label="Digits" :options="digitOptions" />
              <InputNumber v-model="state.period" label="Period (seconds)" :min="1" :max="3600" helper="Almost every service uses 30." />
              <Select v-model="state.edition" label="Page density" :options="editionOptions" helper="Pages are A4." />
              <Switch
                v-model="state.punch"
                label="Leave room for a hole punch"
                description="A wider margin on the left of each front page and on the right of each back page, so the holes miss the codes."
              />
            </div>
          </details>
        </Card>

        <Card title="Generate">
          <div class="flex flex-col gap-4">
            <p v-if="summary" class="text-base font-bold" data-testid="summary">{{ summary }}</p>
            <p v-else class="text-sm text-red-fg">Fix the dates above to see how big the book will be.</p>
            <div v-if="working" class="flex flex-col gap-2" aria-live="polite">
              <Progress :value="progressPercent" label="Generating codes" />
              <p class="flex items-center gap-2 text-sm">
                <Spinner size="sm" />
                {{ NUMBER.format(genProgress.done) }} of {{ NUMBER.format(genProgress.total) }} codes
              </p>
            </div>
            <Notification v-if="generateError" type="error" title="Could not generate" :description="generateError" @dismiss="generateError = ''" />

            <div class="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" :disabled="!canGenerate">Generate</Button>
              <Button v-if="working" @click="stopWorker()">Cancel</Button>
              <Button :disabled="!datesValid" @click="nextPeriod">
                <SkipForward aria-hidden="true" />
                Next period
              </Button>
              <Button variant="danger" @click="clearSecrets()">
                <Eraser aria-hidden="true" />
                Clear key and codes
              </Button>
            </div>
          </div>
        </Card>

        <Card v-if="result" title="Your book" :description="`Generated in ${elapsed.toFixed(1)} seconds. Nothing has left this page.`">
          <div class="flex flex-wrap items-center justify-between gap-3" data-testid="book">
            <div>
              <p class="font-bold">{{ formatDate(result.plan.volumes[0]!.startDate) }} – {{ formatDate(result.plan.volumes[0]!.endDate) }}</p>
              <p class="text-sm text-ink/70">
                {{ NUMBER.format(result.plan.totalCodes) }} codes · {{ NUMBER.format(result.plan.totalPages + 2) }} pages
              </p>
            </div>
            <div class="flex gap-2">
              <Button @click="previewing = previewing === 0 ? null : 0">
                <Eye aria-hidden="true" />
                {{ previewing === 0 ? 'Hide preview' : 'Preview' }}
              </Button>
              <Button variant="primary" @click="print(0)">
                <Printer aria-hidden="true" />
                Print
              </Button>
            </div>
          </div>
          <div v-if="previewing !== null" class="mt-4 overflow-x-auto rounded border border-ink/10 bg-surface-muted p-3">
            <PrintBook
              preview
              :preview-pages="1"
              :settings="{ ...result.settings, punch: state.punch }"
              :volume="result.plan.volumes[previewing]!"
              :codes="result.codes[previewing]!"
              :generated="result.generated"
            />
          </div>
          <p class="mt-4 text-sm text-ink/70">
            In the print dialog, choose "Save as PDF" or a printer, set margins to "None" and untick "Headers and footers".
            Pages are already numbered.
          </p>
        </Card>
      </form>

      <aside class="flex min-w-0 flex-col gap-6">
        <Card title="Check it against your app" class="lg:sticky lg:top-18">
          <div v-if="liveKey && liveCode" class="flex flex-col gap-3" aria-live="off">
            <p class="font-mono text-4xl font-bold tracking-wider [font-feature-settings:'zero']" data-testid="live-code">{{ liveCode }}</p>
            <Progress :value="state.period - secondsLeft" :max="state.period" label="Time until this code changes" />
            <p class="text-sm text-ink/70">Changes in {{ secondsLeft }} {{ secondsLeft === 1 ? 'second' : 'seconds' }}.</p>
            <p class="text-sm">
              This should match your authenticator app right now. If it doesn't, the key is wrong, or this device's
              clock is off. Check that before printing.
              <InfoTip
                label="Why might it not match?"
                text="The code depends only on the key and the current time. A wrong key, a clock that is a few seconds out, or non-default settings (algorithm, digits, period) all give a different code."
              />
            </p>
          </div>
          <p v-else class="text-sm text-ink/70">Enter a valid setup key and the code for right now appears here, with a countdown.</p>
        </Card>

        <Card title="Your defaults">
          <DefaultsBar tool="totp-book" :allowed="SAVEABLE" :current="defaultsToSave" @apply="applyDefaults" />
        </Card>

        <Card title="Copy this setup">
          <div class="flex flex-col gap-3">
            <p class="text-sm text-ink/70">
              The address of this page holds your settings. Save or bookmark it to come back to this account, then use
              "Next period" for the following month.
            </p>
            <Button :status="copyStatus === 'success' ? 'success' : copyStatus === 'error' ? 'error' : 'idle'" success-text="Copied" error-text="Could not copy" @click="copyLink" @update:status="copyStatus = 'idle'">
              <Copy aria-hidden="true" />
              Copy link (contains your key)
            </Button>
          </div>
        </Card>
      </aside>
    </div>

    <Teleport to="body">
      <PrintBook
        v-if="result && printing !== null"
        :settings="{ ...result.settings, punch: state.punch }"
        :volume="result.plan.volumes[printing]!"
        :codes="result.codes[printing]!"
        :generated="result.generated"
      />
    </Teleport>
  </div>
</template>
