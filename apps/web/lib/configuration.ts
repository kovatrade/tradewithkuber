/** Form metadata supplied by the API. Values are converted to storage units only on submission. */
export interface SettingField {
  label: string; type: 'boolean' | 'number' | 'text' | 'date' | 'time' | 'select' | 'object' | 'array';
  value?: string | boolean | null; unit?: string; scale?: number; stringNumber?: boolean;
  nullable?: boolean; nullLabel?: string; options?: { value: string; label: string }[];
  fields?: { key: string; field: SettingField }[]; items?: SettingField[]; template?: SettingField;
}

export function settingValue(field: SettingField): unknown {
  if (field.type === 'object') return Object.fromEntries((field.fields ?? []).map(f => [f.key, settingValue(f.field)]));
  if (field.type === 'array') return (field.items ?? []).map(settingValue);
  if (field.value === null && field.nullable) return null;
  if (field.type === 'boolean') return field.value === true;
  if (field.type !== 'number') return field.value ?? '';
  const text = String(field.value ?? '').trim();
  if (!text || !Number.isFinite(Number(text))) throw new Error(`Enter a valid number for ${field.label}.`);
  if (field.scale === 100) {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error(`${field.label} allows up to two decimal places.`);
    const [whole, fraction = ''] = text.split('.');
    const scaled = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    return field.stringNumber ? scaled.toString() : Number(scaled);
  }
  return field.stringNumber ? text : Number(text);
}
export function settingError(field: SettingField | null) {
  if (!field) return 'Select a setting.';
  try { settingValue(field); return ''; } catch (e) { return (e as Error).message; }
}
export const settingStatus = (status: string) => ({ PENDING: 'Awaiting approval', APPROVED: 'Active', REJECTED: 'Rejected', SUPERSEDED: 'Previous version' })[status] ?? 'Saved';
