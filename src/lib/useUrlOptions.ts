import { onBeforeUnmount, onMounted, reactive, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadDefaults, withDefaults, type Options } from './defaults'
import { parseOptions, serializeOptions, type OptionSet } from './options'

/**
 * A tool's options, kept in its address so a link can be saved or shared, and starting (when the
 * address doesn't say) from the user's saved defaults, then the built-in ones. Everything is written
 * to the address, so a link means the same thing whatever defaults are saved later.
 */
export function useUrlOptions<T extends OptionSet>(config: { routeName: string; tool: string; builtIn: T; saveable: readonly string[] }) {
  const route = useRoute()
  const router = useRouter()
  const { builtIn } = config

  const fromRoute = () => parseOptions(builtIn, withDefaults(route.query, loadDefaults(config.tool, config.saveable)))
  const state = reactive({ ...fromRoute() }) as T

  const serialize = () => serializeOptions(state)
  let timer: ReturnType<typeof setTimeout> | undefined
  watch(
    state,
    () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (route.name === config.routeName) router.replace({ query: serialize() })
      }, 200)
    },
    { deep: true }
  )
  // Back, Forward, or following a link: the address is the truth.
  watch(
    () => route.fullPath,
    () => {
      if (route.name !== config.routeName) return
      const incoming = parseOptions(builtIn, withDefaults(route.query, loadDefaults(config.tool, config.saveable)))
      if (JSON.stringify(serializeOptions(incoming)) !== JSON.stringify(serialize())) Object.assign(state, incoming)
    }
  )
  onMounted(() => router.replace({ query: serialize() }))
  onBeforeUnmount(() => clearTimeout(timer))

  /** Replaces the options with saved defaults (anything not saved goes back to the built-in value). */
  function apply(saved: Options) {
    Object.assign(state, parseOptions(builtIn, saved))
  }
  return { state, apply }
}
