<template>
  <div
    class="rounded-lg bg-white dark:bg-gray-950 overflow-hidden border border-gray-200 dark:border-gray-800"
  >
    <!-- Filters -->
    <div
      class="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex flex-wrap gap-3 items-center"
    >
      <input
        v-model="searchText"
        type="text"
        placeholder="Search test name or FlyQL..."
        class="px-2 py-1 text-xs font-mono rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white w-64 focus:outline-none focus:border-green-500"
      />
      <select
        v-model="filterStatus"
        class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        <option value="">All statuses</option>
        <option value="passed">Passed</option>
        <option value="failed">Failed</option>
      </select>
      <select
        v-model="filterLanguage"
        class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        <option value="">All languages</option>
        <option v-for="lang in languageOptions" :key="lang" :value="lang">
          {{ langLabel(lang) }}
        </option>
      </select>
      <select
        v-model="filterDatabase"
        class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        <option value="">All databases</option>
        <option v-for="db in databaseOptions" :key="db" :value="db">
          {{ dbLabel(db) }}
        </option>
      </select>
      <select
        v-model="filterKind"
        class="px-2 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 cursor-pointer"
      >
        <option value="">All kinds</option>
        <option v-for="kind in kindOptions" :key="kind" :value="kind">
          {{ kind }}
        </option>
      </select>
      <button
        v-if="hasActiveFilters"
        @click="clearFilters"
        class="px-2 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 cursor-pointer"
      >
        Clear filters
      </button>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-xs font-mono">
        <thead
          class="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400"
        >
          <tr>
            <th class="text-left px-3 py-2 font-medium w-8"></th>
            <th
              class="text-left px-3 py-2 font-medium w-16 cursor-pointer select-none"
              @click="toggleSort('passed')"
            >
              Status
              <span v-if="sortField === 'passed'" class="text-gray-400">{{
                sortAsc ? "↑" : "↓"
              }}</span>
            </th>
            <th
              class="text-left px-3 py-2 font-medium cursor-pointer select-none"
              @click="toggleSort('language')"
            >
              Lang
              <span v-if="sortField === 'language'" class="text-gray-400">{{
                sortAsc ? "↑" : "↓"
              }}</span>
            </th>
            <th
              class="text-left px-3 py-2 font-medium cursor-pointer select-none"
              @click="toggleSort('database')"
            >
              DB
              <span v-if="sortField === 'database'" class="text-gray-400">{{
                sortAsc ? "↑" : "↓"
              }}</span>
            </th>
            <th
              class="text-left px-3 py-2 font-medium cursor-pointer select-none"
              @click="toggleSort('kind')"
            >
              Kind
              <span v-if="sortField === 'kind'" class="text-gray-400">{{
                sortAsc ? "↑" : "↓"
              }}</span>
            </th>
            <th
              class="text-left px-3 py-2 font-medium cursor-pointer select-none"
              @click="toggleSort('name')"
            >
              Test
              <span v-if="sortField === 'name'" class="text-gray-400">{{
                sortAsc ? "↑" : "↓"
              }}</span>
            </th>
            <th class="text-left px-3 py-2 font-medium">FlyQL</th>
            <th class="text-left px-3 py-2 font-medium">Generated SQL</th>
            <th class="text-left px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          <template v-for="row in filteredResults" :key="row.__id">
            <tr
              class="cursor-pointer bg-white dark:bg-gray-950 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
              @click="toggleExpand(row.__id)"
            >
              <td class="px-3 py-2">
                <svg
                  class="w-3 h-3 text-gray-400 transition-transform"
                  :class="{ 'rotate-90': expandedRows[row.__id] }"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M6 4l8 6-8 6V4z" />
                </svg>
              </td>
              <td class="px-3 py-2">
                <span
                  class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                  :class="
                    row.passed
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                  "
                >
                  {{ row.passed ? "PASS" : "FAIL" }}
                </span>
              </td>
              <td class="px-3 py-2">
                <span
                  v-if="row.language === 'all'"
                  class="font-semibold text-green-700 dark:text-green-400"
                  >all</span
                >
                <span v-else class="text-gray-700 dark:text-gray-300">{{
                  langLabel(row.language)
                }}</span>
              </td>
              <td
                class="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300"
              >
                <img
                  v-if="dbIcon(row.database)"
                  :src="dbIcon(row.database)"
                  class="w-3.5 h-3.5 inline align-middle mr-1"
                />{{ dbLabel(row.database) }}
              </td>
              <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                {{ row.kind }}
              </td>
              <td class="px-3 py-2 text-gray-700 dark:text-gray-300">
                {{ row.name }}
              </td>
              <td class="px-3 py-2">
                <code
                  class="font-mono"
                  v-html="highlightFlyql(row.flyql, row.kind)"
                ></code>
              </td>
              <td class="px-3 py-2">
                <span
                  v-if="!row.sql || row.sql === '(in-memory)'"
                  class="text-gray-400 dark:text-gray-500 italic"
                  >{{ row.sql }}</span
                >
                <code
                  v-else
                  class="font-mono"
                  v-html="highlightSQL(row.sql)"
                ></code>
              </td>
              <td class="px-3 py-2">
                <span v-if="row.error" class="text-red-500 italic">{{
                  row.error
                }}</span>
              </td>
            </tr>

            <!-- Expansion row -->
            <tr v-if="expandedRows[row.__id]">
              <td :colspan="9" class="px-6 py-4 bg-gray-50 dark:bg-gray-900/30">
                <!-- SELECT tests: expected vs actual rows -->
                <template v-if="row.kind === 'select'">
                  <div class="flex gap-6">
                    <div class="flex-1">
                      <h4
                        class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2"
                      >
                        Expected Rows
                      </h4>
                      <table
                        v-if="row.expected && row.expected.length"
                        class="w-full text-xs border-collapse"
                      >
                        <tbody>
                          <tr
                            v-for="(r, ri) in row.expected"
                            :key="ri"
                            :class="selectRowClass(ri, row)"
                          >
                            <td
                              v-for="(cell, ci) in r"
                              :key="ci"
                              class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-700 dark:text-gray-300"
                            >
                              <span
                                v-if="cell === '' || cell === null"
                                class="text-gray-400 italic"
                                >{{ cell === null ? "null" : "empty" }}</span
                              >
                              <span v-else>{{ cell }}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <span
                        v-else
                        class="text-gray-400 dark:text-gray-500 italic text-xs"
                        >No rows</span
                      >
                    </div>
                    <div class="flex-1">
                      <h4
                        class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2"
                      >
                        Actual Rows
                      </h4>
                      <table
                        v-if="row.actual && row.actual.length"
                        class="w-full text-xs border-collapse"
                      >
                        <tbody>
                          <tr
                            v-for="(r, ri) in row.actual"
                            :key="ri"
                            :class="selectRowClass(ri, row)"
                          >
                            <td
                              v-for="(cell, ci) in r"
                              :key="ci"
                              class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-700 dark:text-gray-300"
                            >
                              <span
                                v-if="cell === '' || cell === null"
                                class="text-gray-400 italic"
                                >{{ cell === null ? "null" : "empty" }}</span
                              >
                              <span v-else>{{ cell }}</span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <span
                        v-else
                        class="text-gray-400 dark:text-gray-500 italic text-xs"
                        >No rows</span
                      >
                    </div>
                  </div>
                </template>

                <!-- WHERE tests: test data rows with expected/actual highlighting -->
                <template v-else>
                  <h4
                    class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2"
                  >
                    {{
                      isJoinTest(row)
                        ? "Joined Data (flyql_e2e_test + flyql_e2e_related)"
                        : "Test Data"
                    }}
                  </h4>
                  <table class="w-full text-xs border-collapse">
                    <thead>
                      <tr>
                        <th
                          v-for="col in columnsForTest(row)"
                          :key="col"
                          class="border border-gray-200 dark:border-gray-700 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-left font-semibold text-gray-600 dark:text-gray-300"
                          :class="{
                            'bg-blue-50 dark:bg-blue-900/20':
                              col.startsWith('r.'),
                          }"
                        >
                          {{ col }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="dataRow in rowsForTest(row)"
                        :key="dataRow.id"
                        :class="rowClass(dataRow, row)"
                      >
                        <td
                          v-for="col in columnsForTest(row)"
                          :key="col"
                          class="border border-gray-200 dark:border-gray-700 px-2 py-1 text-gray-700 dark:text-gray-300"
                          :class="{
                            'bg-blue-50/30 dark:bg-blue-900/10':
                              col.startsWith('r.'),
                          }"
                        >
                          <span
                            v-if="dataRow[col] === null"
                            class="text-gray-400 italic"
                            >null</span
                          >
                          <span
                            v-else-if="dataRow[col] === ''"
                            class="text-gray-400 italic"
                            >empty</span
                          >
                          <span v-else-if="typeof dataRow[col] === 'boolean'">{{
                            dataRow[col]
                          }}</span>
                          <span v-else>{{ dataRow[col] }}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </template>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>

    <!-- Result count -->
    <div class="px-4 py-3 border-t border-gray-200 dark:border-gray-800">
      <span class="text-xs text-gray-500 dark:text-gray-400">
        {{ filteredResults.length }} results
        <span v-if="filteredResults.length !== results.length"
          >({{ results.length }} total)</span
        >
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from "vue";
import { highlight } from "../../../javascript/src/highlight.js";
import "../../../javascript/src/editor/flyql.css";
import { DB_ICONS, DB_ICONS_DARK, dbLabel, langLabel } from "./labels.js";

