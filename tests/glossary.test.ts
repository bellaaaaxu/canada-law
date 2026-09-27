import { describe, expect, it } from 'vitest';
import { loadGlossary, lookupTerm, parseWhere, termsInText, type Glossary } from '../src/glossary.js';

const g: Glossary = {
  加班: [{ jurisdiction: 'bc', en_terms: ['overtime'], acts: [{ act_id: '96113_01', where: 's.40; Part 4' }] }],
  加班费: [{ jurisdiction: 'bc', en_terms: ['overtime wages'], acts: [{ act_id: '96113_01', where: 's.1 definition; s.40' }] }],
  法定假日: [
    { jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'], acts: [{ act_id: '96113_01', where: 's.1 definition; Part 5' }] },
  ],
  'stat holiday': [
    { jurisdiction: 'bc', en_terms: ['statutory holiday', 'statutory holidays'], acts: [{ act_id: '96113_01', where: 's.1 definition; Part 5' }] },
  ],
  'pay stub': [{ jurisdiction: 'bc', en_terms: ['wage statement', 'wage statements'], acts: [{ act_id: '96113_01', where: 's.27' }] }],
};

describe('lookupTerm', () => {
  it('finds a Chinese term exactly', () => {
    expect(lookupTerm(g, ' 法定假日 ')).toEqual([
      {
        term: '法定假日',
        match: 'exact',
        jurisdiction: 'bc',
        en_terms: ['statutory holiday', 'statutory holidays'],
        acts: [{ act_id: '96113_01', where: 's.1 definition; Part 5' }],
      },
    ]);
  });

  it('finds an everyday English term exactly, ignoring case', () => {
    expect(lookupTerm(g, 'Stat Holiday').map((m) => [m.term, m.match])).toEqual([['stat holiday', 'exact']]);
  });

  it('finds entries from one of their statutory English terms, ignoring case', () => {
    expect(lookupTerm(g, 'Statutory Holidays').map((m) => [m.term, m.match])).toEqual([
      ['法定假日', 'english'],
      ['stat holiday', 'english'],
    ]);
  });

  it('finds the most specific term inside a longer phrase or question', () => {
    expect(lookupTerm(g, 'BC 一天工作超过几小时要付加班费？').map((m) => [m.term, m.match])).toEqual([['加班费', 'contained']]);
  });

  it('returns an empty array instead of guessing', () => {
    expect(lookupTerm(g, '育儿假')).toEqual([]);
    expect(lookupTerm(g, 'parental leave')).toEqual([]);
  });
});

describe('termsInText', () => {
  it('lists the glossary terms in a question in order of appearance, dropping terms swallowed by a longer one', () => {
    expect(termsInText(g, '加班费和法定假日')).toEqual(['加班费', '法定假日']);
  });

  it('matches English terms regardless of case, including plurals', () => {
    expect(termsInText(g, 'What are the Stat Holidays in BC?')).toEqual(['stat holiday']);
  });

  it('does not match an English term that starts in the middle of a word', () => {
    expect(termsInText(g, 'I will repay stubbornly')).toEqual([]);
  });
});

describe('data/glossary.json', () => {
  it('loads, and every entry names a section, Part or Division that verify-glossary can check', () => {
    const real = loadGlossary();
    const entries = Object.values(real).flat();
    expect(entries.length).toBeGreaterThanOrEqual(30);
    for (const e of entries) {
      for (const a of e.acts) {
        const w = parseWhere(a.where);
        expect(w.sections.length + w.parts.length + w.divisions.length, `${a.act_id} "${a.where}"`).toBeGreaterThan(0);
      }
    }
  });

  it('holds the golden-test terms in both languages', () => {
    const real = loadGlossary();
    expect(termsInText(real, 'BC 一天工作超过几小时要付加班费？')).toEqual(['加班费']);
    expect(termsInText(real, 'BC 员工连续工作多久必须给餐休？')).toEqual(['餐休']);
    expect(termsInText(real, 'BC 的法定假日有哪些？')).toEqual(['法定假日']);
    expect(termsInText(real, 'In BC, after how many hours of work in a day does overtime pay start?')).toEqual(['overtime pay']);
    expect(termsInText(real, 'How long can I work in BC before my employer has to give me a lunch break?')).toEqual(['lunch break']);
    expect(termsInText(real, 'What are the stat holidays in BC?')).toEqual(['stat holiday']);
  });

  it('holds the federal golden-test terms, each with a federal entry', () => {
    const real = loadGlossary();
    const cases: [string, string[]][] = [
      ['在联邦监管行业工作，超过多少小时要付加班费？', ['联邦监管行业', '加班费']],
      ['在联邦监管行业（比如银行）上班，连续工作多久必须给餐休？', ['联邦监管行业', '餐休']],
      ['联邦监管行业的法定假日有哪些？', ['联邦监管行业', '法定假日']],
      ['I work for a bank in BC. After how many hours of work does overtime pay start?', ['overtime pay']],
      ['I work for an airline in BC. How long can I work before my employer has to give me a lunch break?', ['lunch break']],
      ['What are the stat holidays for federally regulated employees?', ['stat holiday', 'federally regulated']],
    ];
    for (const [q, words] of cases) {
      expect(termsInText(real, q), q).toEqual(words);
      for (const w of words) expect(real[w].some((e) => e.jurisdiction === 'federal'), w).toBe(true);
    }
  });

  it('maps a concept to the statutory words of each jurisdiction, which differ', () => {
    const real = loadGlossary();
    const terms = (word: string, j: string) => lookupTerm(real, word).filter((m) => m.jurisdiction === j).flatMap((m) => m.en_terms);
    expect(terms('法定假日', 'bc')).toContain('statutory holiday');
    expect(terms('法定假日', 'federal')).toContain('general holiday');
    expect(terms('病假', 'federal')).toContain('medical leave');
    expect(terms('遣散费', 'federal')).toContain('severance pay');
  });

  it('maps the everyday English words that D1 showed to find nothing or the wrong law', () => {
    const real = loadGlossary();
    const enTerms = (word: string) => lookupTerm(real, word).flatMap((m) => m.en_terms);
    expect(enTerms('severance')).toContain('compensation for length of service');
    expect(enTerms('sick leave')).toContain('illness or injury leave');
    expect(enTerms('lunch break')).toContain('meal break');
    expect(enTerms('stat holiday')).toContain('statutory holiday');
  });
});

describe('parseWhere', () => {
  it('pulls section numbers and Part numbers out of a "where" note', () => {
    expect(parseWhere('s.1 definition; s.16.1; s.40; Part 4')).toEqual({ sections: ['1', '16.1', '40'], parts: ['4'], divisions: [] });
  });

  it('reads the Roman numerals of federal Parts and Divisions', () => {
    expect(parseWhere('s.166 definition; s.192; Part III; Division XI')).toEqual({ sections: ['166', '192'], parts: ['III'], divisions: ['XI'] });
    expect(parseWhere('Division XIII.1')).toEqual({ sections: [], parts: [], divisions: ['XIII.1'] });
  });

  it('returns empty lists when the note names no section, Part or Division', () => {
    expect(parseWhere('see the regulations')).toEqual({ sections: [], parts: [], divisions: [] });
  });
});
