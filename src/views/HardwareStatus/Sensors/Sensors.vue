<template>
  <b-container fluid="xl">
    <page-title />
    <!-- NTUB DASHBOARD START -->
    <section class="ntub-dashboard" :aria-label="$t('ntubDashboard.title')">
      <div class="ntub-dashboard__header">
        <h2>{{ $t('ntubDashboard.title') }}</h2>
        <span class="ntub-dashboard__badge">
          {{ $t('ntubMonitor.simulated') }}
        </span>
      </div>

      <h3 class="ntub-dashboard__section-title">
        {{ $t('ntubDashboard.live') }}
      </h3>
      <div class="ntub-dashboard__grid">
        <ntub-cpu-temp-card />
        <ntub-voltage-card />
        <ntub-current-card />
        <ntub-fan-card />
      </div>

      <h3 class="ntub-dashboard__section-title">
        {{ $t('ntubDashboard.history') }}
      </h3>
      <div class="ntub-dashboard__grid ntub-dashboard__grid--history">
        <ntub-cpu-temp-history />
        <ntub-voltage-history />
        <ntub-current-history />
        <ntub-fan-history />
      </div>
    </section>
    <!-- NTUB DASHBOARD END -->
    <b-row class="align-items-end">
      <b-col sm="6" md="5" xl="4">
        <search
          :placeholder="$t('pageSensors.searchForSensors')"
          data-test-id="sensors-input-searchForSensors"
          @change-search="onChangeSearchInput"
          @clear-search="onClearSearchInput"
        />
      </b-col>
      <b-col sm="3" md="3" xl="2">
        <table-cell-count
          :filtered-items-count="filteredRows"
          :total-number-of-cells="allSensors.length"
        ></table-cell-count>
      </b-col>
      <b-col sm="3" md="4" xl="6" class="text-end">
        <table-filter :filters="tableFilters" @filter-change="onFilterChange" />
      </b-col>
    </b-row>
    <b-row>
      <b-col xl="12">
        <table-toolbar
          ref="toolbar"
          :selected-items-count="
            Array.isArray(selectedRows) ? selectedRows.length : 0
          "
          @clear-selected="clearSelectedRows($refs.table)"
        >
          <template #toolbar-buttons>
            <table-toolbar-export
              :data="selectedRows"
              :file-name="exportFileNameByDate()"
            />
          </template>
        </table-toolbar>
        <b-table
          ref="table"
          responsive="md"
          selectable
          no-select-on-click
          sort-icon-left
          hover
          must-sort
          sticky-header="75vh"
          thead-class="table-light"
          :sort-by="['status']"
          show-empty
          :items="filteredSensors"
          :fields="fields"
          :sort-desc="[true]"
          :filter="searchFilter"
          :empty-text="$t('global.table.emptyMessage')"
          :empty-filtered-text="$t('global.table.emptySearchMessage')"
          :busy="isBusy"
          @filtered="onFiltered"
          @row-selected="onRowSelected($event, filteredSensors.length)"
        >
          <!-- Checkbox column -->
          <template #head(checkbox)>
            <b-form-checkbox
              v-model="tableHeaderCheckboxModel"
              :indeterminate="tableHeaderCheckboxIndeterminate"
              @change="onChangeHeaderCheckbox($refs.table, $event)"
            >
              <span class="visually-hidden-focusable">
                {{ $t('global.table.selectAll') }}
              </span>
            </b-form-checkbox>
          </template>
          <template #cell(checkbox)="row">
            <b-form-checkbox
              v-model="row.rowSelected"
              @change="toggleSelectRow($refs.table, row.index)"
            >
              <span class="visually-hidden-focusable">
                {{ $t('global.table.selectItem') }}
              </span>
            </b-form-checkbox>
          </template>

          <template #cell(status)="{ value }">
            <status-icon :status="healthStatusIcon(value)" /> {{ value }}
          </template>
          <template #cell(currentValue)="data">
            {{ data.value }}{{ data.item.currentValueDisplay }}
          </template>
          <template #cell(lowerCaution)="data">
            {{ data.value }}{{ data.item.lowerCautionDisplay }}
          </template>
          <template #cell(upperCaution)="data">
            {{ data.value }}{{ data.item.upperCautionDisplay }}
          </template>
          <template #cell(lowerCritical)="data">
            {{ data.value }}{{ data.item.lowerCriticalDisplay }}
          </template>
          <template #cell(upperCritical)="data">
            {{ data.value }}{{ data.item.upperCriticalDisplay }}
          </template>
        </b-table>
      </b-col>
    </b-row>
  </b-container>
