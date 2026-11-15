import type { Broker } from '@/lib/site-data';

/**
 * Regulatory disclosures for the broker website footer. Shows only the details filled in under
 * Configuration → site.broker; investor-awareness notes are the standard points every broker displays.
 */
export function Regulatory({ b, name }: { b: Broker; name: string }) {
  const firm = b.legalName || name;
  return (
    <div className="ws-wrap ws-reg">
      <p>
        {firm}
        {b.exchanges.length > 0 && <>: Member of {b.exchanges.map((x) => `${x.name}${x.memberId ? ` (${x.memberId})` : ''}`).join(', ')}</>}
        {b.sebiRegNo && <> · SEBI Registration no.: {b.sebiRegNo}</>}
        {b.dpRegNo && <> · Depository participant: {b.dpRegNo}</>}
        {b.cin && <> · CIN: {b.cin}</>}
        {b.address && <> · Registered address: {b.address}</>}
      </p>
      {(b.complianceEmail || b.grievanceEmail) && (
        <p>{b.grievanceEmail && <>For complaints, write to <a href={`mailto:${b.grievanceEmail}`}>{b.grievanceEmail}</a>. </>}{b.complianceEmail && <>Compliance officer: <a href={`mailto:${b.complianceEmail}`}>{b.complianceEmail}</a>.</>}</p>
      )}
      <p>If your complaint is not resolved, you can file it on SEBI SCORES (<a href="https://scores.sebi.gov.in" target="_blank" rel="noopener noreferrer">scores.sebi.gov.in</a>) or through the Online Dispute Resolution portal (<a href="https://smartodr.in" target="_blank" rel="noopener noreferrer">smartodr.in</a>).</p>
      <p>Investments in securities markets are subject to market risks; read all related documents carefully before investing. Keep your mobile number and email updated with your broker and depository, check the transaction messages you receive, and never share your password or OTP. Brokers do not give stock tips or assured returns.</p>
    </div>
  );
}
