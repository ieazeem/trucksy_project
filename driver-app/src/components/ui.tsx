import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, View,
  type PressableProps, type StyleProp, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';

import { colors, fonts, statusStyle } from '../theme';

export function T({ style, variant = 'body', ...p }: TextProps & { variant?: 'body' | 'muted' | 'strong' | 'display' | 'title' | 'small' }) {
  return <Text {...p} style={[s.text, s[variant], style]} />;
}

export function Btn({
  title, onPress, kind = 'primary', loading, disabled, icon, style, big,
}: {
  title: string; onPress?: PressableProps['onPress']; kind?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'onSign';
  loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle>; big?: boolean;
}) {
  const k = kinds[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={(e) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        s.btn, big && s.btnBig, { backgroundColor: k.bg, borderColor: k.border },
        pressed && { opacity: 0.85, transform: [{ translateY: 1 }] },
        (disabled || loading) && { opacity: 0.55 }, style,
      ]}
    >
      {loading ? <ActivityIndicator color={k.fg} /> : (
        <View style={s.btnRow}>
          {icon}
          <Text style={[s.btnText, big && s.btnTextBig, { color: k.fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

const kinds = {
  primary: { bg: colors.amber, fg: colors.ink, border: colors.amber },
  secondary: { bg: colors.paper, fg: colors.ink, border: colors.line },
  danger: { bg: colors.paper, fg: colors.stop, border: colors.line },
  ghost: { bg: 'transparent', fg: colors.sign, border: 'transparent' },
  onSign: { bg: 'rgba(255,255,255,0.12)', fg: '#fff', border: 'rgba(255,255,255,0.4)' },
};

export function Chip({ status, label }: { status: string; label: string }) {
  const st = statusStyle[status] || statusStyle.pending;
  return (
    <View style={[s.chip, { backgroundColor: st.bg }]}>
      <View style={[s.chipDot, { backgroundColor: st.fg }]} />
      <Text style={[s.chipText, { color: st.fg }]}>{label}</Text>
    </View>
  );
}

/** Blue road-sign panel with the inset white rule. */
export function SignBoard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.sign, style]}>
      <View style={s.signInner}>{children}</View>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

const STAGE_POS: Record<string, number> = { assigned: 0.04, to_pickup: 0.14, loaded: 0.28, in_transit: 0.62, delivered: 0.96 };

/** The road strip: where this job is between pickup and drop-off. */
export function RoadStrip({ status, plate, from, to }: { status: string; plate: string; from: string; to: string }) {
  const pos = STAGE_POS[status] ?? 0.04;
  const truckLeft = Math.min(Math.max(pos, 0.1), 0.86);
  return (
    <View accessible accessibilityLabel={`Trip from ${from} to ${to}`}>
      <View style={s.road}>
        <View style={[s.roadDone, { width: `${pos * 100}%` }]} />
        <View style={s.lane} />
        <View style={[s.stop, { left: '28%' }]} />
        <View style={[s.stop, { left: '96%' }]} />
        <View style={[s.truck, { left: `${truckLeft * 100}%` }]}>
          <Text style={s.truckText} numberOfLines={1}>{plate}</Text>
        </View>
      </View>
      <View style={s.ends}>
        <Text style={[s.endText]} numberOfLines={1}>{from}</Text>
        <Text style={[s.endText, { textAlign: 'right' }]} numberOfLines={1}>{to}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  text: { color: colors.ink, fontFamily: fonts.regular, fontSize: 16, lineHeight: 22 },
  body: {},
  muted: { color: colors.ink2, fontSize: 15 } as TextStyle,
  small: { color: colors.ink3, fontSize: 13, lineHeight: 18 } as TextStyle,
  strong: { fontFamily: fonts.semibold },
  title: { fontFamily: fonts.displaySemi, fontSize: 22, lineHeight: 26 },
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 42 },

  btn: { minHeight: 50, borderRadius: 8, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  btnBig: { minHeight: 64, borderRadius: 10 },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
  btnTextBig: { fontFamily: fonts.display, fontSize: 24 },

  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: fonts.semibold, fontSize: 13 },

  sign: { backgroundColor: colors.sign, borderRadius: 12, padding: 5 },
  signInner: { borderWidth: 2, borderColor: '#fff', borderRadius: 8, padding: 16 },

  card: { backgroundColor: colors.paper, borderRadius: 8, borderWidth: 1, borderColor: colors.line, padding: 16 },

  road: { height: 26, borderRadius: 5, backgroundColor: colors.asphalt, justifyContent: 'center', marginTop: 6 },
  roadDone: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: 'rgba(242,169,0,0.32)', borderTopLeftRadius: 5, borderBottomLeftRadius: 5 },
  lane: { position: 'absolute', left: 10, right: 10, height: 0, borderTopWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.55)' },
  stop: { position: 'absolute', width: 8, height: 8, marginLeft: -4, borderRadius: 4, backgroundColor: '#fff' },
  truck: {
    position: 'absolute', transform: [{ translateX: -34 }], width: 68, alignItems: 'center',
    backgroundColor: colors.amber, borderRadius: 4, paddingVertical: 1, borderWidth: 2, borderColor: colors.asphalt,
  },
  truckText: { fontFamily: fonts.display, fontSize: 14, color: colors.ink },
  ends: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  endText: { flex: 1, color: colors.ink2, fontFamily: fonts.regular, fontSize: 13 },
});
