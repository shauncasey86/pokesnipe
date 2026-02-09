// src/__tests__/title-parser.test.ts
import { TitleParser } from '../services/parser/title-parser.js';

describe('TitleParser', () => {
  const parser = new TitleParser();

  describe('Card Number Extraction', () => {
    it('should extract standard card numbers (e.g., 4/102)', () => {
      const result = parser.parse('Charizard 4/102 Base Set Holo');
      expect(result.cardNumber).toBe('4');
      expect(result.printedNumber).toBe('4/102');
    });

    it('should extract hash format card numbers (#073)', () => {
      const result = parser.parse('Pikachu #073 Pokemon 151');
      expect(result.cardNumber).toBe('073');
    });

    it('should extract promo codes (SVP052)', () => {
      const result = parser.parse('Charizard SVP052 Promo');
      expect(result.cardNumber).toBe('052');
      expect(result.printedNumber).toBe('SVP052');
      expect(result.setName).toBe('SV Black Star Promos');
    });

    it('should extract SWSH promo codes', () => {
      const result = parser.parse('Pikachu SWSH039 Black Star Promo');
      expect(result.cardNumber).toBe('039');
      expect(result.setName).toBe('SWSH Black Star Promos');
    });

    it('should extract secret rare numbers (201/185)', () => {
      const result = parser.parse('Umbreon VMAX 201/185 Evolving Skies Secret');
      expect(result.cardNumber).toBe('201');
    });
  });

  describe('Grading Detection', () => {
    it('should detect PSA graded cards', () => {
      const result = parser.parse('Charizard Base Set 4/102 PSA 10');
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('PSA');
      expect(result.grade).toBe('10');
    });

    it('should detect CGC graded cards', () => {
      const result = parser.parse('Pikachu CGC 9.5 Pokemon 151');
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('CGC');
      expect(result.grade).toBe('9.5');
    });

    it('should detect BGS graded cards with modifier', () => {
      const result = parser.parse('Charizard BGS 10 Black Label 4/102');
      expect(result.isGraded).toBe(true);
      expect(result.gradingCompany).toBe('BGS');
      expect(result.grade).toBe('10');
      expect(result.gradeModifier).toBe('BLACK LABEL');
    });

    it('should not set condition for graded cards', () => {
      const result = parser.parse('Charizard PSA 10 NM Base Set');
      expect(result.isGraded).toBe(true);
      expect(result.condition).toBeNull();
    });
  });

  describe('Variant Detection', () => {
    it('should detect holo cards', () => {
      const result = parser.parse('Charizard Holo Base Set 4/102');
      expect(result.variant.isHolo).toBe(true);
    });

    it('should detect reverse holo cards', () => {
      const result = parser.parse('Pikachu Reverse Holo 25/185');
      expect(result.variant.isReverseHolo).toBe(true);
    });

    it('should detect full art cards', () => {
      const result = parser.parse('Charizard Full Art 185/185');
      expect(result.variant.isFullArt).toBe(true);
    });

    it('should detect alt art cards', () => {
      const result = parser.parse('Umbreon Alt Art Evolving Skies');
      expect(result.variant.isAltArt).toBe(true);
    });

    it('should detect rainbow rare cards', () => {
      const result = parser.parse('Charizard VMAX Rainbow Rare');
      expect(result.variant.isRainbow).toBe(true);
    });

    it('should detect secret rare cards', () => {
      const result = parser.parse('Gold Rare Charizard Secret Rare');
      expect(result.variant.isSecret).toBe(true);
    });

    it('should detect multiple variants', () => {
      const result = parser.parse('Charizard Full Art Alt Art Promo');
      expect(result.variant.isFullArt).toBe(true);
      expect(result.variant.isAltArt).toBe(true);
      expect(result.variant.isPromo).toBe(true);
    });
  });

  describe('Language Detection', () => {
    it('should default to English', () => {
      const result = parser.parse('Charizard 4/102 Base Set');
      expect(result.language).toBe('English');
      expect(result.languageCode).toBe('EN');
    });

    it('should detect Japanese cards', () => {
      const result = parser.parse('Charizard Japanese Holo');
      expect(result.language).toBe('Japanese');
      expect(result.languageCode).toBe('JA');
    });

    it('should detect Korean cards', () => {
      const result = parser.parse('Pikachu Korean Promo');
      expect(result.language).toBe('Korean');
      expect(result.languageCode).toBe('KR');
    });

    it('should detect Chinese cards', () => {
      const result = parser.parse('Charizard Chinese TCG');
      expect(result.language).toBe('Chinese');
      expect(result.languageCode).toBe('CH');
    });
  });

  describe('Edition Detection', () => {
    it('should detect 1st Edition cards', () => {
      const result = parser.parse('Charizard 1st Edition Base Set');
      expect(result.isFirstEdition).toBe(true);
    });

    it('should detect shadowless cards', () => {
      const result = parser.parse('Charizard Shadowless Base Set');
      expect(result.isShadowless).toBe(true);
    });

    it('should detect both 1st edition and shadowless', () => {
      const result = parser.parse('Charizard 1st Edition Shadowless');
      expect(result.isFirstEdition).toBe(true);
      expect(result.isShadowless).toBe(true);
    });
  });

  describe('Card Type Detection', () => {
    it('should detect EX cards', () => {
      const result = parser.parse('Charizard EX 185/182');
      expect(result.cardType).toBe('EX');
    });

    it('should detect GX cards', () => {
      const result = parser.parse('Charizard GX 150/147');
      expect(result.cardType).toBe('GX');
    });

    it('should detect VMAX cards', () => {
      const result = parser.parse('Charizard VMAX 201/185');
      expect(result.cardType).toBe('VMAX');
    });

    it('should detect VSTAR cards', () => {
      const result = parser.parse('Arceus VSTAR 176/172');
      expect(result.cardType).toBe('VSTAR');
    });

    it('should detect V cards', () => {
      const result = parser.parse('Umbreon V 189/203');
      expect(result.cardType).toBe('V');
    });
  });

  describe('Set Detection', () => {
    it('should detect Base Set', () => {
      const result = parser.parse('Charizard Base Set 4/102');
      expect(result.setName).toBe('Base Set');
    });

    it('should detect Evolving Skies', () => {
      const result = parser.parse('Umbreon VMAX Evolving Skies');
      expect(result.setName).toBe('Evolving Skies');
    });

    it('should detect Pokemon 151', () => {
      const result = parser.parse('Charizard ex 151 Full Art');
      expect(result.setName).toBe('151');
    });

    it('should detect Japanese set codes', () => {
      const result = parser.parse('Pikachu SV6a Night Wanderer');
      expect(result.setName).toBe('Night Wanderer');
    });
  });

  describe('Condition Detection', () => {
    it('should detect NM condition', () => {
      const result = parser.parse('Charizard Base Set NM');
      expect(result.condition).toBe('NM');
    });

    it('should detect LP condition', () => {
      const result = parser.parse('Pikachu LP 25/102');
      expect(result.condition).toBe('LP');
    });

    it('should detect MP condition', () => {
      const result = parser.parse('Blastoise MP Base Set');
      expect(result.condition).toBe('MP');
    });
  });

  describe('Pokemon Name Detection', () => {
    it('should detect Charizard', () => {
      const result = parser.parse('Charizard 4/102 Base Set');
      expect(result.cardName).toBe('Charizard');
    });

    it('should detect Pikachu', () => {
      const result = parser.parse('Pikachu Holo 25/102');
      expect(result.cardName).toBe('Pikachu');
    });

    it('should detect Umbreon VMAX (with card type suffix)', () => {
      const result = parser.parse('Umbreon VMAX Alt Art');
      expect(result.cardName).toBe('Umbreon VMAX');
      expect(result.cardType).toBe('VMAX');
    });

    it('should detect trainer cards', () => {
      const result = parser.parse("Professor's Research Full Art");
      expect(result.cardName).toContain('Professor');
    });
  });

  describe('Junk Detection', () => {
    it('should flag bulk lots', () => {
      const result = parser.parse('Pokemon Card Lot 100 Cards Mixed');
      expect(result.confidence).toBe('LOW');
      expect(result.confidenceScore).toBe(0);
    });

    it('should flag binder collections', () => {
      const result = parser.parse('Pokemon Binder Collection 500 Cards');
      expect(result.confidence).toBe('LOW');
    });

    it('should flag mystery packs', () => {
      const result = parser.parse('Mystery Pack Pokemon Cards Random');
      expect(result.confidence).toBe('LOW');
    });

    it('should flag custom/fake cards', () => {
      const result = parser.parse('Custom Charizard Card Proxy');
      expect(result.confidence).toBe('LOW');
    });

    it('should flag CU$TOM cards (dollar sign variant)', () => {
      const result = parser.parse('CU$TOM Charizard Holo Card');
      expect(result.confidence).toBe('LOW');
    });

    it('should flag INSPIRED cards', () => {
      const result = parser.parse('Pokemon Inspired Charizard Fan Art');
      expect(result.confidence).toBe('LOW');
    });

    it('should NOT flag graded cards with lot in title', () => {
      const result = parser.parse('Charizard PSA 10 4/102 Lot');
      // Should still have reasonable confidence due to grading and number
      expect(result.isGraded).toBe(true);
      expect(result.confidenceScore).toBeGreaterThan(0);
    });
  });

  describe('WOTC Era Standalone Card Numbers', () => {
    it('should detect standalone numbers after Team Rocket set name', () => {
      const result = parser.parse('Pokémon TCG Dark Hypno Team Rocket 9 Holo Unlimited');
      expect(result.cardNumber).toBe('9');
      expect(result.setName).toBe('Team Rocket');
    });

    it('should detect standalone numbers after Base Set', () => {
      const result = parser.parse('Charizard Base Set 4 Holo Rare');
      expect(result.cardNumber).toBe('4');
      expect(result.setName).toBe('Base Set');
    });

    it('should detect standalone numbers after Jungle', () => {
      const result = parser.parse('Jolteon Jungle 4 Holo Rare');
      expect(result.cardNumber).toBe('4');
      expect(result.setName).toBe('Jungle');
    });

    it('should detect standalone numbers after Fossil', () => {
      const result = parser.parse('Gengar Fossil 5 Holo');
      expect(result.cardNumber).toBe('5');
      expect(result.setName).toBe('Fossil');
    });

    it('should detect standalone numbers after Neo Genesis', () => {
      const result = parser.parse('Lugia Neo Genesis 9 Holo');
      expect(result.cardNumber).toBe('9');
      expect(result.setName).toBe('Neo Genesis');
    });

    it('should not match standalone numbers for non-WOTC sets', () => {
      // Numbers at end without WOTC set should not be extracted
      const result = parser.parse('Charizard VMAX 2021 Ultra Rare');
      expect(result.cardNumber).toBeNull();
    });
  });

  describe('Dark/Light Pokemon Names', () => {
    it('should detect Dark Hypno', () => {
      const result = parser.parse('Dark Hypno Team Rocket 9 Holo');
      expect(result.cardName).toBe('Dark Hypno');
    });

    it('should detect Dark Charizard', () => {
      const result = parser.parse('Dark Charizard Team Rocket 4 Holo');
      expect(result.cardName).toBe('Dark Charizard');
    });

    it('should detect Dark Blastoise', () => {
      const result = parser.parse('Dark Blastoise Team Rocket 3 Holo');
      expect(result.cardName).toBe('Dark Blastoise');
    });

    it('should detect Light Arcanine', () => {
      const result = parser.parse('Light Arcanine Neo Destiny 12 Holo');
      expect(result.cardName).toBe('Light Arcanine');
    });

    it('should detect Light Dragonite', () => {
      const result = parser.parse('Light Dragonite Neo Destiny 14 Holo');
      expect(result.cardName).toBe('Light Dragonite');
    });

    it('should detect Light Togetic', () => {
      const result = parser.parse('Light Togetic Neo Destiny 15 Holo');
      expect(result.cardName).toBe('Light Togetic');
    });
  });

  describe("Giovanni's Pokemon Names", () => {
    it("should detect Giovanni's Gyarados", () => {
      const result = parser.parse("Giovanni's Gyarados Gym Challenge Holo");
      expect(result.cardName).toBe("Giovanni's Gyarados");
    });

    it("should detect Giovanni's Machamp", () => {
      const result = parser.parse("Giovanni's Machamp Gym Challenge 6 Holo");
      expect(result.cardName).toBe("Giovanni's Machamp");
    });

    it("should detect Giovanni's Persian", () => {
      const result = parser.parse("Giovanni's Persian Gym Challenge Holo");
      expect(result.cardName).toBe("Giovanni's Persian");
    });
  });

  describe('EX/ex Normalization', () => {
    it('should detect uppercase EX (classic era)', () => {
      const result = parser.parse('Charizard EX 105/112 Fire Red Leaf Green');
      expect(result.cardType).toBe('EX');
      expect(result.cardName).toBe('Charizard EX');
    });

    it('should detect lowercase ex (modern SV era)', () => {
      const result = parser.parse('Charizard ex 199/165 Pokemon 151');
      expect(result.cardType).toBe('ex');
      expect(result.cardName).toBe('Charizard ex');
    });

    it('should handle Umbreon EX correctly', () => {
      const result = parser.parse('Umbreon EX 119/122 XY BREAKpoint');
      expect(result.cardType).toBe('EX');
      expect(result.cardName).toBe('Umbreon EX');
    });

    it('should handle modern ex cards like Koraidon ex', () => {
      const result = parser.parse('Koraidon ex 254/198 Scarlet Violet');
      expect(result.cardType).toBe('ex');
      expect(result.cardName).toBe('Koraidon ex');
    });

    it('should not confuse EX ERA with EX card type', () => {
      const result = parser.parse('Pikachu EX Era Holo 025/100');
      // Should not be marked as EX card type
      expect(result.cardType).not.toBe('EX');
    });
  });

  describe('Confidence Scoring', () => {
    it('should give high confidence for complete listings', () => {
      const result = parser.parse('Charizard PSA 10 4/102 Base Set Holo 1st Edition');
      expect(result.confidence).toBe('PERFECT');
      expect(result.confidenceScore).toBeGreaterThanOrEqual(85);
    });

    it('should give medium confidence for partial info', () => {
      const result = parser.parse('Charizard Holo Base Set');
      expect(['MEDIUM', 'HIGH']).toContain(result.confidence);
    });

    it('should give low confidence for minimal info', () => {
      const result = parser.parse('Pokemon Card');
      expect(result.confidence).toBe('LOW');
    });
  });

  describe('Edge Cases', () => {
    it('should handle special characters', () => {
      const result = parser.parse('Pokémon Charizard 4/102');
      expect(result.cardName).toBe('Charizard');
    });

    it('should handle multiple slashes', () => {
      const result = parser.parse('Charizard 4/102 Base Set 1999/2000');
      expect(result.cardNumber).toBe('4');
    });

    it('should handle emoji in titles', () => {
      const result = parser.parse('🔥 Charizard 4/102 Base Set 🔥');
      expect(result.cardName).toBe('Charizard');
    });

    it('should handle extra whitespace', () => {
      const result = parser.parse('  Charizard   4/102    Base Set  ');
      expect(result.cardName).toBe('Charizard');
      expect(result.cardNumber).toBe('4');
    });
  });
});
