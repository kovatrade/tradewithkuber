import type { ReactNode } from 'react';
import { View } from 'react-native';
import { expiryLabel, fullName, marketOf } from './names';
import { useTheme } from './theme';
import { T } from './ui';

export interface ScriptInst { symbol?: string; name?: string; expiry?: string | null; exchange?: string; category?: string }

/**
 * A script's name the same way everywhere (watchlist, trades, orders, positions, search, trade ticket):
 * NAME in bold capitals, then the expiry, then the market badge (MCX). `extra` is placed after the badge.
 */
export function ScriptName({ i, size = 14, extra }: { i?: ScriptInst | null; size?: number; extra?: ReactNode }) {
  const t = useTheme();
  if (!i) return <T w="800">—</T>;
  const market = marketOf(i);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, rowGap: 2, minWidth: 0, flexShrink: 1 }}>
      <T w="800" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '100%', fontSize: size, lineHeight: size + 4 }}>{fullName(i).toUpperCase()}</T>
      {!!i.expiry && <T v="xs" c="text2" w="500" numberOfLines={1} style={{ fontSize: 10 }}>{expiryLabel(i.expiry)}</T>}
      {!!market && <View style={{ backgroundColor: t.bg3, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 }}><T v="xs" c="text2" w="700" style={{ fontSize: 9, lineHeight: 12 }}>{market}</T></View>}
      {extra}
    </View>
  );
}
