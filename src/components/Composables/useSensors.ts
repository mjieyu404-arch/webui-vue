import api from '@/store/api';
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { useAllSubResources } from '@/api/composables/useAllSubResources';
import i18n from '@/i18n';

/**
 * Raw sensor data from Redfish API
 */
interface RawSensor {
  '@odata.id': string;
  Name: string;
  Status?: { Health?: string };
  Reading?: number;
  ReadingCelsius?: number;
  ReadingVolts?: number;
  ReadingUnits?: string;
  ReadingType?: string;
  Thresholds?: {
    LowerCaution?: { Reading?: number };
    UpperCaution?: { Reading?: number };
    LowerCritical?: { Reading?: number };
    UpperCritical?: { Reading?: number };
  };
  LowerThresholdNonCritical?: number;
  UpperThresholdNonCritical?: number;
  LowerThresholdCritical?: number;
  UpperThresholdCritical?: number;
}

/**
 * Sensor data format for display
 */
export interface SensorDisplay {
  name: string;
  status: string;
  currentValue: number | undefined;
  lowerCaution: number | undefined;
  upperCaution: number | undefined;
  lowerCritical: number | undefined;
  upperCritical: number | undefined;
  units: string;
  currentValueDisplay: string;
  lowerCautionDisplay: string;
  upperCautionDisplay: string;
  lowerCriticalDisplay: string;
  upperCriticalDisplay: string;
}

/**
 * Helper function to format a value with units
 * Only shows units if the value is defined
 */
function formatValueWithUnit(value: number | undefined, units: string): string {
  if (value === undefined) {
    return '';
  }
  return units ? ` ${units}` : '';
}

/**
 * Transforms raw sensor data from Redfish API to display format
 *
 * @param sensor - Raw sensor data from Redfish
 * @returns Transformed sensor data for display
 */
function transformSensorData(sensor: RawSensor): SensorDisplay {
  const currentValue =
    sensor.Reading ?? sensor.ReadingCelsius ?? sensor.ReadingVolts;
  const lowerCaution =
    sensor.Thresholds?.LowerCaution?.Reading ??
    sensor.LowerThresholdNonCritical;
  const upperCaution =
    sensor.Thresholds?.UpperCaution?.Reading ??
    sensor.UpperThresholdNonCritical;
  const lowerCritical =
    sensor.Thresholds?.LowerCritical?.Reading ?? sensor.LowerThresholdCritical;
  const upperCritical =
    sensor.Thresholds?.UpperCritical?.Reading ?? sensor.UpperThresholdCritical;

  // Determine units based on sensor type
  let units = '';
  if (sensor.ReadingUnits) {
    units = sensor.ReadingUnits;
  } else if (sensor.ReadingCelsius !== undefined) {
    units = i18n.global.t('unit.℃');
  } else if (
    sensor.ReadingType === 'Voltage' ||
    sensor.ReadingVolts !== undefined
  ) {
    units = i18n.global.t('unit.V');
  }

  return {
    name: sensor.Name,
    status: sensor.Status?.Health || 'Unknown',
    currentValue,
    lowerCaution,
    upperCaution,
    lowerCritical,
    upperCritical,
    units,
    currentValueDisplay: formatValueWithUnit(currentValue, units),
    lowerCautionDisplay: formatValueWithUnit(lowerCaution, units),
    upperCautionDisplay: formatValueWithUnit(upperCaution, units),
    lowerCriticalDisplay: formatValueWithUnit(lowerCritical, units),
    upperCriticalDisplay: formatValueWithUnit(upperCritical, units),
  };
}

/**
 * Composable for fetching all sensors from all chassis
 * Uses useAllSubResources for efficient fetching with:
 * - Automatic expand query support detection
 * - Deduplication by @odata.id
 * - Error aggregation
 * - Smart retry logic (skips 4xx errors)
 * - TanStack Query caching and state management
 *
 * @returns TanStack Query result with transformed sensor data
 */
// openbmc-legacy-dbus-v2: full sensor enumeration with legacy Thermal fallback.
// The old QEMU image exposes a populated D-Bus REST /sensors/enumerate API,
// but the modern Redfish /Chassis/{id}/Sensors collection is empty.
interface LegacyDbusEnumerateResponse {
  status?: string;
  data?: Record<string, Record<string, unknown>>;
}

