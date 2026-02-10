import { describe, expect, it } from 'vitest';
import { cleanTitle } from '../../services/extraction/title-cleaner.js';

describe('cleanTitle', () => {
  it('strips emojis', () => {
    expect(cleanTitle('🔥 Charizard ex 🔥').cleaned).toBe('charizard ex');
  });

  it('decodes HTML entities', () => {
    expect(cleanTitle('Charizard &amp; Friends').cleaned).toBe('charizard & friends');
  });

  it('decodes all HTML entity types', () => {
    expect(cleanTitle('A &lt;B&gt; &quot;C&#39;D&quot;').cleaned).toBe("a <b> \"c'd\"");
  });

  it('collapses multiple spaces', () => {
    expect(cleanTitle('   lots   of   spaces   ').cleaned).toBe('lots of spaces');
  });

  it('preserves original', () => {
    expect(cleanTitle('🔥 Charizard ex 🔥').original).toBe('🔥 Charizard ex 🔥');
  });

  it('lowercases the result', () => {
    expect(cleanTitle('CHARIZARD EX').cleaned).toBe('charizard ex');
  });

  it('handles combined transformations', () => {
    const result = cleanTitle('  🔥 CHARIZARD &amp; PIKACHU  🔥  ');
    expect(result.cleaned).toBe('charizard & pikachu');
    expect(result.original).toBe('  🔥 CHARIZARD &amp; PIKACHU  🔥  ');
  });
});