</template>

<script setup>
import NtubFanHistory from '@/components/NtubFanHistory.vue';
import NtubCurrentHistory from '@/components/NtubCurrentHistory.vue';
import NtubVoltageHistory from '@/components/NtubVoltageHistory.vue';
import NtubCpuTempHistory from '../../../components/NtubCpuTempHistory.vue';

import NtubCpuTempCard from '@/components/NtubCpuTempCard.vue';
import NtubVoltageCard from '@/components/NtubVoltageCard.vue';
import NtubCurrentCard from '@/components/NtubCurrentCard.vue';
import NtubFanCard from '@/components/NtubFanCard.vue';
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import PageTitle from '@/components/Global/PageTitle';
import Search from '@/components/Global/Search';
import StatusIcon from '@/components/Global/StatusIcon';
import TableFilter from '@/components/Global/TableFilter';
import TableToolbar from '@/components/Global/TableToolbar';
import TableToolbarExport from '@/components/Global/TableToolbarExport';
import TableCellCount from '@/components/Global/TableCellCount';

import { useTableSelection } from '@/components/Composables/useTableSelection';
import { useLoadingBar } from '@/components/Composables/useLoadingBar';
import { useTableFilter } from '@/components/Composables/useTableFilter';
import { useDataFormatter } from '@/components/Composables/useDataFormatter';
import { useSensors } from '@/components/Composables/useSensors';
import i18n from '@/i18n';

const { startLoader, endLoader, hideLoader } = useLoadingBar();
const { dataFormatter } = useDataFormatter();
const { getFilteredTableData } = useTableFilter();
const {
  selectedRows,
  tableHeaderCheckboxModel,
  tableHeaderCheckboxIndeterminate,
  onRowSelected,
  onChangeHeaderCheckbox,
  toggleSelectRow,
  clearSelectedRows,
} = useTableSelection();

const { data: sensorsData, isLoading, isFetching } = useSensors();

// NTUB Ubuntu kernel hwmon sensor table
const ntubTableRows = ref([]);
let ntubTableTimer = null;

