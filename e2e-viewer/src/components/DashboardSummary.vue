<template>
    <div class="mb-6">
        <div class="flex gap-8 mb-4 items-end">
            <div>
                <h3 class="text-sm text-gray-500 mb-2">Total</h3>
                <div class="flex items-center gap-3">
                    <span class="font-semibold">{{ summary.total }}</span>
                    <span class="text-green-600 font-semibold">{{ summary.passed }} passed</span>
                    <span v-if="summary.failed > 0" class="text-red-600 font-semibold"
                        >{{ summary.failed }} failed</span
                    >
                    <span
                        v-if="summary.parity"
                        class="text-sm"
                        :class="summary.parity.mismatched > 0 ? 'text-red-600' : 'text-gray-500'"
                    >
                        parity {{ summary.parity.matching }}/{{ summary.parity.total_groups }}
                    </span>
                </div>
            </div>
            <div>
                <h3 class="text-sm text-gray-500 mb-2">By Language</h3>
                <div class="flex gap-4 flex-wrap">
                    <div v-for="(stats, lang) in summary.by_language" :key="lang" class="flex items-center gap-2">
                        <img v-if="LANG_ICONS[lang]" :src="LANG_ICONS[lang]" :alt="langLabel(lang)" class="icon" />
                        <span class="text-sm font-medium">{{ langLabel(lang) }}</span>
                        <span class="text-green-600 font-semibold">{{ stats.passed }}</span>
                        <span v-if="stats.failed > 0" class="text-red-600 font-semibold">/ {{ stats.failed }}</span>
                    </div>
                </div>
            </div>
            <div>
                <h3 class="text-sm text-gray-500 mb-2">By Database</h3>
                <div class="flex gap-4 flex-wrap">
                    <div v-for="(stats, db) in summary.by_database" :key="db" class="flex items-center gap-2">
                        <img v-if="DB_ICONS[db]" :src="DB_ICONS[db]" :alt="dbLabel(db)" class="icon" />
                        <span class="text-sm font-medium">{{ dbLabel(db) }}</span>
                        <span class="text-green-600 font-semibold">{{ stats.passed }}</span>
                        <span v-if="stats.failed > 0" class="text-red-600 font-semibold">/ {{ stats.failed }}</span>
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
import { LANG_ICONS, DB_ICONS, langLabel, dbLabel } from './labels.js'

defineProps({
    summary: Object,
    generatedAt: String,
    versions: Object,
})
</script>

<style scoped>
.icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
}
</style>
