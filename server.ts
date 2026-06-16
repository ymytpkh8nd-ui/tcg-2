import express from "express";
import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import https from "https";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATABASE_FILE = "pokemon_cards.db";

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Initialize Database connection as a reassignable let variable
let db = new sqlite3.Database(DATABASE_FILE, (err) => {
  if (err) {
    console.error("Failed to connect to SQLite pokemon_cards.db", err);
  } else {
    try {
      db.configure("busyTimeout", 30000);
    } catch (e) {
      console.warn("Failed to set busyTimeout on database startup", e);
    }
    console.log("Connected to SQLite pokemon_cards.db successfully");
    initializeAndBootstrap();
  }
});

async function initializeAndBootstrap() {
  try {
    // 1. Force WAL mode on connection
    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run("PRAGMA journal_mode=WAL;", (err) => {
          if (err) return reject(err);
        });
        db.run("PRAGMA synchronous=NORMAL;", (err) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });

    // 2. Perform bootstrapping
    await bootstrapDatabase();
    await bootstrapPokemonSpecies();
    await loadSpeciesTranslationCache();

    // 3. Post-boot check: Automatic background seed if database is empty of Pokemon cards
    db.get("SELECT COUNT(*) as count FROM cards WHERE game = 'pokemon'", [], (err, row: any) => {
      if (!err && row && row.count === 0) {
        console.log("Database cards is empty. Launching background Python seed...");
        const seeder = spawn("python3", ["main.py", "import", "--sets-count", "1"], {
          env: { ...process.env, PYTHONUNBUFFERED: "1" }
        });
        seeder.stdout.on("data", (data) => console.log(`[SEED] ${data.toString().trim()}`));
        seeder.stderr.on("data", (data) => console.warn(`[SEED WARN] ${data.toString().trim()}`));
        seeder.on("close", (code) => {
          console.log(`[SEED] Seeder completed with code ${code}`);
        });
      }
    });

  } catch (bootErr: any) {
    console.error("CRITICAL error during SQLite initialization:", bootErr);
    const errStr = String(bootErr.message || bootErr).toLowerCase();
    if (errStr.includes("corrupt") || errStr.includes("malformed") || errStr.includes("disk image")) {
      console.warn("Corrupted database detected on startup. Recreating a fresh database...");
      try {
        await forceRecreateDatabase();
        console.log("Database successfully reconstructed after corruption.");
      } catch (recreateErr) {
        console.error("Failed to automatically recreate database after corruption:", recreateErr);
      }
    }
  }
}

// Helper function to force-recreate the SQLite database file upon reset request or disk corruption
async function forceRecreateDatabase(skipOnePieceSeed = false): Promise<void> {
  console.log("Recreating database: Dropping all known tables first to guarantee a clean slate...");
  const tables = ["cards", "sets", "reseller_evaluations", "reseller_set_evaluations", "reseller_inventory", "reseller_favorites", "market_prices", "pokemon_species"];
  for (const table of tables) {
    try {
      await dbRun(`DROP TABLE IF EXISTS ${table};`, []);
      console.log(`Successfully dropped table: ${table}`);
    } catch (dropErr) {
      console.error(`Failed to drop table ${table} during reset:`, dropErr);
    }
  }

  return new Promise<void>((resolve, reject) => {
    console.log("Closing existing database connection and deleting database file...");
    db.close((err) => {
      if (err) {
        console.warn("Soft warning during old database connection close:", err);
      }
      try {
        if (fs.existsSync(DATABASE_FILE)) {
          fs.unlinkSync(DATABASE_FILE);
          console.log("Successfully unlinked corrupted or old SQLite file:", DATABASE_FILE);
        }
      } catch (unlinkErr) {
        console.log("Unlinking SQLite file skipped (falling back to simple table recreation):", unlinkErr);
      }

      db = new sqlite3.Database(DATABASE_FILE, async (newErr) => {
        if (newErr) {
          console.error("Failed to establish new SQLite connection after unlinking", newErr);
          reject(newErr);
        } else {
          try {
            db.configure("busyTimeout", 30000);
          } catch (e) {}
          console.log("Re-opened SQLite database connection.");
          db.serialize(() => {
            db.run("PRAGMA journal_mode=WAL;");
            db.run("PRAGMA synchronous=NORMAL;");
          });
          try {
            await bootstrapDatabase(skipOnePieceSeed);
            await bootstrapPokemonSpecies();
            resolve();
          } catch (bootErr) {
            console.error("Failed to bootstrap new database tables:", bootErr);
            reject(bootErr);
          }
        }
      });
    });
  });
}

// Cloud-KI wurde aus der App entfernt.
// Scanner, reseller and trend decisions are now local deterministic logic.
let skipOnlineTranslation = true;
async function callRemovedOnlineAi(_aiParams: any): Promise<any> {
  throw new Error("Cloud-KI wurde aus dieser App entfernt. Nutze den lokalen OCR-/Datenbank-Scanner.");
}

// Helper function to execute async DB queries
const dbGet = (sql: string, params: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql: string, params: any[]): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const dbRun = (sql: string, params: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

interface SetTranslation {
  DE?: string;
  EN?: string;
}
const setTranslationCache: Record<string, SetTranslation> = {};

const set_translation_static: Record<string, SetTranslation> = {
  // Scarlet & Violet era
  "SV8A": { EN: "Terastal Fest ex", DE: "Terastal Fest ex" },
  "SV8": { EN: "Supercharged Breaker", DE: "Stürmische Funken" },
  "SV7A": { EN: "Paradise Dragona", DE: "Paradies-Dragoran" },
  "SV7": { EN: "Stellar Crown / Stellar Miracle", DE: "Stellarkrone" },
  "SV6A": { EN: "Night Wanderer", DE: "Nachtwanderer" },
  "SV6": { EN: "Twilight Masquerade / Mask of Change", DE: "Maskerade im Zwielicht" },
  "SV5A": { EN: "Crimson Haze", DE: "Crimson Haze" },
  "SV5K": { EN: "Wild Force", DE: "Gewalten der Zeit (Wild Force)" },
  "SV5M": { EN: "Cyber Judge", DE: "Gewalten der Zeit (Cyber Judge)" },
  "SV4A": { EN: "Shiny Treasure ex", DE: "Paldeas Schicksale" },
  "SV4K": { EN: "Ancient Roar", DE: "Brüllen der Vergangenheit" },
  "SV4M": { EN: "Future Flash", DE: "Eisenhaupt der Zukunft" },
  "SV3A": { EN: "Raging Surf", DE: "Raging Surf" },
  "SV3": { EN: "Ruler of the Black Flame", DE: "Obsidianflammen" },
  "SV2A": { EN: "Pokémon Card 151", DE: "Karmesin & Purpur - 151" },
  "SV2D": { EN: "Snow Hazard", DE: "Schneebedeckte Gefahr" },
  "SV2P": { EN: "Clay Burst", DE: "Lehm-Ausbruch" },
  "SV1A": { EN: "Triplet Beat", DE: "Triplet Beat" },
  "SV1S": { EN: "Scarlet ex", DE: "Karmesin ex" },
  "SV1V": { EN: "Violet ex", DE: "Purpur ex" },
  "SVP": { EN: "Scarlet & Violet Promos", DE: "Karmesin & Purpur Promos" },
  "SV-P": { EN: "Scarlet & Violet Promos", DE: "Karmesin & Purpur Promos" },

  // Sword & Shield era
  "S12A": { EN: "VSTAR Universe", DE: "Zenit der Könige / VSTAR Universum" },
  "S12": { EN: "Paradigm Trigger", DE: "Silberne Sturmwinde / Paradigm Trigger" },
  "S11A": { EN: "Incandescent Arcana", DE: "Incandescent Arcana" },
  "S11": { EN: "Lost Abyss", DE: "Verlorener Abgrund" },
  "S10A": { EN: "Pokémon GO", DE: "Pokémon GO" },
  "S10D": { EN: "Time Gazer", DE: "Astralglanz (Time Gazer)" },
  "S10P": { EN: "Space Juggler", DE: "Astralglanz (Space Juggler)" },
  "S9A": { EN: "Battle Region", DE: "Kampfregion" },
  "S9": { EN: "Star Birth", DE: "Strahlende Sterne / Star Birth" },
  "S8B": { EN: "VMAX Climax", DE: "VMAX Climax" },
  "S8": { EN: "Fusion Arts", DE: "Fusionsangriff / Fusion Arts" },
  "S7R": { EN: "Blue Sky Stream", DE: "Drachenwandel (Blue Sky Stream)" },
  "S7D": { EN: "Towering Perfection", DE: "Drachenwandel (Towering Perfection)" },
  "S6A": { EN: "Eevee Heroes", DE: "Evoli-Helden" },
  "S6H": { EN: "Silver Lance", DE: "Schaurige Herrschaft (Silver Lance)" },
  "S6K": { EN: "Jet-Black Spirit", DE: "Schaurige Herrschaft (Jet-Black Spirit)" },
  "S5A": { EN: "Matchless Fighters", DE: "Kampfstile (Matchless Fighters)" },
  "S5R": { EN: "Rapid Strike Master", DE: "Kampfstile (Rapid Strike Master)" },
  "S5I": { EN: "Single Strike Master", DE: "Kampfstile (Single Strike Master)" },
  "S4A": { EN: "Shiny Star V", DE: "Glänzendes Schicksal / Shiny Star V" },
  "S3A": { EN: "Legendary Heartbeat", DE: "Legendäre Schläge" },
  "S3": { EN: "Infinity Zone", DE: "Flammende Finsternis / Infinity Zone" },
  "S2": { EN: "Rebel Clash", DE: "Rebellen in Aufruhr" },
  "S1W": { EN: "Sword", DE: "Schwet & Schild (Sword)" },
  "S1H": { EN: "Shield", DE: "Schwert & Schild (Shield)" },
  "SP": { EN: "Sword & Shield Promos", DE: "Schwert & Schild Promos" },
  "S-P": { EN: "Sword & Shield Promos", DE: "Schwert & Schild Promos" }
};

async function loadSetTranslations() {
  try {
    // 1. Initialise from static configurations
    for (const [code, trans] of Object.entries(set_translation_static)) {
      setTranslationCache[code.toUpperCase()] = { ...trans };
    }

    // 2. Load and merge from sets table
    const rows = await dbAll("SELECT set_code, set_name, language, english_set_name, german_set_name FROM sets", []);
    for (const row of rows) {
      if (!row.set_code) continue;
      const code = row.set_code.toUpperCase();
      const lang = row.language.toUpperCase();
      if (!setTranslationCache[code]) {
        setTranslationCache[code] = {};
      }
      if (row.english_set_name) {
        setTranslationCache[code].EN = row.english_set_name;
      }
      if (row.german_set_name) {
        setTranslationCache[code].DE = row.german_set_name;
      }
      if (lang === "DE") {
        if (!setTranslationCache[code].DE) setTranslationCache[code].DE = row.set_name;
      } else if (lang === "EN") {
        if (!setTranslationCache[code].EN) setTranslationCache[code].EN = row.set_name;
      }
    }
    console.log(`Loaded ${Object.keys(setTranslationCache).length} set translations into cache.`);
  } catch (err) {
    console.warn("Failed to load set translations cache:", err);
  }
}

const speciesTranslationCache: Record<string, { en: string; de: string }> = {};

async function loadSpeciesTranslationCache() {
  try {
    const rows = await dbAll("SELECT english_name, german_name, japanese_name FROM pokemon_species", []);
    for (const row of rows) {
      if (!row) continue;
      const en = (row.english_name || "").trim();
      const de = (row.german_name || "").trim();
      const ja = (row.japanese_name || "").trim();
      if (ja) {
        speciesTranslationCache[ja] = { en, de: de || en };
      }
      if (en) {
        speciesTranslationCache[en.toLowerCase()] = { en, de: de || en };
      }
      if (de) {
        speciesTranslationCache[de.toLowerCase()] = { en, de: de || en };
      }
    }
    console.log(`Loaded ${Object.keys(speciesTranslationCache).length} species entries into the fast-translation cache.`);
  } catch (err) {
    console.warn("Failed to load species translation cache:", err);
  }
}

function translateCardNameUsingCache(name: string): { english: string; german: string } {
  if (!name) return { english: name, german: name };
  
  const cleanName = name.trim();
  const directMatch = speciesTranslationCache[cleanName] || ja_to_bilingual_static[cleanName];
  if (directMatch) {
    return { english: directMatch.en || directMatch.en, german: directMatch.de || directMatch.en };
  }
  
  let baseName = cleanName;
  let prefix = "";
  let suffix = "";
  
  if (baseName.startsWith("Nの")) {
    prefix = "N's ";
    baseName = baseName.slice(3).trim();
  }
  
  const suffixMatch = baseName.match(/^(.*?)\s*\b(ex|vmax|vstar|v|gx|star)\b\s*$/i);
  if (suffixMatch) {
    baseName = suffixMatch[1].trim();
    suffix = formatCardSuffix(suffixMatch[2]);
  }
  
  const baseMatch = speciesTranslationCache[baseName] || ja_to_bilingual_static[baseName];
  if (baseMatch) {
    return {
      english: prefix + baseMatch.en + suffix,
      german: prefix + (baseMatch.de || baseMatch.en) + suffix
    };
  }
  
  // Substring fallback
  for (const [jaKey, val] of Object.entries(speciesTranslationCache)) {
    const isJapaneseKey = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(jaKey);
    if (isJapaneseKey && cleanName.includes(jaKey)) {
      return {
        english: replaceJapaneseNameWithSuffix(cleanName, jaKey, val.en),
        german: replaceJapaneseNameWithSuffix(cleanName, jaKey, val.de || val.en)
      };
    }
  }

  for (const [jaKey, val] of Object.entries(ja_to_bilingual_static)) {
    if (cleanName.includes(jaKey)) {
      return {
        english: replaceJapaneseNameWithSuffix(cleanName, jaKey, val.en),
        german: replaceJapaneseNameWithSuffix(cleanName, jaKey, val.de || val.en)
      };
    }
  }

  return translateJapaneseBilingualStatic(name);
}

function formatCardSuffix(rawSuffix: string): string {
  const lower = String(rawSuffix || "").toLowerCase();
  if (lower === "ex") return " ex";
  if (lower === "v") return " V";
  if (lower === "vmax") return " VMAX";
  if (lower === "vstar") return " VSTAR";
  if (lower === "gx") return " GX";
  if (lower === "star") return " Star";
  return rawSuffix ? ` ${rawSuffix}` : "";
}

function replaceJapaneseNameWithSuffix(fullName: string, jaKey: string, translated: string): string {
  const idx = fullName.indexOf(jaKey);
  if (idx === -1) return fullName;
  const before = fullName.slice(0, idx);
  const after = fullName.slice(idx + jaKey.length);
  const suffixMatch = after.match(/^\s*(ex|vmax|vstar|gx|star|v)(.*)$/i);
  if (suffixMatch) {
    return `${before}${translated}${formatCardSuffix(suffixMatch[1])}${suffixMatch[2] || ""}`.trim();
  }
  return `${before}${translated}${after}`.trim();
}

const ja_to_bilingual_static: Record<string, { en: string; de: string }> = {
  "ピカチュウ": { en: "Pikachu", de: "Pikachu" },
  "リザードン": { en: "Charizard", de: "Glurak" },
  "カメックス": { en: "Blastoise", de: "Turtok" },
  "フシギバナ": { en: "Venusaur", de: "Bisaflor" },
  "ミュウツー": { en: "Mewtwo", de: "Mewtu" },
  "ミュウ": { en: "Mew", de: "Mew" },
  "イーブイ": { en: "Eevee", de: "Evoli" },
  "ルカリオ": { en: "Lucario", de: "Lucario" },
  "ゲンガー": { en: "Gengar", de: "Gengar" },
  "ルギア": { en: "Lugia", de: "Lugia" },
  "レックウザ": { en: "Rayquaza", de: "Rayquaza" },
  "ギャラドス": { en: "Gyarados", de: "Garados" },
  "カビゴン": { en: "Snorlax", de: "Relaxo" },
  "フシギダネ": { en: "Bulbasaur", de: "Bisasam" },
  "ヒトカゲ": { en: "Charmander", de: "Glumanda" },
  "ゼニガメ": { en: "Squirtle", de: "Schiggy" },
  "ゲッコウガ": { en: "Greninja", de: "Quajutsu" },
  "ミミッキュ": { en: "Mimikyu", de: "Mimigma" },
  "カイリュー": { en: "Dragonite", de: "Dragoran" },
  "アルセウス": { en: "Arceus", de: "Arceus" },
  "サーナイト": { en: "Gardevoir", de: "Guardevoir" },
  "ガブリアス": { en: "Garchomp", de: "Knakrack" },
  "ハッサム": { en: "Scizor", de: "Scherox" },
  "ブラッキー": { en: "Umbreon", de: "Nachtara" },
  "エーフィ": { en: "Espeon", de: "Psiana" },
  "ニンフィア": { en: "Sylveon", de: "Feelinara" },
  "サンダース": { en: "Jolteon", de: "Blitza" },
  "ブースター": { en: "Flareon", de: "Flamara" },
  "シャワーズ": { en: "Vaporeon", de: "Aquana" },
  "リーフィア": { en: "Leafeon", de: "Folipurba" },
  "グレイシア": { en: "Glaceon", de: "Glaziola" },
  "カイリキー": { en: "Machamp", de: "Machomei" },
  "フーディン": { en: "Alakazam", de: "Simsala" },
  "ラプラス": { en: "Lapras", de: "Lapras" },
  "バンギラス": { en: "Tyranitar", de: "Despotar" },
  "ボーマンダ": { en: "Salamence", de: "Brutalanda" },
  "メタグロス": { en: "Metagross", de: "Metagross" },
  "ダークライ": { en: "Darkrai", de: "Darkrai" },
  "ディアルガ": { en: "Dialga", de: "Dialga" },
  "パルキア": { en: "Palkia", de: "Palkia" },
  "ギラティナ": { en: "Giratina", de: "Giratina" },
  "ゾロア": { en: "Zorua", de: "Zorua" },
  "ゾロアーク": { en: "Zoroark", de: "Zoroark" },
  "レシラム": { en: "Reshiram", de: "Reshiram" },
  "ゼクロム": { en: "Zekrom", de: "Zekrom" },
  "キュレム": { en: "Kyurem", de: "Kyurem" },
  "ゼルネアス": { en: "Xerneas", de: "Xerneas" },
  "イベルタル": { en: "Yveltal", de: "Yveltal" },
  "ソルガレオ": { en: "Solgaleo", de: "Solgaleo" },
  "ルナアーラ": { en: "Lunala", de: "Lunala" },
  "ザシアン": { en: "Zacian", de: "Zacian" },
  "ザマゼンタ": { en: "Zamazenta", de: "Zamazenta" },
  "ゴンベ": { en: "Munchlax", de: "Mampfax" },
  "トゲピー": { en: "Togepi", de: "Togepi" },
  "コダック": { en: "Psyduck", de: "Enton" },
  "ニャース": { en: "Meowth", de: "Mauzi" },
  "コライドン": { en: "Koraidon", de: "Koraidon" },
  "ミライドン": { en: "Miraidon", de: "Miraidon" },
  "トドロクツキ": { en: "Roaring Moon", de: "Donnersichel" },
  "テツノブジン": { en: "Iron Valiant", de: "Eisenkrieger" },
  "テツノドクガ": { en: "Iron Moth", de: "Eisenfalter" },
  "ハバタクカミ": { en: "Flutter Mane", de: "Flatterhaar" },
  "オーガポン": { en: "Ogerpon", de: "Ogerpon" },
  
  // Expanded for missing entries in Johto, Hoenn, Sinnoh, Kanto & Paldea
  "クヌギダマ": { en: "Pineco", de: "Tannza" },
  "サナギラス": { en: "Pupitar", de: "Pupitar" },
  "ヨーギラス": { en: "Larvitar", de: "Larvitar" },
  "キャタピー": { en: "Caterpie", de: "Raupy" },
  "トランセル": { en: "Metapod", de: "Safcon" },
  "バタフリー": { en: "Butterfree", de: "Smettbo" },
  "パラス": { en: "Paras", de: "Paras" },
  "パラセクト": { en: "Parasect", de: "Parasek" },
  "チョボマキ": { en: "Shelmet", de: "Schnuthelm" },
  "カブルモ": { en: "Karrablast", de: "Laukaps" },
  "アギルダー": { en: "Accelgor", de: "Hydragil" },
  "ニャオハ": { en: "Sprigatito", de: "Felori" },
  "ニャローテ": { en: "Floragato", de: "Floragato" },
  "マスカーニャ": { en: "Meowscarada", de: "Maskagato" },
  "ブーバー": { en: "Magmar", de: "Magmar" },
  "ブーバーン": { en: "Magmortar", de: "Magbrant" },
  "ダルマッカ": { en: "Darumaka", de: "Flampion" },
  "ヒヒダルマ": { en: "Darmanitan", de: "Flampivian" },
  "ボルケニオン": { en: "Volcanion", de: "Volcanion" },
  "フリーザー": { en: "Articuno", de: "Arktos" },
  "テッポウオ": { en: "Remoraid", de: "Remoraid" },
  "オクタン": { en: "Octillery", de: "Octillery" },
  "ヤドン": { en: "Slowpoke", de: "Flegmon" },
  "カイロス": { en: "Pinsir", de: "Pinsir" },
  "マラカッチ": { en: "Maractus", de: "Maracamba" }
};

function translateJapaneseBilingualStatic(jaName: string): { english: string; german: string } {
  const cleaned = jaName.split("-")[0].trim();
  const match = ja_to_bilingual_static[cleaned];
  if (match) {
    return {
      english: replaceJapaneseNameWithSuffix(jaName, cleaned, match.en),
      german: replaceJapaneseNameWithSuffix(jaName, cleaned, match.de)
    };
  }
  for (const [jaKey, val] of Object.entries(ja_to_bilingual_static)) {
    if (jaName.includes(jaKey)) {
      return {
        english: replaceJapaneseNameWithSuffix(jaName, jaKey, val.en),
        german: replaceJapaneseNameWithSuffix(jaName, jaKey, val.de)
      };
    }
  }
  return {
    english: jaName,
    german: jaName
  };
}

async function healJapaneseCardNames() {
  try {
    const cards = await dbAll("SELECT id, api_card_id, local_name, english_name, pokemon_name, set_code FROM cards WHERE language = 'JA' AND game = 'pokemon'", []) as any[];
    if (cards.length === 0) return;
    
    console.log(`Checking ${cards.length} Japanese cards for name translation healing...`);
    const jaRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;
    
    const cardsToTranslate: any[] = [];
    for (const card of cards) {
      let engNeeds = jaRegex.test(card.english_name || "") || !card.english_name || card.english_name === card.local_name;
      let gerNeeds = jaRegex.test(card.pokemon_name || "") || !card.pokemon_name || card.pokemon_name === card.local_name;
      
      // Smart static mismatch detector to capture mismatched third-party index offsets
      if (!engNeeds && card.local_name && card.english_name) {
        for (const [jaKey, val] of Object.entries(ja_to_bilingual_static)) {
          if (card.local_name.includes(jaKey)) {
            const expected = val.en.toLowerCase();
            const actual = card.english_name.toLowerCase();
            if (!actual.includes(expected)) {
              console.log(`[Validation Check] Static name mismatch found on ${card.api_card_id}: "${card.local_name}" (expected contains "${val.en}") vs English Name: "${card.english_name}". Forcing healer correction!`);
              engNeeds = true;
              break;
            }
          }
        }
      }

      if (engNeeds || gerNeeds) {
        cardsToTranslate.push(card);
      }
    }

    if (cardsToTranslate.length === 0) {
      console.log("No Japanese cards require name healing.");
      return;
    }

    if (skipOnlineTranslation) {
      console.log("Online-Übersetzung ist deaktiviert. Nutze statische Offline-Übersetzungen für japanische Karten.");
      await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
      try {
        for (const card of cardsToTranslate) {
          const mapped = translateJapaneseBilingualStatic(card.local_name);
          if (mapped.english !== card.local_name || mapped.german !== card.local_name) {
            await dbRun("UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?", [mapped.english, mapped.german, card.id]);
          }
        }
        await dbRun("COMMIT;", []);
        console.log("-> Successfully completed offline batch card translations.");
      } catch (trErr) {
        await dbRun("ROLLBACK;", []).catch(() => {});
        console.error("Failed to run offline translation transaction:", trErr);
      }
      return;
    }

    console.log(`Found ${cardsToTranslate.length} Japanese cards that need translation. starting static/local batch fallback...`);
    
    // Translating in batches of 15 cards per request.
    const batchSize = 15;
    let healedCount = 0;
    
    // We will translate max 8 batches (120 cards) per restart run to keep boot snappy.
    // A pacing delay of 12 seconds between batches ensures we NEVER hit the 5 RPM rate limit.
    const maxBatches = 8; 
    let batchCount = 0;

    for (let i = 0; i < cardsToTranslate.length && batchCount < maxBatches; i += batchSize) {
      if (skipOnlineTranslation) {
        console.log("Online-Übersetzung deaktiviert. Weiter mit statischem Offline-Fallback...");
        const remaining = cardsToTranslate.slice(i);
        await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
        try {
          for (const card of remaining) {
            const mapped = translateJapaneseBilingualStatic(card.local_name);
            if (mapped.english !== card.local_name || mapped.german !== card.local_name) {
              await dbRun("UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?", [mapped.english, mapped.german, card.id]);
            }
          }
          await dbRun("COMMIT;", []);
        } catch (trErr) {
          await dbRun("ROLLBACK;", []).catch(() => {});
        }
        break;
      }

      const batch = cardsToTranslate.slice(i, i + batchSize);
      batchCount++;
      console.log(`Translating batch ${batchCount} of cards (${batch.length} cards)...`);
      
      try {
        const response = await callRemovedOnlineAi({
          model: "gemini-3.5-flash",
          contents: `You are an expert Pokémon TCG cataloger. I have a batch of Japanese Pokémon cards. Please translate their Japanese names to official English and German Pokémon names.
Input list of cards:
${batch.map(c => `- ID: ${c.id} | ApiCardId: ${c.api_card_id} | Name: ${c.local_name} (Set: ${c.set_code})`).join("\n")}

Respond ONLY with a JSON array of objects representing the translations. Do not wrap in markdown \`\`\`json blocks.
Format exactly as:
[
  {"id": 123, "english": "Pikachu", "german": "Pikachu"}
]`,
          config: {
            responseMimeType: "application/json"
          }
        });

        const text = (response.text || "").trim();
        const cleanText = text.replace(/^```json/, "").replace(/```$/, "").trim();
        const list = JSON.parse(cleanText);
        
        if (Array.isArray(list)) {
          await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
          try {
            for (const item of list) {
              const target = batch.find(c => c.id === Number(item.id));
              if (target && item.english && item.german) {
                const cleanEng = item.english.trim();
                const cleanGer = item.german.trim();
                await dbRun("UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?", [cleanEng, cleanGer, target.id]);
                healedCount++;
              }
            }
            await dbRun("COMMIT;", []);
          } catch (trErr) {
            await dbRun("ROLLBACK;", []).catch(() => {});
            throw trErr;
          }
          console.log(`-> Successfully updated ${list.length} cards from batch.`);
        }
      } catch (err) {
        console.warn(`Failed to translate batch ${batchCount} of cards with online translation (falling back to static offline mapping database):`, err);
        // Fallback to static mapping for this batch
        await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
        try {
          for (const card of batch) {
            const mapped = translateJapaneseBilingualStatic(card.local_name);
            if (mapped.english !== card.local_name || mapped.german !== card.local_name) {
              await dbRun("UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?", [mapped.english, mapped.german, card.id]);
              healedCount++;
            }
          }
          await dbRun("COMMIT;", []);
        } catch (trErr) {
          await dbRun("ROLLBACK;", []).catch(() => {});
        }
      }

      // Pacing delay of 12 seconds between batches to completely respect the 5 RPM rate limit
      if (i + batchSize < cardsToTranslate.length && batchCount < maxBatches) {
        console.log("Skipping online delay; static translation mode is active.");
        await new Promise(r => setTimeout(r, 12000));
      }
    }
    
    if (healedCount > 0) {
      console.log(`Successfully healed ${healedCount} Japanese card names inside SQLite.`);
    }
  } catch (err) {
    console.warn("Failed to heal Japanese card names in background:", err);
  }
}

async function healExistingCardsRaritiesAndEnglishNames() {
  try {
    // Select cards that are Japanese but have 'none'/'null'/empty rarity
    const cards = await dbAll(`
      SELECT id, api_card_id, local_name, english_name, rarity 
      FROM cards 
      WHERE language = 'JA' 
        AND game = 'pokemon'
        AND (
          rarity IS NULL 
          OR LOWER(rarity) IN ('none', 'null', '')
        )
      LIMIT 150
    `, []) as any[];

    if (cards.length === 0) {
      console.log("No Japanese cards require TCGdex live-enrichment.");
      return;
    }

    console.log(`Starting TCGdex background enrichment for ${cards.length} Japanese cards...`);
    let updatedCount = 0;

    for (const card of cards) {
      try {
        const url = `https://api.tcgdex.net/v2/en/cards/${card.api_card_id}`;
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }
        const data = await response.json() as any;
        if (data) {
          let updatedFields: string[] = [];
          let updatedParams: any[] = [];

          // 1. Recover true English Rarity (We do NOT recover English Name from TCGdex due to language offset mismatches)
          const rawRar = data.rarity || "";
          if (rawRar) {
            // Check if we can map it to our clean names
            const cleanRar = rawRar.trim();
            let finalRar = cleanRar;
            const rLower = cleanRar.toLowerCase();
            if (rLower === "common" || rLower === "c") finalRar = "Common";
            else if (rLower === "uncommon" || rLower === "u") finalRar = "Uncommon";
            else if (rLower === "rare" || rLower === "r") finalRar = "Rare";
            else if (rLower.includes("holo")) finalRar = "Rare Holo";
            else if (rLower.includes("ultra") || rLower === "sr") finalRar = "Ultra Rare";
            else if (rLower.includes("secret") || rLower === "secret rare") finalRar = "Secret Rare";
            else if (rLower.includes("special illustration") || rLower === "sar") finalRar = "Special Illustration Rare";
            else if (rLower.includes("illustration") || rLower === "ar") finalRar = "Illustration Rare";
            else if (rLower.includes("double") || rLower === "rr") finalRar = "Double Rare";
            else if (rLower.includes("hyper") || rLower === "ur") finalRar = "Hyper Rare";

            updatedFields.push("rarity = ?");
            updatedParams.push(finalRar);
          }

          if (updatedFields.length > 0) {
            updatedParams.push(card.id);
            await dbRun(
              `UPDATE cards SET ${updatedFields.join(", ")} WHERE id = ?`,
              updatedParams
            );
            updatedCount++;
          }
        }
        // Small pacing delay of 100ms
        await new Promise(r => setTimeout(r, 100));
      } catch (innerErr) {
        // Fail silently
      }
    }

    if (updatedCount > 0) {
      console.log(`-> Successfully enriched ${updatedCount} Japanese cards with accurate TCGdex rarities.`);
    }
  } catch (err) {
    console.warn("Error running TCGdex background healer:", err);
  }
}

