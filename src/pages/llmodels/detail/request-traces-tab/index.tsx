import { getDocumentationUrl } from '@/utils/documentation';
import { ReloadOutlined } from '@ant-design/icons';
import { AutoTooltip, BaseSelect, Table as SealTable } from '@gpustack/core-ui';
import { useIntl } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Result,
  Skeleton,
  Typography
} from 'antd';
import { useRef, useState } from 'react';
import { useDetail } from '../config/context';
import {
  formatTraceDate,
  formatTraceValue,
  grafanaExploreLink,
  isRequestId,
  isTraceIdentifier,
  logQuery,
  logTimeWindow,
  traceRecordKey,
  type LogTarget,
  type TraceMessage
} from './presentation';
import type { TraceFilters, TraceRecord, TraceTimeRange } from './requests';
import TraceDetails, { RequestTraceStatus } from './trace-details';
import styles from './trace-filters.module.less';
import TraceTimeRangeControl from './trace-time-range';
import { defaultFilters, useTraceData } from './use-trace-data';

const outcomes = ['success', 'error', 'cancelled', 'unknown'] as const;

function LogLookup({
  t,
  onLogs
}: {
  t: TraceMessage;
  onLogs: (target: LogTarget) => void;
}) {
  return (
    <Card size="small" title={t('lookupLogs')}>
      <Typography.Paragraph type="secondary">
        {t('lookupLogsHelp')}
      </Typography.Paragraph>
      <Form<{ requestId: string; range: TraceTimeRange }>
        layout="horizontal"
        colon={false}
        labelAlign="left"
        className={styles.filterForm}
        initialValues={defaultFilters}
        onFinish={({ requestId, range }) =>
          onLogs(logTimeWindow(requestId.trim(), range))
        }
      >
        <Flex gap={12} align="start" wrap="wrap">
          <Form.Item
            className={styles.identifier}
            name="requestId"
            label="Request ID"
            rules={[
              {
                validator: (_, value?: string) =>
                  isRequestId(value?.trim() ?? '')
                    ? Promise.resolve()
                    : Promise.reject(new Error(t('invalidRequestId')))
              }
            ]}
          >
            <Input placeholder={t('requestIdPlaceholder')} allowClear />
          </Form.Item>
          <Form.Item className={styles.range} name="range">
            <TraceTimeRangeControl historyNote={t('lookupLogsHelp')} />
          </Form.Item>
          <Button type="primary" htmlType="submit">
            {t('viewLogs')}
          </Button>
        </Flex>
      </Form>
    </Card>
  );
}

