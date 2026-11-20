import { QUICK_TIME_RANGES } from '../config';
import type {
  TraceCapabilities,
  TraceRecord,
  TraceTimeRange
} from './requests';

export type TraceMessage = (
  key: string,
  values?: Record<string, string | number>
) => string;

const requestIdPattern = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
export const isRequestId = (id: string) => requestIdPattern.test(id);
export const isTraceIdentifier = (id: string) =>
  isRequestId(id) || /^[\da-f]{32}$/i.test(id);

export const traceRecordKey = (row: TraceRecord) =>
  `${row.trace_id}:${row.request_id ?? row.started_at_ms}`;

export const formatTraceValue = (
  value: number | null | undefined,
  unit = ''
) =>
  value == null
    ? '—'
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}${unit ? ' ' + unit : ''}`;

export const formatTraceDate = (timestamp: number, locale?: string) =>
  new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium'
  }).format(timestamp);

export interface LogTarget {
  requestId: string;
  from: number;
  to: number;
}

export const logTimeWindow = (
  requestId: string,
  range: TraceTimeRange
): LogTarget => {
  if ('start' in range) {
    return { requestId, from: range.start * 1000, to: range.end * 1000 };
  }
  const to = Date.now();
  const seconds =
    QUICK_TIME_RANGES.find(([window]) => window === range.window)?.[1] ?? 3600;
  return {
    requestId,
    from: to - seconds * 1000,
    to
  };
};

export const logRequestWindow = (
  row: TraceRecord & { request_id: string }
): LogTarget => ({
  requestId: row.request_id,
  from: row.started_at_ms - 60_000,
  to: Math.ceil(row.started_at_ms + row.duration_ms + 60_000)
});

export const logQuery = (target: LogTarget) =>
  `{service_name=~"higress|gpustack[.](server|worker|engine)"} | request_id=${JSON.stringify(target.requestId)}`;

export function grafanaExploreLink(
  capabilities: TraceCapabilities,
  target: LogTarget
) {
  const base = capabilities.log_explore_url;
  const uid = capabilities.log_datasource_uid;
  if (!capabilities.log_collection_enabled || !base || !uid) return undefined;
  const url = new URL(base);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  url.searchParams.set('schemaVersion', '1');
  url.searchParams.set(
    'panes',
    JSON.stringify({
      request: {
        datasource: uid,
        queries: [
          {
            refId: 'A',
            datasource: { uid, type: 'loki' },
            expr: logQuery(target),
            queryType: 'range'
          }
        ],
        range: { from: String(target.from), to: String(target.to) }
      }
    })
  );
  return url.toString();
}
