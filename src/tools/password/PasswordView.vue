<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Card, CardSelect, Input, InputNumber, PageHeader, Progress, Switch } from '@thekestongroup/ui'
import { Copy, RefreshCw } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { serializeOptions } from '../../lib/options'
import wordText from './eff_large_wordlist.txt?raw'
import {
  crackTime,
  DEFAULT_SYMBOLS,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
  strengthOf,
  type CharacterOptions,
  type PassphraseOptions
} from './password'

const WORDS = wordText.split('\n').filter(Boolean)

// Every option is kept in the address and can be saved as a default. The passwords themselves
// are never put in the address or in a cookie.
const builtIn = {
  mode: 'random',
  len: 20,
  lower: true,
  upper: true,
  digits: true,
  symbols: true,
  sym: DEFAULT_SYMBOLS,
  amb: false,
  each: true,
  words: 5,
  sep: '-',
  cap: false,
  num: false,
  count: 1
}
const { state, apply } = useUrlOptions({ routeName: 'password', tool: 'password', builtIn, saveable: Object.keys(builtIn) })

const modeOptions = [
  { title: 'Random characters', value: 'random', description: 'Letters, digits and symbols, e.g. for a password manager.' },
  { title: 'Passphrase', value: 'passphrase', description: 'Words from a list, easier to type and remember.' }
]

const characterOptions = computed<CharacterOptions>(() => ({
  length: Math.min(128, Math.max(4, state.len)),
  lower: state.lower,
  upper: state.upper,
  digits: state.digits,
  symbols: state.symbols,
  symbolSet: state.sym,
  avoidAmbiguous: state.amb,
  requireEach: state.each
}))
const phraseOptions = computed<PassphraseOptions>(() => ({
  words: Math.min(12, Math.max(2, state.words)),
  separator: state.sep,
  capitalize: state.cap,
  number: state.num
}))

const results = ref<string[]>([])
const problem = ref('')
function regenerate() {
  problem.value = ''
  try {
    const count = Math.min(20, Math.max(1, Math.floor(state.count)))
    results.value = Array.from({ length: count }, () =>
      state.mode === 'passphrase' ? generatePassphrase(phraseOptions.value, WORDS) : generatePassword(characterOptions.value)
    )
  } catch (e) {
    results.value = []
    problem.value = e instanceof Error ? e.message : 'Could not make a password.'
  }
}
watch(state, regenerate, { deep: true, immediate: true })

const bits = computed(() => (state.mode === 'passphrase' ? passphraseEntropy(phraseOptions.value, WORDS.length) : passwordEntropy(characterOptions.value)))
const strength = computed(() => strengthOf(bits.value))

const copied = ref<number | null>(null)
async function copy(index: number) {
  try {
    await navigator.clipboard.writeText(results.value[index] ?? '')
    copied.value = index
    setTimeout(() => (copied.value = null), 1500)
  } catch {
    copied.value = null
  }
}

const saveable = computed(() => serializeOptions(state))
const savedKeys = Object.keys(builtIn)
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="Password generator"
      description="Random passwords and passphrases, made in your browser with its secure random number generator. Nothing is sent or stored."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'Password generator' }]"
      link-component="a"
    />

    <Card title="Your password" :description="state.count > 1 ? `${state.count} to choose from.` : undefined">
      <div class="flex flex-col gap-4">
        <ul class="flex flex-col gap-2" data-testid="passwords">
          <li v-for="(password, i) in results" :key="i" class="flex items-center gap-2">
            <code class="min-w-0 flex-1 break-all rounded border border-ink/10 bg-surface-muted px-3 py-2 font-mono text-base" data-testid="password">{{ password }}</code>
            <Button square :aria-label="`Copy password ${i + 1}`" :status="copied === i ? 'success' : 'idle'" success-text="Copied" @click="copy(i)">
              <Copy aria-hidden="true" />
            </Button>
          </li>
        </ul>
        <p v-if="problem" class="text-sm text-red-fg">{{ problem }}</p>
        <div v-else class="flex flex-col gap-2">
          <Progress :value="strength.level" :max="4" label="Password strength" />
          <p class="text-sm" data-testid="strength">
            <strong>{{ strength.label }}</strong> · {{ Math.round(bits) }} bits · would take about {{ crackTime(bits) }} to guess at ten billion guesses a second
          </p>
        </div>
        <div>
          <Button variant="primary" @click="regenerate">
            <RefreshCw aria-hidden="true" />
            Make another
          </Button>
        </div>
      </div>
    </Card>

    <Card title="Options">
      <div class="flex flex-col gap-5">
        <CardSelect v-model="state.mode" label="Kind" hide-label :options="modeOptions" :columns="2" />

        <div v-if="state.mode === 'random'" class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <InputNumber v-model="state.len" label="Length" :min="4" :max="128" helper="4 to 128 characters." />
            <InputNumber v-model="state.count" label="How many" :min="1" :max="20" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <Switch v-model="state.lower" label="Lower case (a–z)" />
            <Switch v-model="state.upper" label="Upper case (A–Z)" />
            <Switch v-model="state.digits" label="Digits (0–9)" />
            <Switch v-model="state.symbols" label="Symbols" />
            <Switch v-model="state.amb" label="Avoid look-alikes (O, 0, l, 1, I)" />
            <Switch v-model="state.each" label="At least one of each kind" />
          </div>
          <Input v-if="state.symbols" v-model="state.sym" label="Symbols to use" helper="Leave out any a site won't accept." />
        </div>

        <div v-else class="flex flex-col gap-4">
          <div class="grid gap-4 sm:grid-cols-2">
            <InputNumber v-model="state.words" label="Words" :min="2" :max="12" helper="Five or six is a good start." />
            <InputNumber v-model="state.count" label="How many" :min="1" :max="20" />
            <Input v-model="state.sep" label="Between words" maxlength="3" />
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <Switch v-model="state.cap" label="Capitalise each word" />
            <Switch v-model="state.num" label="Add a digit to one word" />
          </div>
        </div>
      </div>
    </Card>

    <Card title="Remember these options">
      <DefaultsBar tool="password" :allowed="savedKeys" :current="saveable" @apply="apply" />
    </Card>

    <p class="text-xs text-ink/60">
      Passphrases use the EFF large word list (7,776 words, about 12.9 bits each), © Electronic Frontier Foundation, licensed
      <a class="underline" href="https://creativecommons.org/licenses/by/3.0/us/" rel="noopener noreferrer">CC BY 3.0 US</a>.
    </p>
  </div>
</template>
