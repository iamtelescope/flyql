<template>
    <div class="text-xs font-mono">
        <h3 class="text-base font-semibold mb-2">
            Test Results
            <span class="text-sm font-normal text-gray-500">({{ results.length }} rows)</span>
        </h3>
        <DataTable
            :value="results"
            v-model:filters="filters"
            v-model:expandedRows="expandedRows"
            filterDisplay="row"
            scrollable
            scrollHeight="flex"
            size="small"
            dataKey="__id"
        >
            <Column expander style="width: 40px" />

            <Column field="passed" header="Status" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">
                    <StatusBadge :passed="data.passed" />
                </template>
                <template #filter="{ filterModel, filterCallback }">
                    <MultiSelect
                        v-model="filterModel.value"
                        :options="statusOptions"
                        optionLabel="label"
                        optionValue="value"
                        placeholder="All"
                        @change="filterCallback()"
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="language" header="Lang" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">
                    <span v-if="data.language === 'all'" class="font-semibold text-green-700">all</span>
                    <span v-else>{{ langLabel(data.language) }}</span>
                </template>
                <template #filter="{ filterModel, filterCallback }">
                    <MultiSelect
                        v-model="filterModel.value"
                        :options="languageOptions"
                        placeholder="All"
                        @change="filterCallback()"
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="database" header="DB" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">
                    <span style="white-space: nowrap"
                        ><img
                            v-if="DB_ICONS[data.database]"
                            :src="DB_ICONS[data.database]"
                            style="
                                width: 14px;
                                height: 14px;
                                display: inline;
                                vertical-align: middle;
                                margin-right: 4px;
                            "
                        />{{ dbLabel(data.database) }}</span
                    >
                </template>
                <template #filter="{ filterModel, filterCallback }">
                    <MultiSelect
                        v-model="filterModel.value"
                        :options="databaseOptions"
                        placeholder="All"
                        @change="filterCallback()"
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="kind" header="Kind" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">{{ data.kind }}</template>
                <template #filter="{ filterModel, filterCallback }">
                    <MultiSelect
                        v-model="filterModel.value"
                        :options="kindOptions"
                        placeholder="All"
                        @change="filterCallback()"
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="name" header="Test" :showFilterMenu="false" :sortable="true">
                <template #filter="{ filterModel, filterCallback }">
                    <InputText
                        v-model="filterModel.value"
                        @input="filterCallback()"
                        placeholder="Filter..."
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="flyql" header="FlyQL" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">
                    <code class="font-mono" v-html="highlightFlyql(data.flyql, data.kind)"></code>
                </template>
                <template #filter="{ filterModel, filterCallback }">
                    <InputText
                        v-model="filterModel.value"
                        @input="filterCallback()"
                        placeholder="Filter..."
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="sql" header="Generated SQL" :showFilterMenu="false" :sortable="true">
                <template #body="{ data }">
                    <span v-if="!data.sql || data.sql === '(in-memory)'" class="text-gray-400 italic font-mono">{{
                        data.sql
                    }}</span>
                    <code v-else class="font-mono" v-html="highlightSql(data.sql, data.database)"></code>
                </template>
                <template #filter="{ filterModel, filterCallback }">
                    <InputText
                        v-model="filterModel.value"
                        @input="filterCallback()"
                        placeholder="Filter..."
                        size="small"
                        class="text-xs"
                    />
                </template>
            </Column>

            <Column field="error" header="Error">
                <template #body="{ data }">
                    <span v-if="data.error" class="text-red-500 italic">{{ data.error }}</span>
                </template>
            </Column>

            <template #expansion="{ data }">
                <div class="px-4 py-3">
                    <h4 class="text-xs font-semibold text-gray-500 uppercase mb-2">Test Data</h4>
                    <table class="w-full text-xs border-collapse">
                        <thead>
                            <tr>
                                <th
                                    v-for="col in testDataColumns"
                                    :key="col"
                                    class="border border-gray-200 px-2 py-1 bg-gray-50 text-left font-semibold"
                                >
                                    {{ col }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in testDataRows" :key="row.id" :class="rowClass(row, data)">
                                <td v-for="col in testDataColumns" :key="col" class="border border-gray-200 px-2 py-1">
                                    <span v-if="row[col] === null" class="text-gray-400 italic">null</span>
                                    <span v-else-if="row[col] === ''" class="text-gray-400 italic">empty</span>
                                    <span v-else-if="typeof row[col] === 'boolean'">{{ row[col] }}</span>
                                    <span v-else>{{ row[col] }}</span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </DataTable>
    </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import MultiSelect from 'primevue/multiselect'
import InputText from 'primevue/inputtext'
import StatusBadge from './StatusBadge.vue'
import hljs from 'highlight.js/lib/core'
import pgsql from 'highlight.js/lib/languages/pgsql'
import mysql from 'highlight.js/lib/languages/sql'
import { highlight } from '../../../javascript/src/highlight.js'

hljs.registerLanguage('pgsql', pgsql)
hljs.registerLanguage('mysql', mysql)
import '../../../javascript/src/editor/flyql.css'
import { DB_ICONS, dbLabel, langLabel } from './labels.js'

function highlightFlyql(text, kind) {
    if (!text) return ''
    return highlight(text, { mode: kind === 'select' ? 'columns' : 'query' })
}

const props = defineProps({
    results: Array,
    testDataRows: Array,
})

const expandedRows = ref([])

const testDataColumns = computed(() => {
    if (!props.testDataRows || !props.testDataRows.length) return []
    return Object.keys(props.testDataRows[0])
})

function rowClass(row, testResult) {
    const expectedIds = testResult.expected || []
    const actualIds = testResult.actual || []
    const id = row.id

    const isExpected = expectedIds.includes(id)
    const isReturned = actualIds.includes(id)

    if (isExpected && isReturned) return 'bg-green-50'
    if (isReturned && !isExpected) return 'bg-red-100'
    if (isExpected && !isReturned) return 'bg-yellow-50'
    return ''
}

const filters = ref({
    passed: { value: null, matchMode: 'in' },
    language: { value: null, matchMode: 'in' },
    database: { value: null, matchMode: 'in' },
    kind: { value: null, matchMode: 'in' },
    name: { value: null, matchMode: 'contains' },
    flyql: { value: null, matchMode: 'contains' },
    sql: { value: null, matchMode: 'contains' },
})

const statusOptions = [
    { label: 'Passed', value: true },
    { label: 'Failed', value: false },
]

const SQL_DIALECT = {
    postgresql: 'pgsql',
    clickhouse: 'mysql',
    starrocks: 'mysql',
}

function highlightSql(sql, database) {
    if (!sql) return ''
    const lang = SQL_DIALECT[database] || 'mysql'
    return hljs.highlight(sql, { language: lang }).value
}

const languageOptions = computed(() => [...new Set(props.results.map((r) => r.language))].sort())
const databaseOptions = computed(() => [...new Set(props.results.map((r) => r.database))].sort())
const kindOptions = computed(() => [...new Set(props.results.map((r) => r.kind))].sort())
</script>

<style scoped>
:deep(.p-datatable input),
:deep(.p-datatable .p-multiselect),
:deep(.p-datatable .p-multiselect-label) {
    font-family: ui-sans-serif, system-ui, sans-serif;
}
</style>
