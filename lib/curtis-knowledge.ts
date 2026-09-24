import books from '@/data/curtis-books.json';

export type CurtisSource = { source: string; text: string };

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'could', 'from', 'have', 'just', 'more', 'need', 'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your', 'customer', 'customers', 'sales', 'salesperson', 'sell', 'selling']);

// These are Curtis's own recurring terms. Expanding a natural-language question
// with them makes the local index find the teaching even when the user does not
// use the same words as the book.
const TEACHING_TERMS: Record<string, string[]> = {
  'think about it': ['objection', 'uncover the problem', 'why', 'emotion', 'close'],
  'need to think': ['objection', 'uncover the problem', 'why', 'emotion', 'close'],
  'not interested': ['objection', 'smokescreen', 'why', 'uncover the problem', 'question'],
  'best price': ['value over price', 'good deal', 'cheap deal', 'value'],
  price: ['value over price', 'value', 'good deal', 'cheap deal'],
  cheaper: ['value over price', 'good deal', 'cheap deal', 'raise value'],
  trade: ['trade value', 'purchase vehicle', 'emotion', 'both'],
  phone: ['dial for dollars', 'sixty seconds', 'call', 'word track'],
  call: ['dial for dollars', 'sixty seconds', 'word track', 'appointment'],
  appointment: ['dial for dollars', 'same day', 'next day', 'follow up'],
  close: ['art of the close', 'emotion creates motion', 'why', 'silence'],
  closing: ['art of the close', 'emotion creates motion', 'why', 'silence'],
  leader: ['mindset principle', 'built to lead', 'accountability', 'standard'],
  manager: ['built to lead', 'mindset principle', 'accountability', 'training'],
  objection: ['objections aren’t real', 'smokescreen', 'question', 'why'],
  'think': ['objection', 'uncover the problem', 'why', 'emotion'],
  'through the door': ['appointment', 'same day', 'dial for dollars', 'service to sales', 'referral'],
  'more customers': ['appointment', 'dial for dollars', 'service to sales', 'referral', 'phone'],
  'get customers': ['appointment', 'dial for dollars', 'service to sales', 'referral', 'phone'],
  'customer traffic': ['appointment', 'dial for dollars', 'service to sales', 'referral'],
  traffic: ['appointment', 'same day', 'phone', 'referral', 'service to sales'],
  leads: ['phone', 'appointment', 'sixty seconds', 'follow up'],
  referrals: ['referral', 'family', 'friend', 'sixty days'],
};

function terms(value: string) {
  return value.toLowerCase().match(/[a-z0-9']+/g)?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) || [];
}

function expandedQuery(query: string) {
  const normalized = query.toLowerCase();
  const additions = Object.entries(TEACHING_TERMS)
    .filter(([trigger]) => normalized.includes(trigger))
    .flatMap(([, related]) => related);
  return `${query} ${additions.join(' ')}`;
}

function stem(term: string) {
  return term.replace(/(ing|ed|es|s)$/i, '');
}

export function searchCurtisBooks(query: string, limit = 5): CurtisSource[] {
  const searchText = expandedQuery(query);
  const queryTerms = terms(searchText);
  if (!queryTerms.length) return [];
  const querySet = new Set(queryTerms.map(stem));
  const originalTerms = terms(query).map(stem);
  const phrase = query.toLowerCase().trim();

  return (books as CurtisSource[])
    .map((chunk) => {
      const chunkTerms = terms(chunk.text);
      const chunkSet = new Set(chunkTerms.map(stem));
      const originalOverlap = originalTerms.filter((term) => chunkSet.has(term)).length;
      const overlap = queryTerms.filter((term) => querySet.has(term) && chunkSet.has(term)).length;
      let score = overlap + originalOverlap * 1.75;
      if (phrase.length > 5 && chunk.text.toLowerCase().includes(phrase)) score += 8;
      // Prefer passages that contain Curtis's framework language over boilerplate
      // copyright pages that happen to share a common word.
      if (/key takeaway|technique:|example|word track|the .* close|mindset principle/i.test(chunk.text)) score += 1.5;
      score += queryTerms.filter((term) => chunk.text.toLowerCase().includes(term)).length * 0.08;
      return { chunk, score, overlap };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

export function formatKnowledgeContext(sources: CurtisSource[]) {
  if (!sources.length) return 'No directly relevant excerpt was found in the indexed Curtis material. Do not pretend a generic answer came from Curtis’s books.';
  return sources.map((item, index) => `[Curtis book excerpt ${index + 1} — ${item.source}]\n${item.text}`).join('\n\n');
}
