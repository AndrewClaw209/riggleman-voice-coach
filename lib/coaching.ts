export const SCENARIOS = {
  inbound: { label: 'Inbound Lead', instruction: 'Practice an inbound internet lead or phone pop.' },
  best_price: { label: 'Best Price Objection', instruction: 'The customer is pressing for your best price before visiting.' },
  usst: { label: 'Unsold Showroom Traffic', instruction: 'Call a customer who left without buying.' },
  service_to_sales: { label: 'Service to Sales', instruction: 'Call a service customer with a compelling upgrade opportunity.' },
  referral: { label: 'Referral Call', instruction: 'Ask a happy customer who they know that may be buying next.' },
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
