<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { Button, Card, Input, InputNumber, InputPassword, Notification, PageHeader, Progress, Select } from '@thekestongroup/ui'
import { BookOpen, Eraser } from '@lucide/vue'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { decodeBase32, validateBase32 } from './lib/base32'
import { looksLikeOtpauth, parseOtpauth } from './lib/otpauth'
import { ALGORITHMS, groupCode, importKey, matchOffset, totp, counterFor, type Algorithm } from './lib/totp'

// The setup key is kept in the address (after the #, which is never sent to a server), like in
// the code book, so a link can be bookmarked. Nothing here is ever saved in a cookie.
const builtIn = { key: '', algo: 'SHA-1', digits: 6, period: 30 }
const { state } = useUrlOptions({ routeName: 'totp-checker', tool: 'totp-checker', builtIn, saveable: [] })

const algorithmOptions = ALGORITHMS.map((value) => ({ label: value, value }))
const digitOptions = [
  { label: '6 digits', value: 6 },
  { label: '8 digits', value: 8 }
]

const keyHelper = 'The base32 key your service shows next to its QR code, in any format, or a whole otpauth:// link.'
const touched = ref(false)
const notice = ref('')
const keyError = computed(() => {
  if (!state.key.trim()) return undefined
  if (looksLikeOtpauth(state.key)) {
    try {
      parseOtpauth(state.key)
      return undefined
    } catch (e) {
      return e instanceof Error ? e.message : 'This link could not be read.'
    }
  }
  const message = validateBase32(state.key)
  return message && /incomplete/.test(message) && !touched.value ? undefined : message
})
const valid = computed(() => !!state.key.trim() && !keyError.value && validateBase32(state.key) === undefined)

// A pasted otpauth:// link fills in the rest; only its secret is kept.
watch(
  () => state.key,
  (value) => {
    if (!looksLikeOtpauth(value)) return
    try {
      const data = parseOtpauth(value)
      state.key = data.secret
      touched.value = true
      if (data.algorithm) state.algo = data.algorithm
      if (data.digits) state.digits = data.digits
      if (data.period) state.period = data.period
      notice.value = 'Read the key from the otpauth:// link.'
    } catch {
      // keyError explains it.
    }
  }
)

const cryptoKey = shallowRef<CryptoKey | null>(null)
let importId = 0
watch(
  [() => state.key, () => state.algo],
  async () => {
    const id = ++importId
    cryptoKey.value = null
    if (!valid.value) return
    const bytes = decodeBase32(state.key)
    try {
      const key = await importKey(bytes, state.algo as Algorithm)
      if (id === importId) cryptoKey.value = key
    } finally {
      bytes.fill(0)
    }
  },
  { immediate: true }
)

const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | undefined
const period = computed(() => Math.min(3600, Math.max(1, Math.floor(state.period) || 30)))
const counter = computed(() => counterFor(now.value / 1000, period.value))
const secondsLeft = computed(() => period.value - (Math.floor(now.value / 1000) % period.value))

const codes = ref<{ previous: string; current: string; next: string } | null>(null)
watch(
  [cryptoKey, counter, () => state.digits],
  async ([key]) => {
    if (!key) {
      codes.value = null
      return
    }
    const at = counter.value * period.value
    const [previous, current, next] = await Promise.all([at - period.value, at, at + period.value].map((t) => totp(key, t, period.value, state.digits)))
    if (key === cryptoKey.value) codes.value = { previous: groupCode(previous!), current: groupCode(current!), next: groupCode(next!) }
  },
  { immediate: true }
)

// Compare with the code from the authenticator app.
const typed = ref('')
const verdict = ref<'none' | 'same' | 'behind' | 'ahead' | 'different'>('none')
watch([typed, cryptoKey, counter, () => state.digits], async () => {
  const key = cryptoKey.value
  const wanted = typed.value.replace(/\s+/g, '')
  if (!key || wanted.length < state.digits) {
    verdict.value = 'none'
    return
  }
  const offset = await matchOffset(key, wanted, now.value / 1000, period.value, state.digits)
  verdict.value = offset === undefined ? 'different' : offset === 0 ? 'same' : offset < 0 ? 'behind' : 'ahead'
})

