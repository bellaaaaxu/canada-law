import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyDir } from '../src/copy-dir.js';

describe('copyDir', () => {
  let base = '';
  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('copies a nested folder whose path has Chinese characters (Windows users often have Chinese user names)', () => {
    base = mkdtempSync(join(tmpdir(), 'copydir-'));
    const src = join(base, '张三的电脑', 'canada-employment-law');
    mkdirSync(join(src, 'scripts'), { recursive: true });
    writeFileSync(join(src, 'SKILL.md'), 'skill');
    writeFileSync(join(src, 'scripts', 'bclaw.mjs'), 'script');

    const dst = join(base, '目标', '.claude', 'skills', 'canada-employment-law');
    copyDir(src, dst);

    expect(readFileSync(join(dst, 'SKILL.md'), 'utf8')).toBe('skill');
    expect(readFileSync(join(dst, 'scripts', 'bclaw.mjs'), 'utf8')).toBe('script');
  });

  it('overwrites files from an earlier copy', () => {
    base = mkdtempSync(join(tmpdir(), 'copydir-'));
    const src = join(base, 'src');
    mkdirSync(src);
    writeFileSync(join(src, 'a.txt'), 'new');
    const dst = join(base, 'dst');
    mkdirSync(dst);
    writeFileSync(join(dst, 'a.txt'), 'old');
    copyDir(src, dst);
    expect(readFileSync(join(dst, 'a.txt'), 'utf8')).toBe('new');
  });
});
