import { AdminMfaGate } from '@/admin-screens';
import { useSoleAdmin } from '@/sole-admin';
import { useState } from 'react';
import { View } from 'react-native';
import { gql } from '@/api';
import { useAuth } from '@/auth';
import { BellButton } from '@/screens';
import { EVIDENCE_FIELDS, PaymentEvidenceDetails, type PaymentEvidence } from '@/payment-details';
import { inr, when } from '@/theme';
import {
  Button,
  Chips,
  DateField,
  Empty,
  ErrorState,
  Field,
  Lines,
  ListRow,
  Notice,
  Row,
  Screen,
  SearchBox,
  Sheet,
  Skeleton,
  T,
  toast,
  useQuery,
  VList,
} from '@/ui';

interface P {
  isDemo: boolean;
  paymentEvidence?: PaymentEvidence;
  id: string;
  userId: string;
  username?: string;
  type: string;
  mode: string;
  amount: string;
  status: string;
  createdAt: string;
  requestedById: string;
  requestedByName?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  journalId?: string;
  externalRef?: string;
}
export default function Approvals() {
  const { me } = useAuth();
  const sole = useSoleAdmin();
  const [status, setStatus] = useState('REQUESTED'),
    [type, setType] = useState(''),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const invalidDates = !!from && !!to && from > to;
  const { data, error, loading, refetch } = useQuery<{ paymentRequests: P[] }>(
    `query($s:[PaymentStatus!],$ty:PaymentType,$q:String,$f:DateTime,$t:DateTime,$o:Int){paymentRequests(status:$s,type:$ty,search:$q,from:$f,to:$t,offset:$o,limit:50){id userId username type mode isDemo amount status createdAt requestedById requestedByName reviewedByName reviewedAt reviewNote journalId externalRef paymentEvidence{${EVIDENCE_FIELDS}}}}`,
    {
      s: status ? [status] : undefined,
      ty: type || undefined,
      q: search || undefined,
      f: from ? new Date(`${from}T00:00:00+05:30`).toISOString() : undefined,
      t: to ? new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86400000).toISOString() : undefined,
      o: page * 50,
    },
    10000,
    (me?.role === 'SUPER_ADMIN' && !me.mfaEnabled) || invalidDates,
  );
  const [sel, setSel] = useState<P | null>(null);
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const own = (p: P) => (p.requestedById === me?.id && !sole) || p.userId === me?.id;
  const act = async () => {
    if (!sel) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'approve') await gql(`mutation($id:ID!){ approvePayment(id:$id){ id } }`, { id: sel.id });
      else await gql(`mutation($id:ID!,$n:String!){ rejectPayment(id:$id, note:$n){ id } }`, { id: sel.id, n: note });
      toast(mode === 'approve' ? 'Approved and posted' : 'Request rejected');
      setSel(null);
      setNote('');
      void refetch();
    } catch (e) {
      if ((e as { code?: string }).code !== 'CANCELLED') setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if ((me?.role === 'SUPER_ADMIN' && !me.mfaEnabled)) return <AdminMfaGate title="Approvals" />;
  return (
    <Screen title="Transactions" scroll={false} right={<BellButton />} onRefresh={refetch}>
      <VList
        data={data?.paymentRequests ?? []}
        keyOf={(p) => p.id}
        header={
          <>
            <SearchBox
              value={search}
              onChangeText={(v) => {
                setSearch(v);
                setPage(0);
              }}
              placeholder="Account or transaction ID"
            />
            <Chips
              value={status}
              onChange={(v) => {
                setStatus(v);
                setPage(0);
              }}
              items={['REQUESTED', '', 'POSTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'].map((k) => ({
                k,
                label: k === '' ? 'All statuses' : k === 'REQUESTED' ? 'Needs review' : k.toLowerCase(),
              }))}
            />
            <Chips
              value={type}
              onChange={(v) => {
                setType(v);
                setPage(0);
              }}
              items={[
                { k: '', label: 'All types' },
                { k: 'DEPOSIT', label: 'Deposits' },
                { k: 'WITHDRAWAL', label: 'Withdrawals' },
              ]}
            />
            <DateField
              label="From (IST)"
              value={from}
              max={to || undefined}
              onChange={(v) => {
                setFrom(v);
                setPage(0);
              }}
            />
            <DateField
              label="To (IST)"
              value={to}
              min={from || undefined}
              onChange={(v) => {
                setTo(v);
                setPage(0);
              }}
            />
            {(from || to || search || type) && (
              <Button
                title="Clear filters"
                onPress={() => {
                  setSearch('');
                  setType('');
                  setFrom('');
                  setTo('');
                  setPage(0);
                }}
              />
            )}
            {invalidDates && <Notice tone="err">The start date must be on or before the end date.</Notice>}
          </>
        }
        empty={
          loading && !data ? (
            <Skeleton />
          ) : error ? (
            <ErrorState error={error} retry={refetch} />
          ) : (
            <Empty icon="check" title="No matching requests" />
          )
        }
        render={(p) => (
          <ListRow
            onPress={() => {
              setErr(null);
              setNote('');
              setMode('approve');
              setSel(p);
            }}
            label={`View ${p.username}`}
            title={`${p.username} ? ${p.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}`}
            sub={`${when(p.createdAt)} ? ${p.status}${own(p) && p.status === 'REQUESTED' ? ' ? needs another admin' : ''}`}
            right={<T v="num">?{inr(p.amount)}</T>}
          />
        )}
        footer={
          <Row>
            <Button title="Previous" disabled={!page} onPress={() => setPage((v) => v - 1)} />
            <Button
              title="Next"
              disabled={(data?.paymentRequests.length ?? 0) < 50}
              onPress={() => setPage((v) => v + 1)}
            />
          </Row>
        }
      />
      <Sheet
        visible={!!sel}
        title={mode === 'approve' ? 'Approve request?' : 'Reject request?'}
        sub="You’ll confirm with your password."
        onClose={() => setSel(null)}
      >
        {sel && (
          <Lines
            lines={[
              ['Account', sel.username ?? ''],
              ['Type', sel.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'],
              ['Amount', `₹${inr(sel.amount)}`],
            ]}
          />
        )}
        {sel?.paymentEvidence && <PaymentEvidenceDetails evidence={sel.paymentEvidence} />}
        {sel?.isDemo && mode === 'approve' && <Notice>This changes a virtual balance only. No money moves.</Notice>}
        {sel?.status === 'REQUESTED' && !own(sel) && mode === 'reject' && (
          <Field label="Reason shown to the requester" value={note} onChangeText={setNote} />
        )}
        {err && <Notice tone="err">{err}</Notice>}
        {sel?.status === 'REQUESTED' && !own(sel) && (
          <Row>
            {mode === 'approve' ? (
              <Button block title="Reject" kind="danger" onPress={() => setMode('reject')} />
            ) : (
              <Button block title="Back" onPress={() => setMode('approve')} />
            )}
            <View style={{ flex: 1 }}>
              <Button
                block
                size="lg"
                title={mode === 'approve' ? 'Approve' : 'Reject'}
                kind={mode === 'approve' ? 'primary' : 'sell'}
                busy={busy}
                disabled={sel?.status === 'REQUESTED' && !own(sel) && mode === 'reject' && note.trim().length < 3}
                onPress={act}
              />
            </View>
          </Row>
        )}
      </Sheet>
    </Screen>
  );
}
