export const SCENARIOS = {
  inbound: { label: 'Inbound Lead', instruction: 'You are a new customer responding to an internet inquiry or phone pop.', welcome: 'You are practicing an inbound lead call. I will play the customer who responded to an inquiry. When you hear the tone, open the call as the salesperson and lead the conversation toward an appointment.' },
  best_price: { label: 'Best Price Objection', instruction: 'You are a customer pressing for the best price before agreeing to visit.', welcome: 'You are practicing a best-price objection. I will be the customer asking for your lowest price before I agree to visit. Start the call as the salesperson and work to create enough value and urgency to earn the appointment.' },
  usst: { label: 'Unsold Showroom Traffic', instruction: 'You are a customer who left the showroom without buying and is now receiving a follow-up call.', welcome: 'You are practicing an unsold showroom follow-up. I will be the customer who left without buying. Start as the salesperson, reconnect with me, find out what happened, and work toward a next step.' },
  service_to_sales: { label: 'Service to Sales', instruction: 'You are a service customer who may have an upgrade opportunity, but you are not yet committed to buying.', welcome: 'You are practicing a service-to-sales call. I will be a service customer who may have an upgrade opportunity but is not committed to buying. Start the call as the salesperson and discover whether there is a reason to continue the conversation.' },
  referral: { label: 'Referral Call', instruction: 'You are a happy customer being asked whether you know someone who may be buying next.', welcome: 'You are practicing a referral call. I will be a happy customer, and your goal is to naturally ask whether I know someone who may be buying. Start the call as the salesperson when you are ready.' },
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
