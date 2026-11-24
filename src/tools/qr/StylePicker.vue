<script setup lang="ts">
import { useId } from 'vue'

/** A row of radio buttons that each show a small picture of what they do. The pictures are drawn by our own code from checked values. */
defineProps<{
  label: string
  options: { value: string; name: string; svg: string }[]
}>()
const model = defineModel<string>({ required: true })
const name = useId()
</script>

<template>
  <fieldset class="flex min-w-0 flex-col gap-2">
    <legend class="mb-2 text-sm font-bold">{{ label }}</legend>
    <div class="flex flex-wrap gap-2">
      <label
        v-for="option in options"
        :key="option.value"
        class="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-black/15 bg-white p-2 text-xs transition has-checked:border-primary has-checked:bg-primary/5 has-checked:font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus"
      >
        <input v-model="model" type="radio" class="sr-only" :name="name" :value="option.value" />
        <span class="block size-14 rounded bg-white p-1 [&>svg]:size-full" aria-hidden="true" v-html="option.svg"></span>
        {{ option.name }}
      </label>
    </div>
  </fieldset>
</template>
