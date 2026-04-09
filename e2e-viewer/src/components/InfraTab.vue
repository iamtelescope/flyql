<template>
  <div
    class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800"
  >
    <div
      class="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-800"
    >
      <span
        class="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-wider"
        >Infrastructure</span
      >
      <span v-if="!hasProblems" class="text-green-500">
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </span>
      <span v-else class="text-red-500">
        <svg
          class="w-4 h-4"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </span>
    </div>
    <div class="overflow-x-auto">
      <table class="w-full text-xs font-mono">
        <thead
          class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
        >
          <tr>
            <th class="text-left px-3 py-2 font-medium w-10"></th>
            <th class="text-left px-3 py-2 font-medium">Step</th>
            <th class="text-left px-3 py-2 font-medium w-24">Duration</th>
            <th class="text-left px-3 py-2 font-medium">Detail</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          <tr
            v-for="(step, i) in steps"
            :key="i"
            class="bg-white dark:bg-gray-950"
          >
            <td class="px-3 py-2">
              <span v-if="step.success" class="text-green-500">
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </span>
              <span v-else class="text-red-500">
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="3"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </span>
            </td>
            <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
              {{ step.name }}
            </td>
            <td class="px-3 py-2 text-gray-500 dark:text-gray-400">
              {{ step.duration }}
            </td>
            <td class="px-3 py-2 text-gray-500 dark:text-gray-400">
              {{ step.detail }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  steps: Array,
});

const hasProblems = computed(() => props.steps?.some((s) => !s.success));
</script>
