<template>
    <div v-if="rows && rows.length" class="mb-6">
        <h3 class="text-base font-semibold mb-2 cursor-pointer select-none" @click="expanded = !expanded">
            <i :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-xs mr-1"></i>
            {{ title }} ({{ rows.length }} rows)
        </h3>
        <DataTable v-show="expanded" :value="rows" size="small" class="text-sm" scrollable>
            <Column v-for="col in columns" :key="col" :field="col">
                <template #header>
                    <div>
                        <div class="font-semibold">{{ col }}</div>
                        <div v-if="columnTypes && columnTypes[col]" class="text-xs leading-tight mt-1">
                            <div v-for="(type, dialect) in columnTypes[col]" :key="dialect" class="whitespace-nowrap">
                                <code class="font-mono">{{ type }}</code> | {{ dialect }}
                            </div>
                        </div>
                    </div>
                </template>
                <template #body="{ data }">
                    <code v-if="data[col] === null" class="td-null">null</code>
                    <code v-else-if="data[col] === ''" class="td-null">empty</code>
                    <code v-else-if="typeof data[col] === 'boolean'" class="td-boolean">{{ data[col] }}</code>
                    <code v-else-if="typeof data[col] === 'number'" class="td-number">{{ data[col] }}</code>
                    <code v-else-if="isJsonColumn(col)" class="td-json" v-html="highlightJson(data[col])"></code>
                    <code v-else class="td-string">{{ data[col] }}</code>
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import hljs from 'highlight.js/lib/core'
import json from 'highlight.js/lib/languages/json'

hljs.registerLanguage('json', json)

const expanded = ref(false)

const JSON_COLUMNS = new Set(['meta_json', 'tags', 'metadata'])

const props = defineProps({
    title: { type: String, default: 'Test Data' },
    rows: Array,
    columnTypes: Object,
})

function isJsonColumn(col) {
    return JSON_COLUMNS.has(col)
}

function highlightJson(val) {
    const obj = typeof val === 'string' ? JSON.parse(val) : val
    const str = JSON.stringify(obj, null, 2)
    return hljs.highlight(str, { language: 'json' }).value
}

const columns = computed(() => {
    if (!props.rows || !props.rows.length) return []
    const rowKeys = Object.keys(props.rows[0])
    const typeKeys = props.columnTypes ? Object.keys(props.columnTypes) : []
    return [...rowKeys, ...typeKeys.filter((k) => !rowKeys.includes(k))]
})
</script>

<style scoped>
:deep(.p-datatable td),
:deep(.p-datatable th) {
    border-right: 1px solid #e5e7eb;
    white-space: nowrap;
}
code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 0.8rem;
    background: none;
    padding: 0;
}
.td-null {
    color: #6a737d;
    font-style: italic;
}
.td-string {
    color: #032f62;
}
.td-boolean {
    color: #d73a49;
}
.td-number {
    color: #005cc5;
}
.td-json {
    font-size: 0.75rem;
    white-space: pre;
}
</style>
