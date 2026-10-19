import { describe, it, expect } from 'vitest';
import { normalizeCsvText, parseCsv } from '@/features/vocabulary/csv';
import { detectMapping, readField, splitTags } from '@/features/vocabulary/mapping';

describe('CSV parsing (§12.4.9)', () => {
  it('strips a UTF-8 BOM and normalises CRLF', () => {
    expect(normalizeCsvText('\uFEFFa,b\r\n1,2')).toBe('a,b\n1,2');
  });

  it('parses quoted fields containing commas', () => {
    const { rows, headers } = parseCsv('word,meanings\n"hello, world","a, b, c"\n');
    expect(headers).toEqual(['word', 'meanings']);
    expect(rows[0]?.word).toBe('hello, world');
    expect(rows[0]?.meanings).toBe('a, b, c');
  });

  it('parses quoted fields containing newlines', () => {
    const { rows } = parseCsv('word,notes\n"line","first\nsecond"\n');
    expect(rows[0]?.notes).toBe('first\nsecond');
  });

  it('handles BOM + quoted multiline together', () => {
    const { rows } = parseCsv('\uFEFFword,notes\r\n"x","a\r\nb"\r\n');
    expect(rows[0]?.word).toBe('x');
    expect(rows[0]?.notes).toBe('a\nb');
  });

  it('skips blank lines', () => {
    const { rows } = parseCsv('word\n\ncar\n\n');
    expect(rows).toHaveLength(1);
  });
});

describe('column mapping (§6.1)', () => {
  it('detects Chinese and English aliases', () => {
    const mapping = detectMapping(['单词', '音标', '释义', '标签', '备注']);
    expect(mapping.word).toBe('单词');
    expect(mapping.phonetic).toBe('音标');
    expect(mapping.meanings).toBe('释义');
    expect(mapping.tags).toBe('标签');
    expect(mapping.notes).toBe('备注');
  });

  it('falls back to the first column when no word column matches', () => {
    const mapping = detectMapping(['term_x', 'other']);
    expect(mapping.word).toBe('term_x');
  });

  it('reads and trims mapped fields', () => {
    const mapping = detectMapping(['Word', 'Translation']);
    expect(readField({ Word: '  car ', Translation: ' 汽车 ' }, mapping, 'word')).toBe('car');
    expect(readField({ Word: 'car' }, mapping, 'notes')).toBeUndefined();
  });

  it('splits tags on common separators', () => {
    expect(splitTags('cet4, toefl;gre')).toEqual(['cet4', 'toefl', 'gre']);
    expect(splitTags('商务 英语')).toEqual(['商务', '英语']);
  });
});