async function healJapaneseSetNames() {
  try {
    const sets = await dbAll("SELECT id, set_code, set_name, language, english_set_name, german_set_name FROM sets WHERE game = 'pokemon'", []) as any[];
    if (sets.length === 0) return;
    
    console.log(`Checking ${sets.length} sets for name translation healing...`);
    let healedSetCount = 0;
    const jaRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/;
    
    const setsToTranslate: any[] = [];
    
    await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
    try {
      for (const set of sets) {
        const isJa = set.language?.toUpperCase() === "JA";
        let englishSetName = set.english_set_name || "";
        let germanSetName = set.german_set_name || "";
        
        const translation = setTranslationCache[set.set_code.toUpperCase()];
        if (translation) {
          if (!englishSetName) englishSetName = translation.EN || "";
          if (!germanSetName) germanSetName = translation.DE || "";
        }
        
        const needsAITranslate = !englishSetName || !germanSetName || jaRegex.test(englishSetName) || jaRegex.test(germanSetName) || englishSetName === set.set_name;
        
        if (isJa && needsAITranslate) {
          setsToTranslate.push(set);
        } else {
          const targetEnglish = englishSetName || set.set_name;
          const targetGerman = germanSetName || set.set_name;
          if (set.english_set_name !== targetEnglish || set.german_set_name !== targetGerman) {
            await dbRun("UPDATE sets SET english_set_name = ?, german_set_name = ? WHERE id = ?", [targetEnglish, targetGerman, set.id]);
          }
        }
      }
      await dbRun("COMMIT;", []);
    } catch (trErr) {
      await dbRun("ROLLBACK;", []).catch(() => {});
      throw trErr;
    }

    if (setsToTranslate.length > 0) {
      if (skipOnlineTranslation) {
        console.log("Online-Übersetzung deaktiviert. Set-Übersetzung nutzt statische Codes.");
        await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
        try {
          for (const set of setsToTranslate) {
            let englishSetName = set.set_name;
            let germanSetName = set.set_name;
            const translation = setTranslationCache[set.set_code.toUpperCase()];
            if (translation) {
              englishSetName = translation.EN || set.set_name;
              germanSetName = translation.DE || set.set_name;
            }
            if (set.english_set_name !== englishSetName || set.german_set_name !== germanSetName) {
              await dbRun("UPDATE sets SET english_set_name = ?, german_set_name = ? WHERE id = ?", [englishSetName, germanSetName, set.id]);
            }
          }
          await dbRun("COMMIT;", []);
        } catch (trErr) {
          await dbRun("ROLLBACK;", []).catch(() => {});
        }
        return;
      }

      console.log(`Pacing batch translation of ${setsToTranslate.length} Japanese sets using static/local fallback...`);
      // Translate in batches of 8
      const batchSize = 8;
      for (let i = 0; i < setsToTranslate.length; i += batchSize) {
        if (skipOnlineTranslation) {
          console.log("Online-Übersetzung deaktiviert. Überspringe restliche Online-Set-Übersetzungen.");
          break;
        }

        const batch = setsToTranslate.slice(i, i + batchSize);
        try {
          const response = await callRemovedOnlineAi({
            model: "gemini-3.5-flash",
            contents: `You are an expert Pokémon TCG cataloger. I have a batch of Japanese Pokémon set lists that need their official/standardized English and German set titles.
Input list of sets:
${batch.map(s => `- ID: ${s.id} | Code: ${s.set_code} | Japanese Set Name: ${s.set_name}`).join("\n")}

Respond ONLY with a JSON array of objects representing the translations. Do not wrap in markdown \`\`\`json blocks.
Format exactly as:
[
  {"id": 1, "english": "Shiny Treasure ex", "german": "Paldeas Schicksale"}
]`,
            config: {
              responseMimeType: "application/json"
            }
          });
          const text = (response.text || "").trim();
          const cleanText = text.replace(/^```json/, "").replace(/```$/, "").trim();
          const list = JSON.parse(cleanText);
          if (Array.isArray(list)) {
            await dbRun("BEGIN IMMEDIATE TRANSACTION;", []);
            try {
              for (const item of list) {
                const target = batch.find(s => s.id === Number(item.id));
                if (target && item.english && item.german) {
                  await dbRun("UPDATE sets SET english_set_name = ?, german_set_name = ? WHERE id = ?", [item.english.trim(), item.german.trim(), target.id]);
                  healedSetCount++;
                  console.log(`-> Set translated [${target.set_code}]: Eng="${item.english.trim()}", Ger="${item.german.trim()}"`);
                }
              }
              await dbRun("COMMIT;", []);
            } catch (trErr) {
              await dbRun("ROLLBACK;", []).catch(() => {});
              throw trErr;
            }
          }
        } catch (err) {
          console.warn("Failed to translate batch of sets with online translation (falling back to static offline mapping database):", err);
        }
        // Pace to avoid rate limits
        if (i + batchSize < setsToTranslate.length) {
          await new Promise(r => setTimeout(r, 6000));
        }
      }
    }

    if (healedSetCount > 0) {
      console.log(`Successfully healed ${healedSetCount} Japanese set names.`);
      await loadSetTranslations();
    }
  } catch (err) {
    console.warn("Failed to heal Japanese set names in background:", err);
  }
}

