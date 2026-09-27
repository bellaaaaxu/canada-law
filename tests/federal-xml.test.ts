import { describe, expect, it } from 'vitest';
import {
  bodySections,
  fedDocInfo,
  fedToc,
  findFedSections,
  hasNotInForcePart,
  notInForce,
  renderFedSection,
  sectionRecords,
} from '../src/sources/federal-xml.js';
import { parseXml } from '../src/sources/xml.js';
import { fx } from './helpers.js';

const clc = parseXml(fx('fed-L-2-trimmed.xml'));
const clsr = parseXml(fx('fed-CRC-986-trimmed.xml'));
const hours = parseXml(fx('fed-SOR-2021-200-trimmed.xml'));
const crops = parseXml(fx('fed-C-49.xml'));
const sections = bodySections(clc);
const one = (num: string) => findFedSections(sections, num)[0];
const render = (num: string) => renderFedSection(one(num).node);

describe('fedDocInfo', () => {
  it('reads an act', () => {
    expect(fedDocInfo(clc)).toEqual({ kind: 'act', title: 'Canada Labour Code', instrumentNumber: null, lastAmended: '2025-12-12', allRepealed: false, readerNote: null });
  });

  it('reads a regulation and its number', () => {
    expect(fedDocInfo(clsr)).toMatchObject({ kind: 'regulation', title: 'Canada Labour Standards Regulations', instrumentNumber: 'C.R.C., c. 986', lastAmended: '2025-12-12' });
  });

  it('sees that an act whose every section is "[Repealed…]" is repealed (its root still says in-force="yes")', () => {
    expect(fedDocInfo(crops)).toMatchObject({ title: 'Advance Payments for Crops Act', allRepealed: true });
  });

  it('reads the official reader note of an act', () => {
    const noted = parseXml(fx('fed-L-2-trimmed.xml').replace('</Identification>', '<ReaderNote><Note status="editorial">[Sections 1 to 5 in force June 1, 2027.]</Note></ReaderNote></Identification>'));
    expect(fedDocInfo(noted).readerNote).toBe('[Sections 1 to 5 in force June 1, 2027.]');
  });
});

describe('bodySections', () => {
  it('leaves out related provisions and amendments not in force, whose numbers belong to other acts', () => {
    const nums = sections.map((s) => s.num);
    for (const n of ['2178', '438', '350', '154.1', '312', '177.2']) expect(nums, n).not.toContain(n);
    expect(nums).toContain('169.1');
  });

  it('records the Part, Division and heading above each section', () => {
    expect(one('192').location).toEqual(['PART III — Standard Hours, Wages, Vacations and Holidays', 'DIVISION V — General Holidays']);
    expect(one('206.1').location.at(-1)).toBe('Parental Leave');
    expect(one('235').nearestHeading).toBe('DIVISION XI — Severance Pay');
    expect(one('169.1').heading).toBe('Break');
  });

  it('does not treat a quoted section inside a regulation as one of its own', () => {
    const regSections = bodySections(hours).map((s) => s.num);
    expect(regSections).toEqual(['1', '2', '3', '4']);
  });
});

describe('findFedSections', () => {
  it('finds a section by its exact number', () => {
    expect(findFedSections(sections, '166').map((s) => s.num)).toEqual(['166']);
  });

  it('finds a number inside a range of repealed sections', () => {
    expect(findFedSections(sections, '164')).toMatchObject([{ num: '163 to 165', range: true, repealed: true }]);
  });

  it('finds nothing for a number the act does not have in force', () => {
    expect(findFedSections(sections, '438')).toEqual([]);
    expect(findFedSections(sections, '177.2')).toEqual([]);
  });
});

