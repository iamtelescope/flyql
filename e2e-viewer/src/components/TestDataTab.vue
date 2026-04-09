<template>
  <div
    class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800"
  >
    <div
      class="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 cursor-pointer select-none"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <svg
          class="w-3 h-3 text-gray-400 transition-transform"
          :class="{ 'rotate-90': expanded }"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M6 4l8 6-8 6V4z" />
        </svg>
        <span
          class="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider"
          >{{ title }}</span
        >
        <span class="text-xs text-gray-400 dark:text-gray-500"
          >({{ rows.length }} rows)</span
        >
      </div>
    </div>
    <div v-show="expanded" class="overflow-x-auto">
      <table class="w-full text-xs font-mono">
        <thead
          class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
        >
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              class="text-left px-3 py-2 font-medium whitespace-nowrap"
            >
              <div>{{ col }}</div>
              <div
                v-if="columnTypes && columnTypes[col]"
                class="text-[10px] leading-tight mt-1 font-normal"
              >
                <div
                  v-for="(type, dialect) in columnTypes[col]"
                  :key="dialect"
                  class="whitespace-nowrap"
                >
                  <span class="text-gray-400">{{ type }}</span> | {{ dialect }}
                </div>
              </div>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          <tr
            v-for="(row, ri) in rows"
            :key="ri"
            class="bg-white dark:bg-gray-950"
          >
            <td
              v-for="col in columns"
              :key="col"
              class="px-3 py-2 whitespace-nowrap"
            >
              <span
                v-if="row[col] === null"
                class="text-gray-400 dark:text-gray-500 italic"
                >null</span
              >
              <span
                v-else-if="row[col] === ''"
                class="text-gray-400 dark:text-gray-500 italic"
                >empty</span
              >
              <span
                v-else-if="typeof row[col] === 'boolean'"
                class="text-red-600 dark:text-red-400"
                >{{ row[col] }}</span
              >
              <span
                v-else-if="typeof row[col] === 'number'"
                class="text-blue-600 dark:text-blue-400"
                >{{ row[col] }}</span
              >
              <span
                v-else-if="isJsonColumn(col)"
                class="text-gray-500 dark:text-gray-400 text-[11px]"
                >{{ formatJson(row[col]) }}</span
              >
              <span v-else class="text-gray-700 dark:text-gray-300">{{
                row[col]
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";

const JSON_COLUMNS = new Set(["meta_json", "tags", "metadata"]);

const props = defineProps({
  title: { type: String, default: "Test Data" },
  rows: Array,
  columnTypes: Object,
});

const expanded = ref(true);

function isJsonColumn(col) {
  return JSON_COLUMNS.has(col);
}

function formatJson(val) {
  if (typeof val === "string") {
    try {
      return JSON.stringify(JSON.parse(val), null, 2);
    } catch {
      return val;
    }
  }
  return JSON.stringify(val, null, 2);
}

const columns = computed(() => {
  if (!props.rows || !props.rows.length) return [];
  const rowKeys = Object.keys(props.rows[0]);
  const typeKeys = props.columnTypes ? Object.keys(props.columnTypes) : [];
  return [...rowKeys, ...typeKeys.filter((k) => !rowKeys.includes(k))];
});
</script>