function fetchJSONFromUrl(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: Status ${res.statusCode}`));
        return;
      }
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", (err) => reject(err));
  });
}

async function bootstrapPokemonSpecies() {
  try {
    // Create the pokemon_species table inside SQLite
    await dbRun(`
      CREATE TABLE IF NOT EXISTS pokemon_species (
        pokedex_id INTEGER PRIMARY KEY,
        english_name TEXT NOT NULL,
        german_name TEXT NOT NULL,
        japanese_name TEXT NOT NULL
      );
    `, []);

    await dbRun("CREATE INDEX IF NOT EXISTS idx_species_english_name ON pokemon_species(english_name);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_species_german_name ON pokemon_species(german_name);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_species_japanese_name ON pokemon_species(japanese_name);", []);

    // Check if table has data
    const countRow = await dbGet("SELECT COUNT(*) as count FROM pokemon_species", []);
    if (!countRow || countRow.count === 0) {
      console.log("Seeding base pokemon species...");
      const baseSpecies = [
        { id: 1, en: "Bulbasaur", de: "Bisasam", ja: "フシギダネ" },
        { id: 2, en: "Ivysaur", de: "Bisaknosp", ja: "フシギソウ" },
        { id: 3, en: "Venusaur", de: "Bisaflor", ja: "フシギバナ" },
        { id: 4, en: "Charmander", de: "Glumanda", ja: "ヒトカゲ" },
        { id: 5, en: "Charmeleon", de: "Glutexo", ja: "リザード" },
        { id: 6, en: "Charizard", de: "Glurak", ja: "リザードン" },
        { id: 7, en: "Squirtle", de: "Schiggy", ja: "ゼニガメ" },
        { id: 8, en: "Wartortle", de: "Schillok", ja: "カメール" },
        { id: 9, en: "Blastoise", de: "Turtok", ja: "カメックス" },
        { id: 10, en: "Caterpie", de: "Raupy", ja: "キャタピー" },
        { id: 11, en: "Metapod", de: "Safcon", ja: "トランセル" },
        { id: 12, en: "Butterfree", de: "Smettbo", ja: "バタフリー" },
        { id: 13, en: "Weedle", de: "Hornliu", ja: "ビードル" },
        { id: 14, en: "Kakuna", de: "Kokuna", ja: "コクーン" },
        { id: 15, en: "Beedrill", de: "Bibor", ja: "スピアー" },
        { id: 16, en: "Pidgey", de: "Taubsi", ja: "ポッポ" },
        { id: 17, en: "Pidgeotto", de: "Tauboga", ja: "ピジョン" },
        { id: 18, en: "Pidgeot", de: "Tauboss", ja: "ピジョット" },
        { id: 19, en: "Rattata", de: "Rattfratz", ja: "コラッタ" },
        { id: 20, en: "Raticate", de: "Rattikarl", ja: "ラッタ" },
        { id: 21, en: "Spearow", de: "Habitak", ja: "オニスズメ" },
        { id: 22, en: "Fearow", de: "Ibitak", ja: "オニドリル" },
        { id: 23, en: "Ekans", de: "Rettan", ja: "アーボ" },
        { id: 24, en: "Arbok", de: "Arbok", ja: "アーボック" },
        { id: 25, en: "Pikachu", de: "Pikachu", ja: "ピカチュウ" },
        { id: 26, en: "Raichu", de: "Raichu", ja: "ライチュウ" },
        { id: 27, en: "Sandshrew", de: "Sandan", ja: "サンド" },
        { id: 28, en: "Sandslash", de: "Sandamer", ja: "サンドパン" },
        { id: 29, en: "Nidoran♀", de: "Nidoran♀", ja: "ニドラン♀" },
        { id: 30, en: "Nidorina", de: "Nidorina", ja: "ニドリーナ" },
        { id: 31, en: "Nidoqueen", de: "Nidoqueen", ja: "ニドクイン" },
        { id: 32, en: "Nidoran♂", de: "Nidoran♂", ja: "ニドラン♂" },
        { id: 33, en: "Nidorino", de: "Nidorino", ja: "ニドリーノ" },
        { id: 34, en: "Nidoking", de: "Nidoking", ja: "ニドキング" },
        { id: 35, en: "Clefairy", de: "Piepi", ja: "ピッピ" },
        { id: 36, en: "Clefable", de: "Pixi", ja: "ピクシー" },
        { id: 37, en: "Vulpix", de: "Vulpix", ja: "ロコン" },
        { id: 38, en: "Ninetales", de: "Vulnona", ja: "キュウコン" },
        { id: 39, en: "Jigglypuff", de: "Pummeluff", ja: "プリン" },
        { id: 40, en: "Wigglytuff", de: "Knuddeluff", ja: "プクリン" },
        { id: 41, en: "Zubat", de: "Zubat", ja: "ズバット" },
        { id: 42, en: "Golbat", de: "Golbat", ja: "ゴルバット" },
        { id: 43, en: "Oddish", de: "Myrapla", ja: "ナゾノクサ" },
        { id: 44, en: "Gloom", de: "Duflor", ja: "クサイハナ" },
        { id: 45, en: "Vileplume", de: "Gigaflor", ja: "ラフレシア" },
        { id: 46, en: "Paras", de: "Paras", ja: "パラス" },
        { id: 47, en: "Parasect", de: "Parasek", ja: "パラセクト" },
        { id: 48, en: "Venonat", de: "Bluzuk", ja: "コンパン" },
        { id: 49, en: "Venomoth", de: "Omot", ja: "モルフォン" },
        { id: 50, en: "Diglett", de: "Digda", ja: "ディグダ" },
        { id: 51, en: "Dugtrio", de: "Digdri", ja: "ダグトリオ" },
        { id: 52, en: "Meowth", de: "Mauzi", ja: "ニャース" },
        { id: 53, en: "Persian", de: "Snobilikat", ja: "ペルシアン" },
        { id: 54, en: "Psyduck", de: "Enton", ja: "コダック" },
        { id: 55, en: "Golduck", de: "Entoron", ja: "ゴルダック" },
        { id: 56, en: "Mankey", de: "Menki", ja: "マンキー" },
        { id: 57, en: "Primeape", de: "Rasaff", ja: "オコリザル" },
        { id: 58, en: "Growlithe", de: "Fukano", ja: "ガーディ" },
        { id: 59, en: "Arcanine", de: "Arkani", ja: "ウインディ" },
        { id: 60, en: "Poliwag", de: "Quapsel", ja: "ニョロモ" },
        { id: 133, en: "Eevee", de: "Evoli", ja: "イーブイ" },
        { id: 134, en: "Vaporeon", de: "Aquana", ja: "シャワーズ" },
        { id: 135, en: "Jolteon", de: "Blitza", ja: "サンダース" },
        { id: 136, en: "Flareon", de: "Flamara", ja: "ブースター" },
        { id: 143, en: "Snorlax", de: "Relaxo", ja: "カビゴン" },
        { id: 144, en: "Articuno", de: "Arktos", ja: "フリーザー" },
        { id: 145, en: "Zapdos", de: "Zapdos", ja: "サンダー" },
        { id: 146, en: "Moltres", de: "Lavados", ja: "ファイヤー" },
        { id: 147, en: "Dratini", de: "Dratini", ja: "ミニリュウ" },
        { id: 148, en: "Dragonair", de: "Dragonir", ja: "ハクリュー" },
        { id: 149, en: "Dragonite", de: "Dragoran", ja: "カイリュー" },
        { id: 150, en: "Mewtwo", de: "Mewtu", ja: "ミュウツー" },
        { id: 151, en: "Mew", de: "Mew", ja: "ミュウ" }
      ];
      
      await dbRun("BEGIN TRANSACTION;", []);
      for (const sp of baseSpecies) {
        await dbRun(
          "INSERT OR IGNORE INTO pokemon_species (pokedex_id, english_name, german_name, japanese_name) VALUES (?, ?, ?, ?)",
          [sp.id, sp.en, sp.de, sp.ja]
        );
      }
      await dbRun("COMMIT;", []);
    }

    // Trigger full species sync in background to dynamically load all 1025+ species names
    triggerSpeciesSync().catch((err) => {
      console.warn("Non-blocking background sync warning:", err);
    });

  } catch (err) {
    console.warn("Failed to bootstrap pokemon species table:", err);
  }
}

async function triggerSpeciesSync() {
  try {
    console.log("Syncing complete species database from GitHub in background...");
    const urlEn = "https://raw.githubusercontent.com/sindresorhus/pokemon/main/data/en.json";
    const urlDe = "https://raw.githubusercontent.com/sindresorhus/pokemon/main/data/de.json";
    const urlJa = "https://raw.githubusercontent.com/sindresorhus/pokemon/main/data/ja.json";

    const [enList, deList, jaList] = await Promise.all([
      fetchJSONFromUrl(urlEn).catch(e => { console.warn("Failed syncing EN species lists:", e); return null; }),
      fetchJSONFromUrl(urlDe).catch(e => { console.warn("Failed syncing DE species lists:", e); return null; }),
      fetchJSONFromUrl(urlJa).catch(e => { console.warn("Failed syncing JA species lists:", e); return null; })
    ]);

    if (Array.isArray(enList) && Array.isArray(deList) && Array.isArray(jaList)) {
      const minLen = Math.min(enList.length, deList.length, jaList.length);
      console.log(`Successfully downloaded active Pokedex names. Syncing ${minLen} species inside SQLite database...`);

      await dbRun("BEGIN TRANSACTION;", []);
      for (let i = 0; i < minLen; i++) {
        const pokedex_id = i + 1;
        const enVal = enList[i];
        const deVal = deList[i];
        const jaVal = jaList[i];
        if (enVal && deVal && jaVal) {
          await dbRun(
            "INSERT OR REPLACE INTO pokemon_species (pokedex_id, english_name, german_name, japanese_name) VALUES (?, ?, ?, ?)",
            [pokedex_id, enVal, deVal, jaVal]
          );
        }
      }
      await dbRun("COMMIT;", []);
      console.log(`Pokedex sync completed! ${minLen} species successfully persisted.`);
    }
  } catch (err: any) {
    console.warn("Background Pokedex species expansion failed:", err.message || err);
  }
}

// Bootstrap identical SQLite schema inside Node in case user starts application before running python scripts
async function bootstrapDatabase(skipOnePieceSeed = false) {
  try {
    // Migration for sets table
    try {
      const setsTableSql = await dbAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='sets';", []) as any[];
      if (setsTableSql && setsTableSql.length > 0) {
        const sql = setsTableSql[0].sql;
        if (sql && sql.includes("UNIQUE") && !sql.includes("UNIQUE(set_code, language)")) {
          console.log("Migrating sets table to composite unique in Express...");
          await dbRun("ALTER TABLE sets RENAME TO sets_old;", []);
          await dbRun(`
            CREATE TABLE sets (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              set_name TEXT NOT NULL,
              set_code TEXT NOT NULL,
              series TEXT,
              language TEXT NOT NULL,
              release_date TEXT,
              total_cards INTEGER,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(set_code, language)
            );
          `, []);
          await dbRun(`
            INSERT OR IGNORE INTO sets (id, set_name, set_code, series, language, release_date, total_cards, created_at, updated_at)
            SELECT id, set_name, set_code, series, language, release_date, total_cards, created_at, updated_at FROM sets_old;
          `, []);
          await dbRun("DROP TABLE sets_old;", []);
        }
      }
    } catch (e) {
      console.warn("Sets table migration skipped/failed in server.ts:", e);
    }

    await dbRun(`
      CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        series TEXT,
        language TEXT NOT NULL,
        release_date TEXT,
        total_cards INTEGER,
        logo TEXT,
        symbol TEXT,
        english_set_name TEXT,
        german_set_name TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(set_code, language)
      );
    `, []);

    try {
      await dbRun("ALTER TABLE sets ADD COLUMN logo TEXT;", []);
    } catch (e) {}
    try {
      await dbRun("ALTER TABLE sets ADD COLUMN symbol TEXT;", []);
    } catch (e) {}
    try {
      await dbRun("ALTER TABLE sets ADD COLUMN english_set_name TEXT;", []);
    } catch (e) {}
    try {
      await dbRun("ALTER TABLE sets ADD COLUMN german_set_name TEXT;", []);
    } catch (e) {}

    // Migration for cards table to fix unique and foreign key mismatches
    try {
      const cardsTableSql = await dbAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='cards';", []) as any[];
      if (cardsTableSql && cardsTableSql.length > 0) {
        const sql = cardsTableSql[0].sql;
        if (sql && (sql.includes("FOREIGN KEY") || (sql.includes("UNIQUE") && !sql.includes("UNIQUE(api_card_id, language)")))) {
          console.log("Migrating cards table to fix constraints in Express...");
          await dbRun("ALTER TABLE cards RENAME TO cards_old;", []);
          await dbRun(`
            CREATE TABLE cards (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              api_card_id TEXT NOT NULL,
              english_name TEXT NOT NULL,
              local_name TEXT NOT NULL,
              pokemon_name TEXT,
              japanese_name TEXT,
              language TEXT NOT NULL,
              set_name TEXT NOT NULL,
              set_code TEXT NOT NULL,
              card_number TEXT NOT NULL,
              rarity TEXT,
              supertype TEXT,
              subtype TEXT,
              hp INTEGER,
              types TEXT,
              evolves_from TEXT,
              regulation_mark TEXT,
              illustrator TEXT,
              release_date TEXT,
              image_small TEXT,
              image_large TEXT,
              cardmarket_id TEXT,
              created_at TEXT DEFAULT CURRENT_TIMESTAMP,
              updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
              UNIQUE(api_card_id, language)
            );
          `, []);
          await dbRun(`
            INSERT OR IGNORE INTO cards (id, api_card_id, english_name, local_name, pokemon_name, japanese_name, language, set_name, set_code,
              card_number, rarity, supertype, subtype, hp, types, evolves_from, regulation_mark, illustrator, release_date,
              image_small, image_large, cardmarket_id, created_at, updated_at)
            SELECT id, api_card_id, english_name, local_name, pokemon_name, japanese_name, language, set_name, set_code,
              card_number, rarity, supertype, subtype, hp, types, evolves_from, regulation_mark, illustrator, release_date,
              image_small, image_large, cardmarket_id, created_at, updated_at FROM cards_old;
          `, []);
          await dbRun("DROP TABLE cards_old;", []);
        }
      }
    } catch (e) {
      console.warn("Cards table migration skipped/failed in server.ts:", e);
    }

    await dbRun(`
      CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT NOT NULL,
        english_name TEXT NOT NULL,
        local_name TEXT NOT NULL,
        pokemon_name TEXT,
        japanese_name TEXT,
        language TEXT NOT NULL,
        set_name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        card_number TEXT NOT NULL,
        rarity TEXT,
        supertype TEXT,
        subtype TEXT,
        hp INTEGER,
        types TEXT,
        evolves_from TEXT,
        regulation_mark TEXT,
        illustrator TEXT,
        release_date TEXT,
        image_small TEXT,
        image_large TEXT,
        cardmarket_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_card_id, language)
      );
    `, []);

    try {
      await dbRun("ALTER TABLE cards ADD COLUMN japanese_name TEXT;", []);
    } catch (e) {
      // Ignored if column already exists
    }

    // Create indices
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_english_name ON cards(english_name);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_local_name ON cards(local_name);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_set_name ON cards(set_name);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);", []);

    // Create reseller evaluations table and indices
    await dbRun(`
      CREATE TABLE IF NOT EXISTS reseller_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT NOT NULL,
        language TEXT NOT NULL,
        tier TEXT NOT NULL,
        score INTEGER NOT NULL,
        justification TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_card_id, language)
      );
    `, []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_reseller_api_card_id ON reseller_evaluations(api_card_id);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_reseller_language ON reseller_evaluations(language);", []);

    // Create reseller set evaluations table and indices
    await dbRun(`
      CREATE TABLE IF NOT EXISTS reseller_set_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_code TEXT NOT NULL,
        language TEXT NOT NULL,
        tier TEXT NOT NULL,
        score INTEGER NOT NULL,
        justification TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(set_code, language)
      );
    `, []);
     await dbRun("CREATE INDEX IF NOT EXISTS idx_reseller_set_code ON reseller_set_evaluations(set_code);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_reseller_set_language ON reseller_set_evaluations(language);", []);

    // Create reseller inventory table to persist purchased/stamped items
    await dbRun(`
      CREATE TABLE IF NOT EXISTS reseller_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT NOT NULL,
        pokemon_name TEXT,
        local_name TEXT NOT NULL,
        japanese_name TEXT,
        card_number TEXT NOT NULL,
        set_name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        rarity TEXT,
        language TEXT NOT NULL,
        image_small TEXT,
        yen_price INTEGER NOT NULL DEFAULT 0,
        yellow_label_detected INTEGER NOT NULL DEFAULT 0,
        purchase_date TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        purchase_location TEXT,
        notes TEXT,
        bounding_box_json TEXT, -- Coordinates of this card in JSON string
        image_source_base64 TEXT, -- Base64 of scanned image for canvas stamping
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `, []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_inventory_api_card_id ON reseller_inventory(api_card_id);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_inventory_set_code ON reseller_inventory(set_code);", []);

    // Create reseller favorites table to persist favorite cards user wants to buy
    await dbRun(`
      CREATE TABLE IF NOT EXISTS reseller_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT NOT NULL,
        english_name TEXT,
        local_name TEXT NOT NULL,
        japanese_name TEXT,
        card_number TEXT NOT NULL,
        set_name TEXT NOT NULL,
        set_code TEXT NOT NULL,
        rarity TEXT,
        language TEXT NOT NULL,
        image_small TEXT,
        image_large TEXT,
        game TEXT NOT NULL DEFAULT 'pokemon',
        target_price_eur REAL DEFAULT 0.0,
        target_price_yen INTEGER DEFAULT 0,
        price_updated_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_card_id, game)
      );
    `, []);
    try {
      await dbRun("ALTER TABLE reseller_favorites ADD COLUMN target_price_eur REAL DEFAULT 0.0;", []);
    } catch (err) {}
    try {
      await dbRun("ALTER TABLE reseller_favorites ADD COLUMN target_price_yen INTEGER DEFAULT 0;", []);
    } catch (err) {}
    try {
      await dbRun("ALTER TABLE reseller_favorites ADD COLUMN price_updated_at TEXT;", []);
    } catch (err) {}
    await dbRun("CREATE INDEX IF NOT EXISTS idx_favorites_api_card_id ON reseller_favorites(api_card_id);", []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_favorites_game ON reseller_favorites(game);", []);

    // Manual/local market price cache. Values are user-controlled or imported from trusted sources, never hallucinated.
    await dbRun(`
      CREATE TABLE IF NOT EXISTS market_prices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT NOT NULL,
        game TEXT NOT NULL DEFAULT 'pokemon',
        market_price_eur REAL NOT NULL DEFAULT 0,
        low_price_eur REAL DEFAULT 0,
        trend_price_eur REAL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'manual',
        source_url TEXT,
        observed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        UNIQUE(api_card_id, game, source)
      );
    `, []);
    await dbRun("CREATE INDEX IF NOT EXISTS idx_market_prices_card ON market_prices(api_card_id, game);", []);

    // In-place database fix to restore correct case-sensitive Japanese card image URLs for tcgdex.net and only lowercase pokemon-card.com URLs
    try {
      console.log("Fixing case-sensitive Japanese card image URLs in database...");
      
      // 1. Restore tcgdex.net URLs to original correct casing (uppercase set_code)
      await dbRun(`
        UPDATE cards
        SET image_small = REPLACE(image_small, '/' || LOWER(set_code) || '/', '/' || set_code || '/'),
            image_large = REPLACE(image_large, '/' || LOWER(set_code) || '/', '/' || set_code || '/')
        WHERE language = 'JA' AND (image_small LIKE '%tcgdex.net%' OR image_large LIKE '%tcgdex.net%');
      `, []);

      // 2. Only lowercase the set code for pokemon-card.com which has case sensitivity requirements
      await dbRun(`
        UPDATE cards
        SET image_small = REPLACE(image_small, '/' || set_code || '/', '/' || LOWER(set_code) || '/'),
            image_large = REPLACE(image_large, '/' || set_code || '/', '/' || LOWER(set_code) || '/')
        WHERE language = 'JA' AND (image_small LIKE '%pokemon-card.com%' OR image_large LIKE '%pokemon-card.com%');
      `, []);
      
      console.log("Japanese card image URLs successfully updated and verified in database.");
    } catch (err) {
      console.warn("Failed to update case-sensitive Japanese card image URLs:", err);
    }

    console.log("Database initialized and index structures verified successfully.");
    
    try {
      console.log("In-place healing rarity values for any imported Japanese cards...");
      await dbRun("UPDATE cards SET rarity = 'Common' WHERE LOWER(rarity) = 'c';", []);
      await dbRun("UPDATE cards SET rarity = 'Uncommon' WHERE LOWER(rarity) = 'u';", []);
      await dbRun("UPDATE cards SET rarity = 'Rare' WHERE LOWER(rarity) = 'r';", []);
    } catch (e) {
      console.warn("Failed to update in-place rarity healings:", e);
    }

    // Alter tables to support multiple games dynamically
    try {
      await dbRun("ALTER TABLE sets ADD COLUMN game TEXT DEFAULT 'pokemon';", []);
      console.log("Added game column to sets table.");
    } catch (e) {}
    try {
      await dbRun("ALTER TABLE cards ADD COLUMN game TEXT DEFAULT 'pokemon';", []);
      console.log("Added game column to cards table.");
    } catch (e) {}
    try {
      await dbRun("ALTER TABLE reseller_inventory ADD COLUMN game TEXT DEFAULT 'pokemon';", []);
      console.log("Added game column to reseller_inventory table.");
    } catch (e) {}

    // Seed One Piece TCG data
    if (!skipOnePieceSeed) {
      await seedOnePieceData();
    } else {
      console.log("[Bootstrap] Skipping automatic seeding of One Piece data due to requested clean db reset.");
    }

    // Align pre-existing rows in the db to onepiece
    try {
      await dbRun("UPDATE cards SET game = 'onepiece' WHERE api_card_id LIKE 'op%' OR api_card_id LIKE 'st%' OR set_code LIKE 'OP%' OR set_code LIKE 'ST%'", []);
      await dbRun("UPDATE sets SET game = 'onepiece' WHERE set_code LIKE 'OP%' OR set_code LIKE 'ST%'", []);
      await dbRun("UPDATE reseller_inventory SET game = 'onepiece' WHERE api_card_id LIKE 'op%' OR api_card_id LIKE 'st%'", []);
      
      // Dynamic self-healing for Japanese card image domains
      await dbRun("UPDATE cards SET image_small = replace(image_small, 'asia-en.onepiece-cardgame.com', 'onepiece-cardgame.com'), image_large = replace(image_large, 'asia-en.onepiece-cardgame.com', 'onepiece-cardgame.com') WHERE game = 'onepiece' AND language = 'JA'", []);
      
      console.log("Successfully aligned and healed any pre-existing One Piece database rows.");
    } catch (e) {
      console.warn("Failed to align pre-existing One Piece database rows:", e);
    }

    await loadSetTranslations();
    
    // Kick off healers on boot - sets healer first then cards healer insideExpress
    healJapaneseSetNames()
      .then(() => healJapaneseCardNames())
      .then(() => healExistingCardsRaritiesAndEnglishNames())
      .catch(e => console.error("Error healing Japanese datasets in background:", e));
  } catch (error) {
    console.error("Error bootstrapping SQLite Database:", error);
    throw error;
  }
}

// Seeder for One Piece TCG sets and cards
async function seedOnePieceData(force = false) {
  try {
    const existingOpCards = await dbGet("SELECT COUNT(*) as count FROM cards WHERE game = 'onepiece'", []);
    if (!force) {
      const existingOpSets = await dbAll("SELECT id FROM sets WHERE game = 'onepiece'", []);
      if (existingOpCards && existingOpCards.count > 0 && existingOpSets && existingOpSets.length > 0) {
        console.log("[OnePieceSeed] One Piece TCG official catalog rows already present in database.");
        return;
      }
    }

    const allowLegacyOnePieceSeed = false;
    if (!allowLegacyOnePieceSeed) {
      console.warn("[OnePieceSeed] Legacy hardcoded One Piece card seed is disabled. Use the official onepiece_importer.py sync to avoid name/artwork mismatches.");
      return;
    }

    console.log("[OnePieceSeed] Bootstrapping dynamic One Piece TCG sets and premium cards...");

    const boosterConfigs = [
      { code: "OP01", name: "Romance Dawn", de: "Romance Dawn", cards: 121, dateJA: "2022-07-22", dateEN: "2022-12-02" },
      { code: "OP02", name: "Paramount War", de: "Paramount War", cards: 121, dateJA: "2022-11-04", dateEN: "2023-03-10" },
      { code: "OP03", name: "Pillars of Strength", de: "Säulen der Stärke", cards: 127, dateJA: "2023-02-11", dateEN: "2023-06-30" },
      { code: "OP04", name: "Kingdoms of Intrigue", de: "Königreiche der Intrige", cards: 124, dateJA: "2023-05-27", dateEN: "2023-09-22" },
      { code: "OP05", name: "Awakening of the New Era", de: "Erwachen der neuen Ära", cards: 121, dateJA: "2023-08-26", dateEN: "2023-11-10" },
      { code: "OP06", name: "Wings of the Captain", de: "Flügel des Kapitäns", cards: 126, dateJA: "2023-11-25", dateEN: "2024-03-15" },
      { code: "OP07", name: "500 Years in the Future", de: "500 Jahre in der Zukunft", cards: 125, dateJA: "2024-02-24", dateEN: "2024-06-21" },
      { code: "OP08", name: "Two Legends", de: "Zwei Legenden", cards: 125, dateJA: "2024-05-25", dateEN: "2024-09-13" },
      { code: "OP09", name: "Emperor in the New World", de: "Kaiser der neuen Welt", cards: 121, dateJA: "2024-08-31", dateEN: "2024-12-13" },
      { code: "OP10", name: "Royal Blood", de: "Königliche Blutlinie", cards: 120, dateJA: "2024-11-30", dateEN: "2025-03-14" },
      { code: "EB01", name: "Memorial Collection", de: "Memorial-Kollektion", cards: 61, dateJA: "2024-01-27", dateEN: "2024-05-03" }
    ];

    const starterConfigs = [
      { code: "ST01", name: "Straw Hat Crew [ST01]", de: "Strohhut-Bande [ST01]", dateJA: "2022-07-08", dateEN: "2022-12-02" },
      { code: "ST02", name: "Worst Generation [ST02]", de: "Die Schlimmste Generation [ST02]", dateJA: "2022-07-08", dateEN: "2022-12-02" },
      { code: "ST03", name: "The Seven Warlords of the Sea [ST03]", de: "Die Sieben Samurai der Meere [ST03]", dateJA: "2022-07-08", dateEN: "2022-12-02" },
      { code: "ST04", name: "Animal Kingdom Pirates [ST04]", de: "Bestien-Piraten [ST04]", dateJA: "2022-07-08", dateEN: "2022-12-02" },
      { code: "ST05", name: "ONE PIECE FILM Edition [ST05]", de: "ONE PIECE FILM Edition [ST05]", dateJA: "2022-08-06", dateEN: "2022-12-02" },
      { code: "ST06", name: "Absolute Justice [ST06]", de: "Absolute Gerechtigkeit [ST06]", dateJA: "2022-09-30", dateEN: "2023-03-10" },
      { code: "ST07", name: "Big Mom Pirates [ST07]", de: "Big Mom Piratenbande [ST07]", dateJA: "2023-01-21", dateEN: "2023-06-30" },
      { code: "ST08", name: "Monkey.D.Luffy [ST08]", de: "Monkey.D.Luffy [ST08]", dateJA: "2023-04-27", dateEN: "2023-10-13" },
      { code: "ST09", name: "Yamato [ST09]", de: "Yamato [ST09]", dateJA: "2023-04-27", dateEN: "2023-10-13" },
      { code: "ST10", name: "The Three Captains [ST10]", de: "Die Drei Kapitäne [ST10]", dateJA: "2023-10-20", dateEN: "2023-11-10" },
      { code: "ST11", name: "Uta [ST11]", de: "Uta [ST11]", dateJA: "2023-12-22", dateEN: "2024-02-02" },
      { code: "ST12", name: "Zoro & Sanji [ST12]", de: "Zoro & Sanji [ST12]", dateJA: "2024-03-22", dateEN: "2024-05-03" },
      { code: "ST13", name: "The Three Brothers [ST13]", de: "Die Drei Brüder [ST13]", dateJA: "2024-04-19", dateEN: "2024-05-03" },
      { code: "ST14", name: "3D2Y [ST14]", de: "3D2Y [ST14]", dateJA: "2024-04-27", dateEN: "2024-08-16" }
    ];

    const opSets: any[] = [];
    
    // Add Boosters and Extra Boosters
    for (const b of boosterConfigs) {
      opSets.push({
        set_name: b.name,
        set_code: b.code,
        series: b.code.substring(0, 2),
        language: "JA",
        release_date: b.dateJA,
        total_cards: b.cards,
        logo: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${b.code}-001.png`,
        symbol: b.code,
        english_set_name: b.name,
        german_set_name: b.de
      });
      opSets.push({
        set_name: b.name,
        set_code: b.code,
        series: b.code.substring(0, 2),
        language: "EN",
        release_date: b.dateEN,
        total_cards: b.cards,
        logo: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${b.code}-001.png`,
        symbol: b.code,
        english_set_name: b.name,
        german_set_name: b.de
      });
    }

    // Add Starter Decks
    for (const s of starterConfigs) {
      opSets.push({
        set_name: s.name,
        set_code: s.code,
        series: "ST",
        language: "JA",
        release_date: s.dateJA,
        total_cards: 17,
        logo: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${s.code}-001.png`,
        symbol: s.code,
        english_set_name: s.name,
        german_set_name: s.de
      });
      opSets.push({
        set_name: s.name,
        set_code: s.code,
        series: "ST",
        language: "EN",
        release_date: s.dateEN,
        total_cards: 17,
        logo: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${s.code}-001.png`,
        symbol: s.code,
        english_set_name: s.name,
        german_set_name: s.de
      });
    }

    // Add Promo Sets
    opSets.push({
      set_name: "Promotional Cards",
      set_code: "PR",
      series: "PR",
      language: "JA",
      release_date: "2022-07-01",
      total_cards: 150,
      logo: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png",
      symbol: "PR",
      english_set_name: "Promotional Cards",
      german_set_name: "Promokarten"
    });
    opSets.push({
      set_name: "Promotional Cards",
      set_code: "PR",
      series: "PR",
      language: "EN",
      release_date: "2022-12-01",
      total_cards: 150,
      logo: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png",
      symbol: "PR",
      english_set_name: "Promotional Cards",
      german_set_name: "Promokarten"
    });

    for (const set of opSets) {
      await dbRun(`
        INSERT OR IGNORE INTO sets (set_name, set_code, series, language, release_date, total_cards, logo, symbol, english_set_name, german_set_name, game)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'onepiece')
      `, [set.set_name, set.set_code, set.series, set.language, set.release_date, set.total_cards, set.logo, set.symbol, set.english_set_name, set.german_set_name]);
    }

    const opCards: any[] = [];

    // Core high-value chase cards setup
    const coreCardsConfig = [
      { set: "OP01", num: "001", name: "Roronoa Zoro", jaName: "ロロノア・ゾロ", rarity: "Leader", supertype: "Leader" },
      { set: "OP01", num: "120", name: "Shanks", jaName: "シャンクス", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP01", num: "025", name: "Roronoa Zoro", jaName: "ロロノア・ゾロ", rarity: "Super Rare", supertype: "Character" },
      { set: "OP01", num: "016", name: "Nami", jaName: "ナミ", rarity: "Rare", supertype: "Character" },
      { set: "OP02", num: "001", name: "Smoker", jaName: "スモーカー", rarity: "Leader", supertype: "Leader" },
      { set: "OP02", num: "120", name: "Uta", jaName: "ウタ", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP03", num: "001", name: "Portgas.D.Ace", jaName: "ポートガス・D・エース", rarity: "Leader", supertype: "Leader" },
      { set: "OP03", num: "122", name: "Sogeking", jaName: "そげキング", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP04", num: "001", name: "Nefeltari Vivi", jaName: "ネフェルタリ・ビビ", rarity: "Leader", supertype: "Leader" },
      { set: "OP04", num: "119", name: "Sabo", jaName: "サボ", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP05", num: "060", name: "Monkey.D.Luffy", jaName: "モンキー・D・ルフィ", rarity: "Leader", supertype: "Leader" },
      { set: "OP05", num: "119", name: "Monkey.D.Luffy", jaName: "モンキー・D・ルフィ", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP06", num: "001", name: "Uta", jaName: "ウタ", rarity: "Leader", supertype: "Leader" },
      { set: "OP06", num: "119", name: "Roronoa Zoro", jaName: "ロロノア・ゾロ", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP07", num: "001", name: "Monkey.D.Dragon", jaName: "モンキー・D・ドラゴン", rarity: "Leader", supertype: "Leader" },
      { set: "OP07", num: "119", name: "Boa Hancock", jaName: "ボア・ハンコック", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP08", num: "001", name: "Tony Tony.Chopper", jaName: "トニートニー・チョッパー", rarity: "Leader", supertype: "Leader" },
      { set: "OP08", num: "119", name: "Silvers Rayleigh", jaName: "シルバーズ・レイリー", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP09", num: "001", name: "Gol.D.Roger", jaName: "ゴール・D・ロジャー", rarity: "Leader", supertype: "Leader" },
      { set: "OP09", num: "119", name: "Gol.D.Roger", jaName: "ゴール・D・ロジャー", rarity: "Secret Rare", supertype: "Character" },
      { set: "OP10", num: "001", name: "Shanks", jaName: "シャンクス", rarity: "Leader", supertype: "Leader" },
      { set: "OP10", num: "119", name: "Portgas.D.Ace", jaName: "ポートガス・D・エース", rarity: "Secret Rare", supertype: "Character" },
      { set: "EB01", num: "001", name: "Kozuki Oden", jaName: "光月おでん", rarity: "Leader", supertype: "Leader" },
      { set: "EB01", num: "003", name: "Tony Tony.Chopper", jaName: "トニートニー・チョッパー", rarity: "Super Rare", supertype: "Character" }
    ];

    for (const c of coreCardsConfig) {
      const matchSet = boosterConfigs.find(b => b.code === c.set);
      const setName = matchSet ? matchSet.name : (c.set === "EB01" ? "Memorial Collection" : "Unknown Set");
      const fullNum = `${c.set}-${c.num}`;

      opCards.push({
        api_card_id: `${c.set.toLowerCase()}-${c.num}-ja`,
        english_name: c.name,
        local_name: `${c.jaName} (${c.rarity})`,
        pokemon_name: `${c.name} ${fullNum}`,
        japanese_name: c.jaName,
        language: "JA",
        set_name: setName,
        set_code: c.set,
        card_number: fullNum,
        rarity: c.rarity,
        supertype: c.supertype,
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`
      });

      opCards.push({
        api_card_id: `${c.set.toLowerCase()}-${c.num}-en`,
        english_name: c.name,
        local_name: `${c.name} (${c.rarity} ${fullNum})`,
        pokemon_name: `${c.name} ${fullNum}`,
        japanese_name: c.jaName,
        language: "EN",
        set_name: setName,
        set_code: c.set,
        card_number: fullNum,
        rarity: c.rarity,
        supertype: c.supertype,
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`
      });
    }

    // Programmatic generation for Starters leaders
    const starterLeaders: any = {
      ST01: { name: "Monkey.D.Luffy", ja: "モンキー・D・ルフィ" },
      ST02: { name: "Eustass Kid", ja: "ユースタス・キッド" },
      ST03: { name: "Crocodile", ja: "クロコダイル" },
      ST04: { name: "Kaido", ja: "カイドウ" },
      ST05: { name: "Shanks", ja: "シャンクス" },
      ST06: { name: "Sakazuki", ja: "サカズキ" },
      ST07: { name: "Charlotte Linlin", ja: "シャーロット・リンリン" },
      ST08: { name: "Monkey.D.Luffy", ja: "モンキー・D・ルフィ" },
      ST09: { name: "Yamato", ja: "ヤマト" },
      ST10: { name: "Trafalgar Law", ja: "トラファルガー・ロー" },
      ST11: { name: "Uta", ja: "ウタ" },
      ST12: { name: "Zoro & Sanji", ja: "ゾロ＆サンジ" },
      ST13: { name: "Sabo", ja: "サボ" },
      ST14: { name: "Monkey.D.Luffy", ja: "モンキー・D・ルフィ" }
    };

    for (const code of Object.keys(starterLeaders)) {
      const info = starterLeaders[code];
      const matchS = starterConfigs.find(s => s.code === code);
      const setName = matchS ? matchS.name : `Starter Deck ${code}`;
      const fullNum = `${code}-001`;

      opCards.push({
        api_card_id: `${code.toLowerCase()}-001-ja`,
        english_name: info.name,
        local_name: `${info.ja} (Leader)`,
        pokemon_name: `${info.name} ${fullNum}`,
        japanese_name: info.ja,
        language: "JA",
        set_name: setName,
        set_code: code,
        card_number: fullNum,
        rarity: "Leader",
        supertype: "Leader",
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`
      });

      opCards.push({
        api_card_id: `${code.toLowerCase()}-001-en`,
        english_name: info.name,
        local_name: `${info.name} (Leader ${fullNum})`,
        pokemon_name: `${info.name} ${fullNum}`,
        japanese_name: info.ja,
        language: "EN",
        set_name: setName,
        set_code: code,
        card_number: fullNum,
        rarity: "Leader",
        supertype: "Leader",
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${fullNum}.png`
      });
    }

    // Programmatic generation for Promo Cards (PR)
    const promoCardNames: any = {
      1: "Monkey D. Luffy",
      2: "Roronoa Zoro",
      3: "Nami",
      4: "Usopp",
      5: "Sanji",
      6: "Kaido",
      7: "Yamato",
      8: "Monkey D. Luffy",
      9: "Trafalgar Law",
      10: "Eustass Kid",
      11: "Yamato",
      12: "Monkey D. Luffy",
      13: "Roronoa Zoro",
      14: "Bartolomeo",
      15: "Trafalgar Law",
      16: "Shanks",
      17: "Monkey D. Luffy",
      18: "Eustass Kid",
      19: "Jinbe",
      20: "Crocodile",
      21: "Roronoa Zoro",
      22: "Monkey D. Luffy",
      25: "Smoker",
      28: "Portgas.D.Ace",
      33: "Monkey D. Luffy",
      35: "Monkey D. Luffy",
      36: "Roronoa Zoro",
      37: "Nami",
      38: "Usopp",
      39: "Sanji",
      40: "Tony Tony Chopper",
      41: "Nico Robin",
      45: "Monkey D. Luffy",
      70: "Monkey D. Luffy",
      100: "Sabo",
      115: "Monkey D. Luffy (Gear 5)"
    };

    const promoCardJaNames: any = {
      1: "モンキー・D・ルフィ",
      2: "ロロノア・ゾロ",
      3: "ナミ",
      4: "ウソップ",
      5: "サンジ",
      6: "カイドウ",
      7: "ヤマト",
      8: "モンキー・D・ルフィ",
      9: "トラファルガー・ロー",
      10: "ユースタス・キッド",
      11: "ヤマト",
      12: "モンキー・D・ルフィ",
      13: "ロロノア・ゾロ",
      14: "バルトロメオ",
      15: "トラファルガー・ロー",
      16: "シャンクス",
      17: "モンキー・D・ルフィ",
      18: "ユースタス・キッド",
      19: "ジンベエ",
      20: "クロコダイル",
      21: "ロロノア・ゾロ",
      22: "モンキー・D・ルフィ",
      25: "スモーカー",
      28: "ポートガス・D・エース",
      33: "モンキー・D・ルフィ",
      35: "モンキー・D・ルフィ",
      36: "ロロノア・ゾロ",
      37: "ナミ",
      38: "ウソップ",
      39: "サンジ",
      40: "トニートニー・チョッパー",
      41: "ニコ・ロビン",
      45: "モンキー・D・ルフィ",
      70: "モンキー・D・ルフィ",
      100: "サボ",
      115: "モンキー・D・ルフィ"
    };

    for (const numStr of Object.keys(promoCardNames)) {
      const idx = parseInt(numStr);
      const name = promoCardNames[idx];
      const jaName = promoCardJaNames[idx] || name;
      const formattedNum = "P-" + String(idx).padStart(3, "0");

      opCards.push({
        api_card_id: `p-${String(idx).padStart(3, "0")}-ja`,
        english_name: name,
        local_name: `${jaName} (Promo ${formattedNum})`,
        pokemon_name: `${name} ${formattedNum}`,
        japanese_name: jaName,
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: formattedNum,
        rarity: "Promo",
        supertype: "Character",
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${formattedNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${formattedNum}.png`
      });

      opCards.push({
        api_card_id: `p-${String(idx).padStart(3, "0")}-en`,
        english_name: name,
        local_name: `${name} (Promo ${formattedNum})`,
        pokemon_name: `${name} ${formattedNum}`,
        japanese_name: jaName,
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: formattedNum,
        rarity: "Promo",
        supertype: "Character",
        image_small: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${formattedNum}.png`,
        image_large: `https://asia-en.onepiece-cardgame.com/images/cardlist/card/${formattedNum}.png`
      });
    }

    if (false) {
      const _ignoredOldCards = [
      // OP01 Romance Dawn
      {
        api_card_id: "op01-001-ja",
        english_name: "Roronoa Zoro",
        local_name: "ロロノア・ゾロ (Leader)",
        pokemon_name: "Roronoa Zoro (Leader)",
        japanese_name: "ロロノア・ゾロ",
        language: "JA",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png"
      },
      {
        api_card_id: "op01-001-en",
        english_name: "Roronoa Zoro",
        local_name: "Roronoa Zoro (Leader)",
        pokemon_name: "Roronoa Zoro (Leader)",
        japanese_name: "ロロノア・ゾロ",
        language: "EN",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-001.png"
      },
      {
        api_card_id: "op01-120-ja",
        english_name: "Shanks",
        local_name: "シャンクス (Secret Rare)",
        pokemon_name: "Shanks (Secret Rare)",
        japanese_name: "シャンクス",
        language: "JA",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-120",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-120.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-120.png"
      },
      {
        api_card_id: "op01-120-en",
        english_name: "Shanks",
        local_name: "Shanks (Secret Rare)",
        pokemon_name: "Shanks (Secret Rare)",
        japanese_name: "シャンクス",
        language: "EN",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-120",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-120.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-120.png"
      },
      {
        api_card_id: "op01-025-en",
        english_name: "Roronoa Zoro",
        local_name: "Roronoa Zoro (Super Rare)",
        pokemon_name: "Roronoa Zoro",
        japanese_name: "ロロノア・ゾロ",
        language: "EN",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-025",
        rarity: "Super Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-025.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-025.png"
      },
      {
        api_card_id: "op01-025-ja",
        english_name: "Roronoa Zoro",
        local_name: "ロロノア・ゾロ (SR)",
        pokemon_name: "Roronoa Zoro",
        japanese_name: "ロロノア・ゾロ",
        language: "JA",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-025",
        rarity: "Super Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-025.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-025.png"
      },
      {
        api_card_id: "op01-016-en",
        english_name: "Nami",
        local_name: "Nami (Rare)",
        pokemon_name: "Nami",
        japanese_name: "ナミ",
        language: "EN",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-016",
        rarity: "Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png"
      },
      {
        api_card_id: "op01-016-ja",
        english_name: "Nami",
        local_name: "ナミ (R)",
        pokemon_name: "Nami",
        japanese_name: "ナミ",
        language: "JA",
        set_name: "Romance Dawn",
        set_code: "OP01",
        card_number: "OP01-016",
        rarity: "Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP01-016.png"
      },

      // OP02 Paramount War
      {
        api_card_id: "op02-001-ja",
        english_name: "Smoker",
        local_name: "スモーカー (Leader)",
        pokemon_name: "Smoker (Leader)",
        japanese_name: "スモーカー",
        language: "JA",
        set_name: "Paramount War",
        set_code: "OP02",
        card_number: "OP02-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-001.png"
      },
      {
        api_card_id: "op02-001-en",
        english_name: "Smoker",
        local_name: "Smoker (Leader)",
        pokemon_name: "Smoker (Leader)",
        japanese_name: "スモーカー",
        language: "EN",
        set_name: "Paramount War",
        set_code: "OP02",
        card_number: "OP02-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-001.png"
      },
      {
        api_card_id: "op02-120-ja",
        english_name: "Uta",
        local_name: "ウタ (Secret Rare)",
        pokemon_name: "Uta (Secret Rare)",
        japanese_name: "ウタ",
        language: "JA",
        set_name: "Paramount War",
        set_code: "OP02",
        card_number: "OP02-120",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-120.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-120.png"
      },
      {
        api_card_id: "op02-120-en",
        english_name: "Uta",
        local_name: "Uta (Secret Rare)",
        pokemon_name: "Uta (Secret Rare)",
        japanese_name: "ウタ",
        language: "EN",
        set_name: "Paramount War",
        set_code: "OP02",
        card_number: "OP02-120",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-120.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP02-120.png"
      },

      // OP05 Awakening of the New Era
      {
        api_card_id: "op05-060-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Gear 5 Leader)",
        pokemon_name: "Monkey D. Luffy (Gear 5)",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Awakening of the New Era",
        set_code: "OP05",
        card_number: "OP05-060",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-060.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-060.png"
      },
      {
        api_card_id: "op05-060-ja",
        english_name: "Monkey D. Luffy",
        local_name: "モンキー・D・ルフィ (Gear 5 Leader)",
        pokemon_name: "Monkey D. Luffy (Gear 5)",
        japanese_name: "モンキー・D・ルフィ",
        language: "JA",
        set_name: "Awakening of the New Era",
        set_code: "OP05",
        card_number: "OP05-060",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-060.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-060.png"
      },
      {
        api_card_id: "op05-119-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Manga Art SEC)",
        pokemon_name: "Monkey D. Luffy (Manga Art)",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Awakening of the New Era",
        set_code: "OP05",
        card_number: "OP05-119",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png"
      },
      {
        api_card_id: "op05-119-ja",
        english_name: "Monkey D. Luffy",
        local_name: "モンキー・D・ルフィ (Manga Art SEC)",
        pokemon_name: "Monkey D. Luffy (Manga Art)",
        japanese_name: "モンキー・D・ルフィ",
        language: "JA",
        set_name: "Awakening of the New Era",
        set_code: "OP05",
        card_number: "OP05-119",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP05-119.png"
      },

      // OP09 Emperor in the New World
      {
        api_card_id: "op09-001-ja",
        english_name: "Gol D. Roger",
        local_name: "ゴール・D・ロジャー (Leader)",
        pokemon_name: "Gol D. Roger (Leader)",
        japanese_name: "ゴール・D・ロジャー",
        language: "JA",
        set_name: "Emperor in the New World",
        set_code: "OP09",
        card_number: "OP09-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-001.png"
      },
      {
        api_card_id: "op09-001-en",
        english_name: "Gol D. Roger",
        local_name: "Gol D. Roger (Leader)",
        pokemon_name: "Gol D. Roger (Leader)",
        japanese_name: "ゴール・D・ロジャー",
        language: "EN",
        set_name: "Emperor in the New World",
        set_code: "OP09",
        card_number: "OP09-001",
        rarity: "Leader",
        supertype: "Leader",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-001.png"
      },
      {
        api_card_id: "op09-119-en",
        english_name: "Gol D. Roger",
        local_name: "Gol D. Roger (Secret Manga Art)",
        pokemon_name: "Gol D. Roger (Manga Art)",
        japanese_name: "ゴール・D・ロジャー",
        language: "EN",
        set_name: "Emperor in the New World",
        set_code: "OP09",
        card_number: "OP09-119",
        rarity: "Secret Rare",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-119.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/OP09-119.png"
      },

      // Promotional Cards (PR)
      {
        api_card_id: "p-001-ja",
        english_name: "Monkey D. Luffy",
        local_name: "モンキー・D・ルフィ (Promo P-001)",
        pokemon_name: "Monkey D. Luffy P-001",
        japanese_name: "モンキー・D・ルフィ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-001",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png"
      },
      {
        api_card_id: "p-001-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Promo P-001)",
        pokemon_name: "Monkey D. Luffy P-001",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-001",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-001.png"
      },
      {
        api_card_id: "p-006-ja",
        english_name: "Kaido",
        local_name: "カイドウ (Promo P-006)",
        pokemon_name: "Kaido P-006",
        japanese_name: "カイドウ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-006",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-006.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-006.png"
      },
      {
        api_card_id: "p-006-en",
        english_name: "Kaido",
        local_name: "Kaido (Promo P-006)",
        pokemon_name: "Kaido P-006",
        japanese_name: "カイドウ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-006",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-006.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-006.png"
      },
      {
        api_card_id: "p-011-en",
        english_name: "Yamato",
        local_name: "Yamato (Promo P-011)",
        pokemon_name: "Yamato P-011",
        japanese_name: "ヤマト",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-011",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-011.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-011.png"
      },
      {
        api_card_id: "p-011-ja",
        english_name: "Yamato",
        local_name: "ヤマト (Promo P-011)",
        pokemon_name: "Yamato P-011",
        japanese_name: "ヤマト",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-011",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-011.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-011.png"
      },
      {
        api_card_id: "p-022-en",
        english_name: "Roronoa Zoro",
        local_name: "Roronoa Zoro (Promo P-022)",
        pokemon_name: "Roronoa Zoro P-022",
        japanese_name: "ロロノア・ゾロ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-022",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-022.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-022.png"
      },
      {
        api_card_id: "p-033-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Gear 5 Promo P-033)",
        pokemon_name: "Monkey D. Luffy Gear 5 P-033",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-033",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-033.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-033.png"
      },
      {
        api_card_id: "p-045-en",
        english_name: "Uta",
        local_name: "Uta (Promo P-045)",
        pokemon_name: "Uta P-045",
        japanese_name: "ウタ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-045",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-045.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-045.png"
      },
      {
        api_card_id: "p-070-en",
        english_name: "Shanks",
        local_name: "Shanks (Promo P-070)",
        pokemon_name: "Shanks P-070",
        japanese_name: "シャンクス",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-070",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-070.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-070.png"
      },
      {
        api_card_id: "p-002-ja",
        english_name: "Roronoa Zoro",
        local_name: "ロロノア・ゾロ (Promo P-002)",
        pokemon_name: "Roronoa Zoro P-002",
        japanese_name: "ロロノア・ゾロ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-002",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-002.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-002.png"
      },
      {
        api_card_id: "p-002-en",
        english_name: "Roronoa Zoro",
        local_name: "Roronoa Zoro (Promo P-002)",
        pokemon_name: "Roronoa Zoro P-002",
        japanese_name: "ロロノア・ゾロ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-002",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-002.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-002.png"
      },
      {
        api_card_id: "p-003-ja",
        english_name: "Crocodile",
        local_name: "クロコダイル (Promo P-003)",
        pokemon_name: "Crocodile P-003",
        japanese_name: "クロコダイル",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-003",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-003.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-003.png"
      },
      {
        api_card_id: "p-003-en",
        english_name: "Crocodile",
        local_name: "Crocodile (Promo P-003)",
        pokemon_name: "Crocodile P-003",
        japanese_name: "クロコダイル",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-003",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-003.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-003.png"
      },
      {
        api_card_id: "p-004-ja",
        english_name: "Nami",
        local_name: "ナミ (Promo P-004)",
        pokemon_name: "Nami P-004",
        japanese_name: "ナミ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-004",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-004.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-004.png"
      },
      {
        api_card_id: "p-004-en",
        english_name: "Nami",
        local_name: "Nami (Promo P-004)",
        pokemon_name: "Nami P-004",
        japanese_name: "ナミ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-004",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-004.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-004.png"
      },
      {
        api_card_id: "p-005-ja",
        english_name: "Tony Tony.Chopper",
        local_name: "トニートニー・チョッパー (Promo P-005)",
        pokemon_name: "Tony Tony.Chopper P-005",
        japanese_name: "トニートニー・チョッパー",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-005",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-005.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-005.png"
      },
      {
        api_card_id: "p-005-en",
        english_name: "Tony Tony.Chopper",
        local_name: "Tony Tony.Chopper (Promo P-005)",
        pokemon_name: "Tony Tony.Chopper P-005",
        japanese_name: "トニートニー・チョッパー",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-005",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-005.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-005.png"
      },
      {
        api_card_id: "p-013-ja",
        english_name: "Uta",
        local_name: "ウタ (Promo P-013)",
        pokemon_name: "Uta P-013",
        japanese_name: "ウタ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-013",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-013.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-013.png"
      },
      {
        api_card_id: "p-013-en",
        english_name: "Uta",
        local_name: "Uta (Promo P-013)",
        pokemon_name: "Uta P-013",
        japanese_name: "ウタ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-013",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-013.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-013.png"
      },
      {
        api_card_id: "p-021-ja",
        english_name: "Monkey D. Luffy",
        local_name: "モンキー・D・ルフィ (Promo P-021)",
        pokemon_name: "Monkey D. Luffy P-021",
        japanese_name: "モンキー・D・ルフィ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-021",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-021.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-021.png"
      },
      {
        api_card_id: "p-021-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Promo P-021)",
        pokemon_name: "Monkey D. Luffy P-021",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-021",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-021.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-021.png"
      },
      {
        api_card_id: "p-025-ja",
        english_name: "Roronoa Zoro",
        local_name: "ロロノア・ゾロ (Promo P-025)",
        pokemon_name: "Roronoa Zoro P-025",
        japanese_name: "ロロノア・ゾロ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-025",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-025.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-025.png"
      },
      {
        api_card_id: "p-025-en",
        english_name: "Roronoa Zoro",
        local_name: "Roronoa Zoro (Promo P-025)",
        pokemon_name: "Roronoa Zoro P-025",
        japanese_name: "ロロノア・ゾロ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-025",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-025.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-025.png"
      },
      {
        api_card_id: "p-035-ja",
        english_name: "Monkey D. Luffy",
        local_name: "モンキー・D・ルフィ (Promo P-035)",
        pokemon_name: "Monkey D. Luffy P-035",
        japanese_name: "モンキー・D・ルフィ",
        language: "JA",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-035",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-035.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-035.png"
      },
      {
        api_card_id: "p-035-en",
        english_name: "Monkey D. Luffy",
        local_name: "Monkey D. Luffy (Promo P-035)",
        pokemon_name: "Monkey D. Luffy P-035",
        japanese_name: "モンキー・D・ルフィ",
        language: "EN",
        set_name: "Promotional Cards",
        set_code: "PR",
        card_number: "P-035",
        rarity: "Promo",
        supertype: "Character",
        image_small: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-035.png",
        image_large: "https://asia-en.onepiece-cardgame.com/images/cardlist/card/P-035.png"
      }
    ];
    }

    for (const card of opCards) {
      let imageSmall = card.image_small;
      let imageLarge = card.image_large;
      
      // If the card is in Japanese, point its image to the official Japanese domain
      if (card.language === "JA") {
        if (imageSmall && imageSmall.includes("asia-en.onepiece-cardgame.com")) {
          imageSmall = imageSmall.replace("asia-en.onepiece-cardgame.com", "onepiece-cardgame.com");
        }
        if (imageLarge && imageLarge.includes("asia-en.onepiece-cardgame.com")) {
          imageLarge = imageLarge.replace("asia-en.onepiece-cardgame.com", "onepiece-cardgame.com");
        }
      }

      await dbRun(`
        INSERT OR IGNORE INTO cards (
          api_card_id, english_name, local_name, pokemon_name, japanese_name,
          language, set_name, set_code, card_number, rarity, supertype,
          image_small, image_large, game
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'onepiece')
      `, [
        card.api_card_id, card.english_name, card.local_name, card.pokemon_name, card.japanese_name,
        card.language, card.set_name, card.set_code, card.card_number, card.rarity, card.supertype,
        imageSmall, imageLarge
      ]);
    }

    console.log("[OnePieceSeed] Successfully seeded One Piece TCG sets and premium cards.");
  } catch (err) {
    console.warn("[OnePieceSeed] Bootstrapping failed:", err);
  }
}

