const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{FE00}-\u{FEFF}\u{1FA00}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&#39;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
};

const HTML_ENTITY_REGEX = /&amp;|&#39;|&lt;|&gt;|&quot;/g;

export function cleanTitle(raw: string): { cleaned: string; original: string } {
  const original = raw;

  let cleaned = raw.replace(EMOJI_REGEX, '');
  cleaned = cleaned.replace(HTML_ENTITY_REGEX, (match) => HTML_ENTITIES[match]!);
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.trim();
  cleaned = cleaned.toLowerCase();

  return { cleaned, original };
}