const props = defineProps({
  results: Array,
  testDataRows: Array,
  relatedDataRows: { type: Array, default: () => [] },
  isDark: Boolean,
});

function dbIcon(db) {
  if (props.isDark && DB_ICONS_DARK[db]) return DB_ICONS_DARK[db];
  return DB_ICONS[db];
}

const searchText = ref("");
const filterStatus = ref("");
const filterLanguage = ref("");
const filterDatabase = ref("");
const filterKind = ref("");
const sortField = ref("");
const sortAsc = ref(true);
const page = ref(0);
const expandedRows = reactive({});

const hasActiveFilters = computed(
  () =>
    searchText.value ||
    filterStatus.value ||
    filterLanguage.value ||
    filterDatabase.value ||
    filterKind.value,
);

function clearFilters() {
  searchText.value = "";
  filterStatus.value = "";
  filterLanguage.value = "";
  filterDatabase.value = "";
  filterKind.value = "";
  page.value = 0;
}

// Auto-filter to failed tests if any exist
watch(
  () => props.results,
  (results) => {
    if (results.length && results.some((r) => !r.passed)) {
      filterStatus.value = "failed";
    }
  },
  { immediate: true },
);

const languageOptions = computed(() =>
  [...new Set(props.results.map((r) => r.language))].sort(),
);
const databaseOptions = computed(() =>
  [...new Set(props.results.map((r) => r.database))].sort(),
);
const kindOptions = computed(() =>
  [...new Set(props.results.map((r) => r.kind))].sort(),
);

