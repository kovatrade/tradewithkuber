'use client';
import { useState } from 'react';
import Link from 'next/link';
import { gql } from '@/lib/api';
import { when } from '@/lib/format';
import { useQuery } from '@/lib/hooks';
import { Empty, ErrorState, PageHead, SkeletonRows, useToast } from '@/components/ui';

interface Enquiry { id: string; name: string; phone: string; email?: string; courseSlug?: string; message?: string; status: string; note?: string; handledAt?: string; createdAt: string }
const STATUSES = ['NEW', 'CONTACTED', 'ENROLLED', 'CLOSED'] as const;
const LABEL: Record<string, string> = { NEW: 'New', CONTACTED: 'Contacted', ENROLLED: 'Enrolled', CLOSED: 'Closed' };

/** Super Admin: enquiries from the public course website ("Call me back" forms). */
export default function Enquiries() {
  const toast = useToast();
  const [filter, setFilter] = useState<string>('NEW');
  const q = useQuery<{ courseEnquiries: Enquiry[] }>(`query($s:String){ courseEnquiries(status:$s){ id name phone email courseSlug message status note handledAt createdAt } }`, { s: filter || null }, { pollMs: 30_000 });
  const courses = useQuery<{ siteCourses: { slug: string; title: string }[] }>(`{ siteCourses { slug title } }`);
  const title = (slug?: string) => (slug ? courses.data?.siteCourses.find((c) => c.slug === slug)?.title ?? slug : 'Not sure yet');
  const set = async (e: Enquiry, status: string) => {
    const note = status === 'NEW' ? null : window.prompt('Note (optional)', e.note ?? '') ?? undefined;
    if (note === undefined) return;
    try { await gql(`mutation($id:ID!,$s:String!,$n:String){ setCourseEnquiryStatus(id:$id, status:$s, note:$n){ id } }`, { id: e.id, s: status, n: note || null }); toast(`${e.name}: ${LABEL[status]}`); void q.refetch(); }
    catch (x) { toast((x as Error).message, true); }
  };
  return (
    <div className="stack" style={{ gap: 24 }}>
      <PageHead title="Course enquiries" sub="People who asked for a call back on the course website. Courses and fees are edited in Configuration → site.courses." />
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {[...STATUSES, ''].map((s) => (
          <button key={s || 'all'} className={`chip${filter === s ? ' on' : ''}`} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s ? LABEL[s] : 'All'}</button>
        ))}
        <Link href="/courses" className="btn btn-sm" target="_blank" style={{ marginLeft: 'auto' }}>Open website</Link>
        <Link href="/preview/broker" className="btn btn-sm" target="_blank">Preview broker website</Link>
      </div>
      {q.error && !q.data ? <ErrorState error={q.error} retry={q.refetch} /> : !q.data ? <SkeletonRows rows={4} /> : !q.data.courseEnquiries.length ? (
        <Empty icon="users" title={filter ? `No ${LABEL[filter].toLowerCase()} enquiries` : 'No enquiries yet'}>New enquiries from the website appear here, and you get a notification.</Empty>
      ) : (
        <div className="panel table-wrap">
          <table className="t">
            <thead><tr><th>Received</th><th>Name</th><th>Mobile</th><th>Course</th><th>Message</th><th>Status</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {q.data.courseEnquiries.map((e) => (
                <tr key={e.id}>
                  <td className="nowrap">{when(e.createdAt)}</td>
                  <td><span className="w6">{e.name}</span>{e.email && <div className="t3 xs">{e.email}</div>}</td>
                  <td className="nowrap"><a href={`tel:${e.phone}`}>{e.phone}</a></td>
                  <td>{title(e.courseSlug)}</td>
                  <td style={{ maxWidth: 280 }}>{e.message ?? <span className="t3">—</span>}{e.note && <div className="t3 xs">Note: {e.note}</div>}</td>
                  <td><span className={`badge${e.status === 'NEW' ? ' warn' : e.status === 'ENROLLED' ? ' ok' : ''}`}>{LABEL[e.status]}</span></td>
                  <td className="nowrap">
                    <select className="input" aria-label={`Change status for ${e.name}`} value={e.status} onChange={(ev) => void set(e, ev.target.value)} style={{ minWidth: 130 }}>
                      {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
