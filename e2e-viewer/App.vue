<template>
  <div class="min-h-screen w-full bg-white dark:bg-[#1C1C1C] flex flex-col">
    <Navbar :isDark="isDark" @toggle-dark="toggleDark" />

    <!-- Main -->
    <main class="flex-1">
      <div class="px-4 lg:px-6 pt-16 lg:pt-20 pb-10 lg:pb-16">
        <!-- Error -->
        <div
          v-if="error"
          class="rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-4 py-3 mb-4 text-sm"
        >
          {{ error }}
        </div>

        <!-- Loading -->
        <div
          v-if="loading"
          class="text-center py-12 text-gray-400 dark:text-gray-500"
        >
          <p class="text-sm">Loading report...</p>
        </div>

        <template v-if="report">
          <!-- Tab bar -->
          <div class="flex gap-1 mb-3">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              class="px-4 py-2 text-xs font-medium rounded-t-md transition-colors border-b-2 cursor-pointer"
              :class="
                activeTab === tab.key
                  ? 'border-green-600 dark:border-emerald-500 text-gray-900 dark:text-white'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              "
              @click="activeTab = tab.key"
            >
              {{ tab.label }}
            </button>
          </div>

          <!-- Summary + SQL Parity + Infrastructure -->
          <div v-if="activeTab === 'summary'" class="space-y-4">
            <SummaryTab
              :summary="report.summary"
              :generatedAt="report.generated_at"
              :versions="report.versions"
              :isDark="isDark"
            />
            <ParityTab
              :parity="report.summary?.parity"
              :sqlParity="report.sql_parity"
            />
            <InfraTab :steps="report.infrastructure" />
          </div>

          <!-- Test Data -->
          <div v-if="activeTab === 'data'" class="space-y-4">
            <TestDataTab
              v-if="report.test_data"
              title="Test Data — flyql_e2e_test"
              :rows="report.test_data.rows"
              :columnTypes="report.test_data.column_types"
            />
            <TestDataTab
              v-if="
                report.test_data &&
                report.test_data.related_rows &&
                report.test_data.related_rows.length
              "
              title="Test Data — flyql_e2e_related (JOIN)"
              :rows="report.test_data.related_rows"
            />
          </div>

          <!-- Test Results -->
          <ResultsTab
            v-if="activeTab === 'results'"
            :results="indexedResults"
            :testDataRows="report.test_data ? report.test_data.rows : []"
            :relatedDataRows="
              report.test_data && report.test_data.related_rows
                ? report.test_data.related_rows
                : []
            "
            :isDark="isDark"
          />
        </template>
      </div>
    </main>

    <!-- Footer -->
    <footer class="w-full border-t border-gray-200 dark:border-gray-800">
      <div class="px-2 lg:px-6 py-8 flex justify-center items-center">
        <div class="text-sm text-gray-400 dark:text-gray-500">
          &copy; 2026 FlyQL &middot;&nbsp;<a
            href="https://opensource.org/licenses/MIT"
            target="_blank"
            rel="noopener"
            class="hover:text-gray-900 dark:hover:text-white transition-colors"
            >MIT License</a
          >
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import "@fontsource/inter";
import "@fontsource/inter/500.css";
import "./src/main.css";

import { ref, computed, onMounted } from "vue";
import { fetchReport } from "./src/api.js";
import Navbar from "./src/components/Navbar.vue";
import SummaryTab from "./src/components/SummaryTab.vue";
import InfraTab from "./src/components/InfraTab.vue";
import TestDataTab from "./src/components/TestDataTab.vue";
import ParityTab from "./src/components/ParityTab.vue";
import ResultsTab from "./src/components/ResultsTab.vue";

const isDark = ref(localStorage.getItem("flyql-dark") === "true");
if (isDark.value) {
  document.documentElement.classList.add("dark", "flyql-dark");
}

const report = ref(null);
const loading = ref(true);
const error = ref(null);
const activeTab = ref("summary");

const tabs = [
  { key: "summary", label: "Summary" },
  { key: "data", label: "Test Data" },
  { key: "results", label: "Test Results" },
];

const indexedResults = computed(() => {
  if (!report.value?.results) return [];
  return report.value.results.map((r, i) => ({ ...r, __id: i }));
});

function toggleDark() {
  isDark.value = !isDark.value;
  localStorage.setItem("flyql-dark", isDark.value);
  document.documentElement.classList.toggle("dark", isDark.value);
  document.documentElement.classList.toggle("flyql-dark", isDark.value);
}

onMounted(async () => {
  try {
    report.value = await fetchReport();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
});
</script>
