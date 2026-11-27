<template>
  <section class="ntub-history" :aria-label="$t('ntubHistory.cpuTitle')">
    <div class="ntub-history__heading">
      <div>
        <h5 class="ntub-history__title">{{ $t('ntubHistory.cpuTitle') }}</h5>
        <p class="ntub-history__subtitle">
          CPU_Temp · {{ $t('ntubMonitor.updates') }}
          <span v-if="simulated === true" class="ntub-history__badge">{{
            $t('ntubMonitor.simulated')
          }}</span>
        </p>
      </div>
      <div class="ntub-history__controls">
        <label>
          <span class="ntub-history__control-label">{{
            $t('ntubHistory.displayRange')
          }}</span>
          <select v-model.number="minutes" @change="changeRange">
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
        </label>
        <button type="button" :disabled="loading" @click="loadHistory()">
          {{ loading ? $t('ntubHistory.updating') : $t('ntubHistory.refresh') }}
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="ntub-history__message ntub-history__message--error"
      role="status"
    >
      {{ formatNtubError(error, $t) }}
      <span v-if="displayPoints.length">{{
        $t('ntubHistory.keepPrevious')
      }}</span>
    </div>
    <div v-if="invalidCount" class="ntub-history__message" role="status">
      {{ $t('ntubHistory.invalidCount', { count: invalidCount }) }}
    </div>
    <div
      v-if="sampleIsStale && !error"
      class="ntub-history__message"
      role="status"
    >
      {{ $t('ntubHistory.stale') }}
    </div>

    <dl class="ntub-history__summary">
      <div>
        <dt>{{ $t('ntubHistory.latest') }}</dt>
        <dd class="ntub-history__latest">
          {{ formatTemperature(summary.latest) }} <span>°C</span>
        </dd>
      </div>
      <div>
        <dt>{{ $t('ntubHistory.minimum') }}</dt>
        <dd>{{ formatTemperature(summary.min) }} <span>°C</span></dd>
      </div>
      <div>
        <dt>{{ $t('ntubHistory.average') }}</dt>
        <dd>{{ formatTemperature(summary.average) }} <span>°C</span></dd>
      </div>
      <div>
        <dt>{{ $t('ntubHistory.maximum') }}</dt>
        <dd>{{ formatTemperature(summary.max) }} <span>°C</span></dd>
      </div>
    </dl>

    <div v-if="displayPoints.length" class="ntub-history__chart-scroll">
      <svg
        class="ntub-history__chart"
        :viewBox="'0 0 ' + plot.width + ' ' + plot.height"
        role="img"
        :aria-label="chartDescription"
      >
        <title>{{ chartDescription }}</title>
        <text :x="plot.left" y="17" class="ntub-history__axis-title">
          {{ $t('ntubHistory.cpuAxis') }}
        </text>
        <g v-for="tick in yTicks" :key="'y-' + tick.value">
          <line
            :x1="plot.left"
            :x2="plot.width - plot.right"
            :y1="tick.y"
            :y2="tick.y"
            class="ntub-history__grid"
          />
          <text
            :x="plot.left - 10"
            :y="tick.y + 4"
            text-anchor="end"
            class="ntub-history__axis-text"
          >
            {{ formatTemperature(tick.value) }}
          </text>
        </g>
        <g v-for="(tick, index) in xTicks" :key="'x-' + index">
          <line
            :x1="tick.x"
            :x2="tick.x"
            :y1="plot.top"
            :y2="plot.height - plot.bottom"
            class="ntub-history__grid ntub-history__grid--vertical"
          />
          <text
            :x="tick.x"
            :y="plot.height - plot.bottom + 24"
            :text-anchor="
              index === 0
                ? 'start'
                : index === xTicks.length - 1
                  ? 'end'
                  : 'middle'
            "
            class="ntub-history__axis-text"
          >
            {{ formatTime(tick.time, false) }}
          </text>
        </g>
        <polyline
          v-for="(segment, index) in lineSegments"
          :key="'segment-' + index"
          :points="segment"
          class="ntub-history__line"
        />
        <circle
          v-for="point in plottedPoints"
          :key="point.time"
          :cx="point.x"
          :cy="point.y"
          :r="plottedPoints.length === 1 ? 4 : 2"
          class="ntub-history__point"
        >
          <title>
            {{ formatTimestamp(point.time) }} ·
            {{ formatTemperature(point.temperature) }} °C
          </title>
        </circle>
      </svg>
    </div>
    <div v-else class="ntub-history__empty" role="status">
      <template v-if="loading">{{ $t('ntubHistory.cpuLoading') }}</template>
      <template v-else-if="error">{{ $t('ntubHistory.loadError') }}</template>
      <template v-else>{{ $t('ntubHistory.cpuEmpty', { minutes }) }}</template>
    </div>

    <div class="ntub-history__footer">
      <span
        >{{ $t('ntubHistory.records', { count: displayPoints.length }) }} ·
        {{ $t('ntubHistory.timezone') }}</span
      >
      <span
        >{{ $t('ntubHistory.lastSuccess') }}:
        {{ lastSuccessAt ? formatTime(lastSuccessAt, true) : '—' }}</span
      >
    </div>
    <p v-if="displayPoints.length" class="ntub-history__hint">
      {{ $t('ntubHistory.cpuHint') }}
    </p>
  </section>
