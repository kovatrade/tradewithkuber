/** Display legacy ledger descriptions without mode labels on regular accounts. */
export function accountText(text: string, demo = false) {
  if (demo) return text;
  return text.replace(/\s*\((?:simulated|virtual)\b[^)]*\)/gi, '')
    .replace(/\b(?:simulated|virtual)\b\s*/gi, '')
    .replace(/\s+([.,;:])/g, '$1').trim();
}
