'use client';
import { useState } from 'react';
import { useSoleAdmin } from '@/lib/sole-admin';
import { useAuth } from '@/lib/auth';
import { gql } from '@/lib/api';
import { when } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { settingError, settingStatus, settingValue, type SettingField } from '@/lib/configuration';
import { Dialog, ErrorState, PageHead, SkeletonRows, useToast } from './ui';
import { SettingEditor } from './SettingEditor';

interface Version { id: string; version: number; displayValue: string; status: string; reason: string; makerId?: string; createdAt: string }
interface Item { key: string; label: string; description: string; displayValue: string; editorJson: string; version: number; isDefault: boolean; pending?: Version }
const V = 'id key version valueJson displayValue status reason makerId checkerId createdAt';
const GROUP: Record<string, string> = { demo: 'Demo accounts', trading: 'Trading', payments: 'Payments', broker: 'Broker commissions', risk: 'Risk controls', security: 'Sign-in and security', logs: 'Activity history', ui: 'App content', site: 'Website content', algo: 'Automated strategies', signup: 'Account applications' };

export default function ConfigurationPage() {
  const { me } = useAuth(); const sole = useSoleAdmin(); const toast = useToast();
  const q = useQuery<{ configItems: Item[] }>(`{configItems{key label description displayValue editorJson version isDefault pending{${V}}}}`);
  const [edit, setEdit] = useState<Item | null>(null), [history, setHistory] = useState<Item | null>(null), [search, setSearch] = useState('');
  const items = (q.data?.configItems ?? []).filter(i => `${i.label} ${i.description}`.toLowerCase().includes(search.toLowerCase()));
  const groups = Object.entries(items.reduce<Record<string, Item[]>>((all, i) => { (all[i.key.split('.')[0]] ??= []).push(i); return all; }, {}));
  const decide = async (id: string, approve: boolean) => { try { await gql(`mutation($id:ID!,$a:Boolean!){decideConfigChange(id:$id,approve:$a){id}}`, { id, a: approve }); void q.refetch(); } catch (e) { if ((e as any).code !== 'CANCELLED') toast((e as Error).message, true); } };
  return <div className="stack" style={{ gap: 24 }}>
    <PageHead title="Configuration" sub={sole ? 'Manage your business rules. Saved changes take effect immediately.' : 'Manage your business rules. Changes require approval from another administrator.'} />
    <label className="field">Search settings<input className="input" type="search" value={search} onChange={e => setSearch(e.target.value)} /></label>
    {q.error ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <SkeletonRows /> : groups.map(([group, list]) => <section className="section" key={group}><h2>{GROUP[group] ?? 'Other settings'}</h2><div className="panel list list-pad">{list.map(i => <div className="list-row" key={i.key} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div className="grow" style={{ minWidth: 220 }}><div className="w6">{i.label}</div><p className="t2 sm">{i.description}</p><div style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{i.displayValue.length > 280 ? i.displayValue.slice(0, 280) + '…' : i.displayValue}</div><p className="t3 xs">{i.isDefault ? 'Default setting' : `Version ${i.version}`}</p>{i.pending && <div className="notice warn" style={{ whiteSpace: 'pre-line' }}>Proposed: {i.pending.displayValue.slice(0, 280)} · {i.pending.reason}</div>}</div>
      <div className="row">{i.pending ? i.pending.makerId === me?.id && !sole ? <span className="badge warn">Waiting for another administrator</span> : <><button className="btn btn-sm" onClick={() => void decide(i.pending!.id, false)}>Reject</button><button className="btn btn-sm btn-primary" onClick={() => void decide(i.pending!.id, true)}>Approve</button></> : <button className="btn btn-sm" onClick={() => setEdit(i)}>{sole ? 'Change' : 'Propose change'}</button>}<button className="btn btn-sm" onClick={() => setHistory(i)}>History</button></div>
    </div>)}</div></section>)}
    {edit && <EditSetting item={edit} sole={sole} close={() => setEdit(null)} saved={() => void q.refetch()} />}
    {history && <History item={history} close={() => setHistory(null)} saved={() => void q.refetch()} />}
  </div>;
}

function EditSetting({ item, sole, close, saved }: { item: Item; sole: boolean; close: () => void; saved: () => void }) {
  const [field, setField] = useState<SettingField>(() => JSON.parse(item.editorJson));
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false); const toast = useToast();
  const invalid = settingError(field);
  const save = async () => { setBusy(true); setError(''); try { const d = await gql<{ proposeConfigChange: { status: string } }>(`mutation($k:String!,$v:String!,$r:String!){proposeConfigChange(key:$k,valueJson:$v,reason:$r){id status}}`, { k: item.key, v: JSON.stringify(settingValue(field)), r: reason }); toast(d.proposeConfigChange.status === 'PENDING' ? 'Change sent for approval.' : 'Change applied.'); saved(); close(); } catch (e) { if ((e as any).code !== 'CANCELLED') setError((e as Error).message); } finally { setBusy(false); } };
  return <Dialog title={`Change ${item.label.toLowerCase()}`} sub={item.description} onClose={close}><div className="stack"><SettingEditor field={field} onChange={setField} />{invalid && <p className="err">{invalid}</p>}<label className="field">Reason<input className="input" value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this changing?" /></label>{error && <p className="err" role="alert">{error}</p>}<div className="row"><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !!invalid || reason.trim().length < 5} onClick={() => void save()}>{busy ? 'Saving…' : sole ? 'Save' : 'Send for approval'}</button></div></div></Dialog>;
}
function History({ item, close, saved }: { item: Item; close: () => void; saved: () => void }) {
  const q = useQuery<{ configHistory: Version[] }>(`query($k:String!){configHistory(key:$k){${V}}}`, { k: item.key }); const toast = useToast();
  return <Dialog title="Change history" sub={item.label} onClose={close}>{q.error ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <SkeletonRows /> : !q.data.configHistory.length ? <p>Still on the default setting.</p> : <div className="stack">{q.data.configHistory.map(v => <div key={v.id} className="stack"><strong>Version {v.version} · {settingStatus(v.status)}</strong><div style={{ whiteSpace: 'pre-line' }}>{v.displayValue}</div><span className="t3 sm">{v.reason} · {when(v.createdAt)}</span>{v.status === 'SUPERSEDED' && <button className="btn" onClick={async () => { try { await gql(`mutation($k:String!,$v:Int!){proposeConfigRollback(key:$k,toVersion:$v){id}}`, { k: item.key, v: v.version }); saved(); close(); } catch (e) { toast((e as Error).message, true); } }}>Restore this version</button>}</div>)}</div>}</Dialog>;
}