function runOnePieceOfficialImport(limit = "0") {
  return new Promise<void>((resolve, reject) => {
    const args = ["onepiece_importer.py", "import", "--sets-count", limit];
    console.log(`[OnePieceSync] Running python3 ${args.join(" ")}`);
    const importer = spawn("python3", args, {
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });

    importer.stdout.on("data", (data) => console.log(`[OnePieceSync] ${data.toString().trim()}`));
    importer.stderr.on("data", (data) => console.warn(`[OnePieceSync WARN] ${data.toString().trim()}`));
    importer.on("error", reject);
    importer.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`One Piece importer exited with code ${code}`));
      }
    });
  });
}

// ----------------------------------------

// ----------------------------------------
// API ENDPOINTS
// ----------------------------------------

// URL Link Generators mirroring python logic
const generateEbayLink = (engName: string, setName: string, cardNum: string, game = "pokemon") => {
  const query = game === "onepiece"
    ? `${engName} ${setName} ${cardNum} one piece tcg`
    : `${engName} ${setName} ${cardNum} pokemon tcg`;
  return `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(query)}`;
};

const generateCardmarketLink = (engName: string, cardNum: string, game = "pokemon") => {
  // strip out any Japanese characters from both english_name and card number
  const cleanEngName = (engName || "").replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g, "").trim().replace(/\s+/g, " ");
  const cleanCardNum = (cardNum || "").replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g, "").trim().replace(/\s+/g, " ");
  
  const query = `${cleanEngName} ${cleanCardNum}`.trim().replace(/\s+/g, " ");
  const gameSubpath = game === "onepiece" ? "OnePiece" : "Pokemon";
  return `https://www.cardmarket.com/de/${gameSubpath}/Products/Search?searchString=${encodeURIComponent(query)}`;
};

