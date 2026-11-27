<template>
  <div class="ntub-temp-card" :class="`ntub-temp-card--${ntubSeverity}`">
    <div class="ntub-header">
      <h5>{{ $t('ntubMonitor.cpuTitle') }}</h5>
      <span class="ntub-badge">{{ $t('ntubMonitor.simulated') }}</span>
    </div>

    <div class="ntub-value">
      {{ temperature === null ? '--' : temperature.toFixed(1) }} °C
    </div>

    <p class="ntub-status" role="status" aria-live="polite">
      {{ ntubStatusText }}
    </p>

    <p class="ntub-threshold">
      {{ $t('ntubMonitor.threshold') }}
    </p>

    <p class="ntub-source">
      {{ $t('ntubMonitor.architecture') }}
    </p>

    <p v-if="error" class="ntub-error">
      {{ $t('ntubMonitor.apiError') }}: {{ formatNtubError(error, $t) }}
    </p>

    <div class="ntub-footer">
      <span>{{ $t('ntubMonitor.updates') }}</span>
      <span>{{ formattedLastUpdated }}</span>
    </div>
  </div>
</template>

<script setup>
import { formatNtubError } from '../utils/ntubError';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n({ useScope: 'global' });

const temperature = ref(null);
const lastUpdated = ref(null);

const formattedLastUpdated = computed(() => {
  if (lastUpdated.value === null) {
    return '--';
  }

  const language = locale.value === 'zh-TW' ? 'zh-TW' : 'en-US';

  return new Date(lastUpdated.value).toLocaleTimeString(language, {
    hour12: false,
  });
});
const error = ref('');

// NTUB demo thresholds - not actual hardware safety limits
const NTUB_WARNING_C = 45;
const NTUB_CRITICAL_C = 46;

const ntubSeverity = computed(() => {
  if (error.value || !Number.isFinite(temperature.value)) {
    return 'unavailable';
  }

  if (temperature.value >= NTUB_CRITICAL_C) {
    return 'critical';
  }

  if (temperature.value >= NTUB_WARNING_C) {
    return 'warning';
  }

  return 'normal';
});

const ntubStatusText = computed(() => {
  switch (ntubSeverity.value) {
    case 'critical':
      return t('ntubMonitor.critical');
    case 'warning':
      return t('ntubMonitor.warning');
    case 'normal':
      return t('ntubMonitor.normal');
    default:
      return t('ntubMonitor.unavailable');
  }
});

let timer = null;
let active = true;

async function loadTemperature() {
  try {
    const response = await fetch('/ntub-api/sensors/cpu-temp', {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (typeof data.temperature !== 'number') {
      throw new Error('Invalid temperature value');
    }

    if (!active) return;

    temperature.value = data.temperature;
    lastUpdated.value = Date.now();
    error.value = '';
  } catch (err) {
    if (!active) return;

    temperature.value = null;
    error.value = err.message;
  }
}

onMounted(() => {
  active = true;
  loadTemperature();
  timer = setInterval(loadTemperature, 5000);
});

onUnmounted(() => {
  active = false;
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.ntub-temp-card {
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #d9e2ec;
  border-radius: 12px;
  background: #f8fbff;
  color: #24374c;
}

.ntub-header,
.ntub-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ntub-header h5 {
  margin: 0;
  font-weight: 600;
}

.ntub-badge {
  padding: 5px 10px;
  border-radius: 6px;
  background: #e5eaf0;
  font-size: 12px;
}

.ntub-value {
  margin: 16px 0 6px;
  font-size: 42px;
  font-weight: 700;
  color: #2867a8;
}

.ntub-source {
  margin: 0 0 16px;
  font-size: 13px;
  color: #62758a;
}

.ntub-error {
  color: #c0392b;
  font-size: 13px;
}

.ntub-footer {
  font-size: 12px;
  color: #62758a;
}

.ntub-status {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 700;
  color: #237348;
}

.ntub-threshold {
  margin: 0 0 14px;
  font-size: 12px;
  color: #62758a;
}

.ntub-temp-card--warning {
  border-color: #d5a53e;
  background: #fff9ed;
}

.ntub-temp-card--warning .ntub-value,
.ntub-temp-card--warning .ntub-status {
  color: #9b6800;
}

.ntub-temp-card--critical {
  border-color: #d65a5a;
  background: #fff2f2;
}

.ntub-temp-card--critical .ntub-value,
.ntub-temp-card--critical .ntub-status {
  color: #bf3030;
}

.ntub-temp-card--unavailable {
  border-color: #aab5c0;
  background: #f5f7f9;
}

.ntub-temp-card--unavailable .ntub-value,
.ntub-temp-card--unavailable .ntub-status {
  color: #657485;
}
</style>
