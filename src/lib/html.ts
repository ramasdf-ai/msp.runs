// Feed descriptions (Google Calendar especially) often hold HTML: <br>, <a href>, <b>, lists,
// &nbsp;. Turn that into plain text with line breaks and bare URLs, so the event page can show it
// safely (Astro escapes text) and the .ics stays clean. Plain text passes through unchanged.

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', bull: '•', middot: '·', copy: '©',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

// Google Calendar rewrites links as https://www.google.com/url?q=<real>&sa=D...
function unwrapRedirect(href: string): string {
  try {
    const u = new URL(href);
    if (/(^|\.)google\.[a-z.]+$/.test(u.hostname) && u.pathname === '/url') return u.searchParams.get('q') ?? href;
  } catch { /* not a URL */ }
  return href;
}

const looksHtml = (s: string) => /<\/?[a-z][^>]*>|&(#x?[0-9a-f]+|[a-z]+);/i.test(s);

export function htmlToText(input: string): string {
  if (!looksHtml(input)) return input.trim();
  let s = input.replace(/\r\n?/g, '\n');
  // Newlines in HTML source are just whitespace; the tags carry the line breaks.
  if (/<(br|p|div|li)\b/i.test(s)) s = s.replace(/\n/g, ' ');
  s = s
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<a\b[^>]*?href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, d, s1, bare, inner) => {
      const href = unwrapRedirect(decodeEntities((d ?? s1 ?? bare ?? '').trim()));
      const text = decodeEntities(inner.replace(/<[^>]*>/g, '')).trim();
      if (!/^(https?:|mailto:)/i.test(href)) return text;
      const plainHref = href.replace(/^mailto:/i, '');
      if (!text || text === href || text === plainHref || /^(https?:\/\/|www\.)/i.test(text)) return plainHref;
      return `${text} (${plainHref})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|tr|blockquote)>/gi, '\n')
    .replace(/<(p|div|h[1-6]|ul|ol|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/<[a-z\/][^>]*$/i, ''); // a tag cut off by an earlier length limit
  return decodeEntities(s)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Cut long text at a word boundary rather than mid-word or mid-URL.
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('\n'));
  return (at > max * 0.5 ? cut.slice(0, at) : cut).trimEnd() + '…';
}

// Split text into plain and URL parts so a page can render the URLs as links.
export function linkParts(s: string): { text: string; href?: string }[] {
  const parts: { text: string; href?: string }[] = [];
  const re = /\b(https?:\/\/[^\s<>()"]+[^\s<>()".,;:!?'’”]|www\.[^\s<>()"]+[^\s<>()".,;:!?'’”]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/gi;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) parts.push({ text: s.slice(last, m.index) });
    const t = m[0];
    const href = t.includes('@') && !t.includes('/') ? `mailto:${t}` : /^www\./i.test(t) ? `https://${t}` : t;
    parts.push({ text: t, href });
    last = m.index! + t.length;
  }
  if (last < s.length) parts.push({ text: s.slice(last) });
  return parts;
}
