import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  grafanaExploreLink,
  isRequestId,
  isTraceIdentifier,
  logTimeWindow,
  spanTimelineRows,
  spanTimelineSegment,
  spanTimelineWindow
} from '../presentation';

const requestId = 'a0000000-0000-4000-8000-000000000001';
const target = { requestId, from: 1000, to: 3000 };
const capabilities = {
  tracing_enabled: false,
  trace_query_configured: false,
  log_collection_enabled: true,
  log_explore_url: 'https://grafana.example/team/explore',
  log_datasource_uid: 'loki-test'
};

test('log fallback uses the same absolute interval as the trace search', () => {
  assert.deepEqual(logTimeWindow(requestId, { start: 10, end: 40 }), {
    requestId,
    from: 10000,
    to: 40000
  });
});

test('log fallback uses the selected monitoring preset', () => {
  const range = logTimeWindow(requestId, { window: '3h' });
  assert.equal(range.to - range.from, 3 * 3600 * 1000);
});

test('a log-only deployment builds an Explore query with the original time window and request ID', () => {
  const url = new URL(grafanaExploreLink(capabilities, target)!);
  assert.equal(url.pathname, '/team/explore');
  assert.equal(url.searchParams.get('schemaVersion'), '1');
  const { request } = JSON.parse(url.searchParams.get('panes')!);
  assert.deepEqual(request.range, { from: '1000', to: '3000' });
  assert.deepEqual(request.queries[0].datasource, {
    uid: 'loki-test',
    type: 'loki'
  });
  assert.ok(request.queries[0].expr.endsWith(`| request_id="${requestId}"`));
});

test('disabled collection or missing Loki configuration has no external log link', () => {
  assert.equal(
    grafanaExploreLink(
      { ...capabilities, log_collection_enabled: false },
      target
    ),
    undefined
  );
  assert.equal(
    grafanaExploreLink({ ...capabilities, log_datasource_uid: null }, target),
    undefined
  );
});

test('trace search requires the full identifier and log search accepts only the request ID', () => {
  assert.equal(isTraceIdentifier(requestId), true);
  assert.equal(isRequestId(requestId), true);
  assert.equal(isTraceIdentifier('A'.repeat(32)), true);
  assert.equal(isRequestId('A'.repeat(32)), false);
  assert.equal(isTraceIdentifier(requestId.slice(0, 12)), false);
});

test('overlapping Prefill and Decode spans stay grouped under the recorded parents', () => {
  const spans = [
    { id: 'gateway', parent_id: null },
    { id: 'upstream', parent_id: 'gateway' },
    { id: 'worker', parent_id: 'upstream' },
    { id: 'router', parent_id: 'worker' },
    { id: 'prefill-call', parent_id: 'router' },
    { id: 'decode-call', parent_id: 'router' },
    { id: 'prefill-engine', parent_id: 'prefill-call' },
    { id: 'decode-engine', parent_id: 'decode-call' },
    { id: 'orphan', parent_id: 'not-retained' }
  ];

  assert.deepEqual(
    spanTimelineRows(spans).map(({ span, branches }) => [span.id, branches]),
    [
      ['gateway', []],
      ['upstream', [false]],
      ['worker', [false, false]],
      ['router', [false, false, false]],
      ['prefill-call', [false, false, false, true]],
      ['prefill-engine', [false, false, false, true, false]],
      ['decode-call', [false, false, false, false]],
      ['decode-engine', [false, false, false, false, false]],
      ['orphan', []]
    ]
  );
});

test('focused timeline fits the selected span and clips other bars to the same scale', () => {
  const parent = { start_offset_ms: 0, duration_ms: 200 };
  const selected = { start_offset_ms: 20, duration_ms: 40 };
  const point = { start_offset_ms: 60, duration_ms: 0 };
  const spans = [parent, selected, point];
  const full = spanTimelineWindow(spans);
  const window = spanTimelineWindow(spans, selected);
  assert.deepEqual(full, { start: 0, end: 200 });
  assert.deepEqual(window, { start: 20, end: 60 });
  assert.deepEqual(spanTimelineWindow(spans, point), full);
  assert.deepEqual(spanTimelineSegment(selected, window), {
    offset: 0,
    width: 100,
    clippedStart: false,
    clippedEnd: false
  });
  assert.deepEqual(spanTimelineSegment(parent, window), {
    offset: 0,
    width: 100,
    clippedStart: true,
    clippedEnd: true
  });
  assert.deepEqual(
    spanTimelineSegment({ start_offset_ms: 40, duration_ms: 30 }, window),
    { offset: 50, width: 50, clippedStart: false, clippedEnd: true }
  );
  assert.equal(
    spanTimelineSegment({ start_offset_ms: 60, duration_ms: 20 }, window),
    undefined
  );
  assert.deepEqual(spanTimelineSegment(point, window), {
    offset: 100,
    width: 0,
    clippedStart: false,
    clippedEnd: false
  });
});
