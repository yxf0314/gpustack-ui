import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  grafanaExploreLink,
  isRequestId,
  isTraceIdentifier,
  logTimeWindow,
  spanTimelineDuration,
  spanTimelineRows
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
    spanTimelineRows(spans).map(({ span, depth }) => [span.id, depth]),
    [
      ['gateway', 0],
      ['upstream', 1],
      ['worker', 2],
      ['router', 3],
      ['prefill-call', 4],
      ['prefill-engine', 5],
      ['decode-call', 4],
      ['decode-engine', 5],
      ['orphan', 0]
    ]
  );
});

test('the static timeline covers the latest recorded end, including spans that outlive their parent', () => {
  const parent = { start_offset_ms: 0, duration_ms: 200 };
  const child = { start_offset_ms: 20, duration_ms: 220 };
  assert.equal(spanTimelineDuration([child, parent]), 240);
  assert.equal(
    spanTimelineDuration([{ start_offset_ms: 0, duration_ms: 0 }]),
    1
  );
});
