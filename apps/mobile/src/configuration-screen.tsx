import { useState } from 'react';
import { View } from 'react-native';
import { gql } from './api';
import { useAuth } from './auth';
import { useSoleAdmin } from './sole-admin';
import { when } from './theme';
import { settingError, settingStatus, settingValue, type SettingField } from './configuration';
import { SettingEditor } from './setting-editor';
import { Button, Empty, ErrorState, Field, Notice, Row, Screen, SearchBox, Sheet, Skeleton, T, toast, useQuery, VList } from './ui';

interface Version { id: string; version: number; displayValue: string; status: string; reason: string; makerId?: string; createdAt: string }
export interface Config { key: string; label: string; description: string; displayValue: string; editorJson: string; version: number; isDefault: boolean; pending?: Version }
const V = 'id key version valueJson displayValue status reason makerId checkerId createdAt';

export function Configuration() {
  const q = useQuery<{ configItems: Config[] }>(`{configItems{key label description displayValue editorJson version isDefault pending{${V}}}}`);
  const { me } = useAuth(); const sole = useSoleAdmin();
  const [search, setSearch] = useState(''), [edit, setEdit] = useState<Config | null>(null), [history, setHistory] = useState<Config | null>(null), [busy, setBusy] = useState(false);
  const rows = (q.data?.configItems ?? []).filter(i => `${i.label} ${i.description}`.toLowerCase().includes(search.toLowerCase()));
  const decide = async (id: string, approve: boolean) => { setBusy(true); try { await gql(`mutation($id:ID!,$a:Boolean!){decideConfigChange(id:$id,approve:$a){id}}`, { id, a: approve }); void q.refetch(); } catch (e) { if ((e as any).code !== 'CANCELLED') toast((e as Error).message, true); } finally { setBusy(false); } };
  return <Screen back title="Configuration" scroll={false} onRefresh={q.refetch}>
    <VList data={rows} keyOf={i => i.key} header={<SearchBox value={search} onChangeText={setSearch} placeholder="Search settings" />} empty={q.error ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <Skeleton /> : <Empty title="No matching settings" />}
      render={i => <View style={{ paddingVertical: 14, gap: 8 }}><T w="700">{i.label}</T><T v="sm" c="text2">{i.description}</T><T numberOfLines={4}>{i.displayValue}</T>{i.pending && <Notice tone="warn">Proposed: {i.pending.displayValue.slice(0, 280)}. {i.pending.reason}</Notice>}<Row>{i.pending ? <><Button title="Reject" busy={busy} disabled={i.pending.makerId === me?.id && !sole} onPress={() => void decide(i.pending!.id, false)} /><Button title="Approve" busy={busy} disabled={i.pending.makerId === me?.id && !sole} onPress={() => void decide(i.pending!.id, true)} /></> : <Button title={sole ? 'Change' : 'Propose change'} onPress={() => setEdit(i)} />}<Button title="History" onPress={() => setHistory(i)} /></Row></View>} />
    {edit && <EditSetting item={edit} sole={sole} close={() => setEdit(null)} saved={() => void q.refetch()} />}
    {history && <History item={history} close={() => setHistory(null)} saved={() => void q.refetch()} />}
  </Screen>;
}
function EditSetting({ item, sole, close, saved }: { item: Config; sole: boolean; close: () => void; saved: () => void }) {
  const [field, setField] = useState<SettingField>(() => JSON.parse(item.editorJson));
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const invalid = settingError(field);
  const save = async () => { setBusy(true); setError(''); try { const d = await gql<{ proposeConfigChange: { status: string } }>(`mutation($k:String!,$v:String!,$r:String!){proposeConfigChange(key:$k,valueJson:$v,reason:$r){id status}}`, { k: item.key, v: JSON.stringify(settingValue(field)), r: reason }); saved(); close(); toast(d.proposeConfigChange.status === 'PENDING' ? 'Change sent for approval.' : 'Change applied.'); } catch (e) { if ((e as any).code !== 'CANCELLED') setError((e as Error).message); } finally { setBusy(false); } };
  return <Sheet visible title={`Change ${item.label.toLowerCase()}`} sub={item.description} onClose={close}><SettingEditor field={field} onChange={setField} />{invalid && <Notice tone="err">{invalid}</Notice>}<Field label="Reason" value={reason} onChangeText={setReason} />{error && <Notice tone="err">{error}</Notice>}<Button title={sole ? 'Save' : 'Send for approval'} kind="primary" busy={busy} disabled={!!invalid || reason.trim().length < 5} onPress={() => void save()} /></Sheet>;
}
function History({ item, close, saved }: { item: Config; close: () => void; saved: () => void }) {
  const q = useQuery<{ configHistory: Version[] }>(`query($k:String!){configHistory(key:$k){${V}}}`, { k: item.key }); const [busy, setBusy] = useState(false);
  return <Sheet visible title="Change history" sub={item.label} onClose={close}>{q.error ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <Skeleton /> : !q.data.configHistory.length ? <T>Still on the default setting.</T> : q.data.configHistory.map(v => <View key={v.id} style={{ gap: 8, paddingVertical: 8 }}><T w="700">Version {v.version} · {settingStatus(v.status)}</T><T selectable>{v.displayValue}</T><T v="sm">{v.reason} · {when(v.createdAt)}</T>{v.status === 'SUPERSEDED' && <Button title="Restore this version" busy={busy} onPress={async () => { setBusy(true); try { await gql(`mutation($k:String!,$v:Int!){proposeConfigRollback(key:$k,toVersion:$v){id}}`, { k: item.key, v: v.version }); saved(); close(); } catch (e) { toast((e as Error).message, true); } finally { setBusy(false); } }} />}</View>)}</Sheet>;
}
