import { SectionTitle } from '@gpustack/core-ui';
import { Alert, Button, Descriptions, Flex, Popover, Typography } from 'antd';
import { useState } from 'react';
import {
  formatTraceValue,
  spanTimelineDuration,
  spanTimelineRows,
  type TraceMessage
} from './presentation';
import type { TraceDetail, TraceSpan } from './requests';
import styles from './trace-details.module.less';

const timeTicks = [0, 25, 50, 75, 100];
const phaseLabels = { prefill: 'Prefill', decode: 'Decode' } as const;

const SpanAttributes = ({ span, t }: { span: TraceSpan; t: TraceMessage }) => (
  <Flex vertical gap={12} className={styles.spanPopoverContent}>
    <Descriptions
      column={1}
      size="small"
      items={[
        {
          key: 'name',
          label: 'span.name',
          children: span.name || '—'
        },
        {
          key: 'service',
          label: 'service.name',
          children: (span.reported_service ?? span.service) || '—'
        },
        { key: 'id', label: 'span.id', children: span.id },
        {
          key: 'parent',
          label: 'parent.span.id',
          children: span.parent_id ?? '—'
        },
        ...(span.status === 'error'
          ? [{ key: 'status', label: 'status', children: t('spanError') }]
          : []),
        {
          key: 'start',
          label: t('spanStart'),
          children: formatTraceValue(span.start_offset_ms, 'ms')
        },
        {
          key: 'end',
          label: t('spanEnd'),
          children: formatTraceValue(
            span.start_offset_ms + span.duration_ms,
            'ms'
          )
        },
        {
          key: 'duration',
          label: t('duration'),
          children: formatTraceValue(span.duration_ms, 'ms')
        }
      ]}
    />
    {span.engine && (
      <Descriptions
        title={t('engineTimings')}
        column={2}
        size="small"
        items={[
          {
            key: 'queue',
            label: t('queue'),
            children: formatTraceValue(span.engine.queue_ms, 'ms')
          },
          {
            key: 'prefill',
            label: 'Prefill',
            children: formatTraceValue(span.engine.prefill_ms, 'ms')
          },
          {
            key: 'decode',
            label: 'Decode',
            children: formatTraceValue(span.engine.decode_ms, 'ms')
          },
          {
            key: 'tpot',
            label: 'TPOT',
            children: formatTraceValue(span.engine.tpot_ms, 'ms/token')
          }
        ]}
      />
    )}
  </Flex>
);

export default function SpanTimeline({
  detail,
  t
}: {
  detail: TraceDetail;
  t: TraceMessage;
}) {
  const { spans, span_count: count } = detail;
  const [openSpanId, setOpenSpanId] = useState<string>();
  const duration = spanTimelineDuration(spans);
  const position = (time: number) => `${(time / duration) * 100}%`;

  return (
    <Flex vertical gap={12}>
      <SectionTitle role="heading" aria-level={3}>
        {t('traceWaterfall')}
      </SectionTitle>
      {!detail.request.has_engine && (
        <Alert type="info" showIcon title={t('missingEngine')} />
      )}
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
                {formatTraceValue((duration * tick) / 100, 'ms')}
              </Typography.Text>
            ))}
          </div>
        </Flex>
        <div className={styles.gridArea} aria-hidden="true">
          <div className={styles.guides}>
            {timeTicks.map((tick) => (
              <span key={tick} style={{ insetInlineStart: `${tick}%` }} />
            ))}
          </div>
        </div>
        <Flex vertical gap={4}>
          {spanTimelineRows(spans).map(({ span, depth }) => {
            const open = openSpanId === span.id;
            const offset = formatTraceValue(span.start_offset_ms, 'ms');
            return (
              <Popover
                key={span.id}
                title={t('spanAttributes')}
                content={<SpanAttributes span={span} t={t} />}
                placement="bottomLeft"
                align={{
                  overflow: {
                    adjustX: true,
                    adjustY: true,
                    shiftX: true,
                    shiftY: true
                  }
                }}
                trigger="click"
                open={open}
                onOpenChange={(nextOpen) =>
                  setOpenSpanId((current) =>
                    nextOpen
                      ? span.id
                      : current === span.id
                        ? undefined
                        : current
                  )
                }
                destroyOnHidden
                classNames={{ root: styles.spanPopover }}
              >
                <Button
                  aria-expanded={open}
                  type={open ? 'default' : 'text'}
                  className={styles.spanButton}
                  onKeyDown={(event) => {
                    if (open && event.key === 'Escape') {
                      event.stopPropagation();
                      setOpenSpanId(undefined);
                    }
                  }}
                >
                  <Flex align="center" gap={8} className={styles.spanContent}>
                    <Flex className={styles.spanText}>
                      {depth > 0 && (
                        <span
                          aria-hidden="true"
                          className={styles.spanIndent}
                          style={{ inlineSize: `min(${depth * 18}px, 45%)` }}
                        />
                      )}
                      <Flex vertical align="start" className={styles.spanLabel}>
                        <Typography.Text ellipsis>
                          {span.service || '—'}
                          {span.phase ? ` · ${phaseLabels[span.phase]}` : ''}
                        </Typography.Text>
                        <Typography.Text type="secondary" ellipsis>
                          {span.start_offset_ms > 0 ? `+${offset} · ` : ''}
                          {formatTraceValue(span.duration_ms, 'ms')}
                        </Typography.Text>
                      </Flex>
                    </Flex>
                    <div className={`${styles.track} ${styles.spanTrack}`}>
                      <span
                        className={styles.bar}
                        data-role={span.role}
                        style={{
                          insetInlineStart: `min(${position(span.start_offset_ms)}, calc(100% - 2px))`,
                          width: position(span.duration_ms)
                        }}
                      />
                    </div>
                  </Flex>
                </Button>
              </Popover>
            );
          })}
        </Flex>
      </div>
    </Flex>
  );
}
