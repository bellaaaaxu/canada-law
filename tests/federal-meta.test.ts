import { describe, expect, it } from 'vitest';
import { isFederalId, normalizeFedId, parseFedPage, parseLegis } from '../src/sources/federal-meta.js';
import { ToolError } from '../src/tool-error.js';
import { fx } from './helpers.js';

describe('parseFedPage (the official page: the only source of the "current to" date)', () => {
  it('reads an act page: title, citation, current-to and last-amended dates', () => {
    expect(parseFedPage(fx('fed-page-L-2.head.html'))).toEqual({
      title: 'Canada Labour Code',
      citation: 'R.S.C., 1985, c. L-2',
      currentTo: '2026-09-03',
      lastAmended: '2025-12-12',
    });
  });

  it('reads a regulation page, which says "Regulations are current to"', () => {
    expect(parseFedPage(fx('fed-page-CRC-986.head.html'))).toEqual({
      title: 'Canada Labour Standards Regulations',
      citation: 'C.R.C., c. 986',
      currentTo: '2026-09-03',
      lastAmended: '2025-12-12',
    });
  });

  it('leaves lastAmended null when the page has no "last amended" date', () => {
    expect(parseFedPage(fx('fed-page-SI-97-5.head.html'))).toMatchObject({ citation: 'SI/97-5', currentTo: '2026-09-03', lastAmended: null });
  });

  it('keeps a citation that has parentheses of its own', () => {
    const html = "<h1 id='wb-cont' class='HeadTitle'>Customs Act&#x00A0;(<abbr title='Revised Statutes of Canada'>R.S.C.</abbr>, 1985, c. 1 (2nd Supp.))</h1>";
    expect(parseFedPage(html)).toMatchObject({ title: 'Customs Act', citation: 'R.S.C., 1985, c. 1 (2nd Supp.)' });
  });

  it('returns nulls, not guesses, for a page without those lines', () => {
    expect(parseFedPage('<html><title>Page not Found</title></html>')).toEqual({ title: null, citation: null, currentTo: null, lastAmended: null });
  });
});

describe('parseLegis (the official list of acts and regulations)', () => {
  const entries = parseLegis(fx('fed-legis-trimmed.xml'));
  const byId = (id: string) => entries.find((e) => e.id === id)!;

  it('keeps the English entries only', () => {
    expect(entries.map((e) => e.id).sort()).toEqual(['C-49', 'C.R.C.,_c._986', 'E-5.6', 'L-2', 'SOR-2021-200', 'SOR-86-304']);
    expect(entries.some((e) => e.title === 'Code canadien du travail')).toBe(false);
  });

  it('reads an act and the regulations made under it', () => {
    expect(byId('L-2')).toMatchObject({ kind: 'act', uniqueId: 'L-2', title: 'Canada Labour Code', officialNumber: 'L-2' });
    const regs = byId('L-2').regRefs.map((r) => entries.find((e) => e.ref === r)?.id);
    expect(regs).toEqual(['C.R.C.,_c._986', 'SOR-2021-200']);
  });

  it('takes a regulation id from its XML link, which is the id the website uses', () => {
    expect(byId('C.R.C.,_c._986')).toMatchObject({ kind: 'regulation', uniqueId: 'C.R.C., c. 986', title: 'Canada Labour Standards Regulations' });
  });
});

describe('normalizeFedId / isFederalId', () => {
  it('turns the ways people write an id into the one the website uses', () => {
    expect(normalizeFedId(' L-2 ')).toBe('L-2');
    expect(normalizeFedId('C.R.C., c. 986')).toBe('C.R.C.,_c._986');
    expect(normalizeFedId('C.R.C.,_c._986')).toBe('C.R.C.,_c._986');
    expect(normalizeFedId('SOR/86-304')).toBe('SOR-86-304');
    expect(normalizeFedId('sor/86-304')).toBe('SOR-86-304');
    expect(normalizeFedId('l-2')).toBe('L-2');
    expect(normalizeFedId('c.r.c., c. 986')).toBe('C.R.C.,_c._986');
    // 20 official ids end in a lower-case letter (the website does not mind the case, but act_id should match the list)
    expect(normalizeFedId('SOR-89-30a')).toBe('SOR-89-30a');
  });

  it('rejects anything that could leave the Justice Laws XML folder', () => {
    for (const bad of ['../x', 'L-2/..', 'a b', '', 'L-2?x=1', 'L-2#s']) {
      expect(() => normalizeFedId(bad), bad).toThrow(ToolError);
    }
  });

  it('tells a federal id from a BC one', () => {
    for (const id of ['L-2', 'SOR-86-304', 'C.R.C.,_c._986', 'C.R.C., c. 986', 'SOR/86-304']) expect(isFederalId(id), id).toBe(true);
    for (const id of ['96113_01', '02057_00_multi', '396_95']) expect(isFederalId(id), id).toBe(false);
  });
});