describe('renderFedSection', () => {
  it('lays out subsections and paragraphs the way the official page does', () => {
    const t = render('169.1');
    expect(t.startsWith('169.1 (1) Every employee is entitled to and shall be granted an unpaid break of at least 30 minutes during every period of five consecutive hours of work.')).toBe(true);
    expect(t).toContain('\n(2) An employer may postpone or cancel the break');
    expect(t).toContain('\n  (a) threat to the life, health or safety of any person;');
  });

  it('leaves out marginal notes and amendment history, which are not part of the law', () => {
    expect(render('169.1')).not.toContain('Exception');
    expect(render('192')).not.toContain('R.S., c. L-1, s. 48');
  });

  it('puts each definition on its own line, the defined term in quotes', () => {
    const t = render('166');
    expect(t.startsWith('166 In this Part,')).toBe(true);
    expect(t).toMatch(/\n {2}"general holiday" means New Year’s Day, Good Friday, Victoria Day, Canada Day, Labour Day, National Day for Truth and Reconciliation, which is observed on September 30, .*\(jours fériés\)\n/);
    expect(t).toContain('\n  "inspector" [Repealed, 2018, c. 27, s. 569]');
  });

  it('shows a repealed section as the official page does', () => {
    expect(render('247.1')).toBe('247.1 [Repealed, 2018, c. 22, s. 16]');
  });

  it('keeps a provision that a regulation quotes, under the words that quote it', () => {
    const s4 = findFedSections(bodySections(hours), '4')[0];
    expect(renderFedSection(s4.node)).toContain('subsection 169.1(1) of the Act is modified as follows:\n  169.1 (1) Every employee is entitled to and shall be granted an unpaid break');
  });

  it('can mark search hits', () => {
    expect(renderFedSection(one('169.1').node, { mark: /\bbreak\b/gi })).toContain('unpaid **break** of at least 30 minutes');
  });

  it('flags a part that is not in force (in-force="no")', () => {
    const xml = fx('fed-L-2-trimmed.xml').replace(/(<Label>169\.1<\/Label>[\s\S]*?)<Subsection([^>]*)>(<MarginalNote[^>]*>Exception)/, '$1<Subsection$2 in-force="no">$3');
    const s = findFedSections(bodySections(parseXml(xml)), '169.1')[0];
    expect(hasNotInForcePart(s.node)).toBe(true);
    expect(renderFedSection(s.node)).toContain('\n[Not in force] (2) An employer may postpone or cancel the break');
    expect(hasNotInForcePart(one('169.1').node)).toBe(false);
  });
});

describe('notInForce', () => {
  const nif = notInForce(clc);

  it('lists each amendment not in force with the sections it adds or changes', () => {
    expect(nif.find((a) => a.citation === '2017, c. 20, s. 350')?.sections).toEqual(['154.1']);
    expect(nif.find((a) => a.citation === '2018, c. 27, s. 312')?.sections).toContain('206.1');
    expect(nif.some((a) => a.sections.includes('177.2'))).toBe(true);
  });

  it('does not count a section that an amendment only adds something after', () => {
    expect(nif.find((a) => a.citation === '2017, c. 20, s. 350')?.sections).not.toContain('154');
  });

  it('reads "Section 228 of the Act is repealed." right after the amending section’s own number', () => {
    // As in the full Code (2018, c. 27, s. 482): <Label>482</Label><Text>Section 228 …</Text>, no space in between.
    const xml = fx('fed-L-2-trimmed.xml').replace(
      /<\/BillPiece><\/Schedule>(?![\s\S]*<\/BillPiece><\/Schedule>)/,
      '<RelatedOrNotInForce><Heading level="5" style="nifrp"><TitleText> — 2018, c. 27, s. 482</TitleText></Heading><Section type="amending"><Label>482</Label><Text>Section 228 of the Act is repealed.</Text></Section></RelatedOrNotInForce></BillPiece></Schedule>',
    );
    expect(notInForce(parseXml(xml)).find((a) => a.citation === '2018, c. 27, s. 482')?.sections).toEqual(['228']);
  });

  it('reads the amendments not in force of a regulation too', () => {
    expect(notInForce(clsr).some((a) => a.citation === 'SOR/2026-75, s. 1' && a.sections.includes('11.2'))).toBe(true);
  });
});

describe('fedToc', () => {
  const toc = fedToc(clc);

  it('lists Parts, Divisions and sections, indented', () => {
    expect(toc).toContain('PART III — Standard Hours, Wages, Vacations and Holidays\n  Interpretation\n    166  Definitions');
    expect(toc).toContain('  DIVISION V — General Holidays\n    191  Definitions\n    192  Entitlement to holidays');
    expect(toc).toContain('163 to 165  Repealed');
  });

  it('leaves out amendments not in force', () => {
    expect(toc).not.toContain('177.2');
  });

  it('lists a regulation’s schedules after its sections', () => {
    expect(fedToc(clsr)).toMatch(/\nSCHEDULE V/);
    expect(fedToc(clsr)).not.toMatch(/AMENDMENTS NOT IN FORCE/);
  });
});

describe('sectionRecords (what search reads)', () => {
  const records = sectionRecords(clc);
  const rec = (num: string) => records.find((r) => r.num === num)!;

  it('knows the terms a section defines', () => {
    expect(rec('166').definedTerms).toEqual(expect.arrayContaining(['general holiday', 'overtime']));
  });

  it('keeps the heading above a section, which can hold the only mention of a term', () => {
    expect(rec('235').text).not.toMatch(/severance pay/i);
    expect(rec('235').nearestHeading).toBe('DIVISION XI — Severance Pay');
  });

  it('keeps the marginal notes of subsections for matching', () => {
    expect(rec('230').notes).toContain('Notice period');
  });

  it('skips repealed sections and ranges', () => {
    expect(records.some((r) => r.num === '247.1' || r.num === '163 to 165')).toBe(false);
  });
});
