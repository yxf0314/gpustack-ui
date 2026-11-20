import {
  CardWrapper,
  GSDrawer,
  SectionTitle,
  StatusDot
} from '@gpustack/core-ui';
import {
  Alert,
  Button,
  Col,
  Descriptions,
  Flex,
  Row,
  Skeleton,
  Typography
} from 'antd';
import type { ResourceSnapshot } from '../services/scoped-resource';
import {
  formatTraceDate,
  formatTraceValue,
  logRequestWindow,
  type LogTarget,
  type TraceMessage
} from './presentation';
import type { TraceDetail, TraceRecord } from './requests';
import SpanTimeline from './span-timeline';
import styles from './trace-details.module.less';

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

const RequestCards = ({
  observation,
  instanceName,
  locale,
  t,
  onLogs
}: {
  observation: TraceRecord;
  instanceName: (id: number | null) => string;
  locale: string;
  t: TraceMessage;
  onLogs?: (target: LogTarget) => void;
}) => {
  const requestId = observation.request_id;
  const groups = [
    {
      key: 'requestInfo',
      sm: 24,
      lg: 11,
      items: [
        {
          key: 'request',
          label: 'Request ID',
          children: (
            <Typography.Text
              code
              copyable={!!requestId}
              className={styles.identifier}
            >
              {requestId ?? '—'}
            </Typography.Text>
          )
        },
        {
          key: 'trace',
          label: 'Trace ID',
          children: (
            <Typography.Text code copyable className={styles.identifier}>
              {observation.trace_id}
            </Typography.Text>
          )
        },
        {
          key: 'time',
          label: t('startedAt'),
          children: formatTraceDate(observation.started_at_ms, locale)
        },
        {
          key: 'instance',
          label: t('instanceColumn'),
          children:
            observation.instance_name ?? instanceName(observation.instance_id)
        }
      ]
    },
    {
      key: 'requestMetrics',
      sm: 12,
      lg: 6,
      items: [
        {
          key: 'duration',
          label: t('duration'),
          children: formatTraceValue(observation.duration_ms / 1000, 's')
        },
        {
          key: 'ttft',
          label: t('engineTtft'),
          children: formatTraceValue(observation.engine?.ttft_ms, 'ms')
        },
        {
          key: 'input',
          label: t('inputTokens'),
          children: formatTraceValue(observation.engine?.input_tokens)
        },
        {
          key: 'output',
          label: t('outputTokens'),
          children: formatTraceValue(observation.engine?.output_tokens)
        }
      ]
    },
    {
      key: 'attributes',
      sm: 12,
      lg: 7,
      items: [
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
            observation.stream == null ? '—' : String(observation.stream)
        }
      ]
    }
  ];
  return (
    <Row gutter={[12, 12]} className={styles.requestCards}>
      {groups.map((group) => (
        <Col key={group.key} xs={24} sm={group.sm} lg={group.lg}>
          <CardWrapper style={{ height: '100%' }}>
            <Flex justify="space-between" align="baseline" gap={8} wrap="wrap">
              <SectionTitle>{t(group.key)}</SectionTitle>
              {group.key === 'requestInfo' && onLogs && requestId && (
                <Button
                  size="small"
                  type="link"
                  onClick={() =>
                    onLogs(
                      logRequestWindow({
                        ...observation,
                        request_id: requestId
                      })
                    )
                  }
                >
                  {t('viewLogs')}
                </Button>
              )}
            </Flex>
            <Descriptions column={1} size="small" items={group.items} />
          </CardWrapper>
        </Col>
      ))}
    </Row>
  );
};

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
          <RequestCards
            observation={observation}
            instanceName={instanceName}
            locale={locale}
            t={t}
            onLogs={logsEnabled ? onLogs : undefined}
          />
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
            <SpanTimeline
              key={`${observation.trace_id}:${observation.request_id}`}
              detail={detail}
              t={t}
            />
          )}
        </Flex>
      )}
    </GSDrawer>
  );
}
