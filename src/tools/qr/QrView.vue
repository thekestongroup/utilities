<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button, Card, CardSelect, Input, InputNumber, InputPassword, InputTextArea, Notification, PageHeader, Select, Switch } from '@thekestongroup/ui'
import { Download, Printer } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { downloadBytes, printPdf } from '../../lib/files'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { serializeOptions } from '../../lib/options'
import StylePicker from './StylePicker.vue'
import { ERROR_CORRECTION, makeQr, QrError, qrPdf, wifiPayload, type ErrorCorrection, type WifiSecurity } from './qr'
import { checkStyle, DEFAULT_STYLE, EYES, normaliseHex, qrPath, qrSvg, SHAPES, type EyeShape, type ModuleShape, type QrStyle } from './qrStyle'

// What is in the code (the text, the network name) and the layout options are kept in the address.
// A Wi-Fi password is not: it is typed each time and never kept in the address or a cookie.
const builtIn = { type: 'text', text: '', ssid: '', sec: 'WPA', hidden: false, ecc: 'M', mm: 50, shape: 'square', eye: 'square', fg: '#000000', bg: '#ffffff', merge: false, quiet: 4 }
const saveable = ['type', 'sec', 'hidden', 'ecc', 'mm', 'shape', 'eye', 'fg', 'bg', 'merge', 'quiet'] as const
const { state, apply } = useUrlOptions({ routeName: 'qr', tool: 'qr', builtIn, saveable })

const password = ref('')
const typeOptions = [
  { title: 'Text or link', value: 'text', description: 'Anything: a web address, a message, a phone number.' },
  { title: 'Wi-Fi network', value: 'wifi', description: 'People scan it to join the network.' }
]
const securityOptions = [
  { label: 'WPA / WPA2 / WPA3', value: 'WPA' },
  { label: 'WEP (old)', value: 'WEP' },
  { label: 'No password', value: 'nopass' }
]
const eccOptions = ERROR_CORRECTION.map((e) => ({ label: `${e.name}: ${e.note}`, value: e.id }))

const content = computed(() =>
  state.type === 'wifi' ? (state.ssid ? wifiPayload({ ssid: state.ssid, password: password.value, security: state.sec as WifiSecurity, hidden: state.hidden }) : '') : state.text
)

// ── Style ───────────────────────────────────────────────────────────────────
const style = computed<QrStyle>(() => ({
  shape: SHAPES.some((s) => s.id === state.shape) ? (state.shape as ModuleShape) : DEFAULT_STYLE.shape,
  eye: EYES.some((e) => e.id === state.eye) ? (state.eye as EyeShape) : DEFAULT_STYLE.eye,
  fg: normaliseHex(state.fg) ?? DEFAULT_STYLE.fg,
  bg: state.bg === 'none' ? 'none' : (normaliseHex(state.bg) ?? DEFAULT_STYLE.bg),
  merge: state.merge,
  quiet: Math.min(8, Math.max(1, Math.round(state.quiet) || 4))
}))
const sample = makeQr('HELLO', 'L')
const pictures = <T extends string>(list: { id: T; name: string }[], make: (id: T) => Partial<QrStyle>) =>
  list.map((item) => ({ value: item.id, name: item.name, svg: qrSvg(sample, { ...DEFAULT_STYLE, quiet: 1, ...make(item.id) }) }))
const shapePictures = computed(() => pictures(SHAPES, (shape) => ({ shape, eye: style.value.eye, merge: style.value.merge })))
const eyePictures = computed(() => pictures(EYES, (eye) => ({ eye, shape: style.value.shape })))

