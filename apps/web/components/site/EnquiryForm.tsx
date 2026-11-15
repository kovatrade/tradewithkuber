'use client';
import { useState } from 'react';
import { gql } from '@/lib/api';

/** "Call me back" form. Sends a course enquiry; a Super Admin sees it under Course enquiries. */
export function EnquiryForm({ courses, defaultSlug, compact }: { courses: { slug: string; title: string }[]; defaultSlug?: string; compact?: boolean }) {
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  if (state === 'sent') {
    return (
      <div className="ws-form ws-form-done" role="status">
        <h3>Thanks, we’ll call you</h3>
        <p>Someone from our team will call you back, usually within one working day.</p>
      </div>
    );
  }
  return (
    <form
      className={`ws-form${compact ? ' ws-form-compact' : ''}`}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const v = (k: string) => String(f.get(k) ?? '').trim();
        setErr(null);
        setState('busy');
        try {
          await gql(`mutation($i:CourseEnquiryInput!){ submitCourseEnquiry(input:$i) }`, {
            i: { name: v('name'), phone: v('phone'), email: v('email') || undefined, courseSlug: v('course') || undefined, message: v('message') || undefined, website: v('website') || undefined },
          });
          setState('sent');
        } catch (x) {
          setErr((x as Error).message);
          setState('idle');
        }
      }}
    >
      <label><span>Your name</span><input name="name" required maxLength={80} autoComplete="name" /></label>
      <label><span>Mobile number</span><input name="phone" required inputMode="tel" maxLength={14} autoComplete="tel" placeholder="10-digit number" /></label>
      {!compact && <label><span>Email <span className="ws-opt">(optional)</span></span><input name="email" type="email" maxLength={254} autoComplete="email" /></label>}
      <label><span>Course</span>
        <select name="course" defaultValue={defaultSlug ?? ''}>
          <option value="">Not sure yet, help me choose</option>
          {courses.map((c) => <option key={c.slug} value={c.slug}>{c.title}</option>)}
        </select>
      </label>
      {!compact && <label><span>Anything we should know? <span className="ws-opt">(optional)</span></span><textarea name="message" rows={3} maxLength={1000} placeholder="Your experience, preferred batch time…" /></label>}
      <input className="ws-trap" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      {err && <p className="ws-err" role="alert">{err}</p>}
      <button className="ws-btn ws-btn-main" disabled={state === 'busy'}>{state === 'busy' ? 'Sending…' : 'Call me back'}</button>
      <p className="ws-fine">We use your number only to talk about courses.</p>
    </form>
  );
}