const enrichCard = (card: any) => {
  if (!card) return card;
  let game = (card.game || "pokemon").toLowerCase();
  
  // Defensive heal on-the-fly for One Piece cards (including OP, ST, PR promo codes and P- card numbers)
  const apiId = (card.api_card_id || "").toLowerCase();
  const setCode = (card.set_code || "").toLowerCase();
  if (game === "pokemon" && (apiId.startsWith("op") || apiId.startsWith("st") || setCode.startsWith("op") || setCode.startsWith("st") || setCode === "pr" || apiId.startsWith("p-") || /^p-\d+/.test(apiId))) {
    game = "onepiece";
  }
  
  const isJa = card.language?.toUpperCase() === "JA";
  const gameSubpath = game === "onepiece" ? "OnePiece" : "Pokemon";
  
  let englishName = card.english_name || "";
  let pokemonName = card.pokemon_name || "";

  if (game === "pokemon" && isJa) {
    const cacheMapped = translateCardNameUsingCache(card.local_name || "");
    if (cacheMapped.english && cacheMapped.english !== (card.local_name || "")) {
      const hasJaChars = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(englishName);
      const isMismatched = !englishName || 
                         englishName === "Unknown" || 
                         englishName === (card.local_name || "") ||
                         hasJaChars ||
                         !englishName.toLowerCase().includes(cacheMapped.english.toLowerCase().split(' ')[0]);
      if (isMismatched) {
        englishName = cacheMapped.english;
        pokemonName = cacheMapped.german;
      }
    }
  }

  // Ensure cardmarket search term absolutely excludes any remaining Japanese characters
  let cleanCardmarketTerm = englishName || "";
  const hasJaInTerm = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(cleanCardmarketTerm);
  if (hasJaInTerm) {
    cleanCardmarketTerm = cleanCardmarketTerm.replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g, "").trim();
  }
  
  let englishSetName = "";
  let germanSetName = "";
  if (card.set_code) {
    const translation = setTranslationCache[card.set_code.toUpperCase()];
    if (translation) {
      englishSetName = translation.EN || "";
      germanSetName = translation.DE || "";
    }
  }

  // Compute Cardmarket link using English name and Card number (reverted from including Set Name)
  const cardmarketLink = generateCardmarketLink(cleanCardmarketTerm, card.card_number || "", game);
    
  let cleanEbayTerm = englishName || "";
  if (/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(cleanEbayTerm)) {
    cleanEbayTerm = cleanEbayTerm.replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/g, "").trim();
  }

  const ebayLink = isJa
    ? (game === "onepiece"
       ? `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(`${cleanEbayTerm} Japanese One Piece TCG ${card.set_code || ""} ${card.card_number || ""}`)}`
       : `https://www.ebay.de/sch/i.html?_nkw=${encodeURIComponent(`${cleanEbayTerm} Japanese ${card.set_code || ""} ${card.card_number || ""}`)}`)
    : generateEbayLink(cleanEbayTerm, card.set_name || "", card.card_number || "", game);

  return {
    ...card,
    english_name: englishName,
    pokemon_name: pokemonName,
    cardmarket_link: cardmarketLink,
    ebay_link: ebayLink,
    english_set_name: englishSetName || "",
    german_set_name: germanSetName || ""
  };
};

// GET Image Proxy to bypass same-origin/CORS & hotlink protection on official catalog domains
app.get("/api/image-proxy", async (req, res) => {
  try {
    const imageUrl = req.query.url as string;
    if (!imageUrl) {
      return res.status(400).send("Parameter 'url' ist erforderlich.");
    }

    const parsedUrl = new URL(imageUrl);
    const allowedHosts = [
      "onepiece-cardgame.com",
      "asia-en.onepiece-cardgame.com",
      "en.onepiece-cardgame.com",
      "assets.tcgdex.net",
      "assets.pokemon-card.com",
      "pokemon-card.com"
    ];
    
    const isAllowed = allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith("." + host));
    if (!isAllowed) {
      return res.status(403).send("Host nicht erlaubt.");
    }

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    if (parsedUrl.hostname.includes("onepiece-cardgame.com")) {
      headers["Referer"] = "https://asia-en.onepiece-cardgame.com/";
    } else if (parsedUrl.hostname.includes("pokemon-card.com")) {
      headers["Referer"] = "https://www.pokemon-card.com/";
    }

    let imgResponse = await fetch(imageUrl, { headers });
    
    // Auto-correction fallback if 404 is returned on official One Piece domains
    if (!imgResponse.ok && imgResponse.status === 404 && parsedUrl.hostname.includes("onepiece-cardgame.com")) {
      const urlStr = imageUrl;
      const filename = urlStr.substring(urlStr.lastIndexOf("/") + 1);
      const baseUrl = urlStr.substring(0, urlStr.lastIndexOf("/") + 1);
      
      let fallbackUrl: string | null = null;
      if (filename !== filename.toLowerCase()) {
        fallbackUrl = baseUrl + filename.toLowerCase();
      } else if (filename !== filename.toUpperCase()) {
        fallbackUrl = baseUrl + filename.toUpperCase();
      }
      
      if (fallbackUrl) {
        console.log(`[ImageProxy Fallback] Original URL 404: ${imageUrl}, trying fallback: ${fallbackUrl}`);
        const fallbackResponse = await fetch(fallbackUrl, { headers });
        if (fallbackResponse.ok) {
          imgResponse = fallbackResponse;
        }
      }
    }

    if (!imgResponse.ok) {
      return res.status(imgResponse.status).send(`Fehler beim Laden des Bildes: ${imgResponse.statusText}`);
    }

    const contentType = imgResponse.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    
    // Cache globally for 1 day
    res.setHeader("Cache-Control", "public, max-age=86400");

    const arrayBuffer = await imgResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (err: any) {
    console.error("Fehler im Image-Proxy:", err);
    res.status(500).send("Interner Serverfehler.");
  }
});

