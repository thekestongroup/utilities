<script setup lang="ts">
import { computed, ref } from 'vue'
import { Button } from '@thekestongroup/ui'
import { Save, Undo2 } from '@lucide/vue'
import { clearDefaults, hasDefaults, loadDefaults, saveDefaults, type Options } from '../lib/defaults'

/**
 * "Save these options as my defaults": keeps a tool's harmless options in a cookie, so a new link
 * to the tool starts from them. `allowed` is the complete list of options that may be saved. The
 * tool decides it, so secrets (a setup key, a password, a file) can never reach the cookie.
 */
const props = defineProps<{
  tool: string
  allowed: readonly string[]
  /** The options as they are now, in the form they take in the address. */
  current: Record<string, unknown>
}>()
const emit = defineEmits<{ apply: [options: Options] }>()

const saved = ref(hasDefaults(props.tool, props.allowed))
const message = ref('')

function save() {
  message.value = saveDefaults(props.tool, props.current, props.allowed)
    ? 'Saved. New links to this tool will start from these options.'
    : "Couldn't save: there are too many options for a cookie."
  saved.value = hasDefaults(props.tool, props.allowed)
}
function clear() {
  clearDefaults(props.tool)
  saved.value = false
  message.value = 'Cleared. New links will start from the built-in options.'
}
function useSaved() {
  emit('apply', loadDefaults(props.tool, props.allowed))
  message.value = 'Loaded your saved defaults.'
}
const label = computed(() => (saved.value ? 'Update my defaults' : 'Save these options as my defaults'))
</script>

<template>
  <div class="flex flex-col gap-2 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <Button size="sm" @click="save">
        <Save aria-hidden="true" />
        {{ label }}
      </Button>
      <Button v-if="saved" size="sm" variant="ghost" @click="useSaved">
        <Undo2 aria-hidden="true" />
        Use my saved defaults
      </Button>
      <Button v-if="saved" size="sm" variant="ghost" @click="clear">Clear saved defaults</Button>
      <span aria-live="polite" class="text-ink/70">{{ message }}</span>
    </div>
    <p class="text-xs text-ink/60">
      Kept in a cookie in this browser. Cookies are sent with page requests, so only these harmless options are saved: never a setup key, a password or a file.
    </p>
  </div>
</template>
