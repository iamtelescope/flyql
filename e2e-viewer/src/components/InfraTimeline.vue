<template>
    <div v-if="steps && steps.length" class="mb-6">
        <h3 class="text-base font-semibold mb-2">Infrastructure</h3>
        <DataTable :value="steps" size="small" stripedRows>
            <Column header="" style="width: 40px">
                <template #body="{ data }">
                    <i
                        :class="data.success ? 'pi pi-check-circle text-green-500' : 'pi pi-times-circle text-red-500'"
                    />
                </template>
            </Column>
            <Column field="name" header="Step" />
            <Column field="duration" header="Duration" style="width: 100px" />
            <Column field="detail" header="Detail" />
        </DataTable>
    </div>
</template>

<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

defineProps({
    steps: Array,
})
</script>
