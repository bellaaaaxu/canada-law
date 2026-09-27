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

  it('trims a defined term (s.206.7 has <DefinedTermEn>child </DefinedTermEn>)', () => {
    const s = parseXml('<Section><Label>206.7</Label><Text>In this section,</Text><Definition><Text><DefinedTermEn>child </DefinedTermEn> means a person who is under 18 years of age.</Text></Definition></Section>');
    expect(renderFedSection(s.children[0] as never)).toContain('\n  "child" means a person');
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
    // (The trimmed Code has no s.228, which the full Code has; it is put back so that the section exists.)
    const xml = fx('fed-L-2-trimmed.xml')
      .replace('</Body>', '<Section><Label>228</Label><Text>The Governor in Council may make regulations.</Text></Section></Body>')
      .replace(
        /<\/BillPiece><\/Schedule>(?![\s\S]*<\/BillPiece><\/Schedule>)/,
        '<RelatedOrNotInForce><Heading level="5" style="nifrp"><TitleText> — 2018, c. 27, s. 482</TitleText></Heading><Section type="amending"><Label>482</Label><Text>Section 228 of the Act is repealed.</Text></Section></RelatedOrNotInForce></BillPiece></Schedule>',
      );
    expect(notInForce(parseXml(xml)).find((a) => a.citation === '2018, c. 27, s. 482')?.sections).toEqual(['228']);
  });

  // Real drafting forms the first parser missed (code review, 2026-09-26), each read as the sections it would change.
  const withNif = (root: 'Statute' | 'Regulation', title: string, nums: string[], cite: string, amending: string) =>
    parseXml(
      `<?xml version="1.0"?><${root}><Identification>${root === 'Statute' ? `<ShortTitle>${title}</ShortTitle>` : `<LongTitle>${title}</LongTitle>`}</Identification><Body>` +
        nums.map((n) => `<Section><Label>${n}</Label><Text>text</Text></Section>`).join('') +
        `</Body><Schedule id="NifProvs"><ScheduleFormHeading type="amending"><TitleText>AMENDMENTS NOT IN FORCE</TitleText></ScheduleFormHeading><BillPiece><RelatedOrNotInForce><Heading level="5" style="nifrp"><TitleText> — ${cite}</TitleText></Heading>${amending}</RelatedOrNotInForce></BillPiece></Schedule></${root}>`,
    );
  const sectionsOf = (doc: ReturnType<typeof parseXml>) => notInForce(doc)[0].sections;

  it('reads a list of provisions an amendment would change (SOR/2026-10, s. 41, word for word)', () => {
    const s41 =
      '<Section type="amending"><Label>41</Label><Text>The Regulations are amended by replacing “safety and health committee” with “work place committee” in the following provisions:</Text><Paragraph type="amending"><Label>(a)</Label><Text>section 1.4;</Text></Paragraph><Paragraph type="amending"><Label>(b)</Label><Text>the portion of section 11.4 before paragraph (a);</Text></Paragraph><Paragraph type="amending"><Label>(c)</Label><Text>subsection 11.15(2);</Text></Paragraph><Paragraph type="amending"><Label>(d)</Label><Text>subsection 11.19(1) and the portion of subsection 11.19(3) before paragraph (a);</Text></Paragraph><Paragraph type="amending"><Label>(e)</Label><Text>the portion of section 11.20 before paragraph (a);</Text></Paragraph><Paragraph type="amending"><Label>(f)</Label><Text>the portion of subsection 11.27(3) before paragraph (a);</Text></Paragraph><Paragraph type="amending"><Label>(g)</Label><Text>paragraph 11.28.8(3)(b);</Text></Paragraph><Paragraph type="amending"><Label>(h)</Label><Text>paragraph 11.30(b);</Text></Paragraph><Paragraph type="amending"><Label>(i)</Label><Text>paragraph 11.35(2)(c);</Text></Paragraph><Paragraph type="amending"><Label>(j)</Label><Text>the portion of subsection 11.36(1) before paragraph (a) and subsection 11.36(2);</Text></Paragraph><Paragraph type="amending"><Label>(k)</Label><Text>paragraph 16.3(1)(c) and subsection 16.3(3); and</Text></Paragraph><Paragraph type="amending"><Label>(l)</Label><Text>the portion of subsection 16.4(1) before paragraph (a) and paragraph 16.4(2)(b).</Text></Paragraph></Section>';
    const named = ['1.4', '11.4', '11.15', '11.19', '11.20', '11.27', '11.28.8', '11.30', '11.35', '11.36', '16.3', '16.4'];
    const doc = withNif('Regulation', 'Oil and Gas Occupational Safety and Health Regulations', [...named, '11.5'], 'SOR/2026-10, s. 41', s41);
    expect(sectionsOf(doc)).toEqual(named);
  });

  it('reads "the portion of subsection 167(1) … before paragraph (a) is replaced"', () => {
    const doc = withNif('Statute', 'Canada Labour Code', ['167'], '2018, c. 27, s. 440', '<Section type="amending"><Label>440</Label><Text>The portion of subsection 167(1) of the Act before paragraph (a) is replaced by the following:</Text></Section>');
    expect(sectionsOf(doc)).toEqual(['167']);
  });

  it('reads a range of sections, as the act numbers them', () => {
    const doc = withNif('Statute', 'Canada Labour Code', ['209', '209.1', '209.2', '209.3', '209.4', '209.5'], '2024, c. 15, s. 1', '<Section type="amending"><Label>1</Label><Text>Sections 209 to 209.4 of the Act are replaced by the following:</Text></Section>');
    expect(sectionsOf(doc)).toEqual(['209', '209.1', '209.2', '209.3', '209.4']);
  });

  it('reads "is renumbered"', () => {
    const doc = withNif('Statute', 'Canada Labour Code', ['229.1'], '2024, c. 15, s. 2', '<Section type="amending"><Label>2</Label><Text>Section 229.1 of the Act is renumbered as subsection 229.1(1).</Text></Section>');
    expect(sectionsOf(doc)).toEqual(['229.1']);
  });

  it('does not count a provision of another act or regulation', () => {
    const other = withNif('Statute', 'Canada Labour Code', ['7'], '2024, c. 15, s. 3', '<Section type="amending"><Label>3</Label><Text>Subsection 7(1) of the Canada Labour Standards Regulations is replaced by the following:</Text></Section>');
    expect(sectionsOf(other)).toEqual([]);
    // in a regulation, "the Act" is the act it is made under
    const act = withNif('Regulation', 'Canada Labour Standards Regulations', ['11.1'], 'SOR/2026-75, s. 2', '<Section type="amending"><Label>2</Label><Text>Subsection 169.1(1) of the Act is modified as follows:</Text></Section>');
    expect(sectionsOf(act)).toEqual([]);
    expect(nif.find((a) => a.citation === '2018, c. 27, s. 312')?.sections).not.toEqual(expect.arrayContaining(['35']));
    expect(nif.find((a) => a.citation === '2018, c. 27, s. 312')?.sections).not.toEqual(expect.arrayContaining(['310']));
  });

  it('does not count the amending act’s own sections, however they are named (2018, c. 27, s. 518; 2020, c. 5, s. 45; 2024, c. 15, s. 364)', () => {
    const s518 = withNif(
      'Statute',
      'Canada Labour Code',
      ['182.1', '452'],
      '2018, c. 27, s. 518',
      '<Section><Label>518</Label><Text>If a collective agreement that is in effect on the day on which section 452 of this Act comes into force contains a provision that permits differences in rates of wages based on employment status and there is a conflict between that provision and section 182.1 of the <XRefExternal>Canada Labour Code</XRefExternal>, as enacted by that section 452, the provision of the collective agreement prevails to the extent of the conflict.</Text></Section>',
    );
    expect(sectionsOf(s518)).toEqual(['182.1']);
    const s45 = withNif(
      'Statute',
      'Canada Labour Code',
      ['43', '246.1'],
      '2020, c. 5, ss. 45(1), (3)',
      '<Section type="amending"><Label>45</Label><Subsection><Label>(3)</Label><Text>If subsection 43 (2) of this Act comes into force before section 493 of the other Act, then, on the day on which that section 493 comes into force, paragraph 246.1(1)(a) of the Canada Labour Code is replaced by the following:</Text></Subsection></Section>',
    );
    expect(sectionsOf(s45)).toEqual(['246.1']);
    const s364 = withNif(
      'Statute',
      'Canada Labour Code',
      ['206.1'],
      '2024, c. 15, s. 364',
      '<Section><Label>364</Label><Subsection><Label>(2)</Label><Text>An employee who, on the day on which section 357 comes into force, is on parental leave under section 206.1 of the Act may interrupt their parental leave.</Text></Subsection></Section>',
    );
    expect(sectionsOf(s364)).toEqual(['206.1']);
  });

  it('keeps an amendment that names no section (a heading, a transitional provision), with no sections', () => {
    const doc = withNif('Statute', 'Canada Labour Code', ['182'], '2018, c. 27, s. 451', '<Section type="amending"><Label>451</Label><Text>The heading of Division III of Part III of the Act is replaced by the following:</Text></Section>');
    expect(notInForce(doc)).toEqual([{ citation: '2018, c. 27, s. 451', sections: [] }]);
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
