import { describe, expect, it } from 'vitest';
import { cutSnippet, findElement, parseXml } from '../src/sources/xml.js';

// A clause long enough that a section of several of them is over the 600 characters given whole.
const clause = (n: number) => `(${n}) this clause is here only to make the section long enough to be cut into a snippet`;

describe('cutSnippet (shared by BC and federal search)', () => {
  it('gives a short section whole, hit marks and all', () => {
    const body = '44 An employer must give an employee a **statutory holiday** off with pay if the employee has worked 15 of the 30 days.';
    expect(cutSnippet(body, () => 'unused')).toBe(body);
  });

  it('cuts a long section to the whole clause around the hit, and marks both cuts', () => {
    const body = [clause(1), clause(2), clause(3), 'the **employer** must pay the employee', clause(4), clause(5), clause(6), clause(7)].join('; ') + '.';
    expect(body.length).toBeGreaterThan(600);
    expect(cutSnippet(body, () => 'unused')).toBe('…the **employer** must pay the employee;…');
  });

  it('asks for a fallback when the body has no hit', () => {
    expect(cutSnippet('no marked words here', () => 'the heading')).toBe('the heading');
  });
});

describe('parseXml / findElement', () => {
  it('keeps mixed content in order and finds an element at any depth', () => {
    const doc = parseXml('<a><b>one <i>two</i> three</b><c><d x="1">four</d></c></a>');
    expect(findElement(doc, 'd')).toEqual({ name: 'd', attrs: { x: '1' }, children: ['four'] });
    expect(findElement(doc, 'b')?.children).toEqual(['one ', { name: 'i', attrs: {}, children: ['two'] }, ' three']);
  });
});
