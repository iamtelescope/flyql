<template>
    <pre
        class="bg-gray-900 rounded-md px-4 py-3 overflow-x-auto text-[13px] leading-relaxed m-0"
    ><code v-html="highlighted"></code></pre>
</template>

<script setup>
import { computed } from 'vue'
import hljs from 'highlight.js/lib/core'
import pgsql from 'highlight.js/lib/languages/pgsql'
import mysql from 'highlight.js/lib/languages/sql'

hljs.registerLanguage('pgsql', pgsql)
hljs.registerLanguage('mysql', mysql)

const props = defineProps({
    sql: String,
    dialect: { type: String, default: 'mysql' },
})

const highlighted = computed(() => {
    if (!props.sql) return ''
    return hljs.highlight(props.sql, { language: props.dialect }).value
})
</script>