function clear() {
  importId++
  cryptoKey.value = null
  codes.value = null
  state.key = ''
  typed.value = ''
  touched.value = false
  notice.value = ''
}
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 250)
  window.addEventListener('pagehide', clear)
})
onBeforeUnmount(() => {
  clearInterval(ticker)
  window.removeEventListener('pagehide', clear)
  clear()
})

/** The same settings, for opening the code book. */
const bookQuery = computed(() => {
  const query: Record<string, string> = {}
  if (state.key) query.key = state.key
  if (state.algo !== 'SHA-1') query.algo = state.algo
  if (state.digits !== 6) query.digits = String(state.digits)
  if (state.period !== 30) query.period = String(state.period)
  return query
})
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="TOTP code checker"
      description="Paste a setup key and see its code for right now, to compare with your authenticator app before you print a code book or rely on the key."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'TOTP Tools' }, { label: 'Code checker' }]"
      link-component="a"
    />

    <Card title="Setup key">
      <div class="flex flex-col gap-4">
        <InputPassword
          v-model="state.key"
          label="Setup key"
          :helper="keyHelper"
          autocomplete="off"
          name="totp-checker-key-not-a-password"
          :error-text="keyError"
          :status="valid ? 'success' : undefined"
          @blur="touched = true"
        />
        <Notification v-if="notice" type="success" title="Link read" :description="notice" @dismiss="notice = ''" />
        <details class="rounded px-1">
          <summary class="cursor-pointer rounded px-1 py-1 text-sm font-bold outline-none focus-visible:outline-2 focus-visible:outline-focus">Advanced <span class="font-normal text-ink/70">· algorithm, digits, period</span></summary>
          <div class="mt-4 grid gap-4 px-1 pb-1 sm:grid-cols-3">
            <Select v-model="state.algo" label="Algorithm" :options="algorithmOptions" />
            <Select v-model="state.digits" label="Digits" :options="digitOptions" />
            <InputNumber v-model="state.period" label="Period (seconds)" :min="1" :max="3600" />
          </div>
        </details>
      </div>
    </Card>

    <Card title="The code right now">
      <div v-if="codes" class="flex flex-col gap-4">
        <p class="font-mono text-5xl font-bold tracking-wider [font-feature-settings:'zero']" data-testid="current-code">{{ codes.current }}</p>
        <Progress :value="period - secondsLeft" :max="period" label="Time until this code changes" />
        <p class="text-sm text-ink/70">
          Changes in {{ secondsLeft }} {{ secondsLeft === 1 ? 'second' : 'seconds' }}. Before it: <span class="font-mono">{{ codes.previous }}</span> · after it: <span class="font-mono">{{ codes.next }}</span>
        </p>
      </div>
      <p v-else class="text-sm text-ink/70">Enter a valid setup key and its code appears here, with a countdown.</p>
    </Card>

    <Card v-if="codes" title="Compare with your app" description="Type the code your authenticator app shows now.">
      <div class="flex max-w-sm flex-col gap-4">
        <Input v-model="typed" label="Code from your app" autocomplete="off" inputmode="numeric" :maxlength="state.digits + 1" />
        <Notification v-if="verdict === 'same'" type="success" title="It matches" description="This key works and this device's clock agrees with yours." :dismissible="false" data-testid="verdict" />
        <Notification
          v-else-if="verdict === 'behind' || verdict === 'ahead'"
          type="warning"
          :title="verdict === 'behind' ? 'It matches the previous code' : 'It matches the next code'"
          :description="verdict === 'behind' ? 'The key is right, but one of the two clocks is out by about a step. Check this device’s clock, or your phone’s.' : 'The key is right, but one of the two clocks is out by about a step. Check this device’s clock, or your phone’s.'"
          :dismissible="false"
          data-testid="verdict"
        />
        <Notification
          v-else-if="verdict === 'different'"
          type="error"
          title="It doesn't match"
          description="The key may have been copied wrongly, or the algorithm, digits or period differ from what the service uses (see Advanced above)."
          :dismissible="false"
          data-testid="verdict"
        />
      </div>
    </Card>

    <div class="flex flex-wrap gap-2">
      <RouterLink :to="{ path: '/totp/book', query: bookQuery }" class="rounded outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        <Button as="span" variant="primary" tabindex="-1">
          <BookOpen aria-hidden="true" />
          Make a code book with this key
        </Button>
      </RouterLink>
      <Button variant="danger" @click="clear">
        <Eraser aria-hidden="true" />
        Clear the key
      </Button>
    </div>
  </div>
</template>