const filteredResults = computed(() => {
  let items = props.results;
  if (searchText.value) {
    const q = searchText.value.toLowerCase();
    items = items.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.flyql && r.flyql.toLowerCase().includes(q)),
    );
  }
  if (filterStatus.value) {
    const passed = filterStatus.value === "passed";
    items = items.filter((r) => r.passed === passed);
  }
  if (filterLanguage.value)
    items = items.filter((r) => r.language === filterLanguage.value);
  if (filterDatabase.value)
    items = items.filter((r) => r.database === filterDatabase.value);
  if (filterKind.value)
    items = items.filter((r) => r.kind === filterKind.value);

  if (sortField.value) {
    const field = sortField.value;
    const dir = sortAsc.value ? 1 : -1;
    items = [...items].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }
  return items;
});

const totalPages = computed(() =>
  Math.max(1, Math.ceil(filteredResults.value.length / PAGE_SIZE)),
);

const pagedResults = computed(() => {
  const start = page.value * PAGE_SIZE;
  return filteredResults.value.slice(start, start + PAGE_SIZE);
});

// Reset page when filters change
watch(
  [searchText, filterStatus, filterLanguage, filterDatabase, filterKind],
  () => {
    page.value = 0;
  },
);

function toggleSort(field) {
  if (sortField.value === field) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortField.value = field;
    sortAsc.value = true;
  }
}

