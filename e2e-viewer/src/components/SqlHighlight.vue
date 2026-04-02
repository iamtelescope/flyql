<template>
    <pre
        class="bg-gray-900 rounded-md px-4 py-3 overflow-x-auto text-[13px] leading-relaxed m-0"
    ><code v-html="highlighted"></code></pre>
</template>

<script setup>
import { computed } from 'vue'
import Prism from 'prismjs'
import 'prismjs/components/prism-sql'

const props = defineProps({
    sql: String,
})

const highlighted = computed(() => {
    if (!props.sql) return ''
    return Prism.highlight(props.sql, Prism.languages.sql, 'sql')
})
</script>
