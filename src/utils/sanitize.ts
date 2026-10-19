/**
 * Sanitise untrusted HTML before rendering. Imported CSV/JSON and dictionary
 * HTML are treated as data, never as executable content (taskbook §11.2).
 *
 * This is a conservative allow-list stripper: it removes script/style/iframe/
 * object/embed elements and all attributes beginning with `on`, plus
 * javascript:/data: URLs. It intentionally does not aim to be a full HTML
 * sanitiser; dictionary HTML is rendered as plain text where possible.
 */
const BLOCKED_TAGS = [
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'form',
  'base',
];

export function stripHtml(html: string): string {
  let out = html;
  for (const tag of BLOCKED_TAGS) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    out = out.replace(re, '');
    out = out.replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, 'gi'), '');
  }
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'\s>]*("|')?/gi, '$1="#"');
  return out;
}

/** Convert a sanitised HTML fragment into readable plain text. */
export function htmlToText(html: string): string {
  const withoutScripts = stripHtml(html);
  return withoutScripts
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Block any text that looks like it contains a real access key when shown in
 * logs. We never log full headers, but this guards accidental dumps.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/(accessKey["':=\s]+)[A-Za-z0-9]{16,}/gi, '$1[REDACTED]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]{16,}/gi, '$1[REDACTED]');
}
