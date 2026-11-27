<template>
  <div class="ntub-voltage-card">
    <div class="ntub-voltage-header">
      <h5>{{ $t('ntubMonitor.voltageTitle') }}</h5>
      <span class="ntub-voltage-badge">{{ $t('ntubMonitor.simulated') }}</span>
    </div>

    <div class="ntub-voltage-value">
      {{ voltage === null ? '--' : voltage.toFixed(3) }} V
    </div>

    <p class="ntub-voltage-status" role="status" aria-live="polite">
      {{ error ? $t('ntubMonitor.unavailable') : $t('ntubMonitor.sineWave') }}
    </p>
    <p class="ntub-voltage-note">{{ $t('ntubMonitor.voltageRange') }}</p>
    <p class="ntub-voltage-source">{{ $t('ntubMonitor.architecture') }}</p>
    <p v-if="error" class="ntub-voltage-error" role="alert">
      {{ $t('ntubMonitor.apiError') }}: {{ formatNtubError(error, $t) }}
    </p>

    <div class="ntub-voltage-footer">
      <span>{{ $t('ntubMonitor.updates') }}</span>
      <span>{{ formattedLastUpdated || $t('ntubMonitor.notUpdated') }}</span>
    </div>
  </div>
</template>

<script setup>
import { formatNtubError } from '../utils/ntubError';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const voltage = ref(null);
const lastUpdated = ref('');
const { locale } = useI18n({ useScope: 'global' });

const formattedLastUpdated = computed(() => {
  if (!lastUpdated.value) return '';
  return new Date(lastUpdated.value).toLocaleTimeString(
    locale.value === 'zh-TW' ? 'zh-TW' : 'en-US',
    { hour12: false },
  );
});
const error = ref('');
let timer = null;
let active = false;
let loading = false;

async function loadVoltage() {
  if (loading) return;
  loading = true;
  try {
    const response = await fetch('/ntub-api/sensors/voltage', {
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data.voltage !== 'number' || !Number.isFinite(data.voltage)) {
      throw new Error('Invalid voltage value');
    }
    if (!active) return;
    voltage.value = data.voltage;
    lastUpdated.value = Date.now();
    error.value = '';
  } catch (err) {
    if (!active) return;
    voltage.value = null;
    error.value = err.message;
  } finally {
    loading = false;
  }
}

onMounted(() => {
  active = true;
  loadVoltage();
  timer = setInterval(loadVoltage, 5000);
});

onUnmounted(() => {
  active = false;
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.ntub-voltage-card {
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #d9e2ec;
  border-radius: 12px;
  background: #f8fbff;
  color: #24374c;
}
.ntub-voltage-header,
.ntub-voltage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ntub-voltage-header h5 {
  margin: 0;
  font-size: 16px;
}
.ntub-voltage-badge {
  border-radius: 5px;
  padding: 4px 8px;
  background: #e5ecf4;
  color: #43556d;
  font-size: 12px;
}
.ntub-voltage-value {
  margin: 14px 0 4px;
  font-size: 34px;
  font-weight: 600;
  color: #315fa9;
}
.ntub-voltage-status {
  color: #24734b;
  font-weight: 600;
  margin: 0 0 8px;
}
.ntub-voltage-note,
.ntub-voltage-source {
  color: #65758c;
  font-size: 13px;
  margin: 0 0 8px;
}
.ntub-voltage-error {
  color: #b42318;
  font-size: 13px;
}
.ntub-voltage-footer {
  color: #65758c;
  font-size: 12px;
  margin-top: 15px;
}
</style>
