import { GSDrawer, StatusDot } from '@gpustack/core-ui';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Flex,
  Row,
  Skeleton,
  Tabs,
  Typography
} from 'antd';
import { useState } from 'react';
import type { ResourceSnapshot } from '../services/scoped-resource';
import {
  formatTraceDate,
  formatTraceValue,
  logRequestWindow,
  spanTimelineRows,
  timelineStartWindow,
  type LogTarget,
  type TraceMessage
} from './presentation';
import type { TraceDetail, TraceRecord } from './requests';
import styles from './trace-details.module.less';

const timeTicks = [0, 25, 50, 75, 100];
const phaseLabels = { prefill: 'Prefill', decode: 'Decode' } as const;

const statusTone = {
  success: 'success',
  error: 'error',
  cancelled: 'warning',
  unknown: 'inactive'
} as const;

export const RequestTraceStatus = ({
  row,
  t
}: {
  row: TraceRecord;
  t: TraceMessage;
}) => (
  <StatusDot
    statusValue={{
      status: statusTone[row.outcome],
      text: [t(row.outcome), row.status_code]
        .filter((value) => value != null)
        .join(' ')
    }}
  />
);

const SpanTimeline = ({
  detail,
  t
}: {
  detail: TraceDetail;
  t: TraceMessage;
}) => {
  const { spans, span_count: count } = detail;
  const [selectedId, setSelectedId] = useState(spans[0]?.id);
  const [zoomToStart, setZoomToStart] = useState(false);
  const selected = spans.find((span) => span.id === selectedId) ?? spans[0];
  const fullWindow = Math.max(
    1,
    ...spans.map((span) => span.start_offset_ms + span.duration_ms)
  );
  const startWindow = timelineStartWindow(spans, fullWindow);
  const visibleEnd = (zoomToStart && startWindow) || fullWindow;
  const position = (time: number) => `${(time / visibleEnd) * 100}%`;
  const selectedMarkers = selected
    ? new Set([
        selected.start_offset_ms,
        selected.start_offset_ms + selected.duration_ms
      ])
    : new Set<number>();

  return (
    <Flex vertical gap={12}>
      {!detail.request.has_engine && (
        <Alert type="info" showIcon title={t('missingEngine')} />
      )}
      <Flex justify="space-between" align="center" gap={8}>
        <Typography.Title level={5} style={{ margin: 0 }}>
          {t('spanTimeline', { count })}
        </Typography.Title>
        {startWindow && (
          <Button size="small" onClick={() => setZoomToStart(!zoomToStart)}>
            {t(zoomToStart ? 'fullTimeline' : 'zoomStarts')}
          </Button>
        )}
      </Flex>
      {spans.length < count && (
        <Typography.Text type="secondary">
          {t('spanLimit', { count: spans.length })}
        </Typography.Text>
      )}
      <div className={styles.timeline}>
        <Flex justify="end" className={styles.timeAxis}>
          <div className={styles.track}>
            {timeTicks.map((tick) => (
              <Typography.Text
                key={tick}
                type="secondary"
                className={styles.tick}
                style={{ insetInlineStart: `${tick}%` }}
              >
                {formatTraceValue((visibleEnd * tick) / 100, 'ms')}
              </Typography.Text>
            ))}
          </div>
        </Flex>
        <div className={styles.gridArea} aria-hidden="true">
          <div className={styles.guides}>
            {timeTicks.map((tick) => (
              <span key={tick} style={{ insetInlineStart: `${tick}%` }} />
            ))}
            {[...selectedMarkers]
              .filter((time) => time <= visibleEnd)
              .map((time) => (
                <span
                  key={time}
                  className={styles.spanMarker}
                  style={{ insetInlineStart: position(time) }}
                />
              ))}
          </div>
        </div>
        <Flex vertical gap={8}>
          {spanTimelineRows(spans).map(({ span, depth }) => {
            const end = span.start_offset_ms + span.duration_ms;
            const startLabel = formatTraceValue(span.start_offset_ms, 'ms');
            return (
              <Button
                key={span.id}
                aria-pressed={selected?.id === span.id}
                type={selected?.id === span.id ? 'default' : 'text'}
                className={styles.spanButton}
                title={[
                  span.name,
                  `${t('spanStart')} ${startLabel}`,
                  `${t('spanEnd')} ${formatTraceValue(end, 'ms')}`
                ]
                  .filter(Boolean)
                  .join('\n')}
                onClick={() => setSelectedId(span.id)}
              >
                <Flex align="center" gap={8} className={styles.spanContent}>
                  <Flex
                    vertical
                    align="start"
                    className={styles.spanLabel}
                    style={{ paddingInlineStart: `min(${depth * 8}px, 20%)` }}
                  >
                    <Typography.Text ellipsis>
                      {depth ? '↳ ' : ''}
                      {span.service || '—'}
                      {span.phase ? ` · ${phaseLabels[span.phase]}` : ''}
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis>
                      {span.start_offset_ms > 0 ? `+${startLabel} · ` : ''}
                      {formatTraceValue(span.duration_ms, 'ms')}
                    </Typography.Text>
                  </Flex>
                  <div className={`${styles.track} ${styles.spanTrack}`}>
                    {span.start_offset_ms <= visibleEnd && (
                      <span
                        className={styles.bar}
                        data-role={span.role}
                        data-continues={end > visibleEnd || undefined}
                        style={{
                          insetInlineStart: position(span.start_offset_ms),
                          width: position(
                            Math.min(end, visibleEnd) - span.start_offset_ms
                          )
                        }}
                      />
                    )}
                  </div>
                </Flex>
              </Button>
            );
          })}
        </Flex>
      </div>
      {selected && (
        <Card size="small" title={t('spanAttributes')}>
          <Descriptions
            column={1}
            size="small"
            items={[
              {
                key: 'name',
                label: 'span.name',
                children: selected.name || '—'
              },
              {
                key: 'service',
                label: 'service.name',
                children: (selected.reported_service ?? selected.service) || '—'
              },
              { key: 'id', label: 'span.id', children: selected.id },
              {
                key: 'parent',
                label: 'parent.span.id',
                children: selected.parent_id ?? '—'
              },
              ...(selected.status === 'error'
                ? [{ key: 'status', label: 'status', children: t('spanError') }]
                : []),
              {
                key: 'start',
                label: t('spanStart'),
                children: formatTraceValue(selected.start_offset_ms, 'ms')
              },
              {
                key: 'end',
                label: t('spanEnd'),
                children: formatTraceValue(
                  selected.start_offset_ms + selected.duration_ms,
                  'ms'
                )
              },
              {
                key: 'duration',
                label: t('duration'),
                children: formatTraceValue(selected.duration_ms, 'ms')
              }
            ]}
          />
          {selected.engine && (
            <Flex vertical gap={8} className={styles.engineAttributes}>
              <Typography.Text strong>{t('engineTimings')}</Typography.Text>
              <TraceStats
                values={[
                  [
                    t('queue'),
                    formatTraceValue(selected.engine.queue_ms, 'ms')
                  ],
                  [
                    'Prefill',
                    formatTraceValue(selected.engine.prefill_ms, 'ms')
                  ],
                  ['Decode', formatTraceValue(selected.engine.decode_ms, 'ms')],
                  [
                    'TPOT',
                    formatTraceValue(selected.engine.tpot_ms, 'ms/token')
                  ]
                ]}
              />
            </Flex>
          )}
        </Card>
      )}
    </Flex>
  );
};