// TEMPORARY Test Scraper endpoint to examine One Piece Card list HTML structure
app.get("/api/test-scrape", async (req, res) => {
  try {
    const fs = require("fs");
    const targetUrl = "https://asia-en.onepiece-cardgame.com/cardlist/?series=556101";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://asia-en.onepiece-cardgame.com/"
    };
    const response = await fetch(targetUrl, { headers });
    const text = await response.text();
    
    // Write full html to a file to examine
    fs.writeFileSync("./scrape_output.html", text, "utf8");
    
    // Find some sample matches of card class or images or text
    const imgMatches: string[] = [];
    const nameMatches: string[] = [];
    
    // Let's search for image names matching card structure e.g. .png or OP01
    const regexImg = /src="([^"]+OP01-[^"]+)"/g;
    let m;
    while ((m = regexImg.exec(text)) !== null) {
      imgMatches.push(m[1]);
    }
    
    res.json({
      status: "success",
      length: text.length,
      snippet: text.substring(0, 1000),
      imgMatches: imgMatches.slice(0, 15),
      message: "Scrape successful. Check /scrape_output.html for full content."
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all sets
type PricingOptions = {
  yen_price?: number;
  exchange_rate?: number;
  import_vat_percent?: number;
  customs_fee_eur?: number;
  platform_fee_percent?: number;
  target_margin_percent?: number;
  condition?: string;
  manual_market_price_eur?: number;
};

const TRUSTED_MARKET_PRICE_SOURCES = new Set([
  "manual",
  "cardmarket",
  "cardmarket_api",
  "cardmarket_csv",
  "cardmarket_export",
  "ebay_sold",
  "ebay_sold_csv",
  "tcgplayer",
  "pricecharting"
]);

const PRINTED_POKEMON_SET_CODE_ALIASES: Record<string, string> = {
  SVI: "sv01",
  PAL: "sv02",
  OBF: "sv03",
  MEW: "sv03.5",
  PAR: "sv04",
  PAF: "sv04.5",
  TEF: "sv05",
  TWM: "sv06",
  SFA: "sv06.5",
  SCR: "sv07",
  SSP: "sv08",
  PRE: "sv08.5",
  JTG: "sv09",
  DRI: "sv10",
  BLK: "sv10.5b",
  WHT: "sv10.5w"
};

const MARKET_PRICE_FRESH_DAYS = 14;
const MARKET_PRICE_STALE_DAYS = 45;

function normalizeMarketSource(source: any): string {
  return String(source || "manual").trim().toLowerCase().replace(/\s+/g, "_");
}

function positiveMoney(value: any): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function observedAgeDays(observedAt: any): number | null {
  if (!observedAt) return null;
  const ts = new Date(String(observedAt)).getTime();
  if (!Number.isFinite(ts)) return null;
  return Math.max(0, (Date.now() - ts) / 86400000);
}

function isTrustedMarketSource(source: any): boolean {
  const clean = normalizeMarketSource(source);
  return TRUSTED_MARKET_PRICE_SOURCES.has(clean) && !clean.includes("model") && !clean.includes("fallback");
}

function marketPriority(source: any): number {
  const clean = normalizeMarketSource(source);
  if (clean === "cardmarket_api" || clean === "cardmarket") return 0;
  if (clean === "cardmarket_csv" || clean === "cardmarket_export") return 1;
  if (clean === "manual") return 2;
  if (clean === "ebay_sold" || clean === "ebay_sold_csv") return 3;
  if (TRUSTED_MARKET_PRICE_SOURCES.has(clean)) return 4;
  return 99;
}

function selectBestMarketPrice(rows: any[] = []) {
  return rows
    .filter(row => positiveMoney(row?.market_price_eur) > 0 && isTrustedMarketSource(row?.source))
    .sort((a, b) => {
      const pa = marketPriority(a.source);
      const pb = marketPriority(b.source);
      if (pa !== pb) return pa - pb;
      return String(b.observed_at || "").localeCompare(String(a.observed_at || ""));
    })[0] || null;
}

function buildManualMarketOverride(value: any) {
  const price = positiveMoney(value);
  if (!price) return null;
  return {
    market_price_eur: price,
    low_price_eur: 0,
    trend_price_eur: 0,
    source: "manual",
    observed_at: new Date().toISOString(),
    notes: "Preis aus Request/Frontend manuell gesetzt."
  };
}

function getBackendEstimatedPrices(card: any, game: string) {
  // Transparent local model used only when no manual/imported market price exists.
  // It is intentionally conservative and no longer pretends to be Cardmarket data.
  if (!card) return { raw: 0, psa8: 0, psa9: 0, psa10: 0, source: "none", confidence: "none" };
  const score = localDemandScoreForCard(card);
  const r = String(card.rarity || "").toLowerCase();
  let rawPrice = 0.35;
  if (/special illustration|sar|manga|super parallel/.test(r)) rawPrice = 35;
  else if (/secret|hyper|sec|sp/.test(r)) rawPrice = 22;
  else if (/illustration|\bar\b|ultra|sr/.test(r)) rawPrice = 8;
  else if (/double|rr|leader|promo/.test(r)) rawPrice = 3.5;
  else if (/holo|rare/.test(r)) rawPrice = 1.2;
  rawPrice *= Math.max(0.65, score / 58);
  const isOnePiece = game === "onepiece" || /^(OP|ST|EB|PR)/i.test(String(card.set_code || ""));
  if (isOnePiece) rawPrice *= 1.15;
  rawPrice = Math.max(0.05, Math.round(rawPrice * 100) / 100);
  return {
    raw: rawPrice,
    psa8: Math.round(rawPrice * 1.45 * 100) / 100,
    psa9: Math.round(rawPrice * 2.25 * 100) / 100,
    psa10: Math.round(rawPrice * (score >= 80 ? 7.5 : 4.5) * 100) / 100,
    source: "local_model_reference",
    confidence: "not_a_market_price",
    is_market_price: false
  };
}

function calculateDealAnalysis(card: any, options: PricingOptions = {}, marketOverride?: any) {
  const exchangeRate = Number(options.exchange_rate || 165);
  const yenPrice = Math.max(0, Number(options.yen_price || card?.yen_price || 0));
  const importVat = Number(options.import_vat_percent ?? 19);
  const customsFee = Number(options.customs_fee_eur ?? 0.35);
  const platformFee = Number(options.platform_fee_percent ?? 12);
  const targetMargin = Number(options.target_margin_percent ?? 30);
  const requestManualMarket = buildManualMarketOverride(options.manual_market_price_eur);
  const selectedMarket = requestManualMarket || (marketOverride && isTrustedMarketSource(marketOverride.source) ? marketOverride : null);
  const marketPriceEur = positiveMoney(selectedMarket?.market_price_eur);
  const marketAgeDays = observedAgeDays(selectedMarket?.observed_at);
  const priceIsStale = marketPriceEur > 0 && marketAgeDays !== null && marketAgeDays > MARKET_PRICE_FRESH_DAYS;
  const priceIsExpired = marketPriceEur > 0 && marketAgeDays !== null && marketAgeDays > MARKET_PRICE_STALE_DAYS;
  const localModel = getBackendEstimatedPrices(card, String(card?.game || "pokemon"));
  const grossCostEur = yenPrice > 0 ? yenPrice / exchangeRate : 0;
  const landedCostEur = grossCostEur > 0 ? grossCostEur * (1 + importVat / 100) + customsFee : 0;
  const netRevenueEur = marketPriceEur * (1 - platformFee / 100);
  const profitEur = landedCostEur > 0 ? netRevenueEur - landedCostEur : 0;
  const roiPercent = landedCostEur > 0 ? (profitEur / landedCostEur) * 100 : 0;
  const requiredCostEur = marketPriceEur > 0 ? (netRevenueEur / (1 + targetMargin / 100)) : 0;
  const maxBuyYen = marketPriceEur > 0 ? Math.max(0, Math.floor(((requiredCostEur - customsFee) / (1 + importVat / 100)) * exchangeRate)) : 0;
  let decision: "BUY" | "CHECK" | "SKIP" = "CHECK";
  let decisionReason = "market_price_missing";
  if (marketPriceEur > 0) {
    decisionReason = priceIsExpired
      ? "market_price_expired"
      : priceIsStale
        ? "market_price_stale_recheck_required"
        : "trusted_market_price";
    if (!priceIsStale && !priceIsExpired && yenPrice > 0 && yenPrice <= maxBuyYen && profitEur >= Math.max(3, marketPriceEur * 0.12)) {
      decision = "BUY";
      decisionReason = "margin_target_met";
    }
    if (yenPrice > 0 && (yenPrice > maxBuyYen || profitEur < 1)) {
      decision = "SKIP";
      decisionReason = "margin_target_missed";
    }
  }

  return {
    market_price_eur: Math.round(marketPriceEur * 100) / 100,
    market_source: selectedMarket?.source || "missing_market_price",
    market_confidence: marketPriceEur > 0
      ? (priceIsExpired ? "expired" : priceIsStale ? "stale" : "trusted")
      : "missing",
    market_observed_at: selectedMarket?.observed_at || null,
    market_age_days: marketAgeDays === null ? null : Math.round(marketAgeDays * 10) / 10,
    market_price_required: marketPriceEur <= 0,
    can_calculate_deal: marketPriceEur > 0 && !priceIsExpired,
    yen_price: yenPrice,
    exchange_rate: exchangeRate,
    landed_cost_eur: Math.round(landedCostEur * 100) / 100,
    net_revenue_eur: Math.round(netRevenueEur * 100) / 100,
    expected_profit_eur: Math.round(profitEur * 100) / 100,
    roi_percent: Math.round(roiPercent * 10) / 10,
    max_buy_yen: maxBuyYen,
    decision,
    decision_reason: decisionReason,
    reference_model: localModel,
    assumptions: {
      import_vat_percent: importVat,
      customs_fee_eur: customsFee,
      platform_fee_percent: platformFee,
      target_margin_percent: targetMargin
    }
  };
}

app.get("/api/cards/:api_card_id/pricing", async (req, res) => {
  try {
    const { api_card_id } = req.params;
    const game = String(req.query.game || "pokemon").toLowerCase();
    const card = await dbGet("SELECT * FROM cards WHERE api_card_id = ? AND game = ? LIMIT 1", [api_card_id, game]);
    if (!card) return res.status(404).json({ error: "Karte nicht gefunden." });
    const marketRows = await dbAll("SELECT * FROM market_prices WHERE api_card_id = ? AND game = ? ORDER BY observed_at DESC", [api_card_id, game]);
    const market = selectBestMarketPrice(marketRows);
    const analysis = calculateDealAnalysis(card, {
      yen_price: Number(req.query.yen_price || 0),
      exchange_rate: Number(req.query.exchange_rate || 165),
      import_vat_percent: Number(req.query.import_vat_percent || 19),
      customs_fee_eur: Number(req.query.customs_fee_eur || 0.35),
      platform_fee_percent: Number(req.query.platform_fee_percent || 12),
      target_margin_percent: Number(req.query.target_margin_percent || 30),
      manual_market_price_eur: Number(req.query.manual_market_price_eur || 0)
    }, market);
    res.json({ success: true, card: enrichCard(card), market_price: market || null, market_prices: marketRows, analysis });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/prices/upsert", async (req, res) => {
  try {
    const { api_card_id, game = "pokemon", market_price_eur, low_price_eur = 0, trend_price_eur = 0, source = "manual", source_url = "", notes = "" } = req.body || {};
    const cleanSource = normalizeMarketSource(source);
    const marketPrice = positiveMoney(market_price_eur);
    const lowPrice = positiveMoney(low_price_eur);
    const trendPrice = positiveMoney(trend_price_eur);
    if (!api_card_id || !marketPrice) return res.status(400).json({ error: "api_card_id und ein positiver market_price_eur sind erforderlich." });
    if (!isTrustedMarketSource(cleanSource)) return res.status(400).json({ error: "source muss eine echte Preisquelle sein, z.B. manual, cardmarket_csv, cardmarket_api oder ebay_sold. Modell-/Fallback-Preise werden nicht gespeichert." });
    if (marketPrice > 100000) return res.status(400).json({ error: "market_price_eur wirkt unplausibel hoch und wurde abgelehnt." });
    await dbRun(`
      INSERT INTO market_prices (api_card_id, game, market_price_eur, low_price_eur, trend_price_eur, source, source_url, observed_at, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(api_card_id, game, source) DO UPDATE SET
        market_price_eur = excluded.market_price_eur,
        low_price_eur = excluded.low_price_eur,
        trend_price_eur = excluded.trend_price_eur,
        source_url = excluded.source_url,
        observed_at = CURRENT_TIMESTAMP,
        notes = excluded.notes;
    `, [api_card_id, String(game).toLowerCase(), marketPrice, lowPrice, trendPrice, cleanSource, source_url, notes]);
    const row = await dbGet("SELECT * FROM market_prices WHERE api_card_id = ? AND game = ? AND source = ?", [api_card_id, String(game).toLowerCase(), cleanSource]);
    res.json({ success: true, price: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/sets", async (req, res) => {
  try {
    const game = req.query.game || "pokemon";
    
    // Auto-seed/Self-heal One Piece sets/cards if database was reset or cleared
    if (game === "onepiece") {
      const checkCards = await dbAll("SELECT id FROM cards WHERE game = 'onepiece' LIMIT 1", []);
      if (!checkCards || checkCards.length === 0) {
        console.log("[Auto-Seed] No One Piece cards found. Legacy fallback seed is disabled; run the official One Piece importer.");
        await seedOnePieceData(true);
      }
    }

    if (Object.keys(setTranslationCache).length === 0) {
      await loadSetTranslations();
    }
    const rows = await dbAll(`
      SELECT s.* FROM sets s 
      WHERE s.game = ? AND EXISTS (
        SELECT 1 FROM cards c 
        WHERE c.set_code = s.set_code AND c.language = s.language AND c.game = ?
      )
      ORDER BY s.release_date DESC
    `, [game, game]) as any[];

    const enrichedRows = [];
    for (const s of rows) {
      let englishSetName = "";
      let germanSetName = "";
      if (s.set_code) {
        const translation = setTranslationCache[s.set_code.toUpperCase()];
        if (translation) {
          englishSetName = translation.EN || "";
          germanSetName = translation.DE || "";
        }
      }

      // Fetch cards in this set to compute dynamic stats
      const setCards = await dbAll(
        "SELECT * FROM cards WHERE set_code = ? AND language = ? AND game = ?",
        [s.set_code, s.language, game]
      );

      const marketRows = setCards.length > 0
        ? await dbAll(
            `SELECT * FROM market_prices WHERE game = ? AND api_card_id IN (${setCards.map(() => "?").join(",")})`,
            [game, ...setCards.map((c: any) => c.api_card_id)]
          )
        : [];
      const marketByCardId = new Map<string, any[]>();
      for (const row of marketRows) {
        const key = String(row.api_card_id || "");
        const list = marketByCardId.get(key) || [];
        list.push(row);
        marketByCardId.set(key, list);
      }

      const cardPrices = setCards.map(c => {
        const market = selectBestMarketPrice(marketByCardId.get(String(c.api_card_id || "")) || []);
        const reference = getBackendEstimatedPrices(c, String(game));
        const marketRaw = positiveMoney(market?.market_price_eur);
        const prices = marketRaw > 0
          ? {
              raw: marketRaw,
              psa8: 0,
              psa9: 0,
              psa10: 0,
              source: market.source,
              confidence: "trusted",
              observed_at: market.observed_at,
              is_market_price: true
            }
          : {
              raw: 0,
              psa8: 0,
              psa9: 0,
              psa10: 0,
              source: "missing_market_price",
              confidence: "missing",
              is_market_price: false,
              reference_model: reference
            };
        return {
          card: c,
          prices
        };
      });

      const pricedCardPrices = cardPrices.filter(cp => cp.prices.raw > 0);

      cardPrices.sort((a, b) => b.prices.raw - a.prices.raw);

      const top5 = pricedCardPrices
        .sort((a, b) => b.prices.raw - a.prices.raw)
        .slice(0, 5)
        .map(cp => ({
        id: cp.card.id,
        api_card_id: cp.card.api_card_id,
        english_name: cp.card.english_name,
        local_name: cp.card.local_name,
        pokemon_name: cp.card.pokemon_name,
        card_number: cp.card.card_number,
        rarity: cp.card.rarity,
        image_small: cp.card.image_small,
        image_large: cp.card.image_large,
        prices: cp.prices
      }));

      const totalValueRaw = pricedCardPrices.reduce((sum, cp) => sum + cp.prices.raw, 0);
      const avgPriceRaw = pricedCardPrices.length > 0 ? totalValueRaw / pricedCardPrices.length : 0;
      const highestPriceRaw = pricedCardPrices.length > 0 ? Math.max(...pricedCardPrices.map(cp => cp.prices.raw)) : 0;

      const totalValuePsa10 = 0;
      const avgPricePsa10 = 0;
      const highestPricePsa10 = 0;

      enrichedRows.push({
        ...s,
        english_set_name: englishSetName || "",
        german_set_name: germanSetName || "",
        stats: {
          total_cards_db: setCards.length,
          priced_cards_db: pricedCardPrices.length,
          total_value_raw: totalValueRaw,
          average_price_raw: avgPriceRaw,
          highest_price_raw: highestPriceRaw,
          total_value_psa10: totalValuePsa10,
          average_price_psa10: avgPricePsa10,
          highest_price_psa10: highestPricePsa10,
          price_source: pricedCardPrices.length > 0 ? "market_prices" : "missing_market_prices",
          price_confidence: pricedCardPrices.length > 0 ? "trusted/imported_or_manual" : "missing"
        },
        top_5_cards: top5
      });
    }

    res.json(enrichedRows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET cards with filters & pagination
app.get("/api/cards", async (req, res) => {
  try {
    const { english_name, local_name, set_name, card_number, language, rarity, limit = 50, offset = 0, game = "pokemon" } = req.query;
    
    // Auto-seed/Self-heal One Piece sets/cards if database was reset or cleared
    if (game === "onepiece") {
      const checkCards = await dbAll("SELECT id FROM cards WHERE game = 'onepiece' LIMIT 1", []);
      if (!checkCards || checkCards.length === 0) {
        console.log("[Auto-Seed] No One Piece cards found in get-cards. Legacy fallback seed is disabled; run the official One Piece importer.");
        await seedOnePieceData(true);
      }
    }

    if (Object.keys(setTranslationCache).length === 0) {
      await loadSetTranslations();
    }
    
    let query = "SELECT * FROM cards WHERE game = ?";
    const params: any[] = [game];

    if (english_name || local_name) {
      const searchValPlain = String(english_name || local_name).trim();
      const searchLikeValue = `%${searchValPlain}%`;

      let matchingSpecies: any[] = [];
      if (game === "pokemon") {
        try {
          matchingSpecies = await dbAll(
            `SELECT english_name, german_name, japanese_name 
             FROM pokemon_species 
             WHERE english_name LIKE ? 
                OR german_name LIKE ? 
                OR japanese_name LIKE ?`,
            [searchLikeValue, searchLikeValue, searchLikeValue]
          );
        } catch (err) {
          console.warn("Error matching species during search:", err);
        }
      }

      if (matchingSpecies.length > 0) {
        // We found a matching species! Clean, unique list of all translated names for matching species
        const allNamesSet = new Set<string>();
        allNamesSet.add(searchValPlain);

        for (const sp of matchingSpecies) {
          if (sp.english_name) allNamesSet.add(sp.english_name);
          if (sp.german_name) allNamesSet.add(sp.german_name);
          if (sp.japanese_name) allNamesSet.add(sp.japanese_name);
        }

        const allNames = Array.from(allNamesSet);
        console.log(`Cross-language species query expanded: Matched ${matchingSpecies.length} species. Synonyms:`, allNames);

        // We construct a query that matches any of these synonym names
        const clauses: string[] = [];
        for (const name of allNames) {
          clauses.push("english_name LIKE ?");
          clauses.push("local_name LIKE ?");
          clauses.push("pokemon_name LIKE ?");
          clauses.push("japanese_name LIKE ?");
          params.push(`%${name}%`, `%${name}%`, `%${name}%`, `%${name}%`);
        }
        query += ` AND (${clauses.join(" OR ")})`;
      } else {
        // Fallback: standard simple search if no species was found matching the input
        query += " AND (english_name LIKE ? OR local_name LIKE ? OR pokemon_name LIKE ? OR japanese_name LIKE ?)";
        params.push(searchLikeValue, searchLikeValue, searchLikeValue, searchLikeValue);
      }
    }
    if (set_name) {
      query += " AND set_name LIKE ?";
      params.push(`%${set_name}%`);
    }
    if (card_number) {
      query += " AND card_number = ?";
      params.push(String(card_number));
    }
    if (language) {
      query += " AND language = ?";
      params.push(String(language).toUpperCase());
    }
    if (rarity) {
      let rarityList: string[] = [];
      if (Array.isArray(rarity)) {
        rarityList = rarity.map(r => String(r).toLowerCase().trim());
      } else {
        rarityList = String(rarity).split(",").map(r => r.toLowerCase().trim()).filter(Boolean);
      }

      if (rarityList.length > 0) {
        const clauses: string[] = [];
        for (const r of rarityList) {
          if (r === 'common' || r === 'häufig') {
            clauses.push("LOWER(rarity) IN ('common', 'c')");
          } else if (r === 'uncommon' || r === 'ungewöhnlich') {
            clauses.push("LOWER(rarity) IN ('uncommon', 'u')");
          } else if (r === 'rare' || r === 'selten') {
            clauses.push("LOWER(rarity) IN ('rare', 'r')");
          } else if (r === 'rare holo' || r === 'rare_holo' || r === 'holo') {
            clauses.push("LOWER(rarity) = 'rare holo'");
          } else if (r === 'ultra rare' || r === 'ultra_rare') {
            clauses.push("LOWER(rarity) IN ('ultra rare', 'sr')");
          } else if (r === 'secret rare' || r === 'secret_rare' || r === 'secret') {
            clauses.push("LOWER(rarity) = 'secret rare'");
          } else if (r === 'special illustration rare' || r === 'special_illustration_rare' || r === 'sar' || r === 'special illustration') {
            clauses.push("LOWER(rarity) IN ('special illustration rare', 'sar')");
          } else if (r === 'illustration rare' || r === 'illustration_rare' || r === 'ar') {
            clauses.push("LOWER(rarity) IN ('illustration rare', 'ar')");
          } else if (r === 'double rare' || r === 'double_rare' || r === 'rr') {
            clauses.push("LOWER(rarity) IN ('double rare', 'rr')");
          } else if (r === 'hyper rare' || r === 'hyper_rare' || r === 'ur') {
            clauses.push("LOWER(rarity) IN ('hyper rare', 'ur')");
          } else {
            clauses.push("LOWER(rarity) = ?");
            params.push(r);
          }
        }
        if (clauses.length > 0) {
          query += " AND (" + clauses.join(" OR ") + ")";
        }
      }
    }

    query += " ORDER BY release_date DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    let rows = await dbAll(query, params);
    
    // Deduplicate One Piece cards in list view if no explicit language filter is requested
    if (game === "onepiece" && !language) {
      const uniqueCards: any[] = [];
      const seenVariantKeys = new Set<string>();
      for (const card of rows) {
        const apiVariantId = String(card.api_card_id || "").replace(/-(en|ja)$/i, "");
        const variantKey = `${String(card.set_code || "").toUpperCase()}|${apiVariantId || String(card.card_number || "").toUpperCase()}`;
        if (!seenVariantKeys.has(variantKey)) {
          seenVariantKeys.add(variantKey);
          uniqueCards.push(card);
        } else {
          // If already seen, but the seen one is JA and this one is EN, we prefer EN entries.
          const idx = uniqueCards.findIndex(c => {
            const existingVariantId = String(c.api_card_id || "").replace(/-(en|ja)$/i, "");
            const existingKey = `${String(c.set_code || "").toUpperCase()}|${existingVariantId || String(c.card_number || "").toUpperCase()}`;
            return existingKey === variantKey;
          });
          if (idx !== -1 && uniqueCards[idx].language === "JA" && card.language === "EN") {
            uniqueCards[idx] = card;
          }
        }
      }
      rows = uniqueCards;
    }

    const enrichedRows = rows.map(enrichCard);
    res.json(enrichedRows);
  } catch (err: any) {
    res.status(550).json({ error: err.message });
  }
});


function scoreToTier(score: number): string {
  if (score >= 90) return "S";
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

function localDemandScoreForCard(card: any): number {
  const text = `${card?.english_name || ""} ${card?.pokemon_name || ""} ${card?.local_name || ""} ${card?.rarity || ""} ${card?.set_name || ""}`.toLowerCase();
  let score = 28;
  const premiumNames = ["pikachu", "charizard", "glurak", "mew", "mewtwo", "eevee", "umbreon", "nachtara", "rayquaza", "gengar", "lugia", "latias", "latios", "iono", "lillie", "nami", "luffy", "zoro", "shanks", "ace", "law", "yamato"];
  if (premiumNames.some(n => text.includes(n))) score += 28;
  if (/special illustration|sar|secret|hyper|alt art|alternate|super parallel|manga/.test(text)) score += 28;
  else if (/illustration|\bar\b|ultra|sr|sec|sp|leader|promo/.test(text)) score += 18;
  else if (/rare holo|holo|double rare|rr|rare/.test(text)) score += 8;
  if (/151|evolving skies|terastal|vstar universe|tag all stars|romance dawn|op05|op01/.test(text)) score += 9;
  if ((card?.language || "").toUpperCase() === "JA") score += 3;
  return Math.max(5, Math.min(100, score));
}

function buildLocalCardEvaluation(card: any) {
  const score = localDemandScoreForCard(card);
  const tier = scoreToTier(score);
  const rarity = card?.rarity || "unbekannter Seltenheit";
  const name = card?.pokemon_name || card?.english_name || card?.local_name || "Diese Karte";
  const justification = `${name} wird lokal nach festen Händler-Regeln bewertet: Name/Charakter, Seltenheit, Set-Relevanz, Sprache und erwartete Liquidität. Die erkannte Seltenheit ist ${rarity}; beliebte Charaktere und Illustration-/Secret-Rares erhalten einen deutlichen Liquiditätsaufschlag. Das Ergebnis ist bewusst kein KI-Text und kein Live-Cardmarket-Preis, sondern ein schneller, reproduzierbarer Einkaufsfilter für japanische Shops. Für den finalen Kauf solltest du den Ziel-Verkaufspreis manuell oder über deine eigene Preisquelle im Preisbereich hinterlegen.`;
  return { score, tier, justification };
}

function buildLocalSetEvaluation(setDetails: any, setCards: any[]) {
  const cardScores = setCards.map(localDemandScoreForCard);
  const avg = cardScores.length ? cardScores.reduce((a, b) => a + b, 0) / cardScores.length : 40;
  const chaseCount = cardScores.filter(s => s >= 75).length;
  const score = Math.max(10, Math.min(100, Math.round(avg + Math.min(18, chaseCount * 3))));
  const tier = scoreToTier(score);
  const justification = `${setDetails.set_name} (${setDetails.set_code}) wurde lokal anhand der in der Datenbank vorhandenen Karten bewertet. Entscheidend sind die Anzahl potenzieller Chase-Karten, hochwertige Seltenheiten, bekannte Charaktere und die allgemeine Set-Beliebtheit. Es wurden ${setCards.length} Karten aus diesem Set berücksichtigt; davon wirken ${chaseCount} wie mögliche schnelle Verkäufer. Diese Bewertung ist deterministisch und benötigt keine Cloud-Analyse.`;
  return { score, tier, justification };
}

// GET reseller evaluation for a specific card
app.get("/api/cards/:api_card_id/evaluation", async (req, res) => {
  try {
    const { api_card_id } = req.params;
    const { language = 'JA' } = req.query;
    const langUpper = String(language).toUpperCase();

    const card = await dbGet(
      "SELECT * FROM cards WHERE api_card_id = ? AND language = ?",
      [api_card_id, langUpper]
    );

    let healedCard: any = null;
    if (card && langUpper === "JA") {
      const staticMapped = translateJapaneseBilingualStatic(card.local_name || "");
      if (staticMapped.english !== (card.local_name || "") && (!card.english_name || card.english_name === card.local_name || card.english_name === "Unknown")) {
        await dbRun(
          "UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?",
          [staticMapped.english, staticMapped.german, card.id]
        );
        const updated = await dbGet("SELECT * FROM cards WHERE id = ?", [card.id]);
        healedCard = enrichCard(updated);
      }
    }

    const row = await dbGet(
      "SELECT * FROM reseller_evaluations WHERE api_card_id = ? AND language = ?",
      [api_card_id, langUpper]
    );

    res.json({
      evaluated: !!row,
      evaluation: row || null,
      healedCard
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST force local translation correction for mismatched Japanese card names
app.post("/api/cards/:api_card_id/heal-translation", async (req, res) => {
  try {
    const { api_card_id } = req.params;
    const { language = 'JA' } = req.body;
    const langUpper = String(language).toUpperCase();
    const card = await dbGet("SELECT * FROM cards WHERE api_card_id = ? AND language = ?", [api_card_id, langUpper]);
    if (!card) return res.status(404).json({ error: `Karte ${api_card_id} mit Sprache ${langUpper} nicht gefunden.` });

    const mapped = translateJapaneseBilingualStatic(card.local_name || "");
    if (mapped.english === (card.local_name || "")) {
      return res.status(422).json({ error: "Keine lokale Übersetzung in der statischen Mapping-Tabelle gefunden. Bitte ergänze die Mapping-Tabelle oder korrigiere den Namen manuell in der Datenbank." });
    }

    await dbRun("UPDATE cards SET english_name = ?, pokemon_name = ? WHERE id = ?", [mapped.english, mapped.german, card.id]);
    const updatedCard = await dbGet("SELECT * FROM cards WHERE id = ?", [card.id]);
    return res.json({ success: true, card: enrichCard(updatedCard), source: "static_local_mapping" });
  } catch (err: any) {
    console.error("Failed local translation correction:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST trigger local reseller evaluation for a specific card
app.post("/api/cards/:api_card_id/evaluate", async (req, res) => {
  try {
    const { api_card_id } = req.params;
    const { language = 'JA', force = false } = req.body;
    const langUpper = String(language).toUpperCase();
    const card = await dbGet("SELECT * FROM cards WHERE api_card_id = ? AND language = ?", [api_card_id, langUpper]);
    if (!card) return res.status(404).json({ error: `Karte ${api_card_id} mit Sprache ${langUpper} nicht gefunden.` });

    if (!force) {
      const existing = await dbGet("SELECT * FROM reseller_evaluations WHERE api_card_id = ? AND language = ?", [api_card_id, langUpper]);
      if (existing) return res.json({ evaluated: true, evaluation: existing, engine: "local_reseller_rules_v2" });
    }

    const { score, tier, justification } = buildLocalCardEvaluation(card);
    await dbRun(`
      INSERT INTO reseller_evaluations (api_card_id, language, tier, score, justification, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(api_card_id, language) DO UPDATE SET
        tier = excluded.tier,
        score = excluded.score,
        justification = excluded.justification,
        updated_at = CURRENT_TIMESTAMP;
    `, [api_card_id, langUpper, tier, score, justification]);

    const finalRow = await dbGet("SELECT * FROM reseller_evaluations WHERE api_card_id = ? AND language = ?", [api_card_id, langUpper]);
    res.json({ evaluated: true, evaluation: finalRow, engine: "local_reseller_rules_v2" });
  } catch (err: any) {
    console.error("Fehler bei der lokalen Reseller-Bewertung:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET reseller evaluation for a specific set
app.get("/api/sets/:set_code/evaluation", async (req, res) => {
  try {
    const { set_code } = req.params;
    const { language = 'JA' } = req.query;

    const row = await dbGet(
      "SELECT * FROM reseller_set_evaluations WHERE set_code = ? AND language = ?",
      [set_code, String(language).toUpperCase()]
    );

    if (row) {
      res.json({ evaluated: true, evaluation: row });
    } else {
      res.json({ evaluated: false });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST trigger local reseller evaluation for a specific set
app.post("/api/sets/:set_code/evaluate", async (req, res) => {
  try {
    const { set_code } = req.params;
    const { language = 'JA', force = false } = req.body;
    const langUpper = String(language).toUpperCase();
    const setDetails = await dbGet("SELECT * FROM sets WHERE set_code = ? AND language = ?", [set_code, langUpper]);
    if (!setDetails) return res.status(404).json({ error: `Set ${set_code} mit Sprache ${langUpper} nicht in der Datenbank gefunden.` });

    if (!force) {
      const existing = await dbGet("SELECT * FROM reseller_set_evaluations WHERE set_code = ? AND language = ?", [set_code, langUpper]);
      if (existing) return res.json({ evaluated: true, evaluation: existing, engine: "local_set_rules_v2" });
    }

    const setCards = await dbAll("SELECT * FROM cards WHERE set_code = ? AND language = ? ORDER BY card_number ASC", [set_code, langUpper]);
    const { score, tier, justification } = buildLocalSetEvaluation(setDetails, setCards);
    await dbRun(`
      INSERT INTO reseller_set_evaluations (set_code, language, tier, score, justification, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(set_code, language) DO UPDATE SET
        tier = excluded.tier,
        score = excluded.score,
        justification = excluded.justification,
        updated_at = CURRENT_TIMESTAMP;
    `, [set_code, langUpper, tier, score, justification]);

    const finalRow = await dbGet("SELECT * FROM reseller_set_evaluations WHERE set_code = ? AND language = ?", [set_code, langUpper]);
    res.json({ evaluated: true, evaluation: finalRow, engine: "local_set_rules_v2" });
  } catch (err: any) {
    console.error("Fehler bei der lokalen Set-Reseller-Bewertung:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint to Reset database (safely handles disk image corruption by recreate)
app.post("/api/reset-db", async (req, res) => {
  try {
    const game = String(req.query.game || req.body?.game || "pokemon").toLowerCase();
    console.log(`Resetting database pokemon_cards.db on request for game: ${game}...`);
    // Pass true so bootstrapDatabase does not automatically seed One Piece, ensuring a complete clear
    await forceRecreateDatabase(true);

    if (game === "onepiece") {
      console.log("DB reset complete. Importing official One Piece TCG catalog...");
      await runOnePieceOfficialImport("0");
    } else {
      // Spawn automatic background seed for pokemon so they are back immediately after a DB reset
      console.log("DB reset complete. Launching background Python seed for Pokemon...");
      const seeder = spawn("python3", ["main.py", "import", "--sets-count", "1"], {
        env: { ...process.env, PYTHONUNBUFFERED: "1" }
      });
      seeder.stdout.on("data", (data) => console.log(`[RESET-SEED] ${data.toString().trim()}`));
      seeder.stderr.on("data", (data) => console.warn(`[RESET-SEED WARN] ${data.toString().trim()}`));
    }

    res.json({ success: true, message: `Datenbank erfolgreich zurückgesetzt für ${game === "onepiece" ? "One Piece" : "Pokémon"}.` });
  } catch (err: any) {
    console.error("Failed to reset database", err);
    res.status(500).json({ error: err.message });
  }
});

// POST endpoint to reset only AI reseller evaluations
app.post("/api/reset-evaluations", async (req, res) => {
  try {
    console.log("Resetting only AI reseller evaluations on request...");
    await dbRun("DELETE FROM reseller_evaluations;", []);
    await dbRun("DELETE FROM reseller_set_evaluations;", []);
    res.json({ success: true, message: "Alle KI-Reseller-Bewertungen erfolgreich gelöscht." });
  } catch (err: any) {
    console.error("Failed to reset AI evaluations", err);
    res.status(500).json({ error: err.message });
  }
});

// Auxiliary helper to find a card in the SQLite database based on AI identified parameters
async function findCardInDatabase(pokemonName: string, cardNumberRaw: string, setCode: string, language: string): Promise<any | null> {
  const langUpper = (language || "JA").toUpperCase().trim();
  const setCodeUpper = (setCode || "").toUpperCase().trim();
  
  const candidates: string[] = [cardNumberRaw];
  if (cardNumberRaw.includes("/")) {
    const firstPart = cardNumberRaw.split("/")[0].trim();
    candidates.push(firstPart);
    const parsedNum = parseInt(firstPart, 10);
    if (!isNaN(parsedNum)) {
      candidates.push(String(parsedNum));
      candidates.push(String(parsedNum).padStart(3, "0"));
    }
  } else {
    const parsedNum = parseInt(cardNumberRaw, 10);
    if (!isNaN(parsedNum)) {
      candidates.push(String(parsedNum));
      candidates.push(String(parsedNum).padStart(3, "0"));
    }
  }

  // 1. Precise Match with set_code + number candidate + language
  for (const num of candidates) {
    if (setCodeUpper) {
      const query = `
        SELECT * FROM cards 
        WHERE (UPPER(set_code) = ? OR set_code LIKE ?) 
          AND (card_number = ? OR card_number LIKE ?)
          AND language = ?
        LIMIT 1
      `;
      const row = await dbGet(query, [setCodeUpper, `%${setCodeUpper}%`, num, `%${num}`, langUpper]);
      if (row) return row;
    }
  }

  // 2. Match with names + a number candidate, prioritizing matching set_code
  const searchName = `%${pokemonName.toUpperCase()}%`;
  for (const num of candidates) {
    const query = `
      SELECT * FROM cards 
      WHERE (card_number = ? OR card_number LIKE ?)
        AND (
          UPPER(pokemon_name) LIKE ? 
          OR UPPER(english_name) LIKE ? 
          OR UPPER(local_name) LIKE ? 
          OR UPPER(japanese_name) LIKE ?
        )
      ORDER BY 
        (CASE WHEN UPPER(set_code) = ? THEN 0 WHEN UPPER(set_code) LIKE ? THEN 1 ELSE 2 END) ASC,
        (CASE WHEN language = ? THEN 0 ELSE 1 END) ASC,
        id ASC
      LIMIT 1
    `;
    const row = await dbGet(query, [num, `%${num}`, searchName, searchName, searchName, searchName, setCodeUpper, `%${setCodeUpper}%`, langUpper]);
    if (row) return row;
  }

  // 3. Fallback name matching, prioritizing matching set_code too
  const queryFallback = `
    SELECT * FROM cards 
    WHERE (
      UPPER(pokemon_name) LIKE ? 
      OR UPPER(english_name) LIKE ? 
      OR UPPER(local_name) LIKE ?
    )
    ORDER BY 
      (CASE WHEN UPPER(set_code) = ? THEN 0 WHEN UPPER(set_code) LIKE ? THEN 1 ELSE 2 END) ASC,
      (CASE WHEN language = ? THEN 0 ELSE 1 END) ASC,
      id ASC
    LIMIT 1
  `;
  const rowFallback = await dbGet(queryFallback, [searchName, searchName, searchName, setCodeUpper, `%${setCodeUpper}%`, langUpper]);
  if (rowFallback) return rowFallback;

  return null;
}

// Helper to match a card using file name keywords without calling Cloud-KI
async function tryOfflineMatch(filename: string): Promise<any | null> {
  if (!filename || typeof filename !== "string") return null;

  const lowerFile = filename.toLowerCase().trim();
  // Bypass generic webcam or capture snapshot names
  if (
    lowerFile.includes("kamera_snapshot") || 
    lowerFile.includes("camera_snapshot") || 
    lowerFile.includes("screenshot") ||
    lowerFile.includes("screen shot") ||
    lowerFile.includes("blob") || 
    lowerFile.startsWith("image_") ||
    lowerFile.startsWith("img_") ||
    lowerFile.startsWith("upload_")
  ) {
    return null;
  }

  // Remove extension and clean characters
  const clean = filename.replace(/\.[a-zA-Z0-9]+$/, "").toLowerCase().replace(/[^a-z0-9/]/g, " ").trim();
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length === 0) return null;

  // Extract all numeric/fractional/code candidates from filename (e.g. "125", "125/190", "tg12")
  const numberCandidates: string[] = [];
  for (const w of words) {
    if (/^\d+(\/\d+)?$/.test(w)) {
      numberCandidates.push(w);
      if (w.includes("/")) {
        numberCandidates.push(w.split("/")[0]);
      }
    } else if (/^[a-z]{1,3}\d+$/.test(w)) { // e.g. tg12, gg05, promo02
      numberCandidates.push(w);
      numberCandidates.push(w.replace(/^[a-z]+/, ""));
    }
  }

  // Match the Set (by code or by name matching)
  const sets = await dbAll("SELECT DISTINCT set_code, set_name FROM sets", []);
  let matchedSetCode = "";
  for (const s of sets) {
    const sCode = s.set_code.toLowerCase();
    const sName = s.set_name.toLowerCase();
    
    // Check if filename contains set code as a separate word or part of the string
    if (words.includes(sCode) || clean.includes(sCode)) {
      matchedSetCode = s.set_code;
      break;
    }
    
    // Check if words of the set name are in the filename
    const nameParts = sName.split(/[^a-z0-9]/).filter(p => p.length > 3);
    const matchesAllParts = nameParts.length > 0 && nameParts.every(part => clean.includes(part));
    if (matchesAllParts) {
      matchedSetCode = s.set_code;
      break;
    }
    
    // Check if some distinct parts match
    if (nameParts.some(part => words.includes(part))) {
      matchedSetCode = s.set_code;
    }
  }

  // Filter out set codes and numbers from candidates to find raw card name search words
  const nameWords = words.filter(w => 
    !numberCandidates.includes(w) && 
    w.toLowerCase() !== (matchedSetCode || "").toLowerCase() &&
    w.length > 2 && 
    w !== "png" && w !== "jpg" && w !== "jpeg" && w !== "gif" && w !== "webp" &&
    w !== "pokemon" && w !== "karte" && w !== "card" && w !== "tcg"
  );

  // 1. Precision Search: both set and card number detected
  if (matchedSetCode && numberCandidates.length > 0) {
    for (const num of numberCandidates) {
      const match = await dbGet(
        "SELECT * FROM cards WHERE UPPER(set_code) = ? AND (card_number = ? OR card_number LIKE ? OR card_number LIKE ?) LIMIT 1",
        [matchedSetCode.toUpperCase(), num, `${num}/%`, `%/${num}`]
      );
      if (match) return match;
    }
  }

  // 2. Query with name and card_number candidate (optionally narrowed by set)
  for (const num of numberCandidates) {
    for (const nw of nameWords) {
      const searchPattern = `%${nw}%`;
      let query = `
        SELECT * FROM cards 
        WHERE (card_number = ? OR card_number LIKE ? OR card_number LIKE ?)
          AND (LOWER(pokemon_name) LIKE ? OR LOWER(english_name) LIKE ? OR LOWER(local_name) LIKE ? OR LOWER(japanese_name) LIKE ?)
      `;
      const params = [num, `${num}/%`, `%/${num}`, searchPattern, searchPattern, searchPattern, searchPattern];
      if (matchedSetCode) {
        query += " AND UPPER(set_code) = ?";
        params.push(matchedSetCode.toUpperCase());
      }
      query += " LIMIT 1";
      const match = await dbGet(query, params);
      if (match) return match;
    }
  }

  // 3. Match by Set and Name words only (if card number is missing or failed to parse)
  if (matchedSetCode && nameWords.length > 0) {
    for (const nw of nameWords) {
      const searchPattern = `%${nw}%`;
      const match = await dbGet(
        `SELECT * FROM cards 
         WHERE UPPER(set_code) = ? 
           AND (LOWER(pokemon_name) LIKE ? OR LOWER(english_name) LIKE ? OR LOWER(local_name) LIKE ? OR LOWER(japanese_name) LIKE ?)
         LIMIT 1`,
        [matchedSetCode.toUpperCase(), searchPattern, searchPattern, searchPattern, searchPattern]
      );
      if (match) return match;
    }
  }

  // 4. Last resort: Unique Name matching only when the filename also contained
  // a concrete number or set signal. A plain "meowth.jpg" is too ambiguous.
  if (nameWords.length > 0 && (numberCandidates.length > 0 || Boolean(matchedSetCode))) {
    for (const nw of nameWords) {
      const searchPattern = `%${nw}%`;
      const match = await dbGet(
        `SELECT * FROM cards 
         WHERE (LOWER(pokemon_name) LIKE ? OR LOWER(english_name) LIKE ? OR LOWER(local_name) LIKE ? OR LOWER(japanese_name) LIKE ?)
         LIMIT 1`,
        [searchPattern, searchPattern, searchPattern, searchPattern]
      );
      if (match) return match;
    }
  }

  return null;
}

// Local OCR/data helpers for the local scanner
function normalizeScanText(value: any): string {
  return String(value || "")
    .replace(/[＿－–—]/g, "-")
    .replace(/[￥]/g, "¥")
    .replace(/([0-9OoQ])\s*\/\s*([0-9OoQ])/g, "$1/$2")
    .replace(/(?<=\d)[OoQ](?=\d|\/|\b)/g, "0")
    .replace(/(^|[^0-9])([OoQ])(?=\d{2}\b)/g, (_match, prefix) => `${prefix}0`)
    .replace(/[­]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOcrDigitText(value: string): string {
  return normalizeScanText(value)
    .replace(/[OoQ]/g, "0")
    .replace(/[Il|](?=\d{2}\b)/g, "1");
}

function guessNamesFromScanText(value: string): string[] {
  const stopWords = new Set([
    "BASIC", "STAGE", "TRAINER", "ENERGY", "POKEMON", "POKÉMON", "HP", "WEAKNESS",
    "RESISTANCE", "RETREAT", "FLIP", "COINS", "DAMAGE", "HEADS", "EACH", "ATTACK",
    "FURY", "SWIPES", "ILLUS", "ILLUSTRATOR", "NINTENDO", "CREATURES", "GAME",
    "FREAK", "CARD", "CARDS", "THIS", "FOR", "WHEN", "OBJECT", "LOCAL", "OCR"
  ]);
  const candidates: string[] = [];
  const lines = String(value || "")
    .split(/\n+/)
    .map(line => line.replace(/[^A-Za-z0-9.'’ \-\u3040-\u30ff\u3400-\u9faf]/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    if (/\.(jpe?g|png|webp|gif)\b/i.test(line) || /^[{\[]/.test(line)) continue;
    if (!/[A-Za-z\u3040-\u30ff\u3400-\u9faf]/.test(line) || /\d{2,}/.test(line)) continue;
    const upper = line.toUpperCase();
    if ([...stopWords].some(word => upper === word || upper.startsWith(`${word} `))) continue;
    const words = line.split(/\s+/).filter(w => w.length > 1 && !stopWords.has(w.toUpperCase()));
    if (words.length === 0 || words.length > 4) continue;
    const name = words.join(" ").trim();
    if (name.length >= 3 && name.length <= 36) candidates.push(name);
  }

  return uniqueStrings(candidates).slice(0, 8);
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const clean = normalizeScanText(v).toUpperCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

function normalizeCardNumberToken(value: any): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[OoQ]/g, "0")
    .replace(/[Il|](?=\d)/g, "1")
    .toUpperCase();
}

function cardNumberVariants(value: any): string[] {
  const clean = normalizeCardNumberToken(value);
  if (!clean) return [];
  const values = [clean];
  if (clean.includes("/")) values.push(clean.split("/")[0]);
  const first = clean.split("/")[0];
  if (/^\d{1,3}$/.test(first)) {
    const n = parseInt(first, 10);
    if (!Number.isNaN(n)) {
      values.push(String(n));
      values.push(String(n).padStart(3, "0"));
    }
  }
  return uniqueStrings(values);
}

function cardNumberSqlCondition(alias = "cards") {
  return `(
    UPPER(${alias}.card_number) = ?
    OR UPPER(${alias}.card_number) LIKE ?
    OR UPPER(${alias}.card_number) LIKE ?
  )`;
}

function cardNumberSqlParams(num: string) {
  const clean = normalizeCardNumberToken(num);
  return [clean, `${clean}/%`, `%/${clean}`];
}

function extractStandaloneCardNumbers(value: string): string[] {
  const out: string[] = [];
  const rx = /(^|[^A-Za-z0-9/])(\d{1,3})(?!\s*\/|[A-Za-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(value || "")) !== null) {
    out.push(m[2]);
  }
  return out;
}

function normalizeSetCodeToken(value: any): string {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[＿－–—]/g, "-")
    .toUpperCase();
}

function normalizeInternalSetCode(value: any): string {
  const clean = normalizeSetCodeToken(value);
  return PRINTED_POKEMON_SET_CODE_ALIASES[clean] || clean;
}

function extractPrintedPokemonSetAliases(value: string): string[] {
  const text = normalizeScanText(value || "").toUpperCase();
  const aliases = Object.keys(PRINTED_POKEMON_SET_CODE_ALIASES).join("|");
  const out: string[] = [];
  const rx = new RegExp(`\\b(${aliases})\\s*(?:EN|DE|FR|IT|ES|PT)?\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text)) !== null) {
    out.push(PRINTED_POKEMON_SET_CODE_ALIASES[String(m[1]).toUpperCase()]);
  }
  return out;
}

function looksLikeJapanesePokemonScan(parsed: any): boolean {
  const text = String(parsed?.text || "");
  return /[ぁ-んァ-ン一-龯]/.test(text) || String(parsed?.language || "").toUpperCase() === "JA";
}

function rowMatchesScanName(row: any, names: string[]): boolean {
  const haystack = [
    row?.pokemon_name,
    row?.english_name,
    row?.local_name,
    row?.japanese_name
  ].filter(Boolean).join(" ").toLowerCase();
  return names.some(name => {
    const clean = String(name || "").toLowerCase().trim();
    return clean.length >= 3 && haystack.includes(clean);
  });
}

function scanMatchConfidence(reason: string, parsed: any, row: any): number {
  const rowLang = String(row?.language || "").toUpperCase();
  const desiredLang = String(parsed?.language || "").toUpperCase();
  const langPenalty = desiredLang && rowLang && rowLang !== desiredLang ? 0.05 : 0;
  if (reason === "set_number_exact") return 0.985 - langPenalty;
  if (reason === "name_number_exact") return 0.92 - langPenalty;
  if (reason === "filename_exact") return 0.98 - langPenalty;
  return 0.0;
}

function parseLocalScanHints(text: string, hints: any = {}, game = "pokemon") {
  const joined = normalizeScanText([text, hints?.text, hints?.ocrText, hints?.filename].filter(Boolean).join(" "));
  const digitSafeJoined = normalizeOcrDigitText(joined);
  const setCodes: string[] = [];
  const cardNumbers: string[] = [];
  const names: string[] = [];

  const onePieceCodes = joined.match(/\b(?:OP|ST|EB|PR)[ -]?\d{1,2}\b/gi) || [];
  setCodes.push(...onePieceCodes.map(v => v.replace(/\s+/g, "").replace(/-/g, "").toUpperCase()));

  const pokemonSetCodes = joined.match(/\b(?:SV-P|S-P|SM-P|SV[ -]?\d{1,2}[A-Z]?|SM[ -]?\d{1,2}[A-Z]?|S[ -]?\d{1,2}[A-Z]?|XY[ -]?\d{1,2}[A-Z]?|BW[ -]?\d{1,2}[A-Z]?|DP[ -]?\d{1,2}[A-Z]?|ADV[ -]?\d{1,2}[A-Z]?|PCG[ -]?\d{1,2}[A-Z]?)\b/gi) || [];
  setCodes.push(...pokemonSetCodes.map(v => v.replace(/\s+/g, "").toUpperCase()));
  const tcgdexLikeSetCodes = joined.match(/\b(?:SV|SM|S|XY|BW|DP|ADV|PCG|ME|A|B)[ -]?\d{1,2}(?:\.\d+)?[A-Z]?\b/gi) || [];
  setCodes.push(...tcgdexLikeSetCodes.map(v => v.replace(/\s+/g, "").toUpperCase()));
  setCodes.push(...extractPrintedPokemonSetAliases(joined));

  const fractional = digitSafeJoined.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g) || [];
  for (const num of fractional) {
    const clean = num.replace(/\s+/g, "");
    cardNumbers.push(clean);
    cardNumbers.push(clean.split("/")[0]);
  }

  if (setCodes.length > 0) {
    cardNumbers.push(...extractStandaloneCardNumbers(joined));
  }

  const onePieceNumbers = joined.match(/\b(?:OP|ST|EB|PR)\d{2}[- ]?\d{3}\b/gi) || [];
  cardNumbers.push(...onePieceNumbers.map(v => v.replace(/\s+/g, "").toUpperCase()));

  if (hints?.card_number) cardNumbers.push(String(hints.card_number));
  if (Array.isArray(hints?.card_numbers)) cardNumbers.push(...hints.card_numbers.map(String));
  if (hints?.set_code) setCodes.push(String(hints.set_code));
  if (Array.isArray(hints?.set_codes)) setCodes.push(...hints.set_codes.map(String));
  if (hints?.name) names.push(String(hints.name));
  if (Array.isArray(hints?.names)) names.push(...hints.names.map(String));
  names.push(...guessNamesFromScanText([text, hints?.text, hints?.ocrText].filter(Boolean).join("\n")));

  const priceCandidates: number[] = [];
  const priceRegexes = [
    /(?:¥|JPY|jpy)\s*([0-9][0-9,. ]{1,8})/g,
    /([0-9][0-9,. ]{1,8})\s*(?:円|yen|YEN)/g
  ];
  for (const rx of priceRegexes) {
    let m: RegExpExecArray | null;
    while ((m = rx.exec(joined)) !== null) {
      const n = parseInt(String(m[1]).replace(/[^0-9]/g, ""), 10);
      if (!isNaN(n) && n >= 30 && n <= 300000) priceCandidates.push(n);
    }
  }
  if (/price|preis|label|yen/i.test(String(hints?.zone || hints?.source || ""))) {
    const plainPrices = digitSafeJoined.match(/\b\d{3,6}\b/g) || [];
    for (const raw of plainPrices) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n >= 100 && n <= 300000) priceCandidates.push(n);
    }
  }
  if (hints?.yen_price) {
    const n = parseInt(String(hints.yen_price), 10);
    if (!isNaN(n) && n > 0) priceCandidates.unshift(n);
  }

  const yellowLabelDetected = Boolean(hints?.yellow_label_detected) || /黄色|キズ|傷|訳あり|discount|damaged/i.test(joined);
  const hasJapanese = /([ぁ-んァ-ン一-龯])/.test(joined);
  const hasLatinText = /[A-Za-z]{3,}/.test(joined);
  const language = hints?.language || (hasJapanese ? "JA" : (hasLatinText ? "EN" : ""));

  return {
    text: joined,
    set_codes: uniqueStrings(setCodes.map(normalizeInternalSetCode)).filter(code => {
      const clean = code.replace(/\s+/g, "").toUpperCase();
      if (/^(SV|SM|S|XY|BW|DP|ADV|PCG)$/.test(clean)) return false;
      if (/^(OP|ST|EB|PR)$/.test(clean)) return false;
      return clean.length >= 2 && /\d|-P$/.test(clean);
    }),
    card_numbers: uniqueStrings(cardNumbers),
    names: uniqueStrings(names),
    yen_price: priceCandidates.length ? priceCandidates[0] : 0,
    yellow_label_detected: yellowLabelDetected,
    language: String(language || "JA").toUpperCase()
  };
}

function buildScanIdentification(raw: any, parsed: any, source: string, confidence = 0.82) {
  return {
    pokemon_name: raw?.pokemon_name || raw?.english_name || raw?.local_name || parsed?.names?.[0] || "Unbekannt",
    card_number: raw?.card_number || parsed?.card_numbers?.[0] || "?",
    set_code: raw?.set_code || parsed?.set_codes?.[0] || "",
    language: raw?.language || parsed?.language || "JA",
    yen_price: parsed?.yen_price || 0,
    yellow_label_detected: Boolean(parsed?.yellow_label_detected),
    bounding_box: parsed?.bounding_box || { ymin: 80, xmin: 80, ymax: 920, xmax: 920 },
    confidence,
    similarity_score: Math.round(confidence * 100),
    hash_match_score: Math.round(confidence * 100),
    verification_status: source,
    scanner_source: "local_ocr"
  };
}

app.get("/api/cards/visual-candidates", async (req, res) => {
  try {
    const game = String(req.query.game || "pokemon").toLowerCase();
    const language = String(req.query.language || "").toUpperCase();
    const limit = Math.max(50, Math.min(5000, Number(req.query.limit || 3000)));
    const params: any[] = [game];
    let query = `
      SELECT id, api_card_id, english_name, local_name, pokemon_name, japanese_name, language,
             set_name, set_code, card_number, rarity, supertype, subtype, hp, types,
             evolves_from, regulation_mark, illustrator, release_date, image_small,
             image_large, cardmarket_id, game
      FROM cards
      WHERE game = ?
        AND COALESCE(image_small, image_large, '') != ''
    `;
    if (language) {
      query += " AND UPPER(language) = ?";
      params.push(language);
    }
    query += " ORDER BY id ASC LIMIT ?";
    params.push(limit);

    const rows = await dbAll(query, params);
    res.json({ success: true, cards: rows.map(enrichCard), count: rows.length });
  } catch (err: any) {
    console.error("Failed to load visual candidates:", err);
    res.status(500).json({ error: err.message || "Bildkandidaten konnten nicht geladen werden." });
  }
});

async function findCardsByLocalHints(parsed: any, game = "pokemon"): Promise<any[]> {
  const results: any[] = [];
  const seen = new Set<string>();
  const setCodes = uniqueStrings((parsed.set_codes || []).map(normalizeInternalSetCode));
  const cardNumbers = uniqueStrings((parsed.card_numbers || []).flatMap(cardNumberVariants));
  const lang = (parsed.language || "JA").toUpperCase();
  const ignoredWords = new Set(["BASIC", "STAGE", "TRAINER", "ENERGY", "POKEMON", "POKÉMON", "CARD", "CARDS", "LOCAL", "OCR", "FULL", "SOURCE", "BOTTOM", "NUMBER", "PRICE", "LOWER", "THIRD"]);
  const textWords = normalizeScanText(parsed.text || "")
    .split(/[^A-Za-z0-9ぁ-んァ-ン一-龯]+/)
    .filter(w => w.length >= 3 && !/^\d+$/.test(w) && !ignoredWords.has(w.toUpperCase()))
    .slice(0, 18);
  const searchNames = uniqueStrings([...(parsed.names || []), ...textWords]).slice(0, 14);

  const addRows = (rows: any[], reason: string) => {
    for (const row of rows || []) {
      const key = `${row.api_card_id || row.id}-${row.language}-${row.game || game}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ ...row, __scan_match_reason: reason });
      }
    }
  };

  for (const setCode of setCodes) {
    for (const num of cardNumbers) {
      const rows = await dbAll(`
        SELECT * FROM cards
        WHERE game = ?
          AND UPPER(set_code) = ?
          AND ${cardNumberSqlCondition("cards")}
        ORDER BY
          (CASE WHEN UPPER(language) = ? THEN 0 ELSE 1 END),
          id ASC
        LIMIT 4
      `, [game, setCode, ...cardNumberSqlParams(num), lang]);
      addRows(rows, "set_number_exact");
    }
  }
  if (results.length > 0) return results.slice(0, 6);

  // Name + number is acceptable only when the name actually matches card text.
  // A raw collector number alone is far too ambiguous across Japanese/English sets.
  for (const num of cardNumbers) {
    for (const name of searchNames.filter(n => String(n).length >= 3)) {
      const pattern = `%${String(name).toLowerCase().trim()}%`;
      const rows = await dbAll(`
        SELECT * FROM cards
        WHERE game = ?
          AND ${cardNumberSqlCondition("cards")}
          AND (
            LOWER(pokemon_name) LIKE ?
            OR LOWER(english_name) LIKE ?
            OR LOWER(local_name) LIKE ?
            OR LOWER(japanese_name) LIKE ?
          )
        ORDER BY
          (CASE WHEN UPPER(language) = ? THEN 0 ELSE 1 END),
          (CASE WHEN LOWER(english_name) = LOWER(?) OR LOWER(local_name) = LOWER(?) OR LOWER(pokemon_name) = LOWER(?) THEN 0 ELSE 1 END),
          id ASC
        LIMIT 6
      `, [game, ...cardNumberSqlParams(num), pattern, pattern, pattern, pattern, lang, String(name), String(name), String(name)]);
      addRows(rows.filter((row: any) => rowMatchesScanName(row, [name])), "name_number_exact");
    }
  }
  return results.slice(0, 6);
}

// POST endpoint to scan a card image and identify it in the database without Cloud-KI.
// The browser may send OCR text/hints produced locally by Tesseract.js or manual input.
app.post("/api/cards/scan", async (req, res) => {
  try {
    const { filename = "", ocrText = "", hints = {}, localDetections = [], game = "pokemon" } = req.body || {};
    const gameLower = String(game || "pokemon").toLowerCase();

    const parsed = parseLocalScanHints([filename, ocrText, JSON.stringify(hints || {})].join(" "), { ...hints, filename }, gameLower);
    const segmentParseds = (Array.isArray(localDetections) ? localDetections : []).map((det: any) => ({
      det,
      parsed: parseLocalScanHints(det?.text || "", det, gameLower)
    }));
    if (!parsed.yen_price) {
      const segmentPrice = segmentParseds.find(({ parsed: p }) => Number(p?.yen_price || 0) > 0)?.parsed?.yen_price || 0;
      if (segmentPrice) parsed.yen_price = segmentPrice;
    }
    const matchedCards: any[] = [];
    const identifications: any[] = [];

    const filenameMatched = await tryOfflineMatch(String(filename || ""));
    if (filenameMatched && String(filenameMatched.game || gameLower).toLowerCase() === gameLower) {
      matchedCards.push({
        ...filenameMatched,
        yen_price: parsed.yen_price || null,
        yellow_label_detected: parsed.yellow_label_detected,
        bounding_box: { ymin: 80, xmin: 80, ymax: 920, xmax: 920 },
        ai_confidence: 1,
        ai_detected_language: filenameMatched.language || parsed.language,
        similarity_score: 100,
        hash_match_score: 100,
        verification_status: "Lokaler Dateiname/DB-Match",
        scanner_source: "local_filename"
      });
      identifications.push(buildScanIdentification(filenameMatched, parsed, "Lokaler Dateiname/DB-Match", 1));
    }

    const localMatches = await findCardsByLocalHints(parsed, gameLower);
    for (const row of localMatches) {
      const key = `${row.api_card_id || row.id}-${row.language}`;
      if (!matchedCards.some(c => `${c.api_card_id || c.id}-${c.language}` === key)) {
        const reason = row.__scan_match_reason || "unknown";
        const confidence = scanMatchConfidence(reason, parsed, row);
        const sourceLabel = reason === "set_number_exact"
          ? "Lokaler OCR-Fastmatch: Set + Nummer"
          : "Lokaler OCR-Fastmatch: Name + Nummer";
        const { __scan_match_reason, ...cleanRow } = row;
        matchedCards.push({
          ...cleanRow,
          yen_price: parsed.yen_price || null,
          yellow_label_detected: parsed.yellow_label_detected,
          bounding_box: { ymin: 80, xmin: 80, ymax: 920, xmax: 920 },
          ai_confidence: confidence,
          ai_detected_language: row.language || parsed.language,
          similarity_score: Math.round(confidence * 100),
          hash_match_score: Math.round(confidence * 100),
          verification_status: sourceLabel,
          scanner_source: "local_ocr"
        });
        identifications.push(buildScanIdentification(row, parsed, sourceLabel, confidence));
      }
    }

    for (const { det, parsed: detParsed } of segmentParseds) {
      const hasSegmentNameAndNumber = (detParsed.names?.length || 0) > 0 && (detParsed.card_numbers?.length || 0) > 0;
      const hasSegmentSetAndNumber = (detParsed.set_codes?.length || 0) > 0 && (detParsed.card_numbers?.length || 0) > 0;
      if (!hasSegmentNameAndNumber && !hasSegmentSetAndNumber) {
        continue;
      }
      const rows = await findCardsByLocalHints(detParsed, gameLower);
      for (const row of rows.slice(0, 2)) {
        const key = `${row.api_card_id || row.id}-${row.language}`;
        if (!matchedCards.some(c => `${c.api_card_id || c.id}-${c.language}` === key)) {
          const reason = row.__scan_match_reason || "unknown";
          const confidence = Math.max(0.82, scanMatchConfidence(reason, detParsed, row) - 0.04);
          const { __scan_match_reason, ...cleanRow } = row;
          matchedCards.push({
            ...cleanRow,
            yen_price: detParsed.yen_price || parsed.yen_price || null,
            yellow_label_detected: detParsed.yellow_label_detected || parsed.yellow_label_detected,
            bounding_box: det?.bounding_box || { ymin: 80, xmin: 80, ymax: 920, xmax: 920 },
            ai_confidence: confidence,
            ai_detected_language: row.language || detParsed.language,
            similarity_score: Math.round(confidence * 100),
            hash_match_score: Math.round(confidence * 100),
            verification_status: reason === "set_number_exact" ? "Lokaler Segment-OCR-Match: Set + Nummer" : "Lokaler Segment-OCR-Match: Name + Nummer",
            scanner_source: "local_segment_ocr"
          });
          identifications.push(buildScanIdentification(row, detParsed, reason === "set_number_exact" ? "Lokaler Segment-OCR-Match: Set + Nummer" : "Lokaler Segment-OCR-Match: Name + Nummer", confidence));
        }
      }
    }

    const languageRows = await dbAll("SELECT language, COUNT(*) as count FROM cards WHERE game = ? GROUP BY language", [gameLower]);
    const hasJapaneseInventory = languageRows.some((row: any) => String(row.language || "").toUpperCase() === "JA" && Number(row.count || 0) > 0);
    const scanWarnings: string[] = [];
    if (gameLower === "pokemon" && looksLikeJapanesePokemonScan(parsed) && !hasJapaneseInventory) {
      scanWarnings.push("Die Pokémon-Datenbank enthält aktuell keine JA-Karten. Japanische Raw-Scans werden deshalb nur gemeldet, wenn Set/Nummer eindeutig in vorhandenen Daten existieren; unsichere EN-Fallbacks werden blockiert.");
    }

    return res.json({
      success: true,
      match: matchedCards.length > 0,
      matched_cards: matchedCards,
      ai_identifications: identifications, // kept for old UI compatibility; source is local, not AI
      local_identifications: identifications,
      parsed_hints: parsed,
      scan_warnings: scanWarnings,
      scanner_engine: "local-ocr-db-v3-strict",
      message: matchedCards.length > 0
        ? `${matchedCards.length} lokale Treffer gefunden.`
        : "Kein sicherer lokaler Treffer. Bitte Set-Code/Kartennummer im Foto schärfer aufnehmen oder manuell suchen."
    });
  } catch (err: any) {
    console.error("Fehler beim lokalen Karten-Scan:", err);
    res.status(500).json({ error: err.message || "Unerwarteter Fehler beim lokalen Karten-Scan." });
  }
});

// GET statistics of the database
app.get("/api/stats", async (req, res) => {
  try {
    const { game = "pokemon" } = req.query;
    const cardCount = await dbGet("SELECT COUNT(*) as count FROM cards WHERE game = ?", [game]);
    const setCount = await dbGet("SELECT COUNT(*) as count FROM sets s WHERE s.game = ? AND EXISTS (SELECT 1 FROM cards c WHERE c.set_code = s.set_code AND c.language = s.language AND c.game = s.game)", [game]);
    const rarities = await dbAll("SELECT rarity, COUNT(*) as count FROM cards WHERE game = ? AND rarity IS NOT NULL GROUP BY rarity ORDER BY count DESC LIMIT 8", [game]);
    const languages = await dbAll("SELECT language, COUNT(*) as count FROM cards WHERE game = ? GROUP BY language", [game]);

    res.json({
      total_cards: cardCount?.count || 0,
      total_sets: setCount?.count || 0,
      rarities,
      languages
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// TRIGGER Python script command with Live terminal chunks streamed back directly to UI!
app.get("/api/run-python", async (req, res) => {
  const { action, lang = "de", count = "1", game = "pokemon" } = req.query;
  
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection-Empty", "no"); // keep chunk open
  res.setHeader("Connection", "keep-alive");

  if (game === "onepiece") {
    res.write(`data: [SYSTEM] Starte One Piece TCG Live-Crawl & Synchronisations-Engine...\n\n`);
    
    // Determine limit: "0" indicates ALL sets, otherwise a standard modern catalog slice.
    const allCards = String(req.query.all_cards || "").toLowerCase() === "true";
    const limit = allCards || count === "0" ? "0" : "10";
    const args = ["onepiece_importer.py", "import", "--sets-count", limit];
    
    res.write(`data: [SYSTEM] Führe aus: python3 ${args.join(" ")}\n\n`);
    
    const pythonProcess = spawn("python3", args, {
      env: { ...process.env, PYTHONUNBUFFERED: "1" }
    });
    
    pythonProcess.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          res.write(`data: ${line}\n\n`);
        }
      }
    });
    
    pythonProcess.stderr.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          res.write(`data: [WARNING] ${line}\n\n`);
        }
      }
    });
    
    pythonProcess.on("close", (code) => {
      res.write(`data: [SYSTEM] One Piece Synchronisation beendet mit Code ${code}.\n\n`);
      res.end();
    });
    
    pythonProcess.on("error", (err) => {
      res.write(`data: [ERROR] Starten des Python-Prozesses fehlgeschlagen: ${err.message}\n\n`);
      res.end();
    });
    return;
  }

  res.write(`data: [SYSTEM] Starte Python-Befehl ...\n\n`);

  const args: string[] = ["main.py"];

  if (action === "import") {
    args.push("import", "--lang", String(lang), "--sets-count", String(count));
    if (req.query.all_cards === "true") {
      args.push("--all-cards");
    }
  } else if (action === "update") {
    const limitVal = count === "0" ? "9999" : String(count);
    args.push("update", "--lang", String(lang), "--limit", limitVal);
  } else if (action === "init") {
    args.push("init");
  } else {
    res.write(`data: [ERROR] Unbekannter Befehl '${action}'\n\n`);
    res.end();
    return;
  }

  res.write(`data: [SYSTEM] Führe aus: python3 ${args.join(" ")}\n\n`);

  // Spawn the python process
  const pythonProcess = spawn("python3", args, {
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
  });

  pythonProcess.stdout.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        res.write(`data: ${line}\n\n`);
      }
    }
  });

  pythonProcess.stderr.on("data", (data) => {
    const lines = data.toString().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        res.write(`data: [WARNING] ${line}\n\n`);
      }
    }
  });

  pythonProcess.on("close", (code) => {
    res.write(`data: [SYSTEM] Python-Prozess beendet mit Code ${code}\n\n`);
    res.end();
  });

  pythonProcess.on("error", (err) => {
    res.write(`data: [ERROR] Starten des Python-Prozesses fehlgeschlagen: ${err.message}\n\n`);
    res.end();
  });
});

// ----------------------------------------
// RESELLER INVENTORY MANAGEMENT API
// ----------------------------------------

// GET inventory list
app.get("/api/inventory", async (req, res) => {
  try {
    const { game } = req.query;
    let list;
    if (game) {
      list = await dbAll("SELECT * FROM reseller_inventory WHERE game = ? ORDER BY id DESC", [game]);
    } else {
      list = await dbAll("SELECT * FROM reseller_inventory ORDER BY id DESC", []);
    }
    res.json({ success: true, count: list.length, data: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to add card to inventory
app.post("/api/inventory", express.json({ limit: "50mb" }), async (req, res) => {
  try {
    const {
      api_card_id,
      pokemon_name,
      local_name,
      japanese_name,
      card_number,
      set_name,
      set_code,
      rarity,
      language,
      image_small,
      yen_price = 0,
      yellow_label_detected = 0,
      purchase_date,
      purchase_location = "Unbekannt",
      notes = "",
      bounding_box_json = "",
      image_source_base64 = "",
      game = "pokemon"
    } = req.body;

    if (!local_name) {
      return res.status(400).json({ error: "Name der Karte fehlt (local_name)" });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    const finalDate = purchase_date || todayStr;

    const result = await dbRun(`
      INSERT INTO reseller_inventory (
        api_card_id, pokemon_name, local_name, japanese_name, card_number,
        set_name, set_code, rarity, language, image_small,
        yen_price, yellow_label_detected, purchase_date, purchase_location,
        notes, bounding_box_json, image_source_base64, game
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      api_card_id || "fallback",
      pokemon_name || local_name,
      local_name,
      japanese_name || "",
      card_number || "?",
      set_name || "Unbekannt",
      set_code || "UNK",
      rarity || "Regular",
      language || "JA",
      image_small || null,
      yen_price,
      yellow_label_detected ? 1 : 0,
      finalDate,
      purchase_location,
      notes,
      bounding_box_json,
      image_source_base64,
      game
    ]);

    res.json({
      success: true,
      message: "Karte erfolgreich zum Händler-Inventat hinzugefügt.",
      id: result.id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE cards from inventory
app.delete("/api/inventory/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun("DELETE FROM reseller_inventory WHERE id = ?", [id]);
    res.json({ success: true, message: "Karte aus Händler-Inventar gelöscht." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ----------------------------------------
// RESELLER FAVORITES MANAGEMENT API
// ----------------------------------------

// GET reseller favorites list
app.get("/api/favorites", async (req, res) => {
  try {
    const { game } = req.query;
    let list;
    if (game) {
      list = await dbAll("SELECT * FROM reseller_favorites WHERE game = ? ORDER BY id DESC", [game]);
    } else {
      list = await dbAll("SELECT * FROM reseller_favorites ORDER BY id DESC", []);
    }
    res.json({ success: true, count: list.length, data: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST to add card to favorites
app.post("/api/favorites", express.json(), async (req, res) => {
  try {
    const {
      api_card_id,
      english_name,
      local_name,
      japanese_name,
      card_number,
      set_name,
      set_code,
      rarity,
      language,
      image_small,
      image_large,
      game = "pokemon"
    } = req.body;

    if (!local_name) {
      return res.status(400).json({ error: "Name der Karte fehlt (local_name)" });
    }

    if (!api_card_id) {
      return res.status(400).json({ error: "api_card_id fehlt" });
    }

    await dbRun(`
      INSERT OR IGNORE INTO reseller_favorites (
        api_card_id, english_name, local_name, japanese_name, card_number,
        set_name, set_code, rarity, language, image_small, image_large, game
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      api_card_id,
      english_name || local_name,
      local_name,
      japanese_name || "",
      card_number || "?",
      set_name || "Unbekannt",
      set_code || "UNK",
      rarity || "Regular",
      language || "JA",
      image_small || null,
      image_large || null,
      game
    ]);

    res.json({
      success: true,
      message: "Karte erfolgreich zu den Favoriten hinzugefügt."
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE cards from favorites by unique ID
app.delete("/api/favorites/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await dbRun("DELETE FROM reseller_favorites WHERE id = ?", [id]);
    res.json({ success: true, message: "Karte aus den Favoriten entfernt." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE cards from favorites by api_card_id
app.delete("/api/favorites/by-card-id/:api_card_id", async (req, res) => {
  try {
    const { api_card_id } = req.params;
    await dbRun("DELETE FROM reseller_favorites WHERE api_card_id = ?", [api_card_id]);
    res.json({ success: true, message: "Karte aus den Favoriten entfernt." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT endpoint to update target price for stored favorites (Euro & Yen)
app.put("/api/favorites/:id", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { target_price_eur, target_price_yen } = req.body;
    
    // Check if item exists
    const item = await dbGet("SELECT * FROM reseller_favorites WHERE id = ?", [id]);
    if (!item) {
      return res.status(404).json({ error: "Eintrag in den Favoriten nicht gefunden." });
    }

    const nowIso = new Date().toISOString();
    await dbRun(`
      UPDATE reseller_favorites 
      SET target_price_eur = ?, target_price_yen = ?, price_updated_at = ?
      WHERE id = ?
    `, [
      target_price_eur !== undefined ? parseFloat(target_price_eur) : item.target_price_eur,
      target_price_yen !== undefined ? parseInt(target_price_yen, 10) : item.target_price_yen,
      nowIso,
      id
    ]);

    const updated = await dbGet("SELECT * FROM reseller_favorites WHERE id = ?", [id]);
    res.json({ success: true, message: "Zielpreis aktualisiert.", data: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT endpoint to update card details (such as notes or purchase price) in inventory
app.put("/api/inventory/:id", express.json(), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, yen_price, purchase_location } = req.body;
    
    // Check if item exists
    const item = await dbGet("SELECT * FROM reseller_inventory WHERE id = ?", [id]);
    if (!item) {
      return res.status(404).json({ error: "Eintrag nicht gefunden." });
    }

    const updatedNotes = notes !== undefined ? notes : item.notes;
    const updatedYen = yen_price !== undefined ? parseInt(yen_price) : item.yen_price;
    const updatedLocation = purchase_location !== undefined ? purchase_location : item.purchase_location;

    await dbRun(
      `UPDATE reseller_inventory 
       SET notes = ?, 
           yen_price = ?, 
           purchase_location = ? 
       WHERE id = ?`,
      [updatedNotes, updatedYen, updatedLocation, id]
    );

    res.json({ success: true, message: "Eintrag im Inventar aktualisiert." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// POST deterministic local market trend snapshot. No external AI/API call.
app.post("/api/trends/analyze", async (_req, res) => {
  const trends = [
    {
      pokemon_name: "Pikachu Master Ball Holo",
      japanese_set: "Pokémon Card 151 (SV2a)",
      card_code: "025/165 MB",
      hype_score: 94,
      platforms_driving: ["Cardmarket", "eBay", "Shop-Observation"],
      avg_jpy_cost: 18000,
      est_eur_sale: 150,
      social_sentiment: "Sehr liquide",
      import_tip: "Nur mit sauberer Oberfläche und guter Zentrierung kaufen. Master-Ball-Karten drehen in Deutschland schneller als normale Reverse-Holos."
    },
    {
      pokemon_name: "Glurak ex SAR",
      japanese_set: "Shiny Treasure ex (SV4a)",
      card_code: "349/190",
      hype_score: 92,
      platforms_driving: ["Cardmarket", "eBay", "Instagram"],
      avg_jpy_cost: 13500,
      est_eur_sale: 115,
      social_sentiment: "Dauerbrenner",
      import_tip: "Glurak bleibt einer der liquidesten Namen. Gelbe Mängelsticker konsequent aussortieren oder nur mit starkem Abschlag kaufen."
    },
    {
      pokemon_name: "Mew ex SAR",
      japanese_set: "Pokémon Card 151 (SV2a)",
      card_code: "205/165",
      hype_score: 88,
      platforms_driving: ["Cardmarket", "eBay", "Sammlergruppen"],
      avg_jpy_cost: 8500,
      est_eur_sale: 80,
      social_sentiment: "Stabil",
      import_tip: "Guter Arbitrage-Kandidat, wenn der Einkauf unter deinem berechneten Max-Yen-Limit liegt."
    }
  ];
  res.json({ trends, engine: "local_static_trend_rules_v2" });
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fullstack Server hosting UI and backend API at http://0.0.0.0:${PORT}`);
  });
}

startServer();