</template>

<script>
import { formatNtubError } from '../utils/ntubError';
const HISTORY_URL = '/ntub-api/sensors/cpu-temp/history';
const REFRESH_MS = 5000;
const REQUEST_TIMEOUT_MS = 12000;
const GAP_MS = 20000;

export default {
  name: 'NtubCpuTempHistory',
  data() {
    return {
      minutes: 30,
      points: [],
      simulated: null,
      invalidCount: 0,
      loading: false,
      error: '',
      lastSuccessAt: null,
      windowEnd: Date.now(),
      requestedRange: 30,
      intervalId: null,
      controller: null,
      requestSequence: 0,
      disposed: false,
      plot: {
        width: 860,
        height: 300,
        left: 62,
        right: 20,
        top: 32,
        bottom: 44,
      },
    };
  },
  computed: {
    windowStart() {
      return this.windowEnd - this.requestedRange * 60000;
    },
    displayPoints() {
      return this.points.filter(
        (point) =>
          point.time >= this.windowStart && point.time <= this.windowEnd,
      );
    },
    summary() {
      if (!this.displayPoints.length)
        return { latest: null, min: null, max: null, average: null };
      const temperatures = this.displayPoints.map((point) => point.temperature);
      return {
        latest: temperatures[temperatures.length - 1],
        min: Math.min(...temperatures),
        max: Math.max(...temperatures),
        average:
          temperatures.reduce((sum, value) => sum + value, 0) /
          temperatures.length,
      };
    },
    sampleIsStale() {
      if (!this.displayPoints.length || !this.lastSuccessAt) return false;
      return (
        this.lastSuccessAt -
          this.displayPoints[this.displayPoints.length - 1].time >
        30000
      );
    },
    yScale() {
      if (!this.displayPoints.length) return { min: 0, max: 1, step: 0.25 };
      const span = this.summary.max - this.summary.min;
      const padding = Math.max(1, span * 0.12);
      const roughStep = (span + padding * 2) / 4;
      const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
      const fraction = roughStep / magnitude;
      const niceFraction =
        fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
      const step = niceFraction * magnitude;
      return {
        min: Math.floor((this.summary.min - padding) / step) * step,
        max: Math.ceil((this.summary.max + padding) / step) * step,
        step,
      };
    },
    yTicks() {
      const count = Math.round(
        (this.yScale.max - this.yScale.min) / this.yScale.step,
      );
      return Array.from({ length: count + 1 }, (_, index) => {
        const value = this.yScale.min + index * this.yScale.step;
        return { value, y: this.yPosition(value) };
      });
    },
    xTicks() {
      return Array.from({ length: 5 }, (_, index) => {
        const time =
          this.windowStart + ((this.windowEnd - this.windowStart) * index) / 4;
        return { time, x: this.xPosition(time) };
      });
    },
    plottedPoints() {
      return this.displayPoints.map((point) => ({
        ...point,
        x: this.xPosition(point.time),
        y: this.yPosition(point.temperature),
      }));
    },
    lineSegments() {
      const segments = [];
      let current = [];
      let previous = null;
      this.plottedPoints.forEach((point) => {
        if (previous && point.time - previous.time > GAP_MS) {
          if (current.length > 1) segments.push(current.join(' '));
          current = [];
        }
        current.push(point.x + ',' + point.y);
        previous = point;
      });
      if (current.length > 1) segments.push(current.join(' '));
      return segments;
    },
    chartDescription() {
      return [
        this.$t('ntubHistory.lastMinutes', { minutes: this.requestedRange }),
        'CPU',
        this.$t('ntubHistory.records', { count: this.displayPoints.length }),
        this.$t('ntubHistory.minimum') +
          ' ' +
          this.formatTemperature(this.summary.min) +
          ' °C',
        this.$t('ntubHistory.maximum') +
          ' ' +
          this.formatTemperature(this.summary.max) +
          ' °C',
        this.$t('ntubHistory.timezone'),
      ].join(' · ');
    },
  },
  mounted() {
    this.loadHistory();
    this.intervalId = window.setInterval(() => this.loadHistory(), REFRESH_MS);
  },
  beforeUnmount() {
    this.disposed = true;
    this.requestSequence += 1;
    window.clearInterval(this.intervalId);
    if (this.controller) this.controller.abort();
  },
  methods: {
    formatNtubError,
    formatTemperature(value) {
      return typeof value === 'number' && Number.isFinite(value)
        ? value.toFixed(1)
        : '—';
    },
    formatTime(value, seconds) {
      return new Date(value).toLocaleTimeString(
        this.$i18n.locale === 'en-US' ? 'en-US' : 'zh-TW',
        {
          timeZone: 'Asia/Taipei',
          hour: '2-digit',
          minute: '2-digit',
          ...(seconds ? { second: '2-digit' } : {}),
          hour12: false,
        },
      );
    },
    formatTimestamp(value) {
      return new Date(value).toLocaleString(
        this.$i18n.locale === 'en-US' ? 'en-US' : 'zh-TW',
        {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        },
      );
    },
    xPosition(time) {
      return (
        this.plot.left +
        ((time - this.windowStart) / (this.windowEnd - this.windowStart)) *
          (this.plot.width - this.plot.left - this.plot.right)
      );
    },
    yPosition(temperature) {
      return (
        this.plot.height -
        this.plot.bottom -
        ((temperature - this.yScale.min) /
          (this.yScale.max - this.yScale.min)) *
          (this.plot.height - this.plot.top - this.plot.bottom)
      );
    },
    changeRange() {
      this.points = [];
      this.lastSuccessAt = null;
      this.invalidCount = 0;
      this.error = '';
      this.requestedRange = this.minutes;
      this.windowEnd = Date.now();
      this.loadHistory(true);
    },
    normalizePoints(rawPoints) {
      const uniquePoints = new Map();
      let invalidCount = 0;
      rawPoints.forEach((point) => {
        if (
          !point ||
          typeof point.timestamp !== 'string' ||
          !/(?:Z|[+-]\d{2}:\d{2})$/i.test(point.timestamp) ||
          typeof point.temperature !== 'number' ||
          !Number.isFinite(point.temperature)
        ) {
          invalidCount += 1;
          return;
        }
        const time = Date.parse(point.timestamp);
        if (!Number.isFinite(time)) {
          invalidCount += 1;
          return;
        }
        uniquePoints.set(time, { time, temperature: point.temperature });
      });
      return {
        points: Array.from(uniquePoints.values()).sort(
          (a, b) => a.time - b.time,
        ),
        invalidCount,
      };
    },
    async loadHistory(force = false) {
      if (this.disposed || (this.loading && !force)) return;
      const sequence = ++this.requestSequence;
      if (this.controller) this.controller.abort();
      const controller = new AbortController();
      this.controller = controller;
      const minutes = this.minutes;
      this.loading = true;
      let timedOut = false;
      const timeoutId = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(
          HISTORY_URL + '?minutes=' + encodeURIComponent(minutes),
          {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          },
        );
        if (response.status === 401)
          throw new Error(
            '歷史 API 要求登入（401），請重新登入 WebUI 後再試。',
          );
        if (response.status === 403)
          throw new Error('目前沒有讀取歷史資料的權限（403）。');
        if (!response.ok)
          throw new Error('無法取得歷史資料（HTTP ' + response.status + '）。');
        let payload;
        try {
          payload = await response.json();
        } catch {
          throw new Error('歷史 API 未回傳有效的 JSON 資料。');
        }
        if (!payload || !Array.isArray(payload.points))
          throw new Error('歷史資料格式不符：缺少 points 陣列。');
        const normalized = this.normalizePoints(payload.points);
        if (payload.points.length && !normalized.points.length) {
          throw new Error('歷史資料的時間或溫度格式不符，無法繪製圖表。');
        }
        if (this.disposed || sequence !== this.requestSequence) return;
        const receivedAt = Date.now();
        const newest = normalized.points[normalized.points.length - 1];
        this.windowEnd = newest
          ? Math.max(receivedAt, newest.time)
          : receivedAt;
        this.requestedRange = minutes;
        this.points = normalized.points;
        this.invalidCount = normalized.invalidCount;
        this.simulated =
          typeof payload.simulated === 'boolean' ? payload.simulated : null;
        this.lastSuccessAt = receivedAt;
        this.error = '';
      } catch (requestError) {
        if (this.disposed || sequence !== this.requestSequence) return;
        if (timedOut) {
          this.error = '歷史資料讀取逾時，稍後會自動重試。';
        } else if (requestError.name !== 'AbortError') {
          this.error =
            requestError instanceof TypeError
              ? '無法連線到歷史 API，請確認 SSH 通道與後端服務仍在執行。'
              : requestError.message || '歷史資料更新失敗，稍後會自動重試。';
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (!this.disposed && sequence === this.requestSequence) {
          this.loading = false;
          this.controller = null;
        }
      }
    },
  },
};
</script>