const TraceStats = ({ values }: { values: [string, string][] }) => (
  <Row gutter={[8, 8]}>
    {values.map(([label, value]) => (
      <Col key={label} xs={12} lg={6}>
        <Card size="small" className={styles.stat}>
          <Flex vertical gap={4}>
            <Typography.Text type="secondary">{label}</Typography.Text>
            <Typography.Text strong>{value}</Typography.Text>
          </Flex>
        </Card>
      </Col>
    ))}
  </Row>
);

export default function TraceDetails({
  row,
  state,
  instanceName,
  locale,
  t,
  logsEnabled,
  onLogs,
  onClose,
  onRetry
}: {
  row: TraceRecord | null;
  state: ResourceSnapshot<TraceDetail>;
  instanceName: (id: number | null) => string;
  locale: string;
  t: TraceMessage;
  logsEnabled: boolean;
  onLogs: (target: LogTarget) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const detail = state.data;
  const observation = detail?.request ?? row;
  const notFound =
    (state.error as { response?: { status?: number } } | null)?.response
      ?.status === 404;

  return (
    <GSDrawer
      open={!!row}
      onClose={onClose}
      styles={{
        wrapper: { width: 'min(960px, 100vw)' },
        body: { paddingInline: 'var(--ant-padding-lg)' }
      }}
      destroyOnHidden
      title={
        <Flex gap={12} align="center">
          {t('requestDetail')}
          {observation && <RequestTraceStatus row={observation} t={t} />}
        </Flex>
      }
    >
      {observation && (
        <Flex vertical gap={16}>
          <Descriptions
            size="small"
            column={1}
            items={[
              {
                key: 'request',
                label: 'Request ID',
                children: (
                  <Typography.Text code copyable={!!observation.request_id}>
                    {observation.request_id ?? '—'}
                  </Typography.Text>
                )
              },
              {
                key: 'trace',
                label: 'Trace ID',
                children: (
                  <Typography.Text code copyable>
                    {observation.trace_id}
                  </Typography.Text>
                )
              }
            ]}
          />
          <Flex gap={16} wrap="wrap">
            <Typography.Text type="secondary">
              {formatTraceDate(observation.started_at_ms, locale)}
            </Typography.Text>
            <Typography.Text type="secondary">
              {t('instanceColumn')} ·{' '}
              {observation.instance_name ??
                instanceName(observation.instance_id)}
            </Typography.Text>
          </Flex>
          <TraceStats
            values={[
              [
                t('duration'),
                formatTraceValue(observation.duration_ms / 1000, 's')
              ],
              [
                t('engineTtft'),
                formatTraceValue(observation.engine?.ttft_ms, 'ms')
              ],
              [
                t('inputTokens'),
                formatTraceValue(observation.engine?.input_tokens)
              ],
              [
                t('outputTokens'),
                formatTraceValue(observation.engine?.output_tokens)
              ]
            ]}
          />
          {logsEnabled && observation.request_id && (
            <Flex justify="end">
              <Button
                onClick={() =>
                  onLogs(
                    logRequestWindow({
                      ...observation,
                      request_id: observation.request_id!
                    })
                  )
                }
              >
                {t('viewLogs')}
              </Button>
            </Flex>
          )}
          {state.loading && <Skeleton active />}
          {state.error != null && (
            <Alert
              showIcon
              type={notFound ? 'info' : 'error'}
              title={t(notFound ? 'traceNotFound' : 'queryFailed')}
              action={<Button onClick={onRetry}>{t('retry')}</Button>}
            />
          )}
          {detail && (
            <Tabs
              key={`${observation.trace_id}:${observation.request_id}`}
              items={[
                {
                  key: 'timeline',
                  label: t('timeline'),
                  children: <SpanTimeline detail={detail} t={t} />
                },
                {
                  key: 'attributes',
                  label: t('attributes'),
                  children: (
                    <Descriptions
                      column={1}
                      size="small"
                      items={[
                        {
                          key: 'method',
                          label: t('endpoint'),
                          children: observation.path ?? '—'
                        },
                        {
                          key: 'status',
                          label: 'HTTP',
                          children: observation.status_code ?? '—'
                        },
                        {
                          key: 'service',
                          label: 'service.name',
                          children: observation.observed_by || '—'
                        },
                        {
                          key: 'source',
                          label: t('durationSource'),
                          children: observation.observed_by || '—'
                        },
                        {
                          key: 'stream',
                          label: 'stream',
                          children:
                            observation.stream == null
                              ? '—'
                              : String(observation.stream)
                        }
                      ]}
                    />
                  )
                }
              ]}
            />
          )}
        </Flex>
      )}
    </GSDrawer>
  );
}