export default function RequestTracesTab({
  modelId,
  tenant
}: {
  modelId: number;
  tenant: string;
}) {
  const intl = useIntl();
  const { instances } = useDetail();
  const t: TraceMessage = (key, values) =>
    intl.formatMessage({ id: `requestTracing.${key}` }, values);
  const [filtersForm] = Form.useForm<TraceFilters>();
  const activeFilters = useRef(defaultFilters);
  const pageCursors = useRef<string[]>([]);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TraceRecord | null>(null);
  const [logTarget, setLogTarget] = useState<LogTarget | null>(null);
  const trace = useTraceData(modelId, tenant);
  const capabilities = trace.capabilities.data;
  const tracingEnabled = !!capabilities?.tracing_enabled;
  const logsEnabled = !!capabilities?.log_collection_enabled;
  const listAvailable =
    tracingEnabled && !!capabilities?.trace_query_configured;
  const instanceOptions = (instances.data ?? []).map((instance) => ({
    label: instance.name,
    value: instance.id
  }));
  const instanceName = (id: number | null) =>
    id == null
      ? '—'
      : (instanceOptions.find((instance) => instance.value === id)?.label ??
        `#${id}`);
  const rows = trace.rows.data?.items ?? [];
  const nextCursor = trace.rows.data?.next_cursor;
  const filterRequestId = activeFilters.current.q;

  const closeDetails = () => {
    setSelected(null);
    trace.closeDetail();
  };
  const apply = (values: TraceFilters) => {
    activeFilters.current = { ...values, q: values.q?.trim() || undefined };
    pageCursors.current = [];
    setPage(1);
    closeDetails();
    void trace.loadRows(activeFilters.current);
  };
  const refresh = () => {
    closeDetails();
    pageCursors.current = [];
    setPage(1);
    void trace.refresh(activeFilters.current);
  };
  const changePage = (nextPage: number) => {
    const cursor =
      nextPage > page ? nextCursor : pageCursors.current[nextPage - 1];
    if (!cursor) return;
    if (trace.rows.data) pageCursors.current[page - 1] = trace.rows.data.cursor;
    closeDetails();
    setPage(nextPage);
    void trace.loadRows(activeFilters.current, cursor);
  };
  const openDetails = (row: TraceRecord) => {
    setSelected(row);
    void trace.loadDetail(row);
  };
  const openLogs = (target: LogTarget) => {
    if (!capabilities?.log_collection_enabled) return;
    const url = grafanaExploreLink(capabilities, target);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setLogTarget(target);
  };

  if (!capabilities && !trace.capabilities.error) return <Skeleton active />;

  const columns = [
    {
      dataIndex: 'request_id',
      title: t('requestTime'),
      minWidth: 225,
      span: 2,
      render: (_: unknown, row: TraceRecord) => (
        <Flex vertical gap={2}>
          <Button
            type="link"
            size="small"
            onClick={() => openDetails(row)}
            style={{ paddingInline: 0, alignSelf: 'start', maxWidth: '100%' }}
          >
            <AutoTooltip ghost>{row.request_id ?? row.trace_id}</AutoTooltip>
          </Button>
          <Typography.Text type="secondary">
            {formatTraceDate(row.started_at_ms, intl.locale)}
          </Typography.Text>
        </Flex>
      )
    },
    {
      dataIndex: 'path',
      title: t('endpoint'),
      minWidth: 155,
      render: (_: unknown, row: TraceRecord) => (
        <Flex vertical gap={2}>
          <AutoTooltip ghost>{row.path ?? '—'}</AutoTooltip>
          {row.stream != null && (
            <Typography.Text type="secondary">
              {t(row.stream ? 'streaming' : 'nonStreaming')}
            </Typography.Text>
          )}
        </Flex>
      )
    },
    {
      dataIndex: 'outcome',
      title: t('state'),
      minWidth: 115,
      render: (_: unknown, row: TraceRecord) => (
        <RequestTraceStatus row={row} t={t} />
      )
    },
    {
      dataIndex: 'duration_ms',
      title: t('duration'),
      minWidth: 95,
      render: (value: number) => formatTraceValue(value / 1000, 's')
    },
    {
      dataIndex: 'engine',
      title: 'TTFT',
      minWidth: 96,
      render: (_: unknown, row: TraceRecord) =>
        formatTraceValue(row.engine?.ttft_ms, 'ms')
    },
    {
      dataIndex: 'tokens',
      title: t('tokens'),
      minWidth: 108,
      render: (_: unknown, row: TraceRecord) =>
        `${formatTraceValue(row.engine?.input_tokens)} / ${formatTraceValue(row.engine?.output_tokens)}`
    },
    {
      dataIndex: 'instance_id',
      title: t('instanceColumn'),
      minWidth: 137,
      render: (value: number | null, row: TraceRecord) => (
        <AutoTooltip ghost>
          {row.instance_name ?? instanceName(value)}
        </AutoTooltip>
      )
    }
  ];

  const error = trace.capabilities.error ?? trace.rows.error;
  const loading = trace.capabilities.loading || trace.rows.loading;
  const documentationLink = (
    <Button
      type="link"
      href={getDocumentationUrl(
        'user-guide/observability/#inference-logs-and-traces',
        intl.locale
      )}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('configuration')}
    </Button>
  );
  return (
    <Flex vertical gap={16}>
      {error != null && (
        <Alert
          type="error"
          showIcon
          title={t('queryFailed')}
          action={
            <Button size="small" onClick={refresh}>
              {t('retry')}
            </Button>
          }
        />
      )}
      {capabilities && !tracingEnabled && !logsEnabled && (
        <Result
          status="info"
          title={t('bothOff')}
          subTitle={t('bothOffDetail')}
          extra={documentationLink}
        />
      )}
      {tracingEnabled && !listAvailable && (
        <Alert
          showIcon
          type="warning"
          title={t('traceQueryMissing')}
          action={documentationLink}
        />
      )}
      {!listAvailable && logsEnabled && <LogLookup t={t} onLogs={openLogs} />}

      {listAvailable && (
        <>
          <Form
            form={filtersForm}
            initialValues={defaultFilters}
            layout="horizontal"
            colon={false}
            labelAlign="left"
            className={styles.filterForm}
            onFinish={apply}
          >
            <Flex
              gap={12}
              align="start"
              wrap="wrap"
              className={styles.filterRow}
            >
              <Form.Item
                className={styles.identifier}
                name="q"
                label={t('identifier')}
                rules={[
                  {
                    validator: (_, value?: string) =>
                      !value?.trim() || isTraceIdentifier(value.trim())
                        ? Promise.resolve()
                        : Promise.reject(new Error(t('invalidIdentifier')))
                  }
                ]}
              >
                <Input allowClear placeholder={t('identifierPlaceholder')} />
              </Form.Item>
              <Form.Item className={styles.range} name="range">
                <TraceTimeRangeControl />
              </Form.Item>
              <Form.Item
                className={styles.outcome}
                name="outcome"
                label={t('state')}
              >
                <BaseSelect
                  allowClear
                  placeholder={t('allStates')}
                  options={outcomes.map((value) => ({
                    value,
                    label: t(value)
                  }))}
                />
              </Form.Item>
              <Form.Item
                className={styles.instance}
                name="instance_id"
                label={t('instance')}
              >
                <BaseSelect
                  allowClear
                  placeholder={t('allInstances')}
                  options={instanceOptions}
                />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={trace.rows.loading}
              >
                {t('search')}
              </Button>
            </Flex>
            <Flex align="center" gap={16} wrap="wrap">
              <Form.Item name="no_engine" valuePropName="checked" noStyle>
                <Checkbox>{t('noEngine')}</Checkbox>
              </Form.Item>
              <Button
                type="link"
                size="small"
                onClick={() => {
                  filtersForm.resetFields();
                  apply(defaultFilters);
                }}
              >
                {t('reset')}
              </Button>
            </Flex>
          </Form>
          <Flex align="center" gap={12} wrap="wrap" justify="space-between">
            <Typography.Text strong>{t('recentRecords')}</Typography.Text>
            <Flex align="center" gap={8}>
              <Button
                icon={<ReloadOutlined />}
                loading={loading}
                onClick={refresh}
                aria-label={t('refresh')}
              />
            </Flex>
          </Flex>
          {loading || rows.length ? (
            <SealTable
              rowKey="key"
              columns={columns}
              loading={loading}
              dataSource={rows.map((row) => ({
                ...row,
                key: traceRecordKey(row)
              }))}
              pagination={false}
              scroll={{ x: true }}
            />
          ) : (
            error == null && (
              <Empty description={t('noRecords')}>
                {logsEnabled &&
                  filterRequestId &&
                  isRequestId(filterRequestId) && (
                    <Button
                      onClick={() =>
                        openLogs(
                          logTimeWindow(
                            filterRequestId,
                            activeFilters.current.range
                          )
                        )
                      }
                    >
                      {t('viewLogs')}
                    </Button>
                  )}
              </Empty>
            )
          )}
          {(page > 1 || nextCursor) && (
            <Flex justify="end" align="center" gap={8}>
              <Button
                disabled={loading || page === 1}
                onClick={() => changePage(page - 1)}
              >
                {t('previousPage')}
              </Button>
              <Typography.Text>{page}</Typography.Text>
              <Button
                disabled={loading || !nextCursor}
                onClick={() => changePage(page + 1)}
              >
                {t('nextPage')}
              </Button>
            </Flex>
          )}
          <TraceDetails
            row={selected}
            state={trace.detail}
            instanceName={instanceName}
            locale={intl.locale}
            t={t}
            logsEnabled={logsEnabled}
            onLogs={openLogs}
            onClose={closeDetails}
            onRetry={() => {
              if (selected) void trace.loadDetail(selected);
            }}
          />
        </>
      )}

      <Modal
        open={!!logTarget && logsEnabled}
        title={t('viewLogs')}
        footer={null}
        onCancel={() => setLogTarget(null)}
      >
        {logTarget && (
          <Flex vertical gap={12}>
            <Alert type="info" showIcon title={t('logLinkMissing')} />
            <Typography.Text>
              {t('timeRange')} · {formatTraceDate(logTarget.from, intl.locale)}{' '}
              – {formatTraceDate(logTarget.to, intl.locale)}
            </Typography.Text>
            <Typography.Paragraph copyable={{ text: logQuery(logTarget) }}>
              <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {logQuery(logTarget)}
              </pre>
            </Typography.Paragraph>
          </Flex>
        )}
      </Modal>
    </Flex>
  );
}
