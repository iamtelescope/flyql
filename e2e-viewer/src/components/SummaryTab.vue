<template>
  <div class="space-y-4">
    <!-- Top row: Total + Parity -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div
        class="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-5"
      >
        <div
          class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium mb-3"
        >
          Total Tests
        </div>
        <div class="text-3xl font-semibold text-gray-900 dark:text-white">
          {{ summary.total }}
        </div>
      </div>
      <div
        class="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-5"
      >
        <div
          class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium mb-3"
        >
          Passed
        </div>
        <div class="text-3xl font-semibold text-green-600 dark:text-green-400">
          {{ summary.passed }}
        </div>
      </div>
      <div
        class="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-5"
      >
        <div
          class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium mb-3"
        >
          Failed
        </div>
        <div
          class="text-3xl font-semibold"
          :class="
            summary.failed > 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-300 dark:text-gray-600'
          "
        >
          {{ summary.failed }}
        </div>
      </div>
    </div>

    <!-- Languages row -->
    <div>
      <div
        class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium mb-2"
      >
        By Language
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          v-for="(stats, lang) in summary.by_language"
          :key="lang"
          class="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4"
        >
          <img
            v-if="LANG_ICONS[lang]"
            :src="LANG_ICONS[lang]"
            :alt="langLabel(lang)"
            class="w-8 h-8 object-contain shrink-0"
          />
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ langLabel(lang) }}
            </div>
            <div class="flex items-baseline gap-2 mt-1">
              <span
                class="text-xl font-semibold text-green-600 dark:text-green-400"
                >{{ stats.passed }}</span
              >
              <span class="text-xs text-gray-400 dark:text-gray-500"
                >/ {{ stats.total }}</span
              >
              <span
                v-if="stats.failed > 0"
                class="text-xs text-red-600 dark:text-red-400 font-semibold"
                >{{ stats.failed }} failed</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Databases row -->
    <div>
      <div
        class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider font-medium mb-2"
      >
        By Database
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          v-for="(stats, db) in summary.by_database"
          :key="db"
          class="rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4"
        >
          <img
            v-if="dbIcon(db)"
            :src="dbIcon(db)"
            :alt="dbLabel(db)"
            class="w-8 h-8 object-contain shrink-0"
          />
          <div class="min-w-0">
            <div class="text-sm font-medium text-gray-700 dark:text-gray-300">
              {{ dbLabel(db) }}
            </div>
            <div class="flex items-baseline gap-2 mt-1">
              <span
                class="text-xl font-semibold text-green-600 dark:text-green-400"
                >{{ stats.passed }}</span
              >
              <span class="text-xs text-gray-400 dark:text-gray-500"
                >/ {{ stats.total }}</span
              >
              <span
                v-if="stats.failed > 0"
                class="text-xs text-red-600 dark:text-red-400 font-semibold"
                >{{ stats.failed }} failed</span
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Generated info -->
    <div v-if="generatedAt" class="text-xs text-gray-400 dark:text-gray-500">
      Generated: {{ generatedAt }}
      <span v-if="versions">
        |
        <span v-for="(v, k) in versions" :key="k" class="mr-2"
          >{{ k }}: {{ v }}</span
        >
      </span>
    </div>
  </div>
</template>

<script setup>
import {
  LANG_ICONS,
  DB_ICONS,
  DB_ICONS_DARK,
  langLabel,
  dbLabel,
} from "./labels.js";

const props = defineProps({
  summary: Object,
  generatedAt: String,
  versions: Object,
  isDark: Boolean,
});

function dbIcon(db) {
  if (props.isDark && DB_ICONS_DARK[db]) return DB_ICONS_DARK[db];
  return DB_ICONS[db];
}
</script>
