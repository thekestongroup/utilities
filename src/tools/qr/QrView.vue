<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button, Card, CardSelect, Input, InputNumber, InputPassword, InputTextArea, Notification, PageHeader, Select, Switch } from '@thekestongroup/ui'
import { Download, Printer } from '@lucide/vue'
import DefaultsBar from '../../components/DefaultsBar.vue'
import { downloadBytes, printPdf } from '../../lib/files'
import { useUrlOptions } from '../../lib/useUrlOptions'
import { serializeOptions } from '../../lib/options'
import { ERROR_CORRECTION, makeQr, QrError, qrPdf, qrSvg, wifiPayload, type ErrorCorrection, type WifiSecurity } from './qr'

// What is in the code (the text, the network name) and the layout options are kept in the address.
// A Wi-Fi password is not: it is typed each time and never kept in the address or a cookie.
const builtIn = { type: 'text', text: '', ssid: '', sec: 'WPA', hidden: false, ecc: 'M', mm: 50 }
const saveable = ['type', 'sec', 'hidden', 'ecc', 'mm'] as const
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

const built = computed(() => {
  if (!content.value) return { svg: '', matrix: undefined, error: '' }
  try {
    const matrix = makeQr(content.value, state.ecc as ErrorCorrection)
    return { svg: qrSvg(matrix), matrix, error: '' }
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
  const quiet = 4
  const total = matrix.size + quiet * 2
  const scale = Math.max(4, Math.floor(1200 / total))
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = total * scale
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  for (let r = 0; r < matrix.size; r++) for (let c = 0; c < matrix.size; c++) if (matrix.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBytes(blob, `${baseName.value}.png`)
}
async function pdfBytes() {
  return qrPdf(built.value.matrix!, { sizeMm: size.value, caption: caption.value })
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
          <div v-if="built.svg" class="mx-auto w-full max-w-64 rounded border border-black/15 bg-white p-2" data-testid="qr" v-html="built.svg"></div>
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
