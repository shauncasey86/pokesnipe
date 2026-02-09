// src/services/parser/title-parser.ts

import type {
  ParsedTitle,
  GradingCompany,
  CardVariant,
  ConfidenceLevel,
  CardType,
  CardCondition,
  CardLanguage,
} from './types.js';
import { CONDITION_MAP } from './types.js';

const PATTERNS = {
  // Card numbers - order matters (most specific first)
  // Shiny Vault format: SV32/SV94, SV38/SV94 (must be checked before standard)
  CARD_NUMBER_SHINY_VAULT: /\bSV(\d{1,3})\s*[\/\\]\s*SV(\d{2,3})\b/i,
  // Trainer Gallery format: TG07/TG30, TG17/TG30 (SWSH era subset)
  CARD_NUMBER_TRAINER_GALLERY: /\bTG(\d{1,2})\s*[\/\\]\s*TG(\d{2})\b/i,
  // Galarian Gallery format: GG69/GG70 (Crown Zenith subset)
  CARD_NUMBER_GALARIAN_GALLERY: /\bGG(\d{1,2})\s*[\/\\]\s*G?G?(\d{2})\b/i,
  // H-numbered format: H4/H32, H31/H32 (Aquapolis/Skyridge Holo rare subset)
  CARD_NUMBER_H_FORMAT: /\bH(\d{1,2})\s*[\/\\]\s*H?(\d{2})\b/i,
  // Radiant Collection format: RC11/RC25 (Legendary Treasures subset)
  CARD_NUMBER_RC_FORMAT: /\bRC(\d{1,2})\s*[\/\\]\s*RC?(\d{2})\b/i,
  // Standalone RC number: RC11, RC25 (without slash)
  CARD_NUMBER_RC_ONLY: /\bRC(\d{1,2})\b(?!\s*[\/\\])/i,
  // Hash + TG format: #TG17, #TG07
  CARD_NUMBER_HASH_TG: /#\s*TG(\d{1,2})\b/i,
  // Hash + SV format: #SV75, #SV82
  CARD_NUMBER_HASH_SV: /#\s*SV(\d{1,3})\b/i,
  // Standalone H number: H4, H32 (Aquapolis/Skyridge without slash)
  CARD_NUMBER_H_ONLY: /\bH(\d{1,2})\b(?!\s*[\/\\])/i,
  // Standalone TG number: TG17, TG07 (without slash)
  CARD_NUMBER_TG_ONLY: /\bTG(\d{1,2})\b(?!\s*[\/\\])/i,
  // Standalone GG number: GG69, GG70
  CARD_NUMBER_GG_ONLY: /\bGG(\d{1,2})\b(?!\s*[\/\\])/i,
  // Standalone SV number: SV75, SV82 (without slash)
  CARD_NUMBER_SV_ONLY: /\bSV(\d{1,3})\b(?!\s*[\/\\])/i,
  // Card number with letter suffix (variant): 74b/147, 74a/147, 110b/130
  CARD_NUMBER_VARIANT: /\b(\d{1,3})([a-z])\s*[\/\\]\s*(\d{2,3})\b/i,
  CARD_NUMBER_STANDARD: /\b(\d{1,3})\s*[\/\\]\s*(\d{2,3})\b/,
  CARD_NUMBER_HASH: /#\s*(\d{1,3})\s*[\/\\]\s*(\d{2,3})\b/,
  CARD_NUMBER_HASH_ONLY: /#\s*(\d{2,3})\b/,  // Standalone hash: #073, #130
  CARD_NUMBER_SLASH_CODE: /\b(\d{2,3})\s*\/\s*(SV-?P|SWSH|SM|XY|BW)\b/i,  // 057/SV-P format
  CARD_NUMBER_SECRET: /\b(\d{3})\s*[\/\\]\s*(\d{2,3})\b/,
  // WOTC-era standalone numbers: "Team Rocket 9", "Base Set 4", "Jungle 12" etc.
  // Must appear after a WOTC set name - the set name is captured to validate context
  CARD_NUMBER_WOTC_STANDALONE: /\b(Base\s*Set(?:\s*2)?|Jungle|Fossil|Team\s*Rocket(?!'s)|Gym\s*Heroes|Gym\s*Challenge|Neo\s*Genesis|Neo\s*Discovery|Neo\s*Revelation|Neo\s*Destiny|Legendary\s*Collection|Expedition|Aquapolis|Skyridge)\s+(\d{1,3})\b/i,
  
  // Promo codes with full code capture (SVP052, SWSH050, SM123, XY100, etc.)
  PROMO_CODE_FULL: /\b(SVP|SWSH|SM|XY|BW|DP|HGSS)(\d{2,3})\b/i,
  
  // Japanese set codes with numbers (SV6a, sv3pt5, etc.)
  JP_SET_CODE: /\b(SV\d+(?:pt\d+)?[a-z]?|SM\d+[a-z]?|XY\d+[a-z]?)\b/i,

  // English set codes (SV10, SV09, SV11B, SV11W, SWSH8, SM115, etc.)
  // Must be followed by colon, space, or end of word to avoid matching card names
  EN_SET_CODE: /\b(SV(?:0?[1-9]|1[0-1])[BWbw]?|SV[0-9]{1,2}\.?5?|SWSH(?:1[0-2]|[1-9])|SWSH[0-9]{2,3}|SM(?:1[0-2]|[1-9])|SM[0-9]{2,3})(?:[:;\s]|$)/i,
  
  // Grading
  GRADED: /\b(PSA|CGC|BGS|ACE|TAG|SGC|AGS|GMA|PG|GG|MNT|HGA|KSA|CGA|RCG|UGS)\s*(\d{1,2}(?:\.\d)?)\b/i,
  GRADE_MODIFIER: /\b(BLACK\s*LABEL|PRISTINE|PERFECT|GEM\s*MINT|MINT)\b/i,
  
  // Variants
  HOLO: /\b(HOLO(?:FOIL)?|HOLOFOIL)\b/i,
  REVERSE_HOLO: /\b(REVERSE\s*HOLO(?:FOIL)?|REV\s*HOLO|REVERSE)\b/i,
  FULL_ART: /\b(FULL\s*ART|FA)\b/i,
  ALT_ART: /\b(ALT(?:ERNATE)?\s*ART|AA|ALTERNATIVE\s*ART)\b/i,
  SECRET: /\b(SECRET\s*RARE|SR|GOLD\s*SECRET|HYPER\s*RARE)\b/i,
  RAINBOW: /\b(RAINBOW\s*RARE|RAINBOW|RR)\b/i,
  GOLD: /\b(GOLD\s*RARE|GOLD|UR)\b/i,
  PROMO: /\b(PROMO|PROMOTIONAL|BLACK\s*STAR)\b/i,
  // Delta Species variant (EX era Pokemon with different type) - NOT a set name
  DELTA_SPECIES: /[\(\[]?\s*Delta\s*Species\s*[\)\]]?/i,
  // Illustration Rare variant
  ILLUSTRATION_RARE: /\b(ILLUSTRATION\s*RARE|IR)\b/i,
  // Special Art Rare variant
  SPECIAL_ART_RARE: /\b(SPECIAL\s*ART\s*RARE|SAR)\b/i,

  // Rarity prefixes that appear before card names (should be stripped)
  // SCR = Special Card Rare, SIR = Special Illustration Rare, SAR = Special Art Rare
  // AR = Art Rare, IR = Illustration Rare, UR = Ultra Rare
  RARITY_PREFIX: /\b(SCR|SIR|SAR|AR|IR|UR|ACE\s*SPEC)\s+/i,
  
  // Editions
  FIRST_EDITION: /\b(1ST\s*ED(?:ITION)?|FIRST\s*EDITION|1ST)\b/i,
  SHADOWLESS: /\b(SHADOWLESS|NO\s*SHADOW)\b/i,
  
  // Languages
  JAPANESE: /\b(JAPANESE|JAPAN|JPN|JP|日本語)\b/i,
  KOREAN: /\b(KOREAN|KOR|KR|한국어)\b/i,
  CHINESE: /\b(CHINESE|CHN|CH|中文|TAIPEI)\b/i,
  
  // Card types
  // IMPORTANT: Uppercase EX = Ruby & Sapphire through Power Keepers era (2003-2007)
  //            Lowercase ex = Scarlet & Violet era (2023+)
  // Negative lookahead prevents matching "EX Era" or "EX Series" (case-insensitive)
  CARD_TYPE_EX_UPPER: /\b(EX)\b(?!\s*(?:[Ee][Rr][Aa]|[Ss][Ee][Rr][Ii][Ee][Ss]))/,  // Must be uppercase
  CARD_TYPE_EX_LOWER: /\b(ex)\b(?!\s*(?:[Ee][Rr][Aa]|[Ss][Ee][Rr][Ii][Ee][Ss]))/,  // Must be lowercase (modern)
  CARD_TYPE_GX: /\b(GX)\b/,
  CARD_TYPE_V: /\bV\b(?!MAX|STAR|UNION)/,
  CARD_TYPE_VMAX: /\b(VMAX)\b/,
  CARD_TYPE_VSTAR: /\b(VSTAR|V\s*STAR)\b/,
  CARD_TYPE_MEGA: /\b(MEGA|M)\s+\w+\s+EX\b/i,
  CARD_TYPE_PRIME: /\b(PRIME)\b/i,
  CARD_TYPE_LV_X: /\b(LV\.?\s*X|LEVEL\s*X)\b/i,
  CARD_TYPE_GOLD_STAR: /\b(GOLD\s*STAR|☆)\b/i,
  CARD_TYPE_BREAK: /\b(BREAK)\b/,
  CARD_TYPE_TRAINER: /\b(TRAINER|SUPPORTER|ITEM|STADIUM|TOOL)\b/i,
  CARD_TYPE_ENERGY: /\b(ENERGY)\b/i,
  
  // Conditions - Note: EX requires negative lookahead to avoid matching EX era set names
  CONDITION: /\b(NM|NEAR\s*MINT|MINT|LP|LIGHTLY\s*PLAYED|MP|MODERATELY\s*PLAYED|HP|HEAVILY\s*PLAYED|DMG|DAMAGED|EXCELLENT|VG|VERY\s*GOOD|GOOD|POOR)\b/i,
  
  // Junk detection - includes box toppers/jumbo which have different numbering
  // Also includes sealed products (ETB, booster boxes) that aren't individual cards
  JUNK_PATTERNS: /\b(LOT|BUNDLE|BULK|COLLECTION|MYSTERY|RANDOM|MIXED|ASSORTED|JOB\s*LOT|GRAB\s*BAG|PICK\s*YOUR|CHOOSE|BINDER|SLEEVE|TOPLOADER|CASE|BOX\s*ONLY|EMPTY|POOR|HEAVY\s*PLAY|CREASED|BENT|TORN|WATER|CUSTOM|PROXY|FAKE|REPLICA|UNOFFICIAL|FAN\s*MADE|ORICA|BOX\s*TOPPER|JUMBO|OVERSIZED|PROMO\s*PACK|BOOSTER\s*PACK|SEALED\s*PACK|BLISTER\s*PACK|ELITE\s*TRAINER\s*BOX|ETB|BOOSTER\s*BOX|FACTORY\s*SEALED|SEALED\s*BOX|DISPLAY\s*BOX|BUILD\s*(?:&|AND)?\s*BATTLE|HALF\s*BOOSTER|BOOSTER\s*BUNDLE|PACKS?\s*(?:X|OF)\s*\d+|\d+\s*PACKS?)\b/i,

  // Fake/replica/custom card detection - comprehensive patterns
  // Explicit fake keywords
  // Note: CU$TOM catches dollar-sign variant of CUSTOM
  CUSTOM_FAKE: /\b(CUSTOM|CU\$TOM|PROXY|FAKE|REPLICA|UNOFFICIAL|FAN\s*MADE|ORICA|NOT\s*REAL|HANDMADE|NOT\s*OFFICIAL|NOT\s*AUTHENTIC|REPRODUCTION|RECREATION|TRIBUTE|INSPIRED\s*BY|INSPIRED|FANTASY|CONCEPT|HOME\s*MADE|HOMEMADE|DIY|TEMPLATE|PLACEHOLDER|DISPLAY\s*ONLY|NOT\s*FOR\s*PLAY|DECORATIVE|NOVELTY|SOUVENIR|COLLECTIBLE\s*ONLY|ART\s*PRINT|PRINT\s*ONLY)\b/i,

  // Fake card materials/modifications (metal, gold plated, acrylic, etc.)
  FAKE_MATERIALS: /\b(METAL\s*CARD|GOLD\s*PLATED|GOLD\s*FOIL\s*CARD|SILVER\s*PLATED|ACRYLIC|PLASTIC\s*CARD|CREDIT\s*CARD\s*SIZE|3D\s*EFFECT|3D\s*CARD|EMBOSSED\s*CARD|TEXTURED\s*HOLO|CUSTOM\s*HOLO|ADDED\s*HOLO|HOLO\s*EFFECT|HOLOGRAPHIC\s*EFFECT|LAMINATED)\b/i,

  // Suspicious phrases that often indicate fakes
  FAKE_SUSPICIOUS: /\b(HIGH\s*QUALITY\s*COPY|QUALITY\s*REPLICA|LOOKS\s*REAL|LIKE\s*REAL|SAME\s*AS\s*REAL|PERFECT\s*COPY|EXACT\s*COPY|BEST\s*QUALITY|TOP\s*QUALITY\s*FAKE|REPRINT|GOLD\s*VERSION|GOLDEN\s*CARD|VMAX\s*GOLD|GX\s*GOLD|EX\s*GOLD|V\s*GOLD|RAINBOW\s*GOLD|SHINY\s*GOLD)\b/i,
  
  // Regional form Pokemon names - MUST be checked before generic POKEMON_NAMES
  // These are compound names like "Galarian Rapidash", "Alolan Raichu", "Hisuian Typhlosion"
  REGIONAL_POKEMON: /\b(Galarian\s+(?:Rapidash|Ponyta|Farfetch'd|Sirfetch'd|Weezing|Slowpoke|Slowbro|Slowking|Corsola|Cursola|Zigzagoon|Linoone|Obstagoon|Darumaka|Darmanitan|Yamask|Runerigus|Stunfisk|Mr\.\s*Mime|Mr\.\s*Rime|Articuno|Zapdos|Moltres|Meowth|Perrserker|Persian)|Alolan\s+(?:Raichu|Sandshrew|Sandslash|Vulpix|Ninetales|Diglett|Dugtrio|Meowth|Persian|Geodude|Graveler|Golem|Grimer|Muk|Exeggutor|Marowak|Rattata|Raticate)|Hisuian\s+(?:Growlithe|Arcanine|Voltorb|Electrode|Typhlosion|Qwilfish|Overqwil|Sneasel|Sneasler|Samurott|Lilligant|Basculin|Basculegion|Zorua|Zoroark|Braviary|Sliggoo|Goodra|Avalugg|Decidueye)|Paldean\s+(?:Wooper|Tauros))\b/i,

  // Dark/Light Pokemon (Team Rocket/Neo Destiny era) - MUST be checked before generic POKEMON_NAMES
  DARK_POKEMON: /\b(Dark\s+(?:Alakazam|Arbok|Blastoise|Celebi|Charizard|Crobat|Dragonite|Dugtrio|Electrode|Espeon|Feraligatr|Flaaffy|Flareon|Forretress|Gengar|Gloom|Golbat|Golduck|Golem|Gyarados|Haunter|Houndoom|Hypno|Jolteon|Machamp|Machoke|Magneton|Magcargo|Muk|Omastar|Octillery|Persian|Porygon2|Primeape|Pupitar|Quilava|Raichu|Rapidash|Raticate|Scizor|Slowbro|Slowking|Typhlosion|Tyranitar|Ursaring|Vaporeon|Vileplume|Wartortle|Weezing))\b/i,
  LIGHT_POKEMON: /\b(Light\s+(?:Arcanine|Azumarill|Dragonair|Dragonite|Espeon|Flareon|Golduck|Jolteon|Lanturn|Ledian|Machamp|Ninetales|Piloswine|Sunflora|Togetic|Vaporeon|Venomoth|Wigglytuff))\b/i,

  // Giovanni's Pokemon (Team Rocket era) - MUST be checked before generic POKEMON_NAMES
  GIOVANNIS_POKEMON: /\b(Giovanni(?:'s|s)?\s+(?:Gyarados|Machamp|Nidoking|Nidoqueen|Persian|Mewtwo))\b/i,

  // Pokemon names (common valuable ones) - extensive list including Gen 1-9
  // NOTE: Regional prefixes (Galarian, Alolan, Hisuian, Paldean) removed - handled by REGIONAL_POKEMON
  POKEMON_NAMES: /\b(Charizard|Pikachu|Blastoise|Venusaur|Mewtwo|Mew|Lugia|Ho-Oh|Rayquaza|Umbreon|Espeon|Gengar|Dragonite|Gyarados|Alakazam|Machamp|Arcanine|Ninetales|Snorlax|Lapras|Eevee|Vaporeon|Jolteon|Flareon|Articuno|Zapdos|Moltres|Ditto|Aerodactyl|Kabutops|Omastar|Tyranitar|Celebi|Entei|Raikou|Suicune|Scizor|Heracross|Kingdra|Ampharos|Feraligatr|Typhlosion|Meganium|Groudon|Kyogre|Latios|Latias|Deoxys|Jirachi|Dialga|Palkia|Giratina|Arceus|Darkrai|Shaymin|Reshiram|Zekrom|Kyurem|Xerneas|Yveltal|Zygarde|Solgaleo|Lunala|Necrozma|Zacian|Zamazenta|Eternatus|Calyrex|Miraidon|Koraidon|Terapagos|Hatterene|Persian|Gardevoir|Sylveon|Lucario|Greninja|Mimikyu|Cinderace|Inteleon|Rillaboom|Poliwrath|Blissey|Luxray|Boltund|Empoleon|Glaceon|Leafeon|Rockruff|Lycanroc|Spidops|Giovanni|Gouging\s*Fire|Iron\s*Crown|Roaring\s*Moon|Iron\s*Valiant|Walking\s*Wake|Iron\s*Leaves|Great\s*Tusk|Iron\s*Treads|Scream\s*Tail|Iron\s*Bundle|Flutter\s*Mane|Iron\s*Moth|Slither\s*Wing|Sandy\s*Shocks|Iron\s*Jugulis|Iron\s*Thorns|Brute\s*Bonnet|Chi-Yu|Chien-Pao|Ting-Lu|Wo-Chien|Bulbasaur|Ivysaur|Charmander|Charmeleon|Squirtle|Wartortle|Caterpie|Metapod|Butterfree|Weedle|Kakuna|Beedrill|Pidgey|Pidgeotto|Pidgeot|Rattata|Raticate|Spearow|Fearow|Ekans|Arbok|Raichu|Sandshrew|Sandslash|Nidoran|Nidorina|Nidoqueen|Nidorino|Nidoking|Clefairy|Clefable|Vulpix|Jigglypuff|Wigglytuff|Zubat|Golbat|Oddish|Gloom|Vileplume|Paras|Parasect|Venonat|Venomoth|Diglett|Dugtrio|Meowth|Psyduck|Golduck|Mankey|Primeape|Growlithe|Poliwag|Poliwhirl|Abra|Kadabra|Machop|Machoke|Bellsprout|Weepinbell|Victreebel|Tentacool|Tentacruel|Geodude|Graveler|Golem|Ponyta|Rapidash|Slowpoke|Slowbro|Magnemite|Magneton|Farfetch'd|Doduo|Dodrio|Seel|Dewgong|Grimer|Muk|Shellder|Cloyster|Gastly|Haunter|Onix|Drowzee|Hypno|Krabby|Kingler|Voltorb|Electrode|Exeggcute|Exeggutor|Cubone|Marowak|Hitmonlee|Hitmonchan|Lickitung|Koffing|Weezing|Rhyhorn|Rhydon|Chansey|Tangela|Kangaskhan|Horsea|Seadra|Goldeen|Seaking|Staryu|Starmie|Mr\.\s*Mime|Scyther|Jynx|Electabuzz|Magmar|Pinsir|Tauros|Magikarp|Dratini|Dragonair|Porygon|Omanyte|Kabuto|Dondozo|Tatsugiri|Palafin|Flamigo|Cetitan|Veluza|Orthworm|Glimmora|Greavard|Houndstone|Annihilape|Clodsire|Farigiraf|Dudunsparce|Kingambit|Rosa|Dark\s*Hypno|Dark\s*Raichu|Dark\s*Machamp|Dark\s*Blastoise|Dark\s*Charizard|Dark\s*Dragonite|Dark\s*Vileplume|Dark\s*Alakazam|Dark\s*Slowbro|Dark\s*Magneton|Dark\s*Weezing|Dark\s*Arbok|Dark\s*Dugtrio|Dark\s*Golbat|Dark\s*Gloom|Dark\s*Gyarados|Dark\s*Hypno|Dark\s*Jolteon|Dark\s*Flareon|Dark\s*Vaporeon|Light\s*Arcanine|Light\s*Azumarill|Light\s*Dragonite|Light\s*Flareon|Light\s*Jolteon|Light\s*Machamp|Light\s*Pikachu|Light\s*Togetic|Light\s*Vaporeon|Light\s*Wigglytuff)\b/i,

  // "Team Rocket's" card names (Destined Rivals set)
  TEAM_ROCKETS_NAMES: /\bTeam\s*Rocket(?:'s|s)?\s+(Tyranitar|Giovanni|Moltres|Spidops|Meowth|Arbok|Weezing|Persian|Wobbuffet|Mimikyu|Hitmonlee|Hitmonchan|Hitmontop|Machamp|Primeape|Exeggutor|Marowak|Kangaskhan|Electabuzz|Magmar|Pinsir|Tauros|Ditto|Porygon|Snorlax|Munchlax)\b/i,
  
  TRAINER_NAMES: /\b(Professor(?:'s)?\s*(?:Oak|Elm|Birch|Rowan|Juniper|Sycamore|Kukui|Magnolia|Research)|Cynthia|N|Marnie|Boss(?:'s)?\s*Orders|Guzma|Lysandre|Giovanni|Steven|Champion|Gym\s*Leader|Elite\s*Four)\b/i,

  // Unown variants - capture the letter form (Unown D, Unown [A], Unown A, etc.)
  UNOWN_VARIANT: /\bUnown\s*[\[\(]?\s*([A-Z!?])\s*[\]\)]?/i,

  // Nidoran with gender - captures F/M indicator (Nidoran F, Nidoran M, Nidoran Female, Nidoran Male)
  NIDORAN_GENDER: /\bNidoran\s*[\[\(]?\s*(F|M|Female|Male|♀|♂)\s*[\]\)]?/i,
  
  // Set name patterns by era
  // IMPORTANT: Order matters for overlapping names - specific sets must be checked before generic eras
  SET_NAMES: {
    // PRIORITY: Shiny Vault subsets - must be matched before generic era names
    // "Sun & Moon Hidden Fates" should match "Hidden Fates", not "Sun & Moon"
    SHINY_VAULT: /\b(Hidden\s*Fates|Shining\s*Fates|Paldean\s*Fates)\b/i,
    // WOTC: "Team Rocket" set should NOT match "Team Rocket's" (card names from Destined Rivals)
    WOTC: /\b(Base\s*Set(?!\s*2)|Jungle|Fossil|Team\s*Rocket(?!'s)|Gym\s*Heroes|Gym\s*Challenge|Neo\s*Genesis|Neo\s*Discovery|Neo\s*Revelation|Neo\s*Destiny|Legendary\s*Collection|Expedition|Aquapolis|Skyridge|Base\s*Set\s*2)\b/i,
    // NOTE: "Delta Species" must be handled carefully - it's both a set name AND a Pokemon variant
    // When in parentheses like "(Delta Species)" it indicates the Pokemon's type, not the set
    // extractSetInfo handles this by preferring other EX-era set names when both are present
    EX_ERA: /\b(Ruby\s*(?:&|and)?\s*Sapphire|Sandstorm|Dragon(?!\s*Frontiers)|Team\s*Magma|Team\s*Aqua|Hidden\s*Legends|FireRed\s*(?:&|and)?\s*LeafGreen|Team\s*Rocket\s*Returns|Deoxys|Emerald|Unseen\s*Forces|Delta\s*Species|Legend\s*Maker|Holon\s*Phantoms|Crystal\s*Guardians|Dragon\s*Frontiers|Power\s*Keepers)\b/i,
    DP_ERA: /\b(Diamond\s*(?:&|and)?\s*Pearl|Mysterious\s*Treasures|Secret\s*Wonders|Great\s*Encounters|Majestic\s*Dawn|Legends\s*Awakened|Stormfront|Platinum|Rising\s*Rivals|Supreme\s*Victors|Arceus)\b/i,
    HGSS_ERA: /\b(HeartGold\s*(?:&|and)?\s*SoulSilver|Unleashed|Undaunted|Triumphant|Call\s*of\s*Legends)\b/i,
    BW_ERA: /\b(Black\s*(?:&|and)?\s*White|Emerging\s*Powers|Noble\s*Victories|Next\s*Destinies|Dark\s*Explorers|Dragons\s*Exalted|Boundaries\s*Crossed|Plasma\s*Storm|Plasma\s*Freeze|Plasma\s*Blast|Legendary\s*Treasures)\b/i,
    XY_ERA: /\b(XY(?!\d)|Flashfire|Furious\s*Fists|Phantom\s*Forces|Primal\s*Clash|Roaring\s*Skies|Ancient\s*Origins|BREAKthrough|BREAKpoint|Generations|Fates\s*Collide|Steam\s*Siege|Evolutions|Mega\s*Evolution|Phantasmal\s*Flames)\b/i,
    SM_ERA: /\b(Sun\s*(?:&|and)?\s*Moon(?!\s*Hidden)|Guardians\s*Rising|Burning\s*Shadows|Shining\s*Legends|Crimson\s*Invasion|Ultra\s*Prism|Forbidden\s*Light|Celestial\s*Storm|Dragon\s*Majesty|Lost\s*Thunder|Team\s*Up|Unbroken\s*Bonds|Unified\s*Minds|Cosmic\s*Eclipse)\b/i,
    SWSH_ERA: /\b(Sword\s*(?:&|and)?\s*Shield(?!\s*Shining)|Rebel\s*Clash|Darkness\s*Ablaze|Champion(?:'s)?\s*Path|Vivid\s*Voltage|Battle\s*Styles|Chilling\s*Reign|Evolving\s*Skies|Celebrations|Fusion\s*Strike|Brilliant\s*Stars|Astral\s*Radiance|Pokemon\s*GO|Lost\s*Origin|Silver\s*Tempest|Crown\s*Zenith)\b/i,
    SV_ERA: /\b(Scarlet\s*(?:&|and)?\s*Violet(?!\s*Paldean)|Paldea\s*Evolved|Obsidian\s*Flames|(?:Pokemon\s*)?151|Paradox\s*Rift|Temporal\s*Forces|Twilight\s*Masquerade|Shrouded\s*Fable|Stellar\s*Crown|Surging\s*Sparks|Prismatic\s*Evolutions|Journey\s*Together|Destined\s*Rivals|Black\s*Bolt|White\s*Flare)\b/i,
    // Japanese sets
    JP_SETS: /\b(Night\s*Wanderer|Mask\s*of\s*Change|Cyber\s*Judge|Wild\s*Force|Raging\s*Surf|Ancient\s*Roar|Future\s*Flash|Shiny\s*Treasure|Clay\s*Burst|Snow\s*Hazard|Triple\s*Beat|Violet\s*ex|Scarlet\s*ex|VSTAR\s*Universe|Incandescent\s*Arcana|Lost\s*Abyss|Dark\s*Phantasma|Space\s*Juggler|Time\s*Gazer|Battle\s*Region|Star\s*Birth|VMAX\s*Climax|Fusion\s*Arts|Blue\s*Sky\s*Stream|Skyscraping\s*Perfect|Eevee\s*Heroes|Silver\s*Lance|Jet\s*Black|Peerless\s*Fighters|Matchless\s*Fighter|Single\s*Strike|Rapid\s*Strike|Shiny\s*Star|Legendary\s*Heartbeat|Infinity\s*Zone|Explosive\s*Walker|Rebellion\s*Crash|VMAX\s*Rising|Sword|Shield|25th\s*Anniversary)\b/i,
    PROMO_TYPE: /\b(Black\s*Star\s*Promo(?:s)?|(?:SVP|SWSH|SM|XY|BW|DP|HGSS)\s*Promo(?:s)?|(?:Box|ETB|Blister|Collection|Premium|Center|Together|Anniversary|Birthday|McDonald'?s?|Stamped)\s*Promo)\b/i,
  },
} as const;

// Japanese set code to name mapping
const JP_SET_CODE_MAP: Record<string, string> = {
  'sv6a': 'Night Wanderer',
  'sv6': 'Mask of Change',
  'sv5a': 'Crimson Haze',
  'sv5k': 'Wild Force',
  'sv5m': 'Cyber Judge',
  'sv4a': 'Shiny Treasure ex',
  'sv4k': 'Ancient Roar',
  'sv4m': 'Future Flash',
  'sv3a': 'Raging Surf',
  'sv3': 'Ruler of the Black Flame',
  'sv2a': 'Pokemon Card 151',
  'sv2p': 'Snow Hazard',
  'sv2d': 'Clay Burst',
  'sv1a': 'Triple Beat',
  'sv1s': 'Scarlet ex',
  'sv1v': 'Violet ex',
  'sv3pt5': '151',
  's12a': 'VSTAR Universe',
  's11a': 'Incandescent Arcana',
  's11': 'Lost Abyss',
  's10p': 'Space Juggler',
  's10d': 'Time Gazer',
};

// Promo code to set name mapping
const PROMO_CODE_TO_SET: Record<string, string> = {
  'SVP': 'SV Black Star Promos',
  'SWSH': 'SWSH Black Star Promos',
  'SM': 'SM Black Star Promos',
  'XY': 'XY Black Star Promos',
  'BW': 'BW Black Star Promos',
  'DP': 'DP Black Star Promos',
  'HGSS': 'HGSS Black Star Promos',
};

// English set code to expansion name mapping (for codes like SV10, SWSH8, SM115)
const EN_SET_CODE_MAP: Record<string, string> = {
  // Scarlet & Violet era
  'sv1': 'Scarlet & Violet',
  'sv01': 'Scarlet & Violet',
  'sv2': 'Paldea Evolved',
  'sv02': 'Paldea Evolved',
  'sv3': 'Obsidian Flames',
  'sv03': 'Obsidian Flames',
  'sv35': '151',
  'sv3.5': '151',
  'sv4': 'Paradox Rift',
  'sv04': 'Paradox Rift',
  'sv45': 'Paldean Fates',
  'sv4.5': 'Paldean Fates',
  'sv5': 'Temporal Forces',
  'sv05': 'Temporal Forces',
  'sv6': 'Twilight Masquerade',
  'sv06': 'Twilight Masquerade',
  'sv65': 'Shrouded Fable',
  'sv6.5': 'Shrouded Fable',
  'sv7': 'Stellar Crown',
  'sv07': 'Stellar Crown',
  'sv8': 'Surging Sparks',
  'sv08': 'Surging Sparks',
  'sv85': 'Prismatic Evolutions',
  'sv8.5': 'Prismatic Evolutions',
  'sv9': 'Journey Together',
  'sv09': 'Journey Together',
  'sv10': 'Destined Rivals',
  'sv11b': 'Black Bolt',
  'sv11w': 'White Flare',
  // Sword & Shield era
  'swsh1': 'Sword & Shield',
  'swsh2': 'Rebel Clash',
  'swsh3': 'Darkness Ablaze',
  'swsh35': "Champion's Path",
  'swsh4': 'Vivid Voltage',
  'swsh45': 'Shining Fates',
  'swsh5': 'Battle Styles',
  'swsh6': 'Chilling Reign',
  'swsh7': 'Evolving Skies',
  'swsh8': 'Fusion Strike',
  'swsh9': 'Brilliant Stars',
  'swsh10': 'Astral Radiance',
  'swsh11': 'Lost Origin',
  'swsh12': 'Silver Tempest',
  'swsh125': 'Crown Zenith',
  // Sun & Moon era
  'sm1': 'Sun & Moon',
  'sm2': 'Guardians Rising',
  'sm3': 'Burning Shadows',
  'sm35': 'Shining Legends',
  'sm4': 'Crimson Invasion',
  'sm5': 'Ultra Prism',
  'sm6': 'Forbidden Light',
  'sm7': 'Celestial Storm',
  'sm75': 'Dragon Majesty',
  'sm8': 'Lost Thunder',
  'sm9': 'Team Up',
  'sm10': 'Unbroken Bonds',
  'sm11': 'Unified Minds',
  'sm115': 'Hidden Fates',
  'sm12': 'Cosmic Eclipse',
};

// Set name corrections (misspellings -> correct names)
const SET_NAME_CORRECTIONS: Record<string, string> = {
  'phantasmal flames': 'Mega Evolution',  // me2 expansion
  'phantom flame': 'Phantom Forces',
  'fates collides': 'Fates Collide',
  'primal clashes': 'Primal Clash',
  'roaring sky': 'Roaring Skies',
  'ancient origin': 'Ancient Origins',
  'burning shadow': 'Burning Shadows',
  'guardians rise': 'Guardians Rising',
  'team rockets': 'Team Rocket',
  // McDonald's promos
  'mcdonald\'s 25th anniversary': 'McDonald\'s Collection 2021',
  'mcdonalds 25th anniversary': 'McDonald\'s Collection 2021',
  'mcdonald 25th anniversary': 'McDonald\'s Collection 2021',
  '25th anniversary mcdonald': 'McDonald\'s Collection 2021',
  'mcdonald\'s promo': 'McDonald\'s Collection',
  'mcdonalds promo': 'McDonald\'s Collection',
  // Prismatic Evolutions common misspelling
  'prismatic evolution': 'Prismatic Evolutions',
};

// Common Pokemon name spelling corrections
const NAME_CORRECTIONS: Record<string, string> = {
  // Common typos from training data
  'ninetails': 'Ninetales',
  'ninetail': 'Ninetales',
  'magikrap': 'Magikarp',
  'raichu': 'Raichu',
  'riachu': 'Raichu',
  'alakazm': 'Alakazam',
  'alkazam': 'Alakazam',
  'slowbrow': 'Slowbro',
  'machmap': 'Machamp',
  'hauntr': 'Haunter',
  'genger': 'Gengar',
  'genagar': 'Gengar',
  'exeggutor': 'Exeggutor',
  'dragonaire': 'Dragonair',
  'wigglytuf': 'Wigglytuff',
  'vileplum': 'Vileplume',
  'primeap': 'Primeape',
  // Misspellings found in report
  'kirila': 'Kirlia',
  'kirla': 'Kirlia',
  'tentactuel': 'Tentacruel',
  'tentacrul': 'Tentacruel',
  'revaroom': 'Revavroom',
  'charazard': 'Charizard',
  'charziard': 'Charizard',
  'charrizard': 'Charizard',
  'pickachu': 'Pikachu',
  'pikachuu': 'Pikachu',
  'blastois': 'Blastoise',
  'venasaur': 'Venusaur',
  'vensaur': 'Venusaur',
  'mewtow': 'Mewtwo',
  'mewto': 'Mewtwo',
  'rayquasa': 'Rayquaza',
  'rayquza': 'Rayquaza',
  'gyrados': 'Gyarados',
  'gyardos': 'Gyarados',
  'dragonit': 'Dragonite',
  'arcanin': 'Arcanine',
  'umbrean': 'Umbreon',
  'espean': 'Espeon',
  'sylvean': 'Sylveon',
  'glacean': 'Glaceon',
  'leafean': 'Leafeon',
  'vaporean': 'Vaporeon',
  'joltean': 'Jolteon',
  'flarean': 'Flareon',
  'lucarion': 'Lucario',
  'gardevior': 'Gardevoir',
  'gardivior': 'Gardevoir',
  'giritina': 'Giratina',
  'girtina': 'Giratina',
  'dialag': 'Dialga',
  'palkiah': 'Palkia',
  'zekram': 'Zekrom',
  'reshram': 'Reshiram',
  'typhlosian': 'Typhlosion',
  'feraligator': 'Feraligatr',
  'feraligtr': 'Feraligatr',
  'arodactyl': 'Aerodactyl',
  'kabuotps': 'Kabutops',
  'tyranitaur': 'Tyranitar',
  'tyranater': 'Tyranitar',
  'scizur': 'Scizor',
  'snorlex': 'Snorlax',
  'snrolax': 'Snorlax',
  'celebii': 'Celebi',
  'meww': 'Mew',
  'arcanas': 'Arceus',
  'darkri': 'Darkrai',
  'jirach': 'Jirachi',
  'deoxis': 'Deoxys',
  'grouden': 'Groudon',
  'kyoger': 'Kyogre',
  'latios': 'Latios',
  'latias': 'Latias',
};

// Trainer card names that should be recognized (Crystal/Stadium/Item cards)
const TRAINER_CARD_NAMES = [
  'Crystal Shard',
  'Crystal Beach',
  'Crystal Wall',
  'Ancient Ruins',
  'Mirage Stadium',
  'Pokemon Tower',
  'Radio Tower',
  'Battle Frontier',
  'Desert Ruins',
  'Underground Lake',
  'Underground Expedition',
  'Fisherman',
  'Energy Search',
  'Energy Removal',
  'Super Energy Removal',
  'Pokemon Breeder',
  'Pokemon Trader',
  'Computer Search',
  'Item Finder',
  'Pokemon Center',
  'Bill',
  'Professor Oak',
  "Professor Oak's Research",
];

export class TitleParser {
  parse(title: string): ParsedTitle {
    const normalizedTitle = this.normalizeTitle(title);
    const matchedPatterns: string[] = [];
    const warnings: string[] = [];

    // Check for fake/custom cards - comprehensive detection
    const fakePatterns: string[] = [];
    if (PATTERNS.CUSTOM_FAKE.test(normalizedTitle)) {
      fakePatterns.push('CUSTOM_FAKE');
    }
    if (PATTERNS.FAKE_MATERIALS.test(normalizedTitle)) {
      fakePatterns.push('FAKE_MATERIALS');
    }
    if (PATTERNS.FAKE_SUSPICIOUS.test(normalizedTitle)) {
      fakePatterns.push('FAKE_SUSPICIOUS');
    }

    if (fakePatterns.length > 0) {
      // More patterns = more confidence it's fake
      const isCertainlyFake = fakePatterns.includes('CUSTOM_FAKE') || fakePatterns.length >= 2;
      warnings.push(`Detected as fake/replica: ${fakePatterns.join(', ')}`);
      return this.createResult(title, normalizedTitle, {
        confidence: 'LOW',
        confidenceScore: isCertainlyFake ? 0 : 10,
        matchedPatterns: fakePatterns,
        warnings,
      });
    }

    // Check for junk listings
    if (this.isJunkListing(normalizedTitle)) {
      warnings.push('Detected as bulk/junk listing');
      return this.createResult(title, normalizedTitle, {
        confidence: 'LOW',
        confidenceScore: 0,
        matchedPatterns: ['JUNK_LISTING'],
        warnings,
      });
    }

    // Extract all components
    const cardNumberInfo = this.extractCardNumber(normalizedTitle, matchedPatterns);
    const grading = this.extractGrading(normalizedTitle, matchedPatterns);
    const variant = this.extractVariant(normalizedTitle, matchedPatterns);
    const language = this.extractLanguage(normalizedTitle, matchedPatterns);
    const edition = this.extractEdition(normalizedTitle, matchedPatterns);
    const cardType = this.extractCardType(normalizedTitle, matchedPatterns);
    const setInfo = this.extractSetInfo(normalizedTitle, cardNumberInfo, matchedPatterns);
    const condition = this.extractCondition(normalizedTitle, matchedPatterns, grading.isGraded);
    const cardName = this.extractCardName(normalizedTitle, setInfo, matchedPatterns);

    // Calculate confidence
    const { confidence, score } = this.calculateConfidence(
      cardName,
      cardNumberInfo?.number || null,
      setInfo?.name || null,
      matchedPatterns
    );

    return this.createResult(title, normalizedTitle, {
      cardName,
      cardNumber: cardNumberInfo?.number || null,
      printedNumber: cardNumberInfo?.printed || null,
      setName: setInfo?.name || null,
      setCode: setInfo?.code || null,
      condition,
      isGraded: grading.isGraded,
      gradingCompany: grading.company,
      grade: grading.grade,
      gradeModifier: grading.modifier,
      variant,
      language: language.name,
      languageCode: language.code,
      isFirstEdition: edition.isFirstEdition,
      isShadowless: edition.isShadowless,
      cardType,
      confidence,
      confidenceScore: score,
      matchedPatterns,
      warnings,
    });
  }

  private normalizeTitle(title: string): string {
    let normalized = title
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/pokémon/gi, 'Pokemon')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    // Apply common spelling corrections
    for (const [misspelling, correct] of Object.entries(NAME_CORRECTIONS)) {
      const regex = new RegExp(`\\b${misspelling}\\b`, 'gi');
      normalized = normalized.replace(regex, correct);
    }

    return normalized;
  }

  private isJunkListing(title: string): boolean {
    const junkMatches = title.match(PATTERNS.JUNK_PATTERNS);
    if (!junkMatches) return false;

    // If it has a card number and grading, it's probably legit even with "lot" etc.
    const hasNumber = PATTERNS.CARD_NUMBER_SHINY_VAULT.test(title) ||
                      PATTERNS.CARD_NUMBER_TRAINER_GALLERY.test(title) ||
                      PATTERNS.CARD_NUMBER_GALARIAN_GALLERY.test(title) ||
                      PATTERNS.CARD_NUMBER_H_FORMAT.test(title) ||
                      PATTERNS.CARD_NUMBER_RC_FORMAT.test(title) ||
                      PATTERNS.CARD_NUMBER_RC_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_HASH_TG.test(title) ||
                      PATTERNS.CARD_NUMBER_HASH_SV.test(title) ||
                      PATTERNS.CARD_NUMBER_H_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_TG_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_GG_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_SV_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_VARIANT.test(title) ||
                      PATTERNS.CARD_NUMBER_STANDARD.test(title) ||
                      PATTERNS.CARD_NUMBER_HASH.test(title) ||
                      PATTERNS.CARD_NUMBER_HASH_ONLY.test(title) ||
                      PATTERNS.CARD_NUMBER_SLASH_CODE.test(title);
    const hasGrading = PATTERNS.GRADED.test(title);

    if (hasNumber && hasGrading) return false;

    return true;
  }

  private extractCardNumber(
    title: string,
    matched: string[]
  ): { number: string; printed: string; isPromo: boolean; promoPrefix?: string; isShinyVault?: boolean } | null {

    // 1. Shiny Vault format: SV32/SV94, SV38/SV94 (Hidden Fates, Shining Fates)
    const shinyVaultMatch = title.match(PATTERNS.CARD_NUMBER_SHINY_VAULT);
    if (shinyVaultMatch) {
      matched.push('NUMBER_SHINY_VAULT');
      const num = shinyVaultMatch[1];
      return {
        number: `SV${num}`,
        printed: `SV${num}/SV${shinyVaultMatch[2]}`,
        isPromo: false,
        isShinyVault: true
      };
    }

    // 2. Trainer Gallery format: TG07/TG30, TG17/TG30
    const trainerGalleryMatch = title.match(PATTERNS.CARD_NUMBER_TRAINER_GALLERY);
    if (trainerGalleryMatch) {
      matched.push('NUMBER_TRAINER_GALLERY');
      const num = trainerGalleryMatch[1];
      return {
        number: `TG${num.padStart(2, '0')}`,
        printed: `TG${num}/TG${trainerGalleryMatch[2]}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 3. Galarian Gallery format: GG69/GG70, GG69/G70
    const galarianGalleryMatch = title.match(PATTERNS.CARD_NUMBER_GALARIAN_GALLERY);
    if (galarianGalleryMatch) {
      matched.push('NUMBER_GALARIAN_GALLERY');
      const num = galarianGalleryMatch[1];
      return {
        number: `GG${num.padStart(2, '0')}`,
        printed: `GG${num}/GG${galarianGalleryMatch[2]}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 3.5. H-numbered format: H4/H32, H31/H32 (Aquapolis/Skyridge)
    const hFormatMatch = title.match(PATTERNS.CARD_NUMBER_H_FORMAT);
    if (hFormatMatch) {
      matched.push('NUMBER_H_FORMAT');
      const num = hFormatMatch[1];
      return {
        number: `H${num}`,
        printed: `H${num}/H${hFormatMatch[2]}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 3.6. Radiant Collection format: RC11/RC25 (Legendary Treasures)
    const rcFormatMatch = title.match(PATTERNS.CARD_NUMBER_RC_FORMAT);
    if (rcFormatMatch) {
      matched.push('NUMBER_RC_FORMAT');
      const num = rcFormatMatch[1];
      return {
        number: `RC${num}`,
        printed: `RC${num}/RC${rcFormatMatch[2]}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 3.7. Standalone RC number: RC11, RC25 (without slash)
    const rcOnlyMatch = title.match(PATTERNS.CARD_NUMBER_RC_ONLY);
    if (rcOnlyMatch) {
      matched.push('NUMBER_RC_ONLY');
      const num = rcOnlyMatch[1];
      return {
        number: `RC${num}`,
        printed: `RC${num}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 4. Hash + TG format: #TG17, #TG07
    const hashTgMatch = title.match(PATTERNS.CARD_NUMBER_HASH_TG);
    if (hashTgMatch) {
      matched.push('NUMBER_HASH_TG');
      const num = hashTgMatch[1];
      return {
        number: `TG${num.padStart(2, '0')}`,
        printed: `#TG${num}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 5. Hash + SV format: #SV75, #SV82
    const hashSvMatch = title.match(PATTERNS.CARD_NUMBER_HASH_SV);
    if (hashSvMatch) {
      matched.push('NUMBER_HASH_SV');
      const num = hashSvMatch[1];
      return {
        number: `SV${num}`,
        printed: `#SV${num}`,
        isPromo: false,
        isShinyVault: true
      };
    }

    // 6. Standalone TG number: TG17, TG07 (without slash)
    const tgOnlyMatch = title.match(PATTERNS.CARD_NUMBER_TG_ONLY);
    if (tgOnlyMatch) {
      matched.push('NUMBER_TG_ONLY');
      const num = tgOnlyMatch[1];
      return {
        number: `TG${num.padStart(2, '0')}`,
        printed: `TG${num}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 7. Standalone GG number: GG69, GG70
    const ggOnlyMatch = title.match(PATTERNS.CARD_NUMBER_GG_ONLY);
    if (ggOnlyMatch) {
      matched.push('NUMBER_GG_ONLY');
      const num = ggOnlyMatch[1];
      return {
        number: `GG${num.padStart(2, '0')}`,
        printed: `GG${num}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 7.5. Standalone H number: H4, H32 (Aquapolis/Skyridge without slash)
    const hOnlyMatch = title.match(PATTERNS.CARD_NUMBER_H_ONLY);
    if (hOnlyMatch) {
      matched.push('NUMBER_H_ONLY');
      const num = hOnlyMatch[1];
      return {
        number: `H${num}`,
        printed: `H${num}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 7.6. Variant card number with letter suffix: 74b/147, 74a/147, 110b/130
    const variantMatch = title.match(PATTERNS.CARD_NUMBER_VARIANT);
    if (variantMatch) {
      matched.push('NUMBER_VARIANT');
      const num = variantMatch[1];
      const suffix = variantMatch[2].toLowerCase();
      return {
        number: `${num}${suffix}`,
        printed: `${num}${suffix}/${variantMatch[3]}`,
        isPromo: false,
        isShinyVault: false
      };
    }

    // 8. Standard format: 4/102, 25/185, 251/198 (but NOT 057/SV-P which has letters after slash)
    // IMPORTANT: Check standard format BEFORE standalone SV numbers
    // Titles like "Miriam 251/198 SV01:" have both standard number AND set code
    const standardMatch = title.match(PATTERNS.CARD_NUMBER_STANDARD);
    if (standardMatch) {
      // Make sure the second part is all digits (not a set code like SV-P)
      if (/^\d+$/.test(standardMatch[2])) {
        matched.push('NUMBER_STANDARD');
        return {
          number: standardMatch[1],
          printed: standardMatch[0],
          isPromo: false
        };
      }
    }

    // 9. Standalone SV number: SV75, SV82 (without slash - but not SVP promos or set codes)
    // IMPORTANT: SV01-SV09 are typically SET CODES (SV01=Scarlet&Violet, SV02=Paldea Evolved, etc.)
    // Real Shiny Vault card numbers are higher: SV10+ (e.g., SV65/SV94, SV49/SV94)
    const svOnlyMatch = title.match(PATTERNS.CARD_NUMBER_SV_ONLY);
    if (svOnlyMatch) {
      const num = parseInt(svOnlyMatch[1], 10);
      // Skip if it's a set code (SV01-SV09) - these are expansion identifiers, not card numbers
      // Also skip if there's already a standard format number found elsewhere in the title
      const hasStandardNumber = PATTERNS.CARD_NUMBER_STANDARD.test(title);
      const isSetCode = num <= 9;
      // Make sure it's not part of a promo code like SVP or SV-P
      const fullMatch = title.match(/\bSV-?P?\d{1,3}\b/i);
      const isPromoCode = fullMatch && fullMatch[0].toUpperCase().includes('SVP');

      if (!isSetCode && !isPromoCode && !hasStandardNumber) {
        matched.push('NUMBER_SV_ONLY');
        return {
          number: `SV${num}`,
          printed: `SV${num}`,
          isPromo: false,
          isShinyVault: true
        };
      }
    }

    // 5. Hash format with slash: #4/102
    const hashMatch = title.match(PATTERNS.CARD_NUMBER_HASH);
    if (hashMatch) {
      matched.push('NUMBER_HASH');
      return {
        number: hashMatch[1],
        printed: hashMatch[0],
        isPromo: false
      };
    }

    // 6. Slash with set code: 057/SV-P, 123/SWSH
    const slashCodeMatch = title.match(PATTERNS.CARD_NUMBER_SLASH_CODE);
    if (slashCodeMatch) {
      matched.push('NUMBER_SLASH_CODE');
      const num = slashCodeMatch[1];
      const code = slashCodeMatch[2].toUpperCase().replace('-', '');
      return {
        number: num,
        printed: `${code}${num}`,
        isPromo: true,
        promoPrefix: code
      };
    }

    // 7. Secret rare: 201/185
    const secretMatch = title.match(PATTERNS.CARD_NUMBER_SECRET);
    if (secretMatch) {
      matched.push('NUMBER_SECRET');
      return {
        number: secretMatch[1],
        printed: secretMatch[0],
        isPromo: false
      };
    }

    // 8. Promo codes: SVP052, SWSH050, SM123
    const promoMatch = title.match(PATTERNS.PROMO_CODE_FULL);
    if (promoMatch) {
      matched.push('NUMBER_PROMO');
      const prefix = promoMatch[1].toUpperCase();
      const num = promoMatch[2];
      return {
        number: num,
        printed: `${prefix}${num}`,
        isPromo: true,
        promoPrefix: prefix
      };
    }

    // 9. Standalone hash: #073, #130
    const hashOnlyMatch = title.match(PATTERNS.CARD_NUMBER_HASH_ONLY);
    if (hashOnlyMatch) {
      matched.push('NUMBER_HASH_ONLY');
      return {
        number: hashOnlyMatch[1],
        printed: `#${hashOnlyMatch[1]}`,
        isPromo: false
      };
    }

    // 10. WOTC-era standalone numbers: "Team Rocket 9", "Base Set 4", "Jungle 12"
    // These cards often have numbers without slash notation in older listings
    const wotcStandaloneMatch = title.match(PATTERNS.CARD_NUMBER_WOTC_STANDALONE);
    if (wotcStandaloneMatch) {
      matched.push('NUMBER_WOTC_STANDALONE');
      const num = wotcStandaloneMatch[2];
      // Validate number is within reasonable range for WOTC sets (1-165 for Legendary Collection)
      const numValue = parseInt(num, 10);
      if (numValue >= 1 && numValue <= 165) {
        return {
          number: num,
          printed: num,
          isPromo: false
        };
      }
    }

    return null;
  }

  private extractGrading(
    title: string,
    matched: string[]
  ): { isGraded: boolean; company: GradingCompany | null; grade: string | null; modifier: string | null } {
    const gradingMatch = title.match(PATTERNS.GRADED);
    
    if (!gradingMatch) {
      return { isGraded: false, company: null, grade: null, modifier: null };
    }

    matched.push('GRADED');
    const company = gradingMatch[1].toUpperCase() as GradingCompany;
    const grade = gradingMatch[2];
    
    // Check for grade modifiers
    const modifierMatch = title.match(PATTERNS.GRADE_MODIFIER);
    const modifier = modifierMatch ? modifierMatch[1].toUpperCase().replace(/\s+/g, ' ') : null;
    
    if (modifier) {
      matched.push('GRADE_MODIFIER');
    }

    return { isGraded: true, company, grade, modifier };
  }

  private extractVariant(title: string, matched: string[]): CardVariant {
    const variant: CardVariant = {
      isHolo: false,
      isReverseHolo: false,
      isFullArt: false,
      isAltArt: false,
      isPromo: false,
      isSecret: false,
      isRainbow: false,
      isGold: false,
      variantName: null,
    };

    const variants: string[] = [];

    if (PATTERNS.REVERSE_HOLO.test(title)) {
      variant.isReverseHolo = true;
      variants.push('Reverse Holo');
      matched.push('VARIANT_REVERSE');
    } else if (PATTERNS.HOLO.test(title)) {
      variant.isHolo = true;
      variants.push('Holo');
      matched.push('VARIANT_HOLO');
    }

    if (PATTERNS.FULL_ART.test(title)) {
      variant.isFullArt = true;
      variants.push('Full Art');
      matched.push('VARIANT_FA');
    }

    if (PATTERNS.ALT_ART.test(title)) {
      variant.isAltArt = true;
      variants.push('Alt Art');
      matched.push('VARIANT_AA');
    }

    if (PATTERNS.SECRET.test(title)) {
      variant.isSecret = true;
      variants.push('Secret');
      matched.push('VARIANT_SECRET');
    }

    if (PATTERNS.RAINBOW.test(title)) {
      variant.isRainbow = true;
      variants.push('Rainbow');
      matched.push('VARIANT_RAINBOW');
    }

    if (PATTERNS.GOLD.test(title)) {
      variant.isGold = true;
      variants.push('Gold');
      matched.push('VARIANT_GOLD');
    }

    if (PATTERNS.PROMO.test(title)) {
      variant.isPromo = true;
      variants.push('Promo');
      matched.push('VARIANT_PROMO');
    }

    if (variants.length > 0) {
      variant.variantName = variants.join(' ');
    }

    return variant;
  }

  private extractLanguage(
    title: string,
    matched: string[]
  ): { name: CardLanguage; code: string } {
    if (PATTERNS.JAPANESE.test(title)) {
      matched.push('LANG_JAPANESE');
      return { name: 'Japanese', code: 'JA' };
    }
    if (PATTERNS.KOREAN.test(title)) {
      matched.push('LANG_KOREAN');
      return { name: 'Korean', code: 'KR' };
    }
    if (PATTERNS.CHINESE.test(title)) {
      matched.push('LANG_CHINESE');
      return { name: 'Chinese', code: 'CH' };
    }
    return { name: 'English', code: 'EN' };
  }

  private extractEdition(
    title: string,
    matched: string[]
  ): { isFirstEdition: boolean; isShadowless: boolean } {
    const isFirstEdition = PATTERNS.FIRST_EDITION.test(title);
    const isShadowless = PATTERNS.SHADOWLESS.test(title);

    if (isFirstEdition) matched.push('FIRST_EDITION');
    if (isShadowless) matched.push('SHADOWLESS');

    return { isFirstEdition, isShadowless };
  }

  private extractCardType(title: string, matched: string[]): CardType | null {
    if (PATTERNS.CARD_TYPE_VSTAR.test(title)) {
      matched.push('TYPE_VSTAR');
      return 'VSTAR';
    }
    if (PATTERNS.CARD_TYPE_VMAX.test(title)) {
      matched.push('TYPE_VMAX');
      return 'VMAX';
    }
    if (PATTERNS.CARD_TYPE_V.test(title)) {
      matched.push('TYPE_V');
      return 'V';
    }
    if (PATTERNS.CARD_TYPE_GX.test(title)) {
      matched.push('TYPE_GX');
      return 'GX';
    }
    if (PATTERNS.CARD_TYPE_MEGA.test(title)) {
      matched.push('TYPE_MEGA');
      return 'MEGA';
    }
    // Check lowercase 'ex' first (modern SV era) - more specific
    if (PATTERNS.CARD_TYPE_EX_LOWER.test(title)) {
      matched.push('TYPE_EX_LOWER');
      return 'ex';  // lowercase for modern era
    }
    // Then check uppercase 'EX' (old Ruby & Sapphire era)
    if (PATTERNS.CARD_TYPE_EX_UPPER.test(title)) {
      matched.push('TYPE_EX_UPPER');
      return 'EX';  // uppercase for classic era
    }
    if (PATTERNS.CARD_TYPE_PRIME.test(title)) {
      matched.push('TYPE_PRIME');
      return 'Prime';
    }
    if (PATTERNS.CARD_TYPE_LV_X.test(title)) {
      matched.push('TYPE_LV_X');
      return 'LV.X';
    }
    if (PATTERNS.CARD_TYPE_GOLD_STAR.test(title)) {
      matched.push('TYPE_GOLD_STAR');
      return 'Gold Star';
    }
    if (PATTERNS.CARD_TYPE_BREAK.test(title)) {
      matched.push('TYPE_BREAK');
      return 'BREAK';
    }
    if (PATTERNS.CARD_TYPE_TRAINER.test(title)) {
      matched.push('TYPE_TRAINER');
      return 'Trainer';
    }
    if (PATTERNS.CARD_TYPE_ENERGY.test(title)) {
      matched.push('TYPE_ENERGY');
      return 'Energy';
    }
    return null;
  }

  private extractSetInfo(
    title: string,
    cardNumberInfo: { number: string; printed: string; isPromo: boolean; promoPrefix?: string } | null,
    matched: string[]
  ): { name: string; code: string | null } | null {

    // 1. If we have a promo prefix from the card number, use it to determine the set
    if (cardNumberInfo?.isPromo && cardNumberInfo.promoPrefix) {
      const promoSetName = PROMO_CODE_TO_SET[cardNumberInfo.promoPrefix];
      if (promoSetName) {
        matched.push('SET_PROMO_CODE');
        return { name: promoSetName, code: cardNumberInfo.promoPrefix };
      }
    }

    // 2. GG-prefixed cards (Galarian Gallery) are ALWAYS Crown Zenith
    // This must be checked before general set name matching to avoid
    // matching Pokemon names like "Deoxys", "Arceus" as set names
    if (cardNumberInfo?.number && /^GG\d+$/i.test(cardNumberInfo.number)) {
      matched.push('SET_GALARIAN_GALLERY');
      return { name: 'Crown Zenith', code: 'swsh125gg' };
    }

    // 3. RC-prefixed cards (Radiant Collection) are from specific sets
    // RC cards appear in BW Legendary Treasures
    if (cardNumberInfo?.number && /^RC\d+$/i.test(cardNumberInfo.number)) {
      matched.push('SET_RADIANT_COLLECTION');
      return { name: 'Legendary Treasures', code: 'bw11' };
    }

    // 4. Check for Japanese set codes (SV6a, sv3pt5, etc.)
    const jpCodeMatch = title.match(PATTERNS.JP_SET_CODE);
    if (jpCodeMatch) {
      const code = jpCodeMatch[1].toUpperCase();
      const codeLower = jpCodeMatch[1].toLowerCase();
      const setName = JP_SET_CODE_MAP[codeLower];

      if (setName) {
        matched.push('SET_JP_CODE');
        return { name: setName, code };
      }
    }

    // 4.5. Check for English set codes (SV10, SV09, SV11B, SWSH8, SM115, etc.)
    // This catches titles like "Pokemon SV10: Destined Rivals" or "SWSH8 Fusion Strike"
    const enCodeMatch = title.match(PATTERNS.EN_SET_CODE);
    if (enCodeMatch) {
      const codeLower = enCodeMatch[1].toLowerCase().replace('.', '');
      const setName = EN_SET_CODE_MAP[codeLower];

      if (setName) {
        matched.push('SET_EN_CODE');
        return { name: setName, code: codeLower };
      }
    }

    // 5. Check all set name patterns
    // Collect all matches to handle cases like "Delta Species" appearing as both set and variant
    const allMatches: Array<{ era: string; setName: string; match: RegExpMatchArray }> = [];

    for (const [era, pattern] of Object.entries(PATTERNS.SET_NAMES)) {
      const match = title.match(pattern);
      if (match) {
        let setName = match[0].trim();

        // Apply set name corrections for misspellings
        const correction = SET_NAME_CORRECTIONS[setName.toLowerCase()];
        if (correction) {
          matched.push('SET_NAME_CORRECTED');
          setName = correction;
        }

        allMatches.push({ era, setName, match });
      }
    }

    if (allMatches.length === 0) {
      return null;
    }

    // If we found "Delta Species" but also another EX-era set, prefer the other set
    // "Delta Species" in parentheses or alongside another set indicates it's a Pokemon variant, not the set
    if (allMatches.length > 1) {
      const deltaMatch = allMatches.find(m => /delta\s*species/i.test(m.setName));
      const otherMatches = allMatches.filter(m => !/delta\s*species/i.test(m.setName));

      if (deltaMatch && otherMatches.length > 0) {
        // Check if Delta Species appears in parentheses (indicating variant)
        const deltaInParens = /[\(\[]delta\s*species[\)\]]/i.test(title);
        if (deltaInParens || otherMatches.some(m => m.era === 'EX_ERA')) {
          // Prefer the other match
          matched.push('DELTA_SPECIES_AS_VARIANT');
          matched.push(`SET_${otherMatches[0].era}`);
          return { name: otherMatches[0].setName, code: null };
        }
      }
    }

    // Return the first (most specific) match
    matched.push(`SET_${allMatches[0].era}`);
    return { name: allMatches[0].setName, code: null };
  }

  private extractCondition(
    title: string,
    matched: string[],
    isGraded: boolean
  ): CardCondition | null {
    // Don't extract condition for graded cards
    if (isGraded) return null;

    const conditionMatch = title.match(PATTERNS.CONDITION);
    if (conditionMatch) {
      const rawCondition = conditionMatch[1].toUpperCase().replace(/\s+/g, '');
      const condition = CONDITION_MAP[rawCondition] || null;
      if (condition) {
        matched.push('CONDITION');
        return condition;
      }
    }
    return null;
  }

  private extractCardName(
    title: string,
    setInfo: { name: string; code: string | null } | null,
    matched: string[]
  ): string | null {
    // Pre-process: Strip rarity prefixes (SCR, SIR, SAR, etc.) that appear before card names
    // e.g., "SCR Zeraora" -> "Zeraora"
    let cleanTitle = title.replace(PATTERNS.RARITY_PREFIX, '');
    if (cleanTitle !== title) {
      matched.push('RARITY_PREFIX_STRIPPED');
    }

    // Also strip "(Delta Species)" variant from title for cleaner name extraction
    cleanTitle = cleanTitle.replace(PATTERNS.DELTA_SPECIES, ' ').replace(/\s+/g, ' ').trim();

    // 0. Check for Unown variants first (Unown D, Unown [A], etc.)
    const unownMatch = cleanTitle.match(PATTERNS.UNOWN_VARIANT);
    if (unownMatch) {
      matched.push('NAME_UNOWN_VARIANT');
      const letter = unownMatch[1].toUpperCase();
      return `Unown [${letter}]`;
    }

    // 0.5. Check for Nidoran with gender indicator (Nidoran F, Nidoran M, etc.)
    const nidoranMatch = cleanTitle.match(PATTERNS.NIDORAN_GENDER);
    if (nidoranMatch) {
      matched.push('NAME_NIDORAN_GENDER');
      const genderIndicator = nidoranMatch[1].toUpperCase();
      // Convert to proper gender symbol format
      if (genderIndicator === 'F' || genderIndicator === 'FEMALE' || genderIndicator === '♀') {
        return 'Nidoran♀';
      } else if (genderIndicator === 'M' || genderIndicator === 'MALE' || genderIndicator === '♂') {
        return 'Nidoran♂';
      }
    }

    // 1. Check for known trainer card names first (Crystal Shard, Energy Search, etc.)
    const titleUpper = cleanTitle.toUpperCase();
    for (const trainerName of TRAINER_CARD_NAMES) {
      if (titleUpper.includes(trainerName.toUpperCase())) {
        matched.push('NAME_TRAINER_CARD');
        return trainerName;
      }
    }

    // 2. Try "Team Rocket's" names (Destined Rivals cards)
    const teamRocketMatch = cleanTitle.match(PATTERNS.TEAM_ROCKETS_NAMES);
    if (teamRocketMatch) {
      matched.push('NAME_TEAM_ROCKETS');
      return teamRocketMatch[0]; // Return full "Team Rocket's Pokemon" name
    }

    // 3. Try regional form Pokemon names FIRST (Galarian Rapidash, Alolan Raichu, etc.)
    // These must be checked before generic POKEMON_NAMES to avoid truncation
    const regionalMatch = cleanTitle.match(PATTERNS.REGIONAL_POKEMON);
    if (regionalMatch) {
      matched.push('NAME_REGIONAL_POKEMON');
      // Check if this is a card with type suffix (V, VMAX, EX, ex, GX, etc.)
      const cardType = this.extractCardType(cleanTitle, []);
      // Include both 'EX' (classic era) and 'ex' (modern SV era)
      if (cardType && ['V', 'VMAX', 'VSTAR', 'EX', 'ex', 'GX'].includes(cardType)) {
        return `${regionalMatch[0]} ${cardType}`;
      }
      return regionalMatch[0];
    }

    // 3.5. Try Dark Pokemon names (Team Rocket/Neo Destiny era)
    const darkMatch = cleanTitle.match(PATTERNS.DARK_POKEMON);
    if (darkMatch) {
      matched.push('NAME_DARK_POKEMON');
      return darkMatch[1]; // Return "Dark Hypno", "Dark Charizard", etc.
    }

    // 3.6. Try Light Pokemon names (Neo Destiny era)
    const lightMatch = cleanTitle.match(PATTERNS.LIGHT_POKEMON);
    if (lightMatch) {
      matched.push('NAME_LIGHT_POKEMON');
      return lightMatch[1]; // Return "Light Arcanine", "Light Dragonite", etc.
    }

    // 3.7. Try Giovanni's Pokemon names (Team Rocket era)
    const giovanniMatch = cleanTitle.match(PATTERNS.GIOVANNIS_POKEMON);
    if (giovanniMatch) {
      matched.push('NAME_GIOVANNIS_POKEMON');
      return giovanniMatch[1]; // Return "Giovanni's Gyarados", etc.
    }

    // 4. Try to find a known Pokemon name
    const pokemonMatch = cleanTitle.match(PATTERNS.POKEMON_NAMES);
    if (pokemonMatch) {
      matched.push('NAME_POKEMON');
      // Check if this is a card with type suffix (V, VMAX, EX, ex, Gold Star, LV.X, etc.)
      const cardType = this.extractCardType(cleanTitle, []);
      // Include both 'EX' (classic era uppercase) and 'ex' (modern SV era lowercase)
      if (cardType && ['V', 'VMAX', 'VSTAR', 'EX', 'ex', 'GX', 'Gold Star', 'LV.X'].includes(cardType)) {
        // For Gold Star, use the star symbol
        if (cardType === 'Gold Star') {
          return `${pokemonMatch[1]} ☆`;
        }
        return `${pokemonMatch[1]} ${cardType}`;
      }
      return pokemonMatch[1];
    }

    // 4. Try trainer names
    const trainerMatch = cleanTitle.match(PATTERNS.TRAINER_NAMES);
    if (trainerMatch) {
      matched.push('NAME_TRAINER');
      return trainerMatch[0];
    }

    // 5. Fall back to extraction from title
    let workingTitle = cleanTitle;

    // Remove known patterns to isolate card name
    const patternsToRemove = [
      PATTERNS.GRADED,
      PATTERNS.GRADE_MODIFIER,
      PATTERNS.CARD_NUMBER_SHINY_VAULT,
      PATTERNS.CARD_NUMBER_TRAINER_GALLERY,
      PATTERNS.CARD_NUMBER_GALARIAN_GALLERY,
      PATTERNS.CARD_NUMBER_RC_FORMAT,
      PATTERNS.CARD_NUMBER_RC_ONLY,
      PATTERNS.CARD_NUMBER_HASH_TG,
      PATTERNS.CARD_NUMBER_HASH_SV,
      PATTERNS.CARD_NUMBER_TG_ONLY,
      PATTERNS.CARD_NUMBER_GG_ONLY,
      PATTERNS.CARD_NUMBER_SV_ONLY,
      PATTERNS.CARD_NUMBER_STANDARD,
      PATTERNS.CARD_NUMBER_HASH,
      PATTERNS.CARD_NUMBER_HASH_ONLY,
      PATTERNS.CARD_NUMBER_SLASH_CODE,
      PATTERNS.CARD_NUMBER_SECRET,
      PATTERNS.PROMO_CODE_FULL,
      PATTERNS.JP_SET_CODE,
      PATTERNS.HOLO,
      PATTERNS.REVERSE_HOLO,
      PATTERNS.FULL_ART,
      PATTERNS.ALT_ART,
      PATTERNS.SECRET,
      PATTERNS.RAINBOW,
      PATTERNS.GOLD,
      PATTERNS.PROMO,
      PATTERNS.FIRST_EDITION,
      PATTERNS.SHADOWLESS,
      PATTERNS.JAPANESE,
      PATTERNS.KOREAN,
      PATTERNS.CHINESE,
      // Condition patterns - use a modified version that:
      // 1. Has global flag to replace ALL matches
      // 2. Doesn't match "EX" when followed by set names (EX era sets)
      /\b(NM|NEAR\s*MINT|MINT|LP|LIGHTLY\s*PLAYED|MP|MODERATELY\s*PLAYED|HP|HEAVILY\s*PLAYED|DMG|DAMAGED|VG|VERY\s*GOOD|GD|GOOD|POOR)\b/gi,
      // All grading companies and grade-related text
      /\b(Pokemon|Card|TCG|CGC|PSA|BGS|AGS|ACE|TAG|SGC|GMA|PG|MNT|HGA|KSA|CGA|RCG|UGS|GEM|MINT|NEAR|PERFECT|PRISTINE|LEGENDARY|AI\s*GRADE)\b/gi,
      // Years - remove from name extraction
      /\b(1995|1996|1997|1998|1999|2000|2001|2002|2003|2004|2005|2006|2007|2008|2009|2010|2011|2012|2013|2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024|2025)\b/g,
      // Grade numbers at word boundaries (but not card numbers)
      /\b(10|9\.5|9|8\.5|8|7\.5|7|6\.5|6|5|4|3|2|1)\b(?!\s*[\/\\])/g,
      // Common grade/quality words that bleed in
      /\b(LOW\s*POP|HIGH\s*POP|POP\s*\d+|SWIRL|ENG|JAP|JPN)\b/gi,
      // Emojis
      /[🔥⭐✨💎🌟⚡️]/g,
    ];

    for (const pattern of patternsToRemove) {
      workingTitle = workingTitle.replace(pattern, ' ');
    }

    // Remove set name if found
    if (setInfo?.name) {
      workingTitle = workingTitle.replace(new RegExp(setInfo.name, 'gi'), ' ');
    }

    // Clean up and extract first meaningful word(s)
    workingTitle = workingTitle
      .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Filter out common filler words, noise, and set-related terms that bleed into names
    const fillerWords = [
      // Common noise
      'the', 'and', 'or', 'a', 'an', 'of', 'for', 'in', 'on', 'at', 'to', 'plz', 'read', 'description', 'look', 'see', 'great', 'nice', 'hot', 'wow', 'no', 'with', 'grey', 'gray', 'felt', 'hat', 'van', 'gogh', 'x5', 'x4', 'x3', 'x2', 'x1', 'plus', 'anniv', 'anniversary',
      // Set-related words that bleed into names
      'base', 'set', 'series', 'edition', 'scarlet', 'violet', 'sword', 'shield', 'sun', 'moon',
      // Rarity/variant words - including "shiny" which causes duplicates
      'rare', 'common', 'uncommon', 'illustration', 'full', 'art', 'special', 'ultra', 'secret', 'amazing', 'shiny', 'vault',
      // Card descriptors
      'card', 'cards', 'pokemon', 'tcg', 'wotc', 'english', 'original', 'vintage', 'classic',
      // Trainer card type words that bleed into names (e.g., "Miriam Trainer" should be "Miriam")
      'trainer', 'supporter', 'item', 'stadium', 'tool', 'gallery',
      // Tail/Crystal (when not part of Pokemon name)
      'tail', 'swirl', 'crystal',
      // Free/bonus indicators
      'free', 'case', 'bonus', 'included',
      // Grading/condition words that bleed into names (from report)
      'unlimited', 'grade', 'graded', 'premium', 'tournament', 'stamped', 'center', 'promo', 'promos',
      'master', 'strike', 'rapid', 'single', 'booster', 'pack', 'condition', 'mint', 'near',
      'slabs', 'slab', 'raw', 'sealed', 'forme', 'origin', 'complete', 'collection',
      // Japanese set/card terms
      'jp', 'japanese', 'jap', 'jpn', 's-p', 'sv-p', 'swsh',
      // Number-like noise (years, quantities)
      '1st', '2nd', '3rd', '4th', '5th', '25th', '151',
      // Regional prefixes when standalone (handled by REGIONAL_POKEMON pattern)
      'galarian', 'alolan', 'hisuian', 'paldean', 'mega', 'evolution',
      // Card format/era abbreviations that bleed into names (Duskull SV, etc.)
      'sv', 'swsh', 'sm', 'xy', 'bw', 'dp', 'ex', 'lv',
      // Condition/type words that bleed into names (Lucky Regular Non-)
      'regular', 'non', 'holo', 'reverse', 'non-holo', 'nonholo',
      // Japanese set names that bleed into English titles
      'white', 'flare', 'burst', 'jet', 'black', 'silver', 'tempest', 'lance', 'wild', 'force',
      // Seller noise
      'seller', 'uk', 'fresh', 'pack',
    ];
    // Filter out filler words and standalone numbers
    const words = workingTitle.split(' ').filter(w => {
      if (w.length <= 1) return false;
      if (fillerWords.includes(w.toLowerCase())) return false;
      // Filter out standalone numbers (like "146", "234") but keep Pokemon names with numbers (Porygon2, Type:Null)
      if (/^\d+$/.test(w)) return false;
      return true;
    });

    if (words.length > 0) {
      // Take first 1-3 words as card name
      const nameParts = words.slice(0, 3);
      matched.push('NAME_EXTRACTED');
      return nameParts.join(' ');
    }

    return null;
  }

  private calculateConfidence(
    cardName: string | null,
    cardNumber: string | null,
    setName: string | null,
    matchedPatterns: string[]
  ): { confidence: ConfidenceLevel; score: number } {
    let score = 0;

    // Card number is most important for API matching
    if (cardNumber) score += 40;

    // Set name helps narrow down the search
    if (setName) score += 30;

    // Card name from known Pokemon list
    if (matchedPatterns.includes('NAME_POKEMON')) score += 25;
    else if (matchedPatterns.includes('NAME_TRAINER')) score += 20;
    else if (cardName) score += 15;

    // Graded cards are more likely to be properly titled
    if (matchedPatterns.includes('GRADED')) score += 10;

    // Variants add confidence
    const variantPatterns = matchedPatterns.filter(p => p.startsWith('VARIANT_'));
    score += Math.min(variantPatterns.length * 3, 10);

    // Determine confidence level
    let confidence: ConfidenceLevel;
    if (score >= 85) confidence = 'PERFECT';
    else if (score >= 70) confidence = 'HIGH';
    else if (score >= 50) confidence = 'MEDIUM';
    else confidence = 'LOW';

    return { confidence, score: Math.min(score, 100) };
  }

  private createResult(
    originalTitle: string,
    normalizedTitle: string,
    data: Partial<ParsedTitle>
  ): ParsedTitle {
    return {
      originalTitle,
      normalizedTitle,
      cardName: data.cardName || null,
      cardNumber: data.cardNumber || null,
      printedNumber: data.printedNumber || null,
      setName: data.setName || null,
      setCode: data.setCode || null,
      condition: data.condition || null,
      isGraded: data.isGraded || false,
      gradingCompany: data.gradingCompany || null,
      grade: data.grade || null,
      gradeModifier: data.gradeModifier || null,
      variant: data.variant || {
        isHolo: false,
        isReverseHolo: false,
        isFullArt: false,
        isAltArt: false,
        isPromo: false,
        isSecret: false,
        isRainbow: false,
        isGold: false,
        variantName: null,
      },
      language: data.language || 'English',
      languageCode: data.languageCode || 'EN',
      isFirstEdition: data.isFirstEdition || false,
      isShadowless: data.isShadowless || false,
      cardType: data.cardType || null,
      confidence: data.confidence || 'LOW',
      confidenceScore: data.confidenceScore || 0,
      matchedPatterns: data.matchedPatterns || [],
      warnings: data.warnings || [],
    };
  }
}

export const titleParser = new TitleParser();