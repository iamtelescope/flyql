<template>
    <div class="w-full px-6 py-4">
        <header class="mb-5">
            <h1 class="text-xl font-semibold">FlyQL E2E Test Report</h1>
        </header>

        <main>
            <div v-if="error" class="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 flex items-center gap-2">
                <i class="pi pi-exclamation-triangle" />
                {{ error }}
            </div>

            <div v-if="loading" class="text-center py-12 text-gray-400">
                <i class="pi pi-spin pi-spinner text-3xl" />
                <p class="mt-2">Loading report...</p>
            </div>

            <template v-if="report">
                <DashboardSummary
                    :summary="report.summary"
                    :generated-at="report.generated_at"
                    :versions="report.versions"
                />
                <InfraTimeline :steps="report.infrastructure" />
                <TestData
                    v-if="report.test_data"
                    :rows="report.test_data.rows"
                    :column-types="report.test_data.column_types"
                />
                <TestResultsTable
                    :results="indexedResults"
                    :test-data-rows="report.test_data ? report.test_data.rows : []"
                />
            </template>
        </main>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchReport } from './api.js'
import DashboardSummary from './components/DashboardSummary.vue'
import InfraTimeline from './components/InfraTimeline.vue'
import TestData from './components/TestData.vue'
import TestResultsTable from './components/TestResultsTable.vue'

const report = ref(null)
const loading = ref(true)
const error = ref(null)

const indexedResults = computed(() => {
    if (!report.value?.results) return []
    return report.value.results.map((r, i) => ({ ...r, __id: i }))
})

onMounted(async () => {
    try {
        report.value = await fetchReport()
    } catch (err) {
        error.value = err.message
    } finally {
        loading.value = false
    }
})
</script>
