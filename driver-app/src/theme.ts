// Same road-sign language as the dispatch console: sign blue + highway amber.
export const colors = {
  ink: '#18212e',
  ink2: '#566172',
  ink3: '#8a93a0',
  concrete: '#eceeea',
  paper: '#ffffff',
  line: '#d9ddd5',
  sign: '#12459b',
  signDeep: '#0c326f',
  signTint: '#e3ebf8',
  signText: '#d5e1f6',
  amber: '#f2a900',
  amberTint: '#fdf3d6',
  amberInk: '#7a5300',
  go: '#1d8a57',
  goTint: '#dff1e7',
  stop: '#c2382e',
  stopTint: '#f8e2df',
  asphalt: '#2a3340',
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
  pending: { bg: '#eef0ec', fg: colors.ink2 },
  assigned: { bg: colors.signTint, fg: colors.sign },
  to_pickup: { bg: colors.signTint, fg: colors.sign },
  available: { bg: colors.goTint, fg: colors.go },
  loaded: { bg: colors.amberTint, fg: colors.amberInk },
  in_transit: { bg: colors.amberTint, fg: colors.amberInk },
  on_job: { bg: colors.amberTint, fg: colors.amberInk },
  delivered: { bg: colors.goTint, fg: colors.go },
  cancelled: { bg: colors.stopTint, fg: colors.stop },
  offline: { bg: '#eef0ec', fg: colors.ink3 },
  break: { bg: '#f1ecf8', fg: '#6a4aa0' },
};

/** What the big button says for the next step of a job. */
export const NEXT_ACTION: Record<string, { label: string; hint: string }> = {
  to_pickup: { label: 'Start driving to pickup', hint: 'Tap when you set off.' },
  loaded: { label: 'Goods are loaded', hint: 'Tap once everything is on the truck.' },
  in_transit: { label: 'Leave for drop-off', hint: 'Tap as you drive away from pickup.' },
  delivered: { label: 'Mark as delivered', hint: 'You will enter who received the goods.' },
};
