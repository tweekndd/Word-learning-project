import Papa from 'papaparse';

export interface ParsedCsv {
  headers: string[];
  rows: Array<Record<string, string>>;
  errors: CsvParseError[];
}

export interface CsvParseError {
  row: number;
  type: string;
  message: string;
}

/** Remove a UTF-8 BOM if present and normalise CRLF. */
export function normalizeCsvText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/**
 * Parse a CSV string. Handles quoted fields, embedded commas, embedded
 * newlines and BOM (taskbook §6.1). Rows are returned as string maps keyed by
 * header; ragged rows are reported rather than silently dropped.
 */
export function parseCsv(text: string): ParsedCsv {
  const normalized = normalizeCsvText(text);
  const result = Papa.parse<Record<string, string>>(normalized, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = (result.meta.fields ?? []).filter((h) => h.length > 0);
  const errors: CsvParseError[] = result.errors.map((e) => ({
    row: typeof e.row === 'number' ? e.row + 1 : 0,
    type: e.type,
    message: e.message,
  }));

  return {
    headers,
    rows: result.data.filter((row) => Object.keys(row).length > 0),
    errors,
  };
}

export function rowsToCsv(headers: string[], rows: Array<Record<string, string>>): string {
  return Papa.unparse({ fields: headers, data: rows.map((r) => headers.map((h) => r[h] ?? '')) });
}
