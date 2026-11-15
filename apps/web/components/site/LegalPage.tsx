import type { ReactNode } from 'react';
import { PageIntro } from './Blocks';
import { SiteFrame } from './SiteFrame';

/** Shared layout for the legal pages (terms, privacy). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <SiteFrame>
      <PageIntro title={title} narrow>Last updated {updated}</PageIntro>
      <section className="ws-sec ws-sec-tight">
        <div className="ws-wrap ws-narrow ws-prose ws-legal">{children}</div>
      </section>
    </SiteFrame>
  );
}