async function refreshNtubTable() {
  try {
    const response = await fetch('/ntub-api/sensors/cpu-temp', {
      credentials: 'same-origin',
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const sensor = await response.json();
    const temperature = Number(sensor.temperature);

    if (!Number.isFinite(temperature)) {
      throw new Error('Invalid CPU_Temp value');
    }

    ntubTableRows.value = [
      {
        name: 'CPU_Temp',
        status:
          temperature >= 46 ? 'Critical' : temperature >= 45 ? 'Warning' : 'OK',
        lowerCritical: null,
        lowerCaution: null,
        currentValue: temperature.toFixed(1) + ' °C',
        upperCaution: '45.0 °C',
        upperCritical: '46.0 °C',
      },
    ];
  } catch (error) {
    console.error('NTUB sensor table:', error);
    ntubTableRows.value = [];
  }
}

onMounted(() => {
  refreshNtubTable();
  ntubTableTimer = setInterval(refreshNtubTable, 5000);
});

onBeforeUnmount(() => {
  if (ntubTableTimer !== null) {
    clearInterval(ntubTableTimer);
  }
});

const searchFilter = ref('');
const searchTotalFilteredRows = ref(0);
const activeFilters = ref([]);

const fields = [
  {
    key: 'checkbox',
    sortable: false,
    label: '',
  },
  {
    key: 'name',
    sortable: true,
    label: i18n.global.t('pageSensors.table.name'),
  },
  {
    key: 'status',
    sortable: true,
    label: i18n.global.t('pageSensors.table.status'),
    tdClass: 'text-nowrap',
  },
  {
    key: 'lowerCritical',
    formatter: dataFormatter,
    label: i18n.global.t('pageSensors.table.lowerCritical'),
  },
  {
    key: 'lowerCaution',
    formatter: dataFormatter,
    label: i18n.global.t('pageSensors.table.lowerWarning'),
  },
  {
    key: 'currentValue',
    formatter: dataFormatter,
    label: i18n.global.t('pageSensors.table.currentValue'),
  },
  {
    key: 'upperCaution',
    formatter: dataFormatter,
    label: i18n.global.t('pageSensors.table.upperWarning'),
  },
  {
    key: 'upperCritical',
    formatter: dataFormatter,
    label: i18n.global.t('pageSensors.table.upperCritical'),
  },
];

const tableFilters = [
  {
    key: 'status',
    label: i18n.global.t('pageSensors.table.status'),
    values: [
      i18n.global.t('global.action.ok'),
      i18n.global.t('global.action.warning'),
      i18n.global.t('global.action.critical'),
    ],
  },
];

const allSensors = computed(() => [
  ...ntubTableRows.value,
  ...(sensorsData.value || []).filter((sensor) => sensor.name !== 'CPU_Temp'),
]);

const filteredSensors = computed(() => {
  return getFilteredTableData(allSensors.value, activeFilters.value);
});

const filteredRows = computed(() => {
  return searchFilter.value
    ? searchTotalFilteredRows.value
    : filteredSensors.value.length;
});

const isBusy = computed(() => isLoading.value || isFetching.value);

function onFilterChange({ activeFilters: filters }) {
  activeFilters.value = filters;
}

function onFiltered(filteredItems) {
  searchTotalFilteredRows.value = filteredItems.length;
}

function onChangeSearchInput(event) {
  searchFilter.value = event;
}

function onClearSearchInput() {
  searchFilter.value = '';
}

function exportFileNameByDate() {
  // Create export file name based on date
  let date = new Date();
  date =
    date.toISOString().slice(0, 10) +
    '_' +
    date.toString().split(':').join('-').split(' ')[4];
  return i18n.global.t('pageSensors.exportFilePrefix') + date;
}

function healthStatusIcon(status) {
  switch (status) {
    case 'OK':
      return 'success';
    case 'Warning':
      return 'warning';
    case 'Critical':
      return 'danger';
    case 'Unknown':
      return '';
    default:
      return '';
  }
}

// Watch loading state and control loading bar
watch(
  () => isLoading.value || isFetching.value,
  (loading) => {
    if (loading) {
      startLoader();
    } else {
      endLoader();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  hideLoader();
});
</script>

<style scoped>
.ntub-dashboard {
  margin: 0 0 32px;
}

.ntub-dashboard__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 22px;
}

.ntub-dashboard__header h2 {
  margin: 0;
  color: #24374c;
  font-size: 24px;
  font-weight: 650;
}

.ntub-dashboard__badge {
  padding: 6px 12px;
  border-radius: 8px;
  background: #e5ecf4;
  color: #43556d;
  font-size: 13px;
}

.ntub-dashboard__section-title {
  margin: 26px 0 16px;
  font-size: 18px;
  font-weight: 600;
  color: #315477;
}

.ntub-dashboard__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
  align-items: stretch;
}

.ntub-dashboard__grid > * {
  min-width: 0;
  width: 100%;
  height: 100%;
  margin-bottom: 0;
}

.ntub-dashboard__grid--history {
  margin-bottom: 30px;
}

@media (max-width: 991px) {
  .ntub-dashboard__grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .ntub-dashboard__header h2 {
    font-size: 20px;
  }

  .ntub-dashboard__grid {
    gap: 16px;
  }
}

/* NTUB_HISTORY_ALIGNMENT_V2 */
.ntub-dashboard__grid--history > * {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
  align-self: stretch;
}

/* NTUB_HISTORY_HEADER_V3 */
.ntub-dashboard__grid--history :deep(.history-header) {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.ntub-dashboard__grid--history :deep(.history-controls) {
  justify-content: flex-start;
  flex-wrap: wrap;
}
</style>
