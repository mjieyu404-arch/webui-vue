<template>
  <section class="ntub-fan-history" :aria-label="$t('ntubHistory.fanTitle')">
    <div class="history-header">
      <div>
        <h5>{{ $t('ntubHistory.fanTitle') }}</h5>
        <p class="history-subtitle">
          Fan Speed · {{ $t('ntubMonitor.updates') }}
          <span class="simulated-badge">{{ $t('ntubMonitor.simulated') }}</span>
        </p>
      </div>
      <div class="history-controls">
        <label for="ntub-fan-history-range">{{
          $t('ntubHistory.displayRange')
        }}</label>
        <select
          id="ntub-fan-history-range"
          v-model.number="minutes"
          :aria-label="$t('ntubHistory.fanRangeAria')"
          @change="loadHistory"
        >
          <option :value="15">
            {{ $t('ntubHistory.lastMinutes', { minutes: 15 }) }}
          </option>
          <option :value="30">
            {{ $t('ntubHistory.lastMinutes', { minutes: 30 }) }}
          </option>
          <option :value="60">
            {{ $t('ntubHistory.lastMinutes', { minutes: 60 }) }}
          </option>
          <option :value="120">
            {{ $t('ntubHistory.lastMinutes', { minutes: 120 }) }}
          </option>
        </select>
        <button type="button" :disabled="loading" @click="loadHistory">
          {{ loading ? $t('ntubHistory.updating') : $t('ntubHistory.refresh') }}
        </button>
      </div>
    </div>

    <div class="history-stats">
      <div class="history-stat">
        <span>{{ $t('ntubHistory.latest') }}</span>
        <strong>{{ formatFan(stats.latest) }}<small> RPM</small></strong>
      </div>
      <div class="history-stat">
        <span>{{ $t('ntubHistory.minimum') }}</span>
        <strong>{{ formatFan(stats.min) }}<small> RPM</small></strong>
      </div>
      <div class="history-stat">
        <span>{{ $t('ntubHistory.average') }}</span>
        <strong>{{ formatFan(stats.avg) }}<small> RPM</small></strong>
      </div>
      <div class="history-stat">
        <span>{{ $t('ntubHistory.maximum') }}</span>
        <strong>{{ formatFan(stats.max) }}<small> RPM</small></strong>
      </div>
    </div>

    <p v-if="error" class="history-error" role="alert">
      {{ $t('ntubHistory.loadError') }}: {{ formatNtubError(error, $t) }}
      {{ rows.length ? $t('ntubHistory.keepPrevious') : '' }}
    </p>

    <div v-if="chart" class="chart-area">
      <svg
        class="fan-chart"
        viewBox="0 0 840 270"
        role="img"
        :aria-label="
          $t('ntubHistory.chartAria', {
            sensor: $t('ntubHistory.fanTitle'),
            count: rows.length,
            min: formatFan(stats.min),
            max: formatFan(stats.max),
            unit: 'RPM',
          })
        "
      >
        <text x="56" y="16" class="axis-title">
          {{ $t('ntubHistory.fanAxis') }}
        </text>
        <line x1="56" y1="40" x2="820" y2="40" class="grid-line" />
        <line x1="56" y1="134" x2="820" y2="134" class="grid-line" />
        <line x1="56" y1="228" x2="820" y2="228" class="grid-line" />
        <line x1="56" y1="40" x2="56" y2="228" class="axis-line" />
        <text x="48" y="44" text-anchor="end" class="tick-label">
          {{ chart.topLabel }}
        </text>
        <text x="48" y="138" text-anchor="end" class="tick-label">
          {{ chart.midLabel }}
        </text>
        <text x="48" y="232" text-anchor="end" class="tick-label">
          {{ chart.bottomLabel }}
        </text>
        <polyline
          v-if="chart.points.length > 1"
          :points="chart.polyline"
          fill="none"
          stroke="#16877f"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          vector-effect="non-scaling-stroke"
        />
        <circle
          v-for="(point, index) in chart.points"
          :key="index"
          :cx="point.x"
          :cy="point.y"
          r="2.3"
          fill="#16877f"
        >
          <title>{{ point.label }}</title>
        </circle>
        <text x="56" y="251" text-anchor="start" class="tick-label">
          {{ chart.firstTime }}
        </text>
        <text x="438" y="251" text-anchor="middle" class="tick-label">
          {{ chart.middleTime }}
        </text>
        <text x="820" y="251" text-anchor="end" class="tick-label">
          {{ chart.lastTime }}
        </text>
      </svg>
    </div>
    <div v-else class="history-empty">
      {{ loading ? $t('ntubHistory.fanLoading') : $t('ntubHistory.fanEmpty') }}
    </div>

    <div class="history-footer">
      <span
        >{{ $t('ntubHistory.records', { count: rows.length }) }} ·
        {{ $t('ntubHistory.timezone') }}</span
      >
      <span
        >{{ $t('ntubHistory.lastSuccess') }}:
        {{ formattedLastUpdated || $t('ntubMonitor.notUpdated') }}</span
      >
    </div>
    <p class="history-note">{{ $t('ntubHistory.dataSource') }}</p>
  </section>
</template>

<script setup>
import { formatNtubError } from '../utils/ntubError';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const minutes = ref(30);
const rows = ref([]);
const loading = ref(false);
const error = ref('');
const lastUpdated = ref(null);
const { locale } = useI18n({ useScope: 'global' });

const formattedLastUpdated = computed(() => {
  if (lastUpdated.value === null) return '';
  return dateTimeFormatter.value.format(new Date(lastUpdated.value));
});

let timer = null;
let active = false;
let requestId = 0;
let controller = null;

const timeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-TW', {
      timeZone: 'Asia/Taipei',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
);
const dateTimeFormatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value === 'en-US' ? 'en-US' : 'zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
);

function formatFan(value) {
  return Number.isFinite(value)
    ? Math.round(value).toLocaleString('en-US')
    : '--';
}

const stats = computed(() => {
  if (!rows.value.length) {
    return { latest: null, min: null, avg: null, max: null };
  }
  const values = rows.value.map((item) => item.rpm);
  return {
    latest: values[values.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    avg: values.reduce((total, value) => total + value, 0) / values.length,
  };
});

const chart = computed(() => {
  const data = rows.value;
  if (!data.length) return null;

  const values = data.map((item) => item.rpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.16, 25);
  const low = min - padding;
  const high = max + padding;
  const start = data[0].time;
  const end = data[data.length - 1].time;
  const duration = end - start;
  const left = 56;
  const width = 764;
  const top = 40;
  const height = 188;

  const points = data.map((item, index) => {
    const fraction =
      duration > 0
        ? (item.time - start) / duration
        : data.length === 1
          ? 0.5
          : index / (data.length - 1);
    const x = left + fraction * width;
    const y = top + ((high - item.rpm) / (high - low)) * height;
    return {
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      label: `${dateTimeFormatter.value.format(new Date(item.time))} · ${formatFan(item.rpm)} RPM`,
    };
  });

  return {
    points,
    polyline: points.map((point) => `${point.x},${point.y}`).join(' '),
    topLabel: Math.round(high).toLocaleString('en-US'),
    midLabel: Math.round((high + low) / 2).toLocaleString('en-US'),
    bottomLabel: Math.round(low).toLocaleString('en-US'),
    firstTime: timeFormatter.value.format(new Date(start)),
    middleTime: timeFormatter.value.format(new Date((start + end) / 2)),
    lastTime: timeFormatter.value.format(new Date(end)),
  };
});

async function loadHistory() {
  const id = ++requestId;
  if (controller) controller.abort();
  const currentController = new AbortController();
  controller = currentController;
  loading.value = true;
  try {
    const response = await fetch(
      `/ntub-api/sensors/fan/history?minutes=${minutes.value}`,
      {
        cache: 'no-store',
        credentials: 'same-origin',
        signal: currentController.signal,
      },
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    if (!result || !Array.isArray(result.points))
      throw new Error('Invalid history response');

    const cleaned = result.points
      .slice(-2000)
      .map((point) => ({
        time: Date.parse(point.timestamp),
        rpm: point.rpm,
      }))
      .filter(
        (point) =>
          Number.isFinite(point.time) &&
          typeof point.rpm === 'number' &&
          Number.isFinite(point.rpm),
      );
    cleaned.sort((a, b) => a.time - b.time);

    if (!active || id !== requestId) return;
    rows.value = cleaned;
    error.value = '';
    lastUpdated.value = Date.now();
  } catch (err) {
    if (!active || id !== requestId || (err && err.name === 'AbortError'))
      return;
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    if (id === requestId) {
      loading.value = false;
      controller = null;
    }
  }
}

onMounted(() => {
  active = true;
  loadHistory();
  timer = setInterval(loadHistory, 5000);
});

onUnmounted(() => {
  active = false;
  requestId += 1;
  if (controller) controller.abort();
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.ntub-fan-history {
  padding: 18px;
  margin-bottom: 26px;
  border: 1px solid #d9e2ec;
  border-radius: 9px;
  background: #fff;
  color: #26364a;
}
.history-header,
.history-controls,
.history-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}
.history-header h5 {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 600;
}
.history-subtitle {
  margin: 0;
  color: #677991;
  font-size: 12px;
}
.simulated-badge {
  display: inline-block;
  margin-left: 7px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #edf2f9;
  color: #486494;
}
.history-controls {
  justify-content: flex-end;
  font-size: 12px;
}
.history-controls select,
.history-controls button {
  padding: 7px 10px;
  border: 1px solid #a9b8d1;
  border-radius: 4px;
  background: #fff;
  color: #344d75;
}
.history-controls button {
  color: #315fa5;
  cursor: pointer;
}
.history-controls button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.history-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin: 16px 0;
}
.history-stat {
  background: #f3f5f7;
  padding: 12px;
  border-radius: 5px;
  min-width: 0;
}
.history-stat span {
  display: block;
  color: #69788e;
  font-size: 12px;
  margin-bottom: 4px;
}
.history-stat strong {
  font-size: 18px;
  font-weight: 600;
  color: #314b7f;
}
.history-stat small {
  font-size: 11px;
  font-weight: 400;
}
.chart-area {
  width: 100%;
  overflow: hidden;
}
.fan-chart {
  width: 100%;
  height: auto;
  min-height: 220px;
  display: block;
}
.grid-line {
  stroke: #e0e6ee;
  stroke-width: 1;
  stroke-dasharray: 3 4;
}
.axis-line {
  stroke: #d8e1ee;
  stroke-width: 1;
}
.tick-label {
  fill: #61748d;
  font-size: 12px;
}
.axis-title {
  fill: #61748d;
  font-size: 13px;
}
.history-error {
  padding: 10px;
  background: #fff3f1;
  color: #ad3028;
  border-radius: 5px;
  font-size: 12px;
}
.history-empty {
  padding: 58px 12px;
  text-align: center;
  color: #65748c;
}
.history-footer {
  margin-top: 8px;
  color: #6b7a90;
  font-size: 11px;
}
.history-note {
  margin: 9px 0 0;
  color: #7a8799;
  font-size: 11px;
}
@media (max-width: 700px) {
  .history-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ntub-fan-history {
    padding: 12px;
  }
  .fan-chart {
    min-height: 160px;
  }
}
</style>
