import books from '@/data/curtis-books.json';

export type CurtisSource = { source: string; text: string };

const STOP_WORDS = new Set(['about', 'after', 'again', 'also', 'could', 'from', 'have', 'just', 'more', 'need', 'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);

function terms(value: string) {
  return value.toLowerCase().match(/[a-z0-9']+/g)?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) || [];
}

export function searchCurtisBooks(query: string, limit = 5): CurtisSource[] {
  const queryTerms = terms(query);
  if (!queryTerms.length) return [];
  const querySet = new Set(queryTerms);

  return (books as CurtisSource[])
    .map((chunk) => {
      const chunkTerms = terms(chunk.text);
      const chunkSet = new Set(chunkTerms);
      let score = queryTerms.reduce((total, term) => total + (chunkSet.has(term) ? 1 : 0), 0);
      const phrase = query.toLowerCase().trim();
      if (phrase.length > 5 && chunk.text.toLowerCase().includes(phrase)) score += 4;
      score += queryTerms.filter((term) => chunk.text.toLowerCase().includes(term)).length * 0.15;
      return { chunk, score, overlap: queryTerms.filter((term) => querySet.has(term) && chunkSet.has(term)).length };
    })
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk }) => chunk);
}

export function formatKnowledgeContext(sources: CurtisSource[]) {
  if (!sources.length) return 'No directly relevant excerpt was found in the indexed Curtis material.';
  return sources.map((item, index) => `[Source ${index + 1}: ${item.source}]\n${item.text}`).join('\n\n');
}
