import { Switch, View } from 'react-native';
import { Button, Chips, DateField, Field, Row, T } from './ui';
import type { SettingField } from './configuration';

export function SettingEditor({ field, onChange }: { field: SettingField; onChange: (field: SettingField) => void }) {
  const set = (value: SettingField['value']) => onChange({ ...field, value });
  if (field.type === 'object') return <View style={{ gap: 12 }}><T w="700">{field.label}</T>{field.fields?.map((entry, index) => <SettingEditor key={entry.key} field={entry.field} onChange={next => onChange({ ...field, fields: field.fields!.map((f, n) => n === index ? { ...f, field: next } : f) })} />)}</View>;
  if (field.type === 'array') return <View style={{ gap: 16 }}><T w="700">{field.label}</T>{field.items?.map((item, index) => <View key={index} style={{ gap: 8 }}><SettingEditor field={{ ...item, label: `${item.label} ${index + 1}` }} onChange={next => onChange({ ...field, items: field.items!.map((f, n) => n === index ? { ...next, label: item.label } : f) })} /><Button size="sm" title={`Remove item ${index + 1}`} onPress={() => onChange({ ...field, items: field.items!.filter((_, n) => n !== index) })} /></View>)}<Button title="Add item" onPress={() => onChange({ ...field, items: [...(field.items ?? []), JSON.parse(JSON.stringify(field.template!))] })} /></View>;
  if (field.type === 'boolean') return <Row><T style={{ flex: 1 }}>{field.label}</T><T>{field.value ? 'Enabled' : 'Disabled'}</T><Switch accessibilityLabel={field.label} value={field.value === true} onValueChange={set} /></Row>;
  return <View style={{ gap: 8 }}>
    {field.nullable && <Row><T style={{ flex: 1 }}>{field.nullLabel}</T><Switch accessibilityLabel={field.nullLabel} value={field.value === null} onValueChange={on => set(on ? null : '0')} /></Row>}
    {field.value !== null && (field.type === 'select' ? <View style={{ gap: 6 }}><T>{field.label}</T><Chips value={String(field.value ?? '')} onChange={set} items={field.options!.map(o => ({ k: o.value, label: o.label }))} /></View> : field.type === 'date' ? <DateField label={field.label} value={String(field.value ?? '')} onChange={set} /> : <Field label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`} value={String(field.value ?? '')} keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'} autoCapitalize="none" autoCorrect={false} multiline={field.type === 'text' && String(field.value).length > 120} onChangeText={set} hint={field.type === 'time' ? '24-hour time, for example 09:00' : undefined} />)}
  </View>;
}
