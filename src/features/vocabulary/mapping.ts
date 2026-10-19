export type CsvFieldKey = 'word' | 'phonetic' | 'meanings' | 'tags' | 'notes' | 'source';

export type FieldMapping = Record<CsvFieldKey, string | null>;

/** Alias table used for automatic column detection (taskbook §6.1). */
export const FIELD_ALIASES: Record<CsvFieldKey, string[]> = {
  word: ['word', '单词', 'english', 'term', 'headword', '词汇', '词', '单词名称'],
  phonetic: ['phonetic', '音标', 'pronunciation', 'ipa', 'phonetics'],
  meanings: [
    'meanings',
    'meaning',
    'translation',
    '释义',
    '中文',
    '中文释义',
    'definition_cn',
    'user_meanings',
    'chinese',
  ],
  tags: ['tags', 'tag', '标签', '分类'],
  notes: ['notes', 'note', '备注', '笔记', 'comment'],
  source: ['source', '来源', '出处'],
};

const normalizeHeader = (h: string): string => h.trim().toLowerCase().replace(/[\s_-]+/g, '');

export function detectMapping(headers: string[]): FieldMapping {
  const normalized = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }));
  const mapping: FieldMapping = {
    word: null,
    phonetic: null,
    meanings: null,
    tags: null,
    notes: null,
    source: null,
  };

  (Object.keys(FIELD_ALIASES) as CsvFieldKey[]).forEach((key) => {
    const aliases = FIELD_ALIASES[key].map(normalizeHeader);
    const match = normalized.find((h) => aliases.includes(h.norm));
    if (match) mapping[key] = match.raw;
  });

  // Fallbacks: if no word column matched, use the first column.
  if (!mapping.word && headers[0]) mapping.word = headers[0];
  return mapping;
}

export function splitTags(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,\uFF0C;；|\s]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

export function readField(
  row: Record<string, string>,
  mapping: FieldMapping,
  key: CsvFieldKey,
): string | undefined {
  const column = mapping[key];
  if (!column) return undefined;
  const value = row[column];
  if (value === undefined || value === null) return undefined;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
