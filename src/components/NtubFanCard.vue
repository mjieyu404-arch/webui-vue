<template>
  <div class="ntub-fan-card">
    <div class="ntub-fan-header">
      <h5>{{ $t('ntubMonitor.fanTitle') }}</h5>
      <span class="ntub-fan-badge">{{ $t('ntubMonitor.simulated') }}</span>
    </div>

    <div class="ntub-fan-value" role="status" aria-live="polite">
      {{
        rpm === null
          ? '--'
          : rpm.toLocaleString('en-US', { maximumFractionDigits: 0 })
      }}
      RPM
    </div>

    <p class="ntub-fan-status" :class="{ 'is-error': !!error }">
      {{
        error
          ? $t('ntubMonitor.unavailable')
          : rpm === null
            ? $t('ntubMonitor.loading')
            : $t('ntubMonitor.sineWave')
      }}
    </p>
    <p class="ntub-fan-note">{{ $t('ntubMonitor.fanRange') }}</p>
    <p class="ntub-fan-source">{{ $t('ntubMonitor.architecture') }}</p>
    <p v-if="error" class="ntub-fan-error" role="alert">
      {{ $t('ntubMonitor.apiError') }}: {{ formatNtubError(error, $t) }}
    </p>

    <div class="ntub-fan-footer">
      <span>{{ $t('ntubMonitor.updates') }}</span>
      <span>{{ formattedLastUpdated || $t('ntubMonitor.notUpdated') }}</span>
    </div>
  </div>
</template>

<script setup>
import { formatNtubError } from '../utils/ntubError';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const rpm = ref(null);
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
let pending = false;

async function loadFan() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/ntub-api/sensors/fan', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (
      typeof data.rpm !== 'number' ||
      !Number.isFinite(data.rpm) ||
      data.rpm < 0
    ) {
      throw new Error('Invalid fan RPM');
    }
    if (!active) return;
    rpm.value = data.rpm;
    lastUpdated.value = Date.now();
    error.value = '';
  } catch (err) {
    if (!active) return;
    rpm.value = null;
    error.value = err.message;
  } finally {
    pending = false;
  }
}

onMounted(() => {
  active = true;
  loadFan();
  timer = setInterval(loadFan, 5000);
});

onUnmounted(() => {
  active = false;
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.ntub-fan-card {
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #d9e2ec;
  border-radius: 12px;
  background: #f8fbff;
  color: #24374c;
}
.ntub-fan-header,
.ntub-fan-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ntub-fan-header h5 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ntub-fan-badge {
  border-radius: 5px;
  padding: 4px 8px;
  background: #e5ecf4;
  color: #43556d;
  font-size: 12px;
}
.ntub-fan-value {
  margin: 14px 0 4px;
  font-size: 34px;
  font-weight: 600;
  color: #315fa9;
}
.ntub-fan-status {
  color: #24734b;
  font-weight: 600;
  margin: 0 0 8px;
}
.ntub-fan-status.is-error {
  color: #b42318;
}
.ntub-fan-note,
.ntub-fan-source {
  color: #65758c;
  font-size: 13px;
  margin: 0 0 8px;
}
.ntub-fan-error {
  color: #b42318;
  font-size: 13px;
}
.ntub-fan-footer {
  color: #65758c;
  font-size: 12px;
  margin-top: 15px;
}
</style>
