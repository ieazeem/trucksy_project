import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

/**
 * The official TRUCKSY wordmark, same as the website: white letters with a green
 * glow that sweeps across them from T to Y every 4 seconds.
 */
const LETTERS = 'TRUCKSY'.split('');
const CYCLE = 4000;     // one sweep every 4 s (website: animation 4s infinite)
const STAGGER = 120;    // next letter lights 0.12 s later
const RISE = 320;       // 0% -> 8% of the cycle
const FALL = 480;       // 8% -> 20% of the cycle

export function Wordmark({ size = 30 }: { size?: number }) {
  const glows = useRef(LETTERS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.stagger(
          STAGGER,
          glows.map((v, i) =>
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: RISE, easing: Easing.out(Easing.quad), useNativeDriver: true }),
              Animated.timing(v, { toValue: 0, duration: FALL, easing: Easing.in(Easing.quad), useNativeDriver: true }),
              Animated.delay(CYCLE - RISE - FALL - STAGGER * (LETTERS.length - 1 - i) - STAGGER * i),
            ]),
          ),
        ),
      );
      loop.start();
    });
    return () => { cancelled = true; loop?.stop(); };
  }, [glows]);

  const text = { fontSize: size, lineHeight: size * 1.15 };
  return (
    <View style={s.row} accessible accessibilityRole="header" accessibilityLabel="Trucksy">
      {LETTERS.map((ch, i) => (
        <View key={i}>
          <Text style={[s.letter, text]}>{ch}</Text>
          <Animated.Text style={[s.letter, s.glow, text, { opacity: glows[i] }]} aria-hidden>{ch}</Animated.Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // System bold, like the website's wordmark.
  letter: { color: '#fff', fontWeight: '800', letterSpacing: 1.2 },
  glow: {
    position: 'absolute', left: 0, top: 0, color: colors.amber,
    textShadowColor: 'rgba(52, 211, 153, 0.9)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 14,
  },
});
