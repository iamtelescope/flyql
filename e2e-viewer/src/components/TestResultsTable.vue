<template>
    <div class="text-sm">
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
                    <span v-else>{{ data.language }}</span>
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
                <template #body="{ data }">{{ data.database }}</template>
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

            <Column field="flyql" header="FlyQL" :showFilterMenu="false">
                <template #body="{ data }">
                    <code class="font-mono">{{ data.flyql }}</code>
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

            <Column field="sql" header="Generated SQL" :showFilterMenu="false">
                <template #body="{ data }">
                    <code class="font-mono" v-html="highlightSql(data.sql)"></code>
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

            <Column field="expected" header="Expected IDs">
                <template #body="{ data }">
                    <code class="font-mono text-xs">{{ formatIds(data.expected) }}</code>
                </template>
            </Column>

            <Column field="actual" header="Returned IDs">
                <template #body="{ data }">
                    <code class="font-mono text-xs" :class="{ 'text-red-500 font-semibold': !data.passed }">{{
                        formatIds(data.actual)
                    }}</code>
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
import Prism from 'prismjs'
import 'prismjs/components/prism-sql'

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

function formatIds(val) {
    if (val == null) return ''
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
}

function highlightSql(sql) {
    if (!sql) return ''
    return Prism.highlight(sql, Prism.languages.sql, 'sql')
}

const languageOptions = computed(() => [...new Set(props.results.map((r) => r.language))].sort())
const databaseOptions = computed(() => [...new Set(props.results.map((r) => r.database))].sort())
const kindOptions = computed(() => [...new Set(props.results.map((r) => r.kind))].sort())
</script>
