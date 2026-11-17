'use client';
import { useId } from 'react';
import type { SettingField } from '@/lib/configuration';

/** Regular labelled controls for scalar values and nested business settings; never a JSON editor. */
export function SettingEditor({ field, onChange }: { field: SettingField; onChange: (field: SettingField) => void }) {
  const id = useId();
  const set = (value: SettingField['value']) => onChange({ ...field, value });
  if (field.type === 'object') return <fieldset className="stack" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}><legend className="w6">{field.label}</legend>{field.fields?.map((entry, index) => <SettingEditor key={entry.key} field={entry.field} onChange={next => onChange({ ...field, fields: field.fields!.map((f, n) => n === index ? { ...f, field: next } : f) })} />)}</fieldset>;
  if (field.type === 'array') return <fieldset className="stack" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 12 }}><legend className="w6">{field.label}</legend>{field.items?.map((item, index) => <div className="stack" key={index}><SettingEditor field={{ ...item, label: `${item.label} ${index + 1}` }} onChange={next => onChange({ ...field, items: field.items!.map((f, n) => n === index ? { ...next, label: item.label } : f) })} /><button type="button" className="btn btn-sm" onClick={() => onChange({ ...field, items: field.items!.filter((_, n) => n !== index) })}>Remove item {index + 1}</button></div>)}<button type="button" className="btn" onClick={() => onChange({ ...field, items: [...(field.items ?? []), JSON.parse(JSON.stringify(field.template!))] })}>Add item</button></fieldset>;
  if (field.type === 'boolean') return <label className="row" htmlFor={id}><input id={id} type="checkbox" checked={field.value === true} onChange={e => set(e.target.checked)} />{field.label} · {field.value ? 'Enabled' : 'Disabled'}</label>;
  return <div className="field">
    {field.nullable && <label className="row" htmlFor={`${id}-default`}><input id={`${id}-default`} type="checkbox" checked={field.value === null} onChange={e => set(e.target.checked ? null : '0')} />{field.nullLabel}</label>}
    {field.value !== null && <><label htmlFor={id}>{field.label}{field.unit ? ` (${field.unit})` : ''}</label>{field.type === 'select' ? <select className="input" id={id} value={String(field.value ?? '')} onChange={e => set(e.target.value)}><option value="" disabled>Choose an option</option>{field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select> : field.type === 'text' && String(field.value).length > 120 ? <textarea className="input" id={id} rows={3} value={String(field.value ?? '')} onChange={e => set(e.target.value)} /> : <input className="input" id={id} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} step="any" value={String(field.value ?? '')} onChange={e => set(e.target.value)} />}</>}
  </div>;
}
