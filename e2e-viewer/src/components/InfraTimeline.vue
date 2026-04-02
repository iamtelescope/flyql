<template>
    <div v-if="steps && steps.length" class="mb-6">
        <h3 class="text-base font-semibold mb-2 cursor-pointer select-none" @click="expanded = !expanded">
            <i :class="expanded ? 'pi pi-chevron-down' : 'pi pi-chevron-right'" class="text-xs mr-1"></i>
            Infrastructure
            <i v-if="!hasProblems" class="pi pi-check-circle text-green-500 text-sm ml-1"></i>
            <i v-else class="pi pi-exclamation-triangle text-red-500 text-sm ml-1"></i>
        </h3>
        <DataTable v-show="expanded" :value="steps" size="small" stripedRows>
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
import { computed, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

const props = defineProps({
    steps: Array,
})

const hasProblems = computed(() => props.steps?.some((s) => !s.success))
const expanded = ref(hasProblems.value)
</script>
