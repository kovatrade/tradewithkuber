/** Format checks only. Payment receipt must still be verified against the receiving account. */
export const UTR_RE = /^(?:\d{12}|(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)(?:[A-Z0-9]{16}|[A-Z0-9]{22}))$/;
export const UTR_HINT = 'Enter the 12-digit UPI reference or a 16- or 22-character bank UTR containing letters and digits.';
export function validPaymentReference(value: string) {
  const utr = value.trim().toUpperCase();
  return UTR_RE.test(utr) && !/^(.)\1+$/.test(utr);
}
