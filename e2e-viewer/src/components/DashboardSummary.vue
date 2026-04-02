<template>
    <div class="mb-6">
        <div class="flex gap-4 mb-5">
            <div class="flex-1 p-5 rounded-lg bg-gray-50 border-l-4 border-blue-500 text-center">
                <div class="text-3xl font-bold">{{ summary.total }}</div>
                <div class="text-sm text-gray-500 mt-1">Total Tests</div>
            </div>
            <div class="flex-1 p-5 rounded-lg bg-gray-50 border-l-4 border-green-500 text-center">
                <div class="text-3xl font-bold text-green-600">{{ summary.passed }}</div>
                <div class="text-sm text-gray-500 mt-1">Passed</div>
            </div>
            <div
                class="flex-1 p-5 rounded-lg bg-gray-50 border-l-4 text-center"
                :class="summary.failed > 0 ? 'border-red-500' : 'border-green-500'"
            >
                <div class="text-3xl font-bold" :class="summary.failed > 0 ? 'text-red-600' : 'text-green-600'">
                    {{ summary.failed }}
                </div>
                <div class="text-sm text-gray-500 mt-1">Failed</div>
            </div>
            <div
                v-if="summary.parity"
                class="flex-1 p-5 rounded-lg bg-gray-50 border-l-4 text-center"
                :class="summary.parity.mismatched > 0 ? 'border-red-500' : 'border-green-500'"
            >
                <div
                    class="text-3xl font-bold"
                    :class="summary.parity.mismatched > 0 ? 'text-red-600' : 'text-green-600'"
                >
                    {{ summary.parity.matching }}/{{ summary.parity.total_groups }}
                </div>
                <div class="text-sm text-gray-500 mt-1">SQL Parity</div>
            </div>
        </div>

        <div class="flex gap-8 mb-4">
            <div>
                <h3 class="text-sm text-gray-500 mb-2">By Language</h3>
                <div class="flex gap-3 flex-wrap">
                    <div v-for="(stats, lang) in summary.by_language" :key="lang" class="flex items-center gap-1.5">
                        <Tag :value="lang" severity="info" />
                        <span class="text-green-600 font-semibold">{{ stats.passed }}</span>
                        <span v-if="stats.failed > 0" class="text-red-600 font-semibold"
                            >/ {{ stats.failed }} failed</span
                        >
                    </div>
                </div>
            </div>
            <div>
                <h3 class="text-sm text-gray-500 mb-2">By Database</h3>
                <div class="flex gap-3 flex-wrap">
                    <div v-for="(stats, db) in summary.by_database" :key="db" class="flex items-center gap-1.5">
                        <Tag :value="db" :severity="dbSeverity(db)" />
                        <span class="text-green-600 font-semibold">{{ stats.passed }}</span>
                        <span v-if="stats.failed > 0" class="text-red-600 font-semibold"
                            >/ {{ stats.failed }} failed</span
                        >
                    </div>
                </div>
            </div>
        </div>

        <div v-if="generatedAt" class="text-xs text-gray-400">
            Generated: {{ generatedAt }}
            <span v-if="versions">
                | <span v-for="(v, k) in versions" :key="k" class="mr-2">{{ k }}: {{ v }}</span>
            </span>
        </div>
    </div>
</template>

<script setup>
import Tag from 'primevue/tag'

defineProps({
    summary: Object,
    generatedAt: String,
    versions: Object,
})

const DB_COLORS = { clickhouse: 'warn', postgresql: 'info', starrocks: 'success', matcher: 'secondary' }
function dbSeverity(db) {
    return DB_COLORS[db] || 'info'
}
</script>