// The colour boxes take any hex colour; the style only ever uses a checked one.
const fgText = ref(state.fg)
const bgText = ref(state.bg === 'none' ? '#ffffff' : state.bg)
watch(fgText, (text) => {
  const hex = normaliseHex(text)
  if (hex) state.fg = hex
})
watch(bgText, (text) => {
  const hex = normaliseHex(text)
  if (hex && state.bg !== 'none') state.bg = hex
})
watch(() => state.fg, (value) => normaliseHex(fgText.value) !== value && (fgText.value = value))
watch(() => state.bg, (value) => value !== 'none' && normaliseHex(bgText.value) !== value && (bgText.value = value))
const transparent = computed({
  get: () => state.bg === 'none',
  set: (on) => (state.bg = on ? 'none' : (normaliseHex(bgText.value) ?? DEFAULT_STYLE.bg))
})
const fgError = computed(() => (fgText.value && !normaliseHex(fgText.value) ? 'Use a colour like #023750.' : undefined))
const bgError = computed(() => (bgText.value && !normaliseHex(bgText.value) ? 'Use a colour like #ffffff.' : undefined))
const darkPresets = [
  { name: 'Black', hex: '#000000' },
  { name: 'Keston blue', hex: '#023750' },
  { name: 'Green', hex: '#0b5d3b' },
  { name: 'Plum', hex: '#5b1f4f' },
  { name: 'Brick', hex: '#9a2b1f' }
]
const lightPresets = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Cream', hex: '#fff8e1' },
  { name: 'Pale blue', hex: '#e8f4fa' },
  { name: 'Pale green', hex: '#e7f6ec' }
]
const styleCheck = computed(() => checkStyle(style.value))

const built = computed(() => {
  if (!content.value) return { svg: '', matrix: undefined, error: '' }
  try {
    const matrix = makeQr(content.value, state.ecc as ErrorCorrection)
    return { svg: qrSvg(matrix, style.value), matrix, error: '' }
  } catch (e) {
    return { svg: '', matrix: undefined, error: e instanceof QrError ? e.message : 'Could not make the code.' }
  }
})

const size = computed(() => Math.min(150, Math.max(15, state.mm || 50)))
const caption = computed(() => (state.type === 'wifi' ? `Wi-Fi: ${state.ssid}` : state.text.length <= 80 ? state.text : ''))
const baseName = computed(() => (state.type === 'wifi' ? 'wifi-qr' : 'qr-code'))