function toggleExpand(id) {
  expandedRows[id] = !expandedRows[id];
}

function highlightFlyql(text, kind) {
  if (!text) return "";
  return highlight(text, { mode: kind === "select" ? "columns" : "query" });
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function highlightSQL(sql) {
  if (!sql) return "";
  const keywords =
    /\b(WHERE|AND|OR|NOT|IN|IS|NULL|LIKE|ILIKE|TRUE|FALSE|BETWEEN|EXISTS|CASE|WHEN|THEN|ELSE|END|AS|FROM|SELECT)\b/gi;
  const functions =
    /\b(match|position|has|mapContains|JSON_EXISTS|JSON_VALUE|JSONExtractString|JSONExtractInt|JSONExtractFloat|JSONType|JSONHas|JSONLength|concat|lower|upper|length|multiIf|INSTR|regexp|parse_json|cast|array_length|jsonb_typeof)\b/g;
  const strings = /'(?:[^'\\]|\\.)*'/g;
  const numbers = /\b(\d+(?:\.\d+)?)\b/g;
  let result = escapeHtml(sql);
  result = result.replace(strings, '<span class="sql-hl-string">$&</span>');
  result = result.replace(keywords, '<span class="sql-hl-keyword">$&</span>');
  result = result.replace(functions, '<span class="sql-hl-function">$&</span>');
  result = result.replace(numbers, '<span class="sql-hl-number">$1</span>');
  return result;
}

// Test data helpers
const testDataColumns = computed(() => {
  if (!props.testDataRows || !props.testDataRows.length) return [];
  return Object.keys(props.testDataRows[0]);
});

const relatedByTestId = computed(() => {
  const map = {};
  for (const row of props.relatedDataRows) {
    map[row.test_id] = row;
  }
  return map;
});

const joinedRows = computed(() => {
  if (
    !props.testDataRows ||
    !props.relatedDataRows ||
    !props.relatedDataRows.length
  )
    return [];
  const result = [];
  for (const row of props.testDataRows) {
    const related = relatedByTestId.value[row.id];
    if (related) {
      result.push({
        ...row,
        "r.category": related.category,
        "r.priority": related.priority,
        "r.label": related.label,
      });
    }
  }
  return result;
});

const joinedColumns = computed(() => {
  if (!joinedRows.value.length) return [];
  return Object.keys(joinedRows.value[0]);
});

function isJoinTest(testResult) {
  return testResult.name && testResult.name.startsWith("join_");
}

function rowsForTest(testResult) {
  return isJoinTest(testResult) ? joinedRows.value : props.testDataRows;
}

function columnsForTest(testResult) {
  return isJoinTest(testResult) ? joinedColumns.value : testDataColumns.value;
}

function selectRowClass(rowIndex, testResult) {
  const expected = testResult.expected || [];
  const actual = testResult.actual || [];
  const expRow = expected[rowIndex];
  const actRow = actual[rowIndex];
  if (!expRow || !actRow) return "bg-red-100 dark:bg-red-900/20";
  if (JSON.stringify(expRow) === JSON.stringify(actRow))
    return "bg-green-50 dark:bg-green-900/20";
  return "bg-red-100 dark:bg-red-900/20";
}

function rowClass(row, testResult) {
  const expectedIds = testResult.expected || [];
  const actualIds = testResult.actual || [];
  const id = row.id;

  const isExpected = expectedIds.includes(id);
  const isReturned = actualIds.includes(id);

  if (isExpected && isReturned) return "bg-green-50 dark:bg-green-900/20";
  if (isReturned && !isExpected) return "bg-red-100 dark:bg-red-900/20";
  if (isExpected && !isReturned) return "bg-yellow-50 dark:bg-yellow-900/20";
  return "";
}
</script>
