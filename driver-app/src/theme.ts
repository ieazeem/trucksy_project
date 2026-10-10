// Same road-sign language as the dispatch console: sign blue + highway amber.
export const colors = {
  // Same palette as the Trucksy website and dispatch console:
  // dark grey / black / emerald green (the trucks' underglow).
  ink: '#ffffff',
  ink2: '#c9cdd2',
  ink3: '#8f969e',
  concrete: '#262626',
  paper: '#333333',
  field: '#404040',
  line: '#3d3d3d',
  sign: '#1a1a1a',
  signDeep: '#000000',
  signTint: 'rgba(125,211,252,0.14)',
  signText: '#c9cdd2',
  sky: '#7dd3fc',
  amber: '#34d399',
  amberTint: 'rgba(52,211,153,0.14)',
  amberInk: '#34d399',
  go: '#e5e7eb',
  goTint: 'rgba(255,255,255,0.09)',
  wait: '#fbbf24',
  waitTint: 'rgba(251,191,36,0.14)',
  stop: '#f87171',
  stopTint: 'rgba(248,113,113,0.14)',
  asphalt: '#111111',
};

export const fonts = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  display: 'BarlowCondensed_700Bold',
  displaySemi: 'BarlowCondensed_600SemiBold',
};

export type LoadStatus =
  | 'pending' | 'assigned' | 'to_pickup' | 'loaded' | 'in_transit' | 'delivered' | 'cancelled';

export const statusStyle: Record<string, { bg: string; fg: string }> = {
  pending: { bg: colors.waitTint, fg: colors.wait },
  assigned: { bg: colors.signTint, fg: colors.sky },
  to_pickup: { bg: colors.signTint, fg: colors.sky },
  available: { bg: colors.signTint, fg: colors.sky },
  loaded: { bg: colors.amberTint, fg: colors.amberInk },
  in_transit: { bg: colors.amberTint, fg: colors.amberInk },
  on_job: { bg: colors.amberTint, fg: colors.amberInk },
  delivered: { bg: colors.goTint, fg: colors.go },
  cancelled: { bg: colors.stopTint, fg: colors.stop },
  offline: { bg: 'rgba(255,255,255,0.06)', fg: colors.ink3 },
  break: { bg: 'rgba(196,181,253,0.14)', fg: '#c4b5fd' },
};

/** What the big button says for the next step of a job. */
export const NEXT_ACTION: Record<string, { label: string; hint: string }> = {
  to_pickup: { label: 'Start driving to pickup', hint: 'Tap when you set off.' },
  loaded: { label: 'Goods are loaded', hint: 'Tap once everything is on the truck.' },
  in_transit: { label: 'Leave for drop-off', hint: 'Tap as you drive away from pickup.' },
  delivered: { label: 'Mark as delivered', hint: 'You will enter who received the goods.' },
};
