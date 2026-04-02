<template>
    <div v-if="rows && rows.length" class="mb-6">
        <h3 class="text-base font-semibold mb-2">Test Data ({{ rows.length }} rows)</h3>
        <DataTable :value="rows" size="small" class="text-sm" scrollable>
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
                    <span v-if="data[col] === null" class="text-gray-400 italic">null</span>
                    <span v-else-if="data[col] === ''" class="text-gray-400 italic">empty</span>
                    <span v-else-if="typeof data[col] === 'boolean'">{{ data[col] }}</span>
                    <span v-else>{{ data[col] }}</span>
                </template>
            </Column>
        </DataTable>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

const props = defineProps({
    rows: Array,
    columnTypes: Object,
})

const columns = computed(() => {
    if (!props.rows || !props.rows.length) return []
    return Object.keys(props.rows[0])
})
</script>
