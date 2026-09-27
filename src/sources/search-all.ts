// search_law "all" and the script's "search all": BC and federal searched in parallel and ranked by the same score.
import { BC_LAWS_NOTICE, FEDERAL_NOTICE } from '../notice.js';
import { ToolError } from '../tool-error.js';
import type { BcClient } from './bc.js';
import type { FederalClient } from './federal.js';

type Scored = Awaited<ReturnType<FederalClient['searchScored']>>;
const EMPTY: Scored = { output: { query: '', documents_searched: 0, results: [], warnings: [], notes: [], notice: '' }, scored: [] };

export async function searchAll(sources: { bc: BcClient; federal: FederalClient }, query: string, limit = 10) {
  // One side failing (BC Laws or Justice Laws down) still returns the other side, with a warning.
  const [bs, fs] = await Promise.allSettled([sources.bc.searchScored(query, limit), sources.federal.searchScored(query, limit)]);
  const failed = [bs, fs].filter((s): s is PromiseRejectedResult => s.status === 'rejected');
  if (failed.length === 2) throw failed[0].reason;
  for (const f of failed) if (!(f.reason instanceof ToolError)) throw f.reason;
  const b = bs.status === 'fulfilled' ? bs.value : EMPTY;
  const f = fs.status === 'fulfilled' ? fs.value : EMPTY;
  const lost = [
    ...(bs.status === 'rejected' ? [`BC search failed, so only federal results are shown: ${(bs.reason as Error).message}`] : []),
    ...(fs.status === 'rejected' ? [`Federal search failed, so only BC results are shown: ${(fs.reason as Error).message}`] : []),
  ];
  const results = [...b.scored, ...f.scored] // BC first among equal scores
    .map((s, order) => ({ ...s, order }))
    .sort((x, y) => y.score - x.score || x.order - y.order)
    .slice(0, limit)
    .map((s) => s.result);
  return {
    query,
    documents_searched: b.output.documents_searched + f.output.documents_searched,
    results,
    warnings: [...lost, ...b.output.warnings, ...f.output.warnings],
    notes: ['BC and federal results, ranked together by the same scoring.', ...new Set([...b.output.notes, ...f.output.notes])],
    notice: `${BC_LAWS_NOTICE}\n\n${FEDERAL_NOTICE}`,
  };
}
