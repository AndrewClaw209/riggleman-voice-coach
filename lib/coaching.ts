export const SCENARIOS = {
  inbound: { label: 'Inbound Lead', instruction: 'You are a new customer responding to an internet inquiry or phone pop.' },
  best_price: { label: 'Best Price Objection', instruction: 'You are a customer pressing for the best price before agreeing to visit.' },
  usst: { label: 'Unsold Showroom Traffic', instruction: 'You are a customer who left the showroom without buying and is now receiving a follow-up call.' },
  service_to_sales: { label: 'Service to Sales', instruction: 'You are a service customer who may have an upgrade opportunity, but you are not yet committed to buying.' },
  referral: { label: 'Referral Call', instruction: 'You are a happy customer being asked whether you know someone who may be buying next.' },
} as const;

export type Scenario = keyof typeof SCENARIOS;

export const SCORE_DIMENSIONS = [
  'opening',
  'discovery',
  'appointmentAsk',
  'urgency',
  'objectionHandling',
  'nextStepClarity',
] as const;

export type Score = Record<(typeof SCORE_DIMENSIONS)[number], number> & { total: number };

export function emptyScore(): Score {
  return { opening: 0, discovery: 0, appointmentAsk: 0, urgency: 0, objectionHandling: 0, nextStepClarity: 0, total: 0 };
}
