import { describe, expect, it } from 'vitest';
import { asciiJson } from '../src/ascii-json.js';
import { runCli } from '../src/cli.js';
import { loadGlossary } from '../src/glossary.js';
import { BC_LAWS_NOTICE, FEDERAL_NOTICE } from '../src/notice.js';
import { BcClient } from '../src/sources/bc.js';
import { FederalClient } from '../src/sources/federal.js';
import { DOC, FED, esaRoutes, fakeFetcher, fedRoutes, fx, NO_RESULTS, type Route } from './helpers.js';

const nonAscii = (s: string) => [...s].filter((c) => c.charCodeAt(0) > 0x7f);

describe('asciiJson', () => {
  it('escapes every non-ASCII character, and still parses back to the same value', () => {
    const value = { term: '法定假日', where: 'Part 4 — Hours', face: '😀' };
    const out = asciiJson(value);
    expect(nonAscii(out)).toEqual([]);
    expect(out).toContain('\\u6cd5\\u5b9a\\u5047\\u65e5');
    expect(JSON.parse(out)).toEqual(value);
  });
});

function cli(routes: Route[]) {
  const fetcher = fakeFetcher(routes);
  const deps = { bc: new BcClient({ fetcher }), federal: new FederalClient({ fetcher }), glossary: loadGlossary() };
  return { fetcher, run: (...argv: string[]) => runCli(argv, deps) };
}

const bcOvertimeSearch: Route[] = [
  [(u) => u.includes('/search/complete/fullsearch?'), fx('fullsearch-overtime.xml')],
  [(u) => u.startsWith(`${DOC}96113_01/xml/search/`), fx('insearch-96113_01-overtime.xml')],
  [(u) => u === `${DOC}96113_01`, fx('page-96113_01.head.html')],
];

describe('runCli', () => {
  it('term: prints the glossary entry as ASCII-only JSON', async () => {
    const r = await cli([]).run('term', '法定假日');
    expect(r.code).toBe(0);
    expect(nonAscii(r.stdout)).toEqual([]);
    expect(JSON.parse(r.stdout)[0]).toMatchObject({ term: '法定假日', en_terms: ['statutory holiday', 'statutory holidays'] });
  });

  it('search bc: quotes each phrase and joins them with OR', async () => {
    const { fetcher, run } = cli(bcOvertimeSearch);
    const r = await run('search', 'bc', 'meal break', 'meal breaks');
    expect(r.code).toBe(0);
    expect(decodeURIComponent(fetcher.calls[0])).toContain('q=("meal break" OR "meal breaks")');
    expect(JSON.parse(r.stdout).notice).toBe(BC_LAWS_NOTICE);
    expect(JSON.parse(r.stdout).notes.join(' ')).toMatch(/cut short/);
  });

  it('search federal: searches the Canada Labour Code and its regulations', async () => {
    const r = await cli(fedRoutes).run('search', 'federal', 'general holiday', 'general holidays');
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.results[0]).toMatchObject({ jurisdiction: 'federal', act_id: 'L-2', section: '166' });
    expect(body.notice).toBe(FEDERAL_NOTICE);
  });

  it('search all: BC and federal results together', async () => {
    const r = await cli([...bcOvertimeSearch, ...fedRoutes]).run('search', 'all', 'overtime');
    const body = JSON.parse(r.stdout);
    expect(new Set(body.results.map((x: { jurisdiction: string }) => x.jurisdiction))).toEqual(new Set(['bc', 'federal']));
  });

  it('section and toc: tell a federal act_id from a BC one', async () => {
    const { fetcher, run } = cli(fedRoutes);
    const s = await run('section', 'L-2', '169.1');
    expect(s.code).toBe(0);
    expect(nonAscii(s.stdout)).toEqual([]);
    expect(JSON.parse(s.stdout)).toMatchObject({ citation: { jurisdiction: 'federal', act_id: 'L-2', heading: 'Break' }, notice: FEDERAL_NOTICE });
    expect(fetcher.calls).toContain(`${FED}/eng/XML/L-2.xml`);
    const t = await run('toc', 'C.R.C.,_c._986');
    expect(JSON.parse(t.stdout).act).toMatchObject({ act_id: 'C.R.C.,_c._986', act_citation: 'C.R.C., c. 986' });
  });

  it('find federal: the official list', async () => {
    const r = await cli(fedRoutes).run('find', 'federal', 'Canada', 'Labour', 'Code');
    expect(JSON.parse(r.stdout)[0]).toMatchObject({ act_id: 'L-2', citation: 'R.S.C., 1985, c. L-2' });
  });

  it('section: prints the citation, the text and the licence notice', async () => {
    const r = await cli(esaRoutes).run('section', '96113_01', '40');
    expect(r.code).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body.citation).toMatchObject({ act_id: '96113_01', section: '40', current_to: '2026-09-15' });
    expect(body.text.startsWith('40 (1) An employer must pay')).toBe(true);
    expect(body.notice).toBe(BC_LAWS_NOTICE);
  });

  it('toc: prints the outline', async () => {
    const r = await cli(esaRoutes).run('toc', '96113_01');
    expect(JSON.parse(r.stdout).outline).toContain('Part 4 — Hours of Work and Overtime');
  });

  it('find bc: lists the act first', async () => {
    const r = await cli([
      [(u) => u.toLowerCase().includes('title:"employment standards act"'), fx('fullsearch-title-employment-standards.xml')],
      [(u) => u.includes('/xpath//act:act[@status]'), NO_RESULTS],
    ]).run('find', 'bc', 'Employment', 'Standards', 'Act');
    expect(JSON.parse(r.stdout)[0]).toMatchObject({ act_id: '96113_01', citation: 'RSBC 1996, c. 113' });
  });

  it('reports a missing section on stderr with exit code 1, and names the toc command', async () => {
    const r = await cli(esaRoutes).run('section', '96113_01', '999');
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/No section 999/);
    expect(r.stderr).toMatch(/\btoc\b/);
  });

  it('shows usage with exit code 2 for an unknown command, missing arguments or a missing jurisdiction', async () => {
    for (const argv of [['frobnicate'], ['section', '96113_01'], ['search'], ['search', 'bc'], ['search', 'overtime'], ['find', 'Employment Standards Act'], ['find', 'all', 'Labour'], []]) {
      const r = await cli([]).run(...argv);
      expect(r.code, argv.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/Usage/);
      expect(r.stderr).toContain('search <bc|federal|all>');
    }
  });

  it('prints usage with exit code 0 for --help', async () => {
    const r = await cli([]).run('--help');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Usage/);
  });
});
