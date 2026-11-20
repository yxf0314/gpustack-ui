import TimeRangeControl from '@/pages/_components/monitoring/time-range-control';
import { FALLBACK_MONITORING_CAPABILITIES, QUICK_TIME_RANGES } from '../config';
import type { TraceTimeRange } from './requests';

const traceRangeCapabilities = {
  data: {
    ...FALLBACK_MONITORING_CAPABILITIES,
    min_query_seconds: 1,
    supports_custom_range: true
  },
  stale: false
};

export default function TraceTimeRangeControl({
  value = { window: '1h' },
  onChange,
  historyNote
}: {
  value?: TraceTimeRange;
  onChange?: (range: TraceTimeRange) => void;
  historyNote: string;
}) {
  return (
    <TimeRangeControl
      scope={'start' in value ? { window: '1h', ...value } : value}
      capabilities={traceRangeCapabilities}
      historyNote={historyNote}
      changeScope={({ window, start, end }) => {
        if (start !== undefined && end !== undefined) {
          onChange?.({ start, end });
          return;
        }
        const preset = QUICK_TIME_RANGES.find(([option]) => option === window);
        if (preset) onChange?.({ window: preset[0] });
      }}
    />
  );
}