// Ignore non-finite values (including null for unset D-Bus thresholds).
function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function legacyDbusSensorToDisplay(
  objectPath: string,
  properties: Record<string, unknown>,
): SensorDisplay | null {
  // The additional CPU_Temp/chassis object is a helper association,
  // NOT a ninth sensor. Require exactly /sensors/type/name.
  const match = /^\/xyz\/openbmc_project\/sensors\/([^/]+)\/([^/]+)$/.exec(
    objectPath,
  );
  if (!match) return null;

  const reading = asFiniteNumber(properties.Value);
  if (reading === undefined) return null;

  const kind = match[1];
  const sensorName = match[2].replace(/_/g, ' ');
  const prefix: Record<string, string> = {
    temperature: '',
    fan_tach: 'Fan Tach ',
    voltage: 'Voltage ',
    utilization: 'Utilization ',
    current: 'Current ',
    power: 'Power ',
  };
  const name = (prefix[kind] ?? kind + ' ') + sensorName;

  const rawUnit =
    typeof properties.Unit === 'string'
      ? properties.Unit.split('.').pop() ?? ''
      : '';
  const unitMap: Record<string, string> = {
    DegreesC: i18n.global.t('unit.℃'),
    DegreesF: '°F',
    RPMS: 'RPM',
    Volts: 'V',
    Percent: '%',
    Amperes: 'A',
    Watts: 'W',
    Joules: 'J',
  };
  const units = unitMap[rawUnit] ?? rawUnit;

  // Respect explicit alarm flags rather than inferring alarms from
  // thresholds. The emulated fan may report -110 RPM while Functional=true.
  let status = 'OK';
  if (properties.Functional === false) {
    status = 'Unknown';
  } else if (
    properties.CriticalAlarmHigh === true ||
    properties.CriticalAlarmLow === true
  ) {
    status = 'Critical';
  } else if (
    properties.WarningAlarmHigh === true ||
    properties.WarningAlarmLow === true
  ) {
    status = 'Warning';
  }

  // Round only the displayed numbers, not the original sensor state.
  const rounded = (value: number | undefined): number | undefined =>
    value === undefined ? undefined : Math.round(value * 100) / 100;
  const currentValue = rounded(reading);
  const lowerCaution = rounded(asFiniteNumber(properties.WarningLow));
  const upperCaution = rounded(asFiniteNumber(properties.WarningHigh));
  const lowerCritical = rounded(asFiniteNumber(properties.CriticalLow));
  const upperCritical = rounded(asFiniteNumber(properties.CriticalHigh));

  return {
    name,
    status,
    currentValue,
    lowerCaution,
    upperCaution,
    lowerCritical,
    upperCritical,
    units,
    currentValueDisplay: formatValueWithUnit(currentValue, units),
    lowerCautionDisplay: formatValueWithUnit(lowerCaution, units),
    upperCautionDisplay: formatValueWithUnit(upperCaution, units),
    lowerCriticalDisplay: formatValueWithUnit(lowerCritical, units),
    upperCriticalDisplay: formatValueWithUnit(upperCritical, units),
  };
}

// Prefer standard Redfish Sensors on systems where they exist. On this older
// QEMU firmware, collect ALL eight sensors via the D-Bus REST endpoint.
// Keep Thermal as a final fallback, so the working CPU temperature stays visible
// even if the D-Bus enumeration endpoint is unavailable.
export function useSensors() {
  const modern = useAllSubResources<RawSensor>('/redfish/v1/Chassis', 'Sensors');
  const noModernData = computed(() => (modern.data.value?.length ?? 0) === 0);

  const legacyDbus = useQuery({
    queryKey: ['legacy-dbus-sensors-v2'],
    queryFn: async (): Promise<SensorDisplay[]> => {
      const { data } = await api.get<LegacyDbusEnumerateResponse>(
        '/xyz/openbmc_project/sensors/enumerate',
      );
      if (!data || data.status !== 'ok' || !data.data) {
        throw new Error('Legacy D-Bus sensor enumeration failed');
      }
      return Object.entries(data.data)
        .map(([objectPath, properties]) =>
          legacyDbusSensorToDisplay(objectPath, properties),
        )
        .filter((item): item is SensorDisplay => item !== null);
    },
    enabled: noModernData,
    refetchInterval: 5000,
    retry: false,
  });

  const hasDbusData = computed(() => (legacyDbus.data.value?.length ?? 0) > 0);

  const legacyThermal = useQuery({
    queryKey: ['legacy-thermal-sensors'],
    queryFn: async (): Promise<RawSensor[]> => {
      const { data } = await api.get<{ Temperatures?: RawSensor[] }>(
        '/redfish/v1/Chassis/chassis/Thermal',
      );
      return data.Temperatures ?? [];
    },
    enabled: computed(
      () => noModernData.value && legacyDbus.isFetched.value && !hasDbusData.value,
    ),
    refetchInterval: 5000,
    retry: false,
  });

  const sensors = computed<SensorDisplay[]>(() => {
    if (!noModernData.value) {
      return (modern.data.value ?? []).map(transformSensorData);
    }
    if (hasDbusData.value) {
      return legacyDbus.data.value ?? [];
    }
    return (legacyThermal.data.value ?? []).map(transformSensorData);
  });

  // Avoid making the whole table flicker during periodic five-second polls.
  const isLoading = computed(
    () => sensors.value.length === 0 &&
      (modern.isLoading.value || legacyDbus.isLoading.value || legacyThermal.isLoading.value),
  );
  const isFetching = computed(
    () => sensors.value.length === 0 &&
      (modern.isFetching.value || legacyDbus.isFetching.value || legacyThermal.isFetching.value),
  );
  const isError = computed(
    () => modern.isError.value && legacyDbus.isError.value && legacyThermal.isError.value,
  );
  const error = computed(() =>
    isError.value
      ? legacyDbus.error.value ?? legacyThermal.error.value ?? modern.error.value
      : null,
  );
  const refetch = async () => {
    await Promise.all([modern.refetch(), legacyDbus.refetch(), legacyThermal.refetch()]);
  };

  return {
    data: sensors,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  };
}
