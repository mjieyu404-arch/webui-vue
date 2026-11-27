<template>
  <div class="ntub-current-card">
    <div class="ntub-current-header">
      <h5>{{ $t('ntubMonitor.currentTitle') }}</h5>
      <span class="ntub-current-badge">{{ $t('ntubMonitor.simulated') }}</span>
    </div>

    <div class="ntub-current-value" role="status" aria-live="polite">
      {{ current === null ? '--' : current.toFixed(3) }} A
    </div>

    <p class="ntub-current-status" :class="{ 'is-error': !!error }">
      {{
        error
          ? $t('ntubMonitor.unavailable')
          : current === null
            ? $t('ntubMonitor.loading')
            : $t('ntubMonitor.sineWave')
      }}
    </p>
    <p class="ntub-current-note">{{ $t('ntubMonitor.currentRange') }}</p>
    <p class="ntub-current-source">{{ $t('ntubMonitor.architecture') }}</p>
    <p v-if="error" class="ntub-current-error" role="alert">
      {{ $t('ntubMonitor.apiError') }}: {{ formatNtubError(error, $t) }}
    </p>

    <div class="ntub-current-footer">
      <span>{{ $t('ntubMonitor.updates') }}</span>
      <span>{{ formattedLastUpdated || $t('ntubMonitor.notUpdated') }}</span>
    </div>
  </div>
</template>

<script setup>
import { formatNtubError } from '../utils/ntubError';
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';

const current = ref(null);
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

async function loadCurrent() {
  if (pending) return;
  pending = true;
  try {
    const response = await fetch('/ntub-api/sensors/current', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (typeof data.current !== 'number' || !Number.isFinite(data.current)) {
      throw new Error('Invalid current value');
    }
    if (!active) return;
    current.value = data.current;
    lastUpdated.value = Date.now();
    error.value = '';
  } catch (err) {
    if (!active) return;
    current.value = null;
    error.value = err.message;
  } finally {
    pending = false;
  }
}

onMounted(() => {
  active = true;
  loadCurrent();
  timer = setInterval(loadCurrent, 5000);
});

onUnmounted(() => {
  active = false;
  if (timer !== null) clearInterval(timer);
});
</script>

<style scoped>
.ntub-current-card {
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid #d9e2ec;
  border-radius: 12px;
  background: #f8fbff;
  color: #24374c;
}
.ntub-current-header,
.ntub-current-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.ntub-current-header h5 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ntub-current-badge {
  border-radius: 5px;
  padding: 4px 8px;
  background: #e5ecf4;
  color: #43556d;
  font-size: 12px;
}
.ntub-current-value {
  margin: 14px 0 4px;
  font-size: 34px;
  font-weight: 600;
  color: #315fa9;
}
.ntub-current-status {
  color: #24734b;
  font-weight: 600;
  margin: 0 0 8px;
}
.ntub-current-status.is-error {
  color: #b42318;
}
.ntub-current-note,
.ntub-current-source {
  color: #65758c;
  font-size: 13px;
  margin: 0 0 8px;
}
.ntub-current-error {
  color: #b42318;
  font-size: 13px;
}
.ntub-current-footer {
  color: #65758c;
  font-size: 12px;
  margin-top: 15px;
}
</style>