function downloadSvg() {
  downloadBytes(new TextEncoder().encode(built.value.svg), `${baseName.value}.svg`, 'image/svg+xml')
}
async function downloadPng() {
  const matrix = built.value.matrix
  if (!matrix) return
  const total = matrix.size + style.value.quiet * 2
  const scale = Math.max(4, Math.floor(1200 / total))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total * scale
  const ctx = canvas.getContext('2d')!
  if (style.value.bg !== 'none') {
    ctx.fillStyle = style.value.bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
  ctx.scale(scale, scale)
  ctx.fillStyle = style.value.fg
  ctx.fill(new Path2D(qrPath(matrix, style.value)))
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBytes(blob, `${baseName.value}.png`)
}
async function pdfBytes() {
  return qrPdf(built.value.matrix!, { sizeMm: size.value, caption: caption.value, style: style.value })
}
async function downloadPdf() {
  downloadBytes(await pdfBytes(), `${baseName.value}.pdf`, 'application/pdf')
}
const printFailed = ref(false)
async function print() {
  printFailed.value = false
  printPdf(await pdfBytes(), { failed: () => (printFailed.value = true) })
}

const saveCurrent = computed(() => serializeOptions(state))
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
    <PageHeader
      title="QR code generator"
      description="Make a QR code for a link, some text or a Wi-Fi network, as a crisp vector you can print at an exact size or save."
      :breadcrumb="[{ label: 'Keston Utilities', to: '/' }, { label: 'QR code generator' }]"
      link-component="a"
    />

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div class="flex min-w-0 flex-col gap-6">
        <Card title="What goes in the code">
          <div class="flex flex-col gap-4">
            <CardSelect v-model="state.type" label="Kind" hide-label :options="typeOptions" :columns="2" />
            <InputTextArea v-if="state.type === 'text'" v-model="state.text" label="Text or link" maxlength="2000" />
            <div v-else class="flex flex-col gap-4">
              <Input v-model="state.ssid" label="Network name" autocomplete="off" />
              <Select v-model="state.sec" label="Security" :options="securityOptions" />
              <InputPassword
                v-if="state.sec !== 'nopass'"
                v-model="password"
                label="Password"
                autocomplete="off"
                helper="Not kept in the address or in a cookie: you'll type it again next time."
              />
              <Switch v-model="state.hidden" label="Hidden network" />
            </div>
          </div>
        </Card>

        <Card title="Style" description="How the code looks. The pattern a scanner reads stays the same.">
          <div class="flex flex-col gap-5">
            <StylePicker v-model="state.shape" label="Modules" :options="shapePictures" />
            <Switch v-model="state.merge" label="Merge connected modules" description="Neighbouring rounded modules join up, so only the outside corners are rounded." :disabled="state.shape !== 'rounded'" />
            <StylePicker v-model="state.eye" label="Corner squares" :options="eyePictures" />

            <div class="grid gap-5 sm:grid-cols-2">
              <div class="flex flex-col gap-2">
                <Input v-model="fgText" label="Dark colour" autocomplete="off" :error-text="fgError" />
                <div class="flex flex-wrap gap-2" role="group" aria-label="Dark colour presets">
                  <button
                    v-for="preset in darkPresets"
                    :key="preset.hex"
                    type="button"
                    class="size-7 rounded-full border border-black/25 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    :class="state.fg === preset.hex ? 'ring-2 ring-primary ring-offset-2' : ''"
                    :style="{ backgroundColor: preset.hex }"
                    :aria-label="preset.name"
                    :aria-pressed="state.fg === preset.hex"
                    @click="fgText = preset.hex"
                  ></button>
                </div>
              </div>
              <div class="flex flex-col gap-2">
                <Input v-model="bgText" label="Light colour" autocomplete="off" :disabled="transparent" :error-text="bgError" />
                <div class="flex flex-wrap gap-2" role="group" aria-label="Light colour presets">
                  <button
                    v-for="preset in lightPresets"
                    :key="preset.hex"
                    type="button"
                    class="size-7 rounded-full border border-black/25 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    :class="state.bg === preset.hex ? 'ring-2 ring-primary ring-offset-2' : ''"
                    :style="{ backgroundColor: preset.hex }"
                    :aria-label="preset.name"
                    :aria-pressed="state.bg === preset.hex"
                    :disabled="transparent"
                    @click="bgText = preset.hex"
                  ></button>
                </div>
                <Switch v-model="transparent" label="Transparent background" />
              </div>
            </div>

            <InputNumber v-model="state.quiet" label="Blank border (modules)" :min="1" :max="8" helper="4 is the standard. Scanners need some blank space round the code." />
            <Notification
              :type="styleCheck.level === 'ok' ? 'success' : styleCheck.level === 'bad' ? 'error' : 'warning'"
              :title="styleCheck.level === 'ok' ? 'Should scan well' : styleCheck.level === 'bad' ? 'May not scan' : 'Check it scans'"
              :description="styleCheck.message"
              :dismissible="false"
              data-testid="style-check"
            />
          </div>
        </Card>

        <Card title="Options">
          <div class="flex flex-col gap-4">
            <Select v-model="state.ecc" label="Error correction" :options="eccOptions" helper="More means the code still scans when it is dirty or damaged, but it gets bigger." />
            <InputNumber v-model="state.mm" label="Printed size (mm)" :min="15" :max="150" helper="The width of the whole code, including its blank border. For the PDF and printing." />
            <DefaultsBar tool="qr" :allowed="saveable" :current="saveCurrent" @apply="apply" />
          </div>
        </Card>
      </div>

      <Card title="Your code" class="lg:sticky lg:top-18 lg:self-start">
        <div class="flex flex-col gap-4">
          <!-- Built from numbers by qrSvg, not from user text, so it is safe to insert. -->
          <div v-if="built.svg" class="mx-auto w-full max-w-64 rounded border border-black/15 bg-[#fff] p-2" data-testid="qr" v-html="built.svg"></div>
          <p v-else-if="!built.error" class="text-sm text-black/70">Add some text and the code appears here.</p>
          <Notification v-if="built.error" type="warning" title="Can't make this code" :description="built.error" :dismissible="false" />
          <Notification v-if="printFailed" type="warning" title="Couldn't open the print dialog" description="Download the PDF and print that instead." @dismiss="printFailed = false" />
          <div v-if="built.svg" class="flex flex-col gap-2">
            <Button variant="primary" data-testid="qr-print" @click="print">
              <Printer aria-hidden="true" />
              Print at {{ size }}mm
            </Button>
            <div class="flex flex-wrap gap-2">
              <Button size="sm" @click="downloadSvg"><Download aria-hidden="true" /> SVG</Button>
              <Button size="sm" @click="downloadPng"><Download aria-hidden="true" /> PNG</Button>
              <Button size="sm" @click="downloadPdf"><Download aria-hidden="true" /> PDF</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>
