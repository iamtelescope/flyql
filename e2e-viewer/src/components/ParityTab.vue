<template>
  <div
    class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800"
  >
    <div class="p-6">
      <div v-if="parity" class="flex items-center gap-4 mb-4">
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >Total groups:</span
          >
          <span class="font-semibold text-gray-900 dark:text-white">{{
            parity.total_groups
          }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >Matching:</span
          >
          <span class="font-semibold text-green-600 dark:text-green-400">{{
            parity.matching
          }}</span>
        </div>
        <div v-if="parity.mismatched > 0" class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >Mismatched:</span
          >
          <span class="font-semibold text-red-600 dark:text-red-400">{{
            parity.mismatched
          }}</span>
        </div>
        <div v-if="parity.not_implemented > 0" class="flex items-center gap-2">
          <span class="text-sm font-medium text-gray-700 dark:text-gray-300"
            >Not implemented:</span
          >
          <span class="font-semibold text-yellow-600 dark:text-yellow-400">{{
            parity.not_implemented
          }}</span>
        </div>
      </div>

      <div
        v-if="
          sqlParity &&
          sqlParity.not_implemented &&
          sqlParity.not_implemented.length
        "
        class="mb-6"
      >
        <h4
          class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"
        >
          Not Implemented
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full text-xs font-mono">
            <thead
              class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
            >
              <tr>
                <th class="text-left px-3 py-2 font-medium">Test</th>
                <th class="text-left px-3 py-2 font-medium">FlyQL</th>
                <th class="text-left px-3 py-2 font-medium">Databases</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="(item, i) in sqlParity.not_implemented" :key="i">
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {{ item.name }}
                </td>
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {{ item.flyql }}
                </td>
                <td class="px-3 py-2 text-gray-500 dark:text-gray-400">
                  {{ (item.databases || []).join(", ") }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="sqlParity && sqlParity.details && sqlParity.details.length"
        class="mb-4"
      >
        <h4
          class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2"
        >
          Mismatches
        </h4>
        <div class="overflow-x-auto">
          <table class="w-full text-xs font-mono">
            <thead
              class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
            >
              <tr>
                <th class="text-left px-3 py-2 font-medium">Test</th>
                <th class="text-left px-3 py-2 font-medium">FlyQL</th>
                <th class="text-left px-3 py-2 font-medium">Details</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              <tr v-for="(item, i) in sqlParity.details" :key="i">
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {{ item.name }}
                </td>
                <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                  {{ item.flyql }}
                </td>
                <td class="px-3 py-2 text-gray-500 dark:text-gray-400">
                  <div v-for="(result, db) in item.results" :key="db">
                    <span class="font-semibold">{{ db }}:</span>
                    {{ JSON.stringify(result) }}
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div
        v-if="
          !sqlParity ||
          (!sqlParity.details?.length && !sqlParity.not_implemented?.length)
        "
        class="text-sm text-gray-500 dark:text-gray-400"
      >
        <span
          v-if="parity && parity.mismatched === 0"
          class="text-green-600 dark:text-green-400 font-medium"
          >All SQL outputs match across databases.</span
        >
        <span v-else>No parity data available.</span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  parity: Object,
  sqlParity: Object,
});
</script>
