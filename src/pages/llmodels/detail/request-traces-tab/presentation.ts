import { QUICK_TIME_RANGES } from '../config';
import type {
  TraceCapabilities,
  TraceRecord,
  TraceSpan,
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

export function spanTimelineRows<T extends Pick<TraceSpan, 'id' | 'parent_id'>>(
  spans: T[]
) {
  const ids = new Set(spans.map(({ id }) => id));
  const children = new Map<string | null, T[]>();
  for (const span of spans) {
    const parent =
      span.parent_id && ids.has(span.parent_id) ? span.parent_id : null;
    const siblings = children.get(parent);
    if (siblings) {
      siblings.push(span);
    } else {
      children.set(parent, [span]);
    }
  }

  // Each branch records whether its level has a following sibling.
  const ordered: { span: T; branches: boolean[] }[] = [];
  const visited = new Set<string>();
  const visit = (span: T, branches: boolean[]) => {
    if (visited.has(span.id)) return;
    visited.add(span.id);
    ordered.push({ span, branches });
    const siblings = children.get(span.id) ?? [];
    siblings.forEach((child, index) => {
      visit(child, [...branches, index < siblings.length - 1]);
    });
  };
  for (const span of children.get(null) ?? []) visit(span, []);
  for (const span of spans) visit(span, []);
  return ordered;
}

type SpanTiming = Pick<TraceSpan, 'start_offset_ms' | 'duration_ms'>;
type TimelineWindow = { start: number; end: number };

export function spanTimelineWindow(
  spans: SpanTiming[],
  focus?: SpanTiming
): TimelineWindow {
  if (focus && focus.duration_ms > 0) {
    return {
      start: focus.start_offset_ms,
      end: focus.start_offset_ms + focus.duration_ms
    };
  }
  return {
    start: 0,
    end: Math.max(
      1,
      ...spans.map((span) => span.start_offset_ms + span.duration_ms)
    )
  };
}

export function spanTimelineSegment(
  span: SpanTiming,
  { start, end }: TimelineWindow
) {
  const spanEnd = span.start_offset_ms + span.duration_ms;
  const from = Math.max(span.start_offset_ms, start);
  const to = Math.min(spanEnd, end);
  if (to < from || (to === from && span.duration_ms > 0)) return undefined;
  const duration = end - start;
  return {
    offset: ((from - start) / duration) * 100,
    width: ((to - from) / duration) * 100,
    clippedStart: span.start_offset_ms < start,
    clippedEnd: spanEnd > end
  };
}

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