<style scoped>
.ntub-history {
  margin: 1rem 0 1.5rem;
  padding: 1.25rem;
  border: 1px solid #d8dee6;
  border-radius: 8px;
  background: #fff;
  color: #29323d;
}
.ntub-history__heading,
.ntub-history__controls,
.ntub-history__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.ntub-history__title {
  margin: 0 0 0.35rem;
  font-size: 1.125rem;
  font-weight: 600;
}
.ntub-history__subtitle {
  margin: 0;
  color: #586675;
  font-size: 0.85rem;
}
.ntub-history__badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: #edf4ff;
  color: #24569b;
  font-size: 0.75rem;
}
.ntub-history__controls {
  justify-content: flex-start;
}
.ntub-history__controls label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
}
.ntub-history__control-label {
  font-size: 0.85rem;
  white-space: nowrap;
}
.ntub-history__controls select,
.ntub-history__controls button {
  min-height: 36px;
  padding: 0.4rem 0.65rem;
  border: 1px solid #a7b1bf;
  border-radius: 4px;
  background: #fff;
  color: #29323d;
  font: inherit;
  font-size: 0.85rem;
}
.ntub-history__controls button {
  border-color: #1b5fa7;
  color: #1b5fa7;
  cursor: pointer;
}
.ntub-history__controls button:hover:not(:disabled) {
  background: #edf4ff;
}
.ntub-history__controls button:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ntub-history__controls select:focus-visible,
.ntub-history__controls button:focus-visible {
  outline: 3px solid #91bdf1;
  outline-offset: 2px;
}
.ntub-history__summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
  margin: 1.25rem 0 0.75rem;
}
.ntub-history__summary > div {
  padding: 0.75rem 0.9rem;
  border-radius: 5px;
  background: #f4f6f8;
}
.ntub-history__summary dt {
  margin: 0 0 0.25rem;
  font-size: 0.8rem;
  font-weight: 400;
  color: #586675;
}
.ntub-history__summary dd {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ntub-history__summary dd span {
  font-size: 0.8rem;
  font-weight: 400;
}
.ntub-history__latest {
  color: #1b5fa7;
}
.ntub-history__chart-scroll {
  overflow-x: auto;
}
.ntub-history__chart {
  display: block;
  width: 100%;
  min-width: 0;
  height: auto;
}
.ntub-history__grid {
  stroke: #e4e9ef;
  stroke-width: 1;
}
.ntub-history__grid--vertical {
  stroke-dasharray: 3 4;
}
.ntub-history__axis-text,
.ntub-history__axis-title {
  fill: #586675;
  font-size: 12px;
}
.ntub-history__line {
  fill: none;
  stroke: #2466b2;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.ntub-history__point {
  fill: #2466b2;
}
.ntub-history__point:hover {
  r: 5px;
  fill: #124577;
}
.ntub-history__message {
  margin-top: 1rem;
  padding: 0.65rem 0.8rem;
  border-radius: 4px;
  background: #fff6dd;
  color: #745512;
  font-size: 0.85rem;
}
.ntub-history__message--error {
  background: #fff0ef;
  color: #962c25;
}
.ntub-history__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  padding: 1rem;
  color: #586675;
  text-align: center;
}
.ntub-history__footer {
  margin-top: 0.25rem;
  color: #586675;
  font-size: 0.8rem;
}
.ntub-history__hint {
  margin: 0.5rem 0 0;
  color: #586675;
  font-size: 0.75rem;
}
@media (max-width: 600px) {
  .ntub-history {
    padding: 1rem 0.75rem;
  }
  .ntub-history__summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ntub-history__controls {
    margin-top: 0.25rem;
  }
}
</style>
