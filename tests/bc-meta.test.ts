import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { classifyDoc, parseFullSearch, parsePageMeta, type SearchDoc } from '../src/sources/bc-meta.js';

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parsePageMeta (official HTML page)', () => {
  it('reads an act title, citation and current-to date', () => {
    expect(parsePageMeta(fx('page-96113_01.head.html'))).toEqual({
      title: 'Employment Standards Act',
      citation: 'RSBC 1996, c. 113',
      currentTo: '2026-09-15',
    });
  });

  it('reads a regulation current-to date, which differs from the acts', () => {
    expect(parsePageMeta(fx('page-396_95.head.html'))).toEqual({
      title: 'Employment Standards Regulation',
      citation: null,
      currentTo: '2026-09-22',
    });
  });

  it('reads the table-of-contents page of a multi-document act', () => {
    expect(parsePageMeta(fx('page-02057_00.head.html'))).toMatchObject({
      title: 'Business Corporations Act',
      citation: 'SBC 2002, c. 57',
      currentTo: '2026-09-15',
    });
  });

  it('returns null rather than guessing when the current-to line is missing', () => {
    expect(parsePageMeta('<html><div id="title"><h2>X Act</h2></div></html>').currentTo).toBeNull();
  });
});

describe('parseFullSearch', () => {
  it('reads total hits and documents in rank order', () => {
    const r = parseFullSearch(fx('fullsearch-overtime.xml'));
    expect(r.totalHits).toBe(15);
    expect(r.docs).toHaveLength(15);
    expect(r.docs[4]).toMatchObject({ id: '96113_01', title: 'Employment Standards Act' });
  });

  it('keeps the multi-document parent of a part', () => {
    const r = parseFullSearch(fx('fullsearch-title-business-corporations.xml'));
    expect(r.docs[0]).toMatchObject({ id: '02057_01', multiParent: 'Business Corporations Act' });
  });
});

describe('classifyDoc (by CIVIX_DOCUMENT_LOC)', () => {
  const docs = [
    ...parseFullSearch(fx('fullsearch-overtime.xml')).docs,
    ...parseFullSearch(fx('fullsearch-title-employment-standards.xml')).docs,
    ...parseFullSearch(fx('fullsearch-title-business-corporations.xml')).docs,
    ...parseFullSearch(fx('fullsearch-title-local-government-act.xml')).docs,
  ];
  const byId = (id: string) => classifyDoc(docs.find((d) => d.id === id)!);

  it('recognises a single-document act and its citation', () => {
    expect(byId('96113_01')).toEqual({
      kind: 'act',
      actId: '96113_01',
      docId: '96113_01',
      actTitle: 'Employment Standards Act',
      actCitation: 'RSBC 1996, c. 113',
    });
  });

  it('recognises a regulation and builds its B.C. Reg. citation', () => {
    expect(byId('396_95')).toEqual({
      kind: 'regulation',
      actId: '396_95',
      docId: '396_95',
      actTitle: 'Employment Standards Regulation',
      actCitation: 'B.C. Reg. 396/95',
    });
  });

  it('maps a part of a multi-document act to the whole act', () => {
    expect(byId('02057_05')).toEqual({
      kind: 'act',
      actId: '02057_00_multi',
      docId: '02057_05',
      actTitle: 'Business Corporations Act',
      actCitation: 'SBC 2002, c. 57',
    });
    expect(byId('r15001_03')).toMatchObject({ actId: 'r15001_00_multi', actCitation: 'RSBC 2015, c. 1' });
  });

  it('drops point-in-time versions, tables of legislative changes and historical tables', () => {
    for (const id of ['96113_pit', '418_95_pit', 'e4tlc96113', 'tlc96113', 'ht11300', '2082655341']) {
      expect(byId(id).kind, id).toBe('other');
    }
  });

  it('strips the ordering prefix from an act folder name', () => {
    const d: SearchDoc = {
      id: '96318_01',
      title: 'Part 1',
      loc: '-- M --/60_Motor Vehicle Act [RSBC 1996] c. 318/00_Act/01_96318_01.xml',
      multiParent: 'Motor Vehicle Act',
      frags: [],
    };
    expect(classifyDoc(d)).toMatchObject({ actTitle: 'Motor Vehicle Act', actCitation: 'RSBC 1996, c. 318', actId: '96318_00_multi' });
  });
});
