import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import * as Sharing from 'expo-sharing';
import { API_URL, gql } from './api';
import { useAuth } from './auth';
import { useSoleAdmin } from './sole-admin';
import {
  ACTIVITY_FIELDS,
  CONSENT_FIELDS,
  LOGIN_FIELDS,
  type ConsentRecord,
  type LoginEvent,
  type ActivityEntry,
  actionLabel,
  stamp,
} from './activity';
import { when } from './theme';
import {
  Badge,
  Button,
  Chips,
  Empty,
  ErrorState,
  Field,
  ListRow,
  Notice,
  Row,
  Screen,
  Section,
  SearchBox,
  Sheet,
  Skeleton,
  T,
  toast,
  useQuery,
  VList,
} from './ui';

function useAction() {
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      done?.();
    } catch (e) {
      if ((e as { code?: string }).code !== 'CANCELLED') toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
const formatJson = (value: string) => {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
};
function Details({ title, value, close }: { title: string; value: unknown; close: () => void }) {
  return (
    <Sheet visible title={title} onClose={close}>
      <T selectable>{typeof value === 'string' ? formatJson(value) : JSON.stringify(value, null, 2)}</T>
    </Sheet>
  );
}
const V = 'id key version valueJson status reason makerId checkerId createdAt';
interface Version {
  id: string;
  key: string;
  version: number;
  valueJson: string;
  status: string;
  reason: string;
  makerId?: string;
  createdAt: string;
}
interface Config {
  key: string;
  description: string;
  valueJson: string;
  version: number;
  isDefault: boolean;
  pending?: Version;
}
function Configuration() {
  const q = useQuery<{ configItems: Config[] }>(
    `{configItems{key description valueJson version isDefault pending{${V}}}}`,
  );
  const { me } = useAuth();
  const sole = useSoleAdmin();
  const action = useAction();
  const [search, setSearch] = useState(''),
    [edit, setEdit] = useState<Config | null>(null),
    [history, setHistory] = useState<string | null>(null);
  const [value, setValue] = useState(''),
    [reason, setReason] = useState('');
  let valid = true;
  try {
    JSON.parse(value);
  } catch {
    valid = false;
  }
  const rows = (q.data?.configItems ?? []).filter((i) =>
    `${i.key} ${i.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Screen back title="Configuration" scroll={false} onRefresh={q.refetch}>
      <VList
        data={rows}
        keyOf={(i) => i.key}
        header={<SearchBox value={search} onChangeText={setSearch} placeholder="Search settings" />}
        empty={
          q.loading && !q.data ? (
            <Skeleton />
          ) : q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : (
            <Empty title="No matching settings" />
          )
        }
        render={(i) => (
          <View style={{ paddingVertical: 14, gap: 8 }}>
            <T w="700">{i.key}</T>
            <T v="sm" c="text2">
              {i.description}
            </T>
            <T selectable numberOfLines={3}>
              {i.valueJson}
            </T>
            {i.pending && (
              <Notice tone="warn">
                Proposed:{' '}
                {i.pending.valueJson.length > 180 ? i.pending.valueJson.slice(0, 180) + '\u2026' : i.pending.valueJson}.{' '}
                {i.pending.reason}
              </Notice>
            )}
            <Row>
              {!i.pending ? (
                <Button
                  title={sole ? 'Change' : 'Propose change'}
                  onPress={() => {
                    setValue(formatJson(i.valueJson));
                    setReason('');
                    setEdit(i);
                  }}
                />
              ) : (
                <>
                  <Button
                    title="Reject"
                    busy={action.busy}
                    disabled={i.pending.makerId === me?.id && !sole}
                    onPress={() =>
                      void action.run(
                        () =>
                          gql(`mutation($id:ID!,$a:Boolean!){decideConfigChange(id:$id,approve:$a){id}}`, {
                            id: i.pending!.id,
                            a: false,
                          }),
                        () => {
                          void q.refetch();
                        },
                      )
                    }
                  />
                  <Button
                    title="Approve"
                    kind="primary"
                    busy={action.busy}
                    disabled={i.pending.makerId === me?.id && !sole}
                    onPress={() =>
                      void action.run(
                        () =>
                          gql(`mutation($id:ID!,$a:Boolean!){decideConfigChange(id:$id,approve:$a){id}}`, {
                            id: i.pending!.id,
                            a: true,
                          }),
                        () => {
                          void q.refetch();
                        },
                      )
                    }
                  />
                </>
              )}
              <Button title="History" onPress={() => setHistory(i.key)} />
            </Row>
          </View>
        )}
      />
      <Sheet
        visible={!!edit}
        title={edit?.key ?? 'Change setting'}
        sub={edit?.description}
        onClose={() => setEdit(null)}
      >
        <Field
          label="New value (JSON)"
          multiline
          numberOfLines={8}
          autoCapitalize="none"
          autoCorrect={false}
          value={value}
          onChangeText={setValue}
          error={!valid ? 'Enter valid JSON.' : null}
        />
        <Field label="Reason" value={reason} onChangeText={setReason} />
        <Button
          title={sole ? 'Save' : 'Send for approval'}
          kind="primary"
          busy={action.busy}
          disabled={!valid || reason.trim().length < 5}
          onPress={() =>
            void action.run(
              () =>
                gql(
                  `mutation($k:String!,$v:String!,$r:String!){proposeConfigChange(key:$k,valueJson:$v,reason:$r){id status}}`,
                  { k: edit!.key, v: JSON.stringify(JSON.parse(value)), r: reason },
                ),
              () => {
                setEdit(null);
                void q.refetch();
                toast('Change saved.');
              },
            )
          }
        />
      </Sheet>
      {history && (
        <ConfigHistory
          name={history}
          close={() => setHistory(null)}
          saved={() => {
            void q.refetch();
          }}
        />
      )}
    </Screen>
  );
}
function ConfigHistory({ name, close, saved }: { name: string; close: () => void; saved: () => void }) {
  const q = useQuery<{ configHistory: Version[] }>(`query($k:String!){configHistory(key:$k){${V}}}`, { k: name });
  const action = useAction();
  return (
    <Sheet visible title="Setting history" sub={name} onClose={close}>
      {q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !q.data ? (
        <Skeleton />
      ) : !q.data.configHistory.length ? (
        <T>Still on the default value.</T>
      ) : (
        q.data.configHistory.map((v) => (
          <View key={v.id} style={{ gap: 8, paddingVertical: 8 }}>
            <T w="700">
              Version {v.version} · {v.status}
            </T>
            <T selectable>{formatJson(v.valueJson)}</T>
            <T v="sm">
              {v.reason} · {when(v.createdAt)}
            </T>
            {v.status === 'SUPERSEDED' && (
              <Button
                title="Restore this version"
                busy={action.busy}
                onPress={() =>
                  void action.run(
                    () =>
                      gql(`mutation($k:String!,$v:Int!){proposeConfigRollback(key:$k,toVersion:$v){id status}}`, {
                        k: name,
                        v: v.version,
                      }),
                    () => {
                      saved();
                      close();
                      toast('Restore request saved.');
                    },
                  )
                }
              />
            )}
          </View>
        ))
      )}
    </Sheet>
  );
}
interface Lot {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  category: string;
  lotClass: string;
  lotLabel?: string;
  lotSize: number;
}
function Lots() {
  const q = useQuery<{ allInstruments: Lot[] }>(
    `{allInstruments{id symbol name exchange category lotClass lotLabel lotSize}}`,
  );
  const [search, setSearch] = useState(''),
    [kind, setKind] = useState(''),
    [market, setMarket] = useState(''),
    [selected, setSelected] = useState(new Set<string>());
  const [editing, setEditing] = useState<Lot | null>(null),
    [label, setLabel] = useState('');
  const action = useAction();
  const all = q.data?.allInstruments ?? [],
    rows = all.filter(
      (i) =>
        (!kind || i.lotClass === kind) &&
        (!market || i.exchange === market) &&
        `${i.symbol} ${i.name}`.toLowerCase().includes(search.toLowerCase()),
    );
  const set = (ids: string[], cls: string) =>
    void action.run(
      () =>
        gql(`mutation($ids:[ID!]!,$c:String!){setInstrumentLotClass(instrumentIds:$ids,lotClass:$c){id}}`, {
          ids,
          c: cls,
        }),
      () => {
        setSelected(new Set());
        void q.refetch();
        toast('Lot types updated.');
      },
    );
  return (
    <Screen back title="Mini & mega lots" scroll={false} onRefresh={q.refetch}>
      <VList
        data={rows}
        keyOf={(i) => i.id}
        header={
          <>
            <SearchBox value={search} onChangeText={setSearch} placeholder="Search instruments" />
            <Chips
              value={kind}
              onChange={setKind}
              items={[
                { k: '', label: 'All lots' },
                { k: 'MINI', label: 'Mini' },
                { k: 'MEGA', label: 'Mega' },
              ]}
            />
            <Chips
              value={market}
              onChange={setMarket}
              items={[
                { k: '', label: 'All markets' },
                ...[...new Set(all.map((i) => i.exchange))].map((k) => ({ k, label: k })),
              ]}
            />
            <Row>
              <Button
                title="Select shown (max 500)"
                onPress={() => setSelected(new Set(rows.slice(0, 500).map((i) => i.id)))}
              />
              <Button title="Clear" onPress={() => setSelected(new Set())} />
            </Row>
            {!!selected.size && (
              <>
                <T>{selected.size} selected</T>
                <Row>
                  <Button title="Make mini" busy={action.busy} onPress={() => set([...selected], 'MINI')} />
                  <Button title="Make mega" busy={action.busy} onPress={() => set([...selected], 'MEGA')} />
                </Row>
              </>
            )}
          </>
        }
        empty={
          q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.loading ? (
            <Skeleton />
          ) : (
            <Empty title="No matching instruments" />
          )
        }
        render={(i) => (
          <View style={{ gap: 8, paddingVertical: 12 }}>
            <ListRow
              title={<T w="800">{i.name}</T>}
              sub={`${i.symbol} · ${i.exchange} · ${i.lotLabel ?? i.lotSize}`}
              right={<Badge text={selected.has(i.id) ? 'Selected' : i.lotClass} />}
              onPress={() =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (next.has(i.id)) next.delete(i.id);
                  else if (next.size < 500) next.add(i.id);
                  return next;
                })
              }
            />
            <Row>
              <Button
                title="Mini"
                busy={action.busy}
                disabled={i.lotClass === 'MINI'}
                onPress={() => set([i.id], 'MINI')}
              />
              <Button
                title="Mega"
                busy={action.busy}
                disabled={i.lotClass === 'MEGA'}
                onPress={() => set([i.id], 'MEGA')}
              />
              <Button
                title="Lot label"
                onPress={() => {
                  setEditing(i);
                  setLabel(i.lotLabel ?? '');
                }}
              />
            </Row>
          </View>
        )}
      />
      <Sheet visible={!!editing} title="One lot is" sub={editing?.name} onClose={() => setEditing(null)}>
        <Field
          label="Lot label"
          value={label}
          maxLength={40}
          onChangeText={setLabel}
          hint="For example: 100 g. Empty uses the default lot size."
        />
        <Button
          title="Save label"
          kind="primary"
          busy={action.busy}
          onPress={() =>
            void action.run(
              () =>
                gql(`mutation($id:ID!,$l:String!){setInstrumentLotLabel(instrumentId:$id,lotLabel:$l){id}}`, {
                  id: editing!.id,
                  l: label,
                }),
              () => {
                setEditing(null);
                void q.refetch();
              },
            )
          }
        />
      </Sheet>
    </Screen>
  );
}
interface AuditEvent {
  id: string;
  seq: string;
  action: string;
  outcome: string;
  ip?: string;
  actorId?: string;
  actorRole?: string;
  entityType?: string;
  entityId?: string;
  userAgent?: string;
  sessionId?: string;
  requestId?: string;
  metadataJson?: string;
  hash: string;
  createdAt: string;
}
function AuditTrail() {
  const [actionFilter, setActionFilter] = useState(''),
    [request, setRequest] = useState(''),
    [pages, setPages] = useState<string[]>([]),
    [selected, setSelected] = useState<AuditEvent | null>(null),
    [check, setCheck] = useState<string | null>(null);
  const action = useAction();
  const q = useQuery<{ auditEvents: AuditEvent[] }>(
    `query($a:String,$b:String,$r:String){auditEvents(limit:50,action:$a,beforeSeq:$b,requestId:$r){id seq actorId actorRole action entityType entityId outcome ip userAgent sessionId requestId metadataJson hash createdAt}}`,
    { a: actionFilter || undefined, b: pages.at(-1), r: request || undefined },
  );
  const rows = q.data?.auditEvents ?? [];
  return (
    <Screen back title="Audit trail" scroll={false} onRefresh={q.refetch}>
      <VList
        data={rows}
        keyOf={(e) => e.id}
        header={
          <>
            <Field
              label="Action filter"
              value={actionFilter}
              onChangeText={(v) => {
                setActionFilter(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Field
              label="Request ID"
              value={request}
              onChangeText={(v) => {
                setRequest(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Button
              title="Verify audit chain"
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const d = await gql<{ verifyAuditChain: { ok: boolean; checked: number; brokenAtSeq?: string } }>(
                    `{verifyAuditChain{ok checked brokenAtSeq}}`,
                  );
                  setCheck(
                    d.verifyAuditChain.ok
                      ? `${d.verifyAuditChain.checked} events verified. Chain intact.`
                      : `Chain broken at ${d.verifyAuditChain.brokenAtSeq}.`,
                  );
                })
              }
            />
            {check && <Notice>{check}</Notice>}
          </>
        }
        empty={
          q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.loading ? (
            <Skeleton />
          ) : (
            <Empty title="No audit events" />
          )
        }
        render={(e) => (
          <ListRow
            title={e.action}
            sub={`${when(e.createdAt)} · ${e.outcome} · ${e.ip ?? ''}`}
            onPress={() => setSelected(e)}
          />
        )}
        footer={
          <Row>
            <Button title="Newer" disabled={!pages.length} onPress={() => setPages((p) => p.slice(0, -1))} />
            <Button
              title="Older"
              disabled={rows.length < 50}
              onPress={() => setPages((p) => [...p, rows.at(-1)!.seq])}
            />
          </Row>
        }
      />
      {selected && <Details title={`Audit event #${selected.seq}`} value={selected} close={() => setSelected(null)} />}
    </Screen>
  );
}
interface Run {
  id: string;
  ok: boolean;
  summaryJson: string;
  createdAt: string;
}
function Reconciliation() {
  const q = useQuery<{ reconciliationRuns: Run[] }>(`{reconciliationRuns{id ok summaryJson createdAt}}`);
  const action = useAction();
  const [selected, setSelected] = useState<Run | null>(null);
  return (
    <Screen back title="Reconciliation" onRefresh={q.refetch}>
      <Button
        title="Run reconciliation now"
        kind="primary"
        busy={action.busy}
        onPress={() =>
          void action.run(
            async () => {
              const d = await gql<{ runReconciliation: { ok: boolean } }>(`mutation{runReconciliation{ok}}`);
              toast(
                d.runReconciliation.ok ? 'All checks passed.' : 'Problems found. Review the results.',
                !d.runReconciliation.ok,
              );
            },
            () => {
              void q.refetch();
            },
          )
        }
      />
      {q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !q.data ? (
        <Skeleton />
      ) : !q.data.reconciliationRuns.length ? (
        <Empty title="No reconciliation runs" />
      ) : (
        q.data.reconciliationRuns.map((r) => (
          <ListRow
            key={r.id}
            title={r.ok ? 'All checks passed' : 'Problems found'}
            sub={when(r.createdAt)}
            onPress={() => setSelected(r)}
          />
        ))
      )}
      {selected && (
        <Details title="Reconciliation results" value={selected.summaryJson} close={() => setSelected(null)} />
      )}
    </Screen>
  );
}
interface Archive {
  day: string;
  kind: string;
  rows: number;
  sha256: string;
  location: string;
  createdAt: string;
}
function Archives() {
  const q = useQuery<{ logArchives: Archive[]; configItems: Config[] }>(
    `{logArchives(limit:120){day kind rows sha256 location createdAt} configItems{key description valueJson version isDefault}}`,
  );
  const action = useAction();
  const [result, setResult] = useState('');
  return (
    <Screen back title="Archives & retention" onRefresh={q.refetch}>
      <Button title="Change retention settings" onPress={() => router.push('/admin-tools/config')} />
      {(q.data?.configItems ?? [])
        .filter((c) => c.key.startsWith('logs.'))
        .map((c) => (
          <ListRow key={c.key} title={c.description} sub={c.valueJson} />
        ))}
      <Button
        title="Run archive maintenance"
        busy={action.busy}
        onPress={() =>
          void action.run(
            async () => {
              const d = await gql<{ runLogMaintenance: string }>(`mutation{runLogMaintenance}`);
              setResult(d.runLogMaintenance);
            },
            () => {
              void q.refetch();
            },
          )
        }
      />
      {result && <T selectable>{formatJson(result)}</T>}
      {q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !q.data ? (
        <Skeleton />
      ) : !q.data.logArchives.length ? (
        <Empty title="No archives yet" />
      ) : (
        q.data.logArchives.map((a) => (
          <View key={a.day + a.kind} style={{ gap: 8, paddingVertical: 12 }}>
            <T w="700">
              {a.day} · {a.kind} · {a.rows} rows
            </T>
            <T selectable v="xs">
              SHA-256 {a.sha256}
            </T>
            <T selectable v="xs">
              {a.location}
            </T>
            <Button
              title="Verify archive"
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const d = await gql<{ verifyLogArchive: { ok: boolean; reason?: string } }>(
                    `query($d:String!,$k:String!){verifyLogArchive(day:$d,kind:$k){ok reason}}`,
                    { d: a.day, k: a.kind },
                  );
                  toast(
                    d.verifyLogArchive.ok ? 'Archive intact.' : (d.verifyLogArchive.reason ?? 'Archive check failed.'),
                    !d.verifyLogArchive.ok,
                  );
                })
              }
            />
          </View>
        ))
      )}
    </Screen>
  );
}
function AdminActivity() {
  const [ip, setIp] = useState(''),
    [user, setUser] = useState(''),
    [operation, setOperation] = useState(''),
    [outcome, setOutcome] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [actionsOnly, setActionsOnly] = useState('actions'),
    [pages, setPages] = useState<string[]>([]),
    [selected, setSelected] = useState<ActivityEntry | null>(null),
    [ipAccounts, setIpAccounts] = useState<unknown>(null);
  const action = useAction();
  const filter = {
    ip: ip || undefined,
    userId: user || undefined,
    opName: operation || undefined,
    outcome: outcome || undefined,
    from: from || undefined,
    to: to || undefined,
    actionsOnly: actionsOnly === 'actions',
  };
  const query = `query($f:ActivityFilter,$b:String,$l:Int){activityLog(filter:$f,beforeId:$b,limit:$l){${ACTIVITY_FIELDS}}}`;
  const q = useQuery<{ activityLog: ActivityEntry[] }>(query, { f: filter, b: pages.at(-1), l: 50 });
  const rows = q.data?.activityLog ?? [];
  const exportCsv = async () => {
    const all: ActivityEntry[] = [];
    let before: string | undefined;
    while (all.length < 10000) {
      const d = await gql<{ activityLog: ActivityEntry[] }>(query, { f: filter, b: before, l: 500 });
      all.push(...d.activityLog);
      if (d.activityLog.length < 500) break;
      before = d.activityLog.at(-1)!.id;
    }
    const keys: (keyof ActivityEntry)[] = [
      'at',
      'username',
      'role',
      'ip',
      'userAgent',
      'opType',
      'opName',
      'fields',
      'outcome',
      'errorCode',
      'durationMs',
      'requestId',
      'variablesJson',
    ];
    const cell = (v: unknown) =>
      '"' +
      String(v ?? '')
        .replace(/^[=+@-]/, "'$&")
        .replace(/"/g, '""') +
      '"';
    const csv =
      '\uFEFF' +
      [keys.join(','), ...all.slice(0, 10000).map((r) => keys.map((k) => cell(r[k])).join(','))].join('\r\n');
    const file = new File(Paths.cache, `activity-${Date.now()}.csv`);
    file.write(csv);
    await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
  };
  return (
    <Screen back title="Activity log" scroll={false} onRefresh={q.refetch}>
      <VList
        data={rows}
        keyOf={(r) => r.id}
        header={
          <>
            <Row>
              <Button title="Archives & retention" onPress={() => router.push('/admin-tools/archives')} />
              <Button title="Export CSV" busy={action.busy} onPress={() => void action.run(exportCsv)} />
            </Row>
            <Field
              label="IP address"
              value={ip}
              onChangeText={(v) => {
                setIp(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Button
              title="Accounts using this IP"
              disabled={!ip.trim()}
              busy={action.busy}
              onPress={() =>
                void action.run(async () => {
                  const d = await gql<{ accountsOnIp: unknown }>(
                    `query($ip:String!){accountsOnIp(ip:$ip,days:90){userId username role requests firstSeen lastSeen}}`,
                    { ip },
                  );
                  setIpAccounts(d.accountsOnIp);
                })
              }
            />
            <Field
              label="Account ID"
              value={user}
              onChangeText={(v) => {
                setUser(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Field
              label="Operation"
              value={operation}
              onChangeText={(v) => {
                setOperation(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Field
              label="From (ISO date/time)"
              value={from}
              onChangeText={(v) => {
                setFrom(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Field
              label="To (ISO date/time)"
              value={to}
              onChangeText={(v) => {
                setTo(v);
                setPages([]);
              }}
              autoCapitalize="none"
            />
            <Chips
              value={outcome}
              onChange={(v) => {
                setOutcome(v);
                setPages([]);
              }}
              items={[
                { k: '', label: 'All outcomes' },
                { k: 'OK', label: 'Successful' },
                { k: 'ERROR', label: 'Errors' },
              ]}
            />
            <Chips
              value={actionsOnly}
              onChange={(v) => {
                setActionsOnly(v);
                setPages([]);
              }}
              items={[
                { k: 'actions', label: 'Actions only' },
                { k: 'all', label: 'All requests' },
              ]}
            />
          </>
        }
        empty={
          q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.loading ? (
            <Skeleton />
          ) : (
            <Empty title="No matching activity" />
          )
        }
        render={(r) => (
          <ListRow
            title={`${r.username ?? 'Anonymous'} · ${actionLabel(r.opName, r.fields)}`}
            sub={`${stamp(r.at)} · ${r.ip} · ${r.outcome}`}
            onPress={() => setSelected(r)}
          />
        )}
        footer={
          <Row>
            <Button title="Newer" disabled={!pages.length} onPress={() => setPages((p) => p.slice(0, -1))} />
            <Button
              title="Older"
              disabled={rows.length < 50}
              onPress={() => setPages((p) => [...p, rows.at(-1)!.id])}
            />
          </Row>
        }
      />
      {selected && <Details title="Request details" value={selected} close={() => setSelected(null)} />}
      {ipAccounts != null && (
        <Details title="Accounts on this IP" value={ipAccounts} close={() => setIpAccounts(null)} />
      )}
    </Screen>
  );
}
interface Release {
  id: string;
  platform: string;
  version: string;
  notes?: string;
  fileName?: string;
  fileSize?: number;
  sha256?: string;
  active: boolean;
  url?: string;
  downloadPath?: string;
  createdAt: string;
}
function Releases() {
  const q = useQuery<{
    appReleases: { uploadsEnabled: boolean; maxUploadMb: number; autoPublish: boolean; history: Release[] };
  }>(
    `{appReleases(limit:30){uploadsEnabled maxUploadMb autoPublish history{id platform version notes fileName fileSize sha256 active url downloadPath createdAt}}}`,
  );
  const action = useAction();
  const [file, setFile] = useState<File | null>(null),
    [version, setVersion] = useState(''),
    [notes, setNotes] = useState(''),
    [url, setUrl] = useState(''),
    [iosVersion, setIosVersion] = useState(''),
    [iosNotes, setIosNotes] = useState('');
  const info = q.data?.appReleases;
  const upload = async () => {
    if (!file || !info) return;
    if (file.size > info.maxUploadMb * 1024 * 1024) throw new Error(`APK exceeds ${info.maxUploadMb} MB.`);
    const d = await gql<{ createApkUploadLink: { path: string } }>(
      `mutation($v:String!,$n:String){createApkUploadLink(version:$v,notes:$n){path}}`,
      { v: version.trim(), n: notes || undefined },
    );
    const response = await expoFetch(API_URL + d.createApkUploadLink.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.android.package-archive' },
      body: file,
    });
    if (!response.ok) {
      let message = 'APK upload failed.';
      try {
        message = (await response.json()).message ?? message;
      } catch {}
      throw new Error(message);
    }
    setFile(null);
    setVersion('');
    setNotes('');
    toast('Android release published.');
  };
  return (
    <Screen back title="App downloads" onRefresh={q.refetch}>
      <Button title="Open public download page" onPress={() => void Linking.openURL(API_URL + '/download')} />
      {q.error ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : !info ? (
        <Skeleton />
      ) : (
        <>
          <Notice>
            {info.autoPublish
              ? 'GitHub builds publish automatically. Manual uploads are also available.'
              : 'Manual publishing is enabled when server upload storage is configured.'}
          </Notice>
          <Section title="Android APK">
            <Field label="Version" value={version} onChangeText={setVersion} />
            <Field label="Release notes" value={notes} onChangeText={setNotes} />
            <Button
              title={file ? file.name : 'Choose APK'}
              disabled={!info.uploadsEnabled || action.busy}
              onPress={() =>
                void action.run(async () => {
                  const pick = await File.pickFileAsync({
                    mimeTypes: ['application/vnd.android.package-archive', 'application/octet-stream'],
                  });
                  if (!pick.canceled) {
                    if (!pick.result.name.toLowerCase().endsWith('.apk')) throw new Error('Choose an APK file.');
                    setFile(pick.result);
                  }
                })
              }
            />
            <T v="xs">Maximum {info.maxUploadMb} MB.</T>
            <Button
              title="Upload and publish APK"
              kind="primary"
              busy={action.busy}
              disabled={!info.uploadsEnabled || !file || !version.trim()}
              onPress={() =>
                void action.run(upload, () => {
                  void q.refetch();
                })
              }
            />
          </Section>
          <Section title="iPhone download">
            <Field label="TestFlight or App Store URL" value={url} onChangeText={setUrl} autoCapitalize="none" />
            <Field label="iOS version" value={iosVersion} onChangeText={setIosVersion} />
            <Field label="iOS release notes" value={iosNotes} onChangeText={setIosNotes} />
            <Button
              title="Publish iPhone link"
              kind="primary"
              busy={action.busy}
              disabled={!/^https:\/\/(testflight|apps)\.apple\.com\//.test(url) || !iosVersion.trim()}
              onPress={() =>
                void action.run(
                  () =>
                    gql(`mutation($u:String!,$v:String!,$n:String){setIosRelease(url:$u,version:$v,notes:$n){id}}`, {
                      u: url,
                      v: iosVersion,
                      n: iosNotes || undefined,
                    }),
                  () => {
                    void q.refetch();
                    toast('iPhone link published.');
                  },
                )
              }
            />
          </Section>
          <Section title="Release history">
            {info.history.map((r) => (
              <View key={r.id} style={{ gap: 6, paddingVertical: 10 }}>
                <T w="700">
                  {r.platform} · {r.version} · {r.active ? 'Published' : 'Removed'}
                </T>
                <T v="xs">
                  {when(r.createdAt)} · {r.fileName ?? r.url ?? ''}
                </T>
                {r.notes && <T>{r.notes}</T>}
                {r.sha256 && (
                  <T selectable v="xs">
                    SHA-256 {r.sha256}
                  </T>
                )}
                {r.active && (
                  <Row>
                    <Button title="Open" onPress={() => void Linking.openURL(r.url ?? API_URL + r.downloadPath)} />
                    <Button
                      title="Remove"
                      kind="danger"
                      busy={action.busy}
                      onPress={() =>
                        void action.run(
                          () => gql(`mutation($id:ID!){hideAppRelease(id:$id){id}}`, { id: r.id }),
                          () => {
                            void q.refetch();
                          },
                        )
                      }
                    />
                  </Row>
                )}
              </View>
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}
interface Enquiry {
  id: string;
  name: string;
  phone: string;
  email?: string;
  courseSlug?: string;
  message?: string;
  status: string;
  note?: string;
  handledAt?: string;
  createdAt: string;
}
function Enquiries() {
  const [status, setStatus] = useState('NEW'),
    [selected, setSelected] = useState<Enquiry | null>(null),
    [next, setNext] = useState('NEW'),
    [note, setNote] = useState('');
  const action = useAction();
  const q = useQuery<{ courseEnquiries: Enquiry[] }>(
    `query($s:String){courseEnquiries(status:$s){id name phone email courseSlug message status note handledAt createdAt}}`,
    { s: status || undefined },
  );
  return (
    <Screen back title="Course enquiries" scroll={false} onRefresh={q.refetch}>
      <VList
        data={q.data?.courseEnquiries ?? []}
        keyOf={(e) => e.id}
        header={
          <Chips
            value={status}
            onChange={setStatus}
            items={['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED', ''].map((k) => ({ k, label: k || 'All' }))}
          />
        }
        empty={
          q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.loading ? (
            <Skeleton />
          ) : (
            <Empty title="No enquiries" />
          )
        }
        render={(e) => (
          <ListRow
            title={e.name}
            sub={`${e.phone} · ${e.courseSlug ?? 'Course enquiry'} · ${e.status} · ${when(e.createdAt)}`}
            onPress={() => {
              setSelected(e);
              setNext(e.status);
              setNote(e.note ?? '');
            }}
          />
        )}
      />
      <Sheet visible={!!selected} title={selected?.name ?? 'Enquiry'} onClose={() => setSelected(null)}>
        {selected && (
          <>
            <T>{selected.message ?? 'No message supplied.'}</T>
            <T>{selected.email}</T>
            <Row>
              <Button title="Call" onPress={() => void Linking.openURL(`tel:${selected.phone}`)} />
              {selected.email && (
                <Button title="Email" onPress={() => void Linking.openURL(`mailto:${selected.email}`)} />
              )}
            </Row>
            <Chips
              value={next}
              onChange={setNext}
              items={['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'].map((k) => ({ k, label: k }))}
            />
            <Field label="Note" value={note} multiline onChangeText={setNote} />
            <Button
              title="Save status"
              kind="primary"
              busy={action.busy}
              onPress={() =>
                void action.run(
                  () =>
                    gql(
                      `mutation($id:ID!,$s:String!,$n:String){setCourseEnquiryStatus(id:$id,status:$s,note:$n){id}}`,
                      { id: selected.id, s: next, n: note || undefined },
                    ),
                  () => {
                    setSelected(null);
                    void q.refetch();
                  },
                )
              }
            />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

async function shareCsv(name: string, keys: string[], rows: object[]) {
  const cell = (v: unknown) =>
    '"' +
    String(Array.isArray(v) ? v.join(' | ') : (v ?? ''))
      .replace(/^[=+@\-\t\r]/, "'$&")
      .replace(/"/g, '""') +
    '"';
  const file = new File(Paths.cache, `${name}-${Date.now()}.csv`);
  file.write(
    '\uFEFF' +
      [keys.join(','), ...rows.map((row) => keys.map((k) => cell((row as Record<string, unknown>)[k])).join(','))].join(
        '\r\n',
      ),
  );
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv' });
}
function LoginConsent() {
  const [tab, setTab] = useState('logins'),
    [outcome, setOutcome] = useState(''),
    [ip, setIp] = useState(''),
    [draftIp, setDraftIp] = useState('');
  const [pages, setPages] = useState<string[]>([]),
    [selected, setSelected] = useState<LoginEvent | ConsentRecord | null>(null);
  const action = useAction();
  const loginsQuery = `query($o:String,$ip:String,$b:String,$n:Int){loginAudit(outcome:$o,ip:$ip,beforeSeq:$b,limit:$n){${LOGIN_FIELDS}}}`;
  const consentsQuery = `query($b:String,$n:Int){consentLog(before:$b,limit:$n){${CONSENT_FIELDS}}}`;
  const vars = { o: outcome || undefined, ip: ip || undefined, b: pages.at(-1), n: 50 };
  const logins = useQuery<{ loginAudit: LoginEvent[] }>(loginsQuery, vars, undefined, tab !== 'logins');
  const consents = useQuery<{ consentLog: ConsentRecord[] }>(consentsQuery, vars, undefined, tab !== 'consents');
  const rows: (LoginEvent | ConsentRecord)[] =
    tab === 'logins' ? (logins.data?.loginAudit ?? []) : (consents.data?.consentLog ?? []);
  const q = tab === 'logins' ? logins : consents;
  const exportLog = async () => {
    if (tab === 'logins') {
      const d = await gql<{ loginAudit: LoginEvent[] }>(loginsQuery, { ...vars, b: undefined, n: 500 });
      await shareCsv(
        'login-audit',
        ['at', 'username', 'role', 'action', 'outcome', 'detail', 'ip', 'userAgent', 'sessionId', 'requestId'],
        d.loginAudit,
      );
    } else {
      const d = await gql<{ consentLog: ConsentRecord[] }>(consentsQuery, { n: 500 });
      await shareCsv(
        'trading-consents',
        [
          'acceptedAt',
          'username',
          'displayName',
          'ip',
          'userAgent',
          'client',
          'sessionId',
          'termsVersion',
          'requestId',
          'rules',
        ],
        d.consentLog,
      );
    }
  };
  return (
    <Screen back title="Login & consent" scroll={false} onRefresh={q.refetch}>
      <VList
        data={rows}
        keyOf={(r) => ('seq' in r ? r.seq : r.id)}
        header={
          <>
            <Chips
              value={tab}
              onChange={(v) => {
                setTab(v);
                setPages([]);
              }}
              items={[
                { k: 'logins', label: 'Login audit' },
                { k: 'consents', label: 'Trading consents' },
              ]}
            />
            {tab === 'logins' && (
              <>
                <Field label="IP address" autoCapitalize="none" value={draftIp} onChangeText={setDraftIp} />
                <Button
                  title="Apply IP filter"
                  onPress={() => {
                    setIp(draftIp.trim());
                    setPages([]);
                  }}
                />
                <Chips
                  value={outcome}
                  onChange={(v) => {
                    setOutcome(v);
                    setPages([]);
                  }}
                  items={[
                    { k: '', label: 'All' },
                    { k: 'SUCCESS', label: 'Successful' },
                    { k: 'FAILURE', label: 'Failed' },
                    { k: 'DENIED', label: 'Blocked' },
                  ]}
                />
              </>
            )}
            <Button
              title="Export CSV (latest 500)"
              busy={action.busy}
              disabled={!rows.length}
              onPress={() => void action.run(exportLog)}
            />
          </>
        }
        empty={
          q.error ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : q.loading ? (
            <Skeleton />
          ) : (
            <Empty title="No matching records" />
          )
        }
        render={(r) => (
          <ListRow
            title={r.username ?? 'Unknown account'}
            sub={
              'seq' in r
                ? `${stamp(r.at)} ? ${r.action} ? ${r.outcome} ? ${r.ip ?? ''}`
                : `${stamp(r.acceptedAt)} ? Accepted trading rules ? ${r.ip}`
            }
            onPress={() => setSelected(r)}
          />
        )}
        footer={
          <Row>
            <Button title="Newer" disabled={!pages.length} onPress={() => setPages((p) => p.slice(0, -1))} />
            <Button
              title="Older"
              disabled={rows.length < 50}
              onPress={() => {
                const last = rows.at(-1)!;
                setPages((p) => [...p, 'seq' in last ? last.seq : last.id]);
              }}
            />
          </Row>
        }
      />
      {selected && (
        <Details
          title={'seq' in selected ? 'Login details' : 'Accepted trading rules'}
          value={selected}
          close={() => setSelected(null)}
        />
      )}
    </Screen>
  );
}

export const ADMIN_SCREENS: Record<string, () => React.JSX.Element> = {
  logins: LoginConsent,
  config: Configuration,
  lots: Lots,
  audit: AuditTrail,
  reconciliation: Reconciliation,
  activity: AdminActivity,
  archives: Archives,
  releases: Releases,
  enquiries: Enquiries,
};
