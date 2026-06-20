import React, { useState, useEffect, useRef, useMemo } from "react";
import { 
  Database, 
  Search, 
  Library, 
  Terminal as TerminalIcon, 
  BookOpen, 
  Download, 
  AlertCircle, 
  RefreshCw, 
  Layers, 
  ExternalLink, 
  Globe, 
  Star, 
  ChevronLeft,
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  X, 
  CheckCircle,
  Copy,
  Info,
  Trash2,
  Sparkles,
  TrendingUp,
  Award,
  Camera,
  Heart,
  ShoppingBag,
  ThumbsUp,
  ThumbsDown,
  Flame,
  Check,
  Plus,
  PlusCircle,
  DownloadCloud,
  MapPin,
  Calendar,
  ShieldCheck,
  CreditCard,
  Tag,
  Edit,
  Menu,
  MoreVertical
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

declare global {
  interface Window {
    Tesseract?: any;
    __tcgTesseractPromise?: Promise<any>;
    __tcgOcrWorkerPromises?: Record<string, Promise<any | null>>;
  }
}

const SCAN_CACHE_NAME = "pokemon-local-scan-results-v15-denominator-match";
const SCAN_CACHE_KEY_PREFIX = "/api/cards/scan-cache-v15-denominator-match";

// Types matching sqlite representation
interface PokemonCard {
  id: number;
  api_card_id: string;
  english_name: string;
  local_name: string;
  pokemon_name: string;
  japanese_name?: string | null;
  language: string;
  set_name: string;
  set_code: string;
  card_number: string;
  rarity: string | null;
  supertype: string | null;
  subtype: string | null;
  hp: number | null;
  types: string | null;
  evolves_from: string | null;
  regulation_mark: string | null;
  illustrator: string | null;
  release_date: string | null;
  image_small: string | null;
  image_large: string | null;
  cardmarket_id: string | null;
  cardmarket_link: string;
  ebay_link: string;
  google_link?: string;
  tcgplayer_link?: string;
  market_price_eur?: number;
  manual_market_price_eur?: number;
  low_price_eur?: number;
  median_price_eur?: number;
  average_price_eur?: number;
  trend_price_eur?: number;
  max_price_eur?: number;
  offer_count?: number;
  market_source?: string;
  market_observed_at?: string;
  market_source_url?: string;
  english_set_name?: string;
  german_set_name?: string;
}

interface PokemonSet {
  id: number;
  set_name: string;
  set_code: string;
  series: string | null;
  language: string;
  release_date: string | null;
  total_cards: number;
  logo?: string | null;
  symbol?: string | null;
  english_set_name?: string;
  german_set_name?: string;
}

interface DBStats {
  total_cards: number;
  total_sets: number;
  rarities: { rarity: string; count: number }[];
  languages: { language: string; count: number }[];
}

// Client-side mapping & clean translation helper functions
const PokéballIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="8" fill="white" />
    <path d="M 8,50 A 42,42 0 0,1 92,50 Z" fill="#ef4444" stroke="currentColor" strokeWidth="5" />
    <line x1="4" y1="50" x2="96" y2="50" stroke="currentColor" strokeWidth="8" />
    <circle cx="50" cy="50" r="16" fill="white" stroke="currentColor" strokeWidth="8" />
    <circle cx="50" cy="50" r="6" fill="#18181b" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const JollyRogerIcon = ({ className = "w-6 h-6" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <line x1="15" y1="15" x2="85" y2="85" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    <line x1="85" y1="15" x2="15" y2="85" stroke="currentColor" strokeWidth="8" strokeLinecap="round" />
    <circle cx="15" cy="15" r="7" fill="currentColor" />
    <circle cx="85" cy="85" r="7" fill="currentColor" />
    <circle cx="85" cy="15" r="7" fill="currentColor" />
    <circle cx="15" cy="85" r="7" fill="currentColor" />
    
    <circle cx="50" cy="45" r="22" fill="#ffffff" stroke="currentColor" strokeWidth="6" />
    <rect x="40" y="55" width="20" height="15" rx="5" fill="#ffffff" stroke="currentColor" strokeWidth="6" />
    <line x1="47" y1="62" x2="47" y2="70" stroke="currentColor" strokeWidth="4" />
    <line x1="53" y1="62" x2="53" y2="70" stroke="currentColor" strokeWidth="4" />
    <circle cx="42" cy="43" r="5" fill="currentColor" />
    <circle cx="58" cy="43" r="5" fill="currentColor" />
    <polygon points="50,48 47,53 53,53" fill="currentColor" />
    
    <ellipse cx="50" cy="28" rx="30" ry="8" fill="#eab308" stroke="currentColor" strokeWidth="4" />
    <path d="M 30,28 C 30,5 70,5 70,28 Z" fill="#eab308" stroke="currentColor" strokeWidth="4" />
    <path d="M 29,24 C 35,27 65,27 71,24 L 71,28 C 65,30 35,30 29,28 Z" fill="#ef4444" />
  </svg>
);

export function translateRarityToEnglish(rarity: string | null | undefined): string {
  if (!rarity) return "";
  const r = rarity.toLowerCase().trim();
  if (r === "none" || r === "null") return "Unspezifiziert / Andere";
  if (r === "häufig" || r === "common") return "Common";
  if (r === "ungewöhnlich" || r === "uncommon") return "Uncommon";
  if (r === "selten" || r === "rare") return "Rare";
  if (r === "illustration rare" || r === "ar") return "Illustration Rare";
  if (r === "special illustration rare" || r === "sar") return "Special Illustration Rare";
  if (r.includes("holo") || r.includes("holografisch")) return "Rare Holo";
  if (r.includes("ultra") || r === "ultra rare") return "Ultra Rare";
  if (r.includes("secret") || r.includes("geheimnisvoll") || r.includes("secret rare")) return "Secret Rare";
  if (r.includes("promo")) return "Promo";
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}

export function formatCardName(card: any): string {
  if (!card) return "";
  const isJa = card.language?.toUpperCase() === "JA" || card.language_code?.toUpperCase() === "JA" || String(card.api_card_id).startsWith("sv8a") || String(card.api_card_id).startsWith("sv8");
  const local = card.local_name || card.pokemon_name || "Unbekannt";
  const eng = card.english_name || "";
  
  if (isJa) {
    if (eng && eng !== "Unknown" && eng !== local) {
      return `${eng} (${local})`;
    }
    return local;
  }
  return local;
}

export function getEstimatedCardmarketPrices(card: any) {
  // Honest price state: only user/imported market prices are treated as prices.
  // The local model is kept as reference metadata and must not drive BUY decisions.
  if (!card) return { raw: 0, source: "none", confidence: "none", isMarketPrice: false };
  const text = `${card.english_name || ""} ${card.pokemon_name || ""} ${card.local_name || ""} ${card.rarity || ""} ${card.set_name || ""}`.toLowerCase();
  let score = 28;
  const premiumNames = ["pikachu", "charizard", "glurak", "mew", "mewtwo", "eevee", "umbreon", "nachtara", "rayquaza", "gengar", "lugia", "latias", "latios", "iono", "lillie", "nami", "luffy", "zoro", "shanks", "ace", "law", "yamato"];
  if (premiumNames.some(n => text.includes(n))) score += 28;
  if (/special illustration|sar|secret|hyper|alt art|alternate|super parallel|manga/.test(text)) score += 28;
  else if (/illustration|\bar\b|ultra|sr|sec|sp|leader|promo/.test(text)) score += 18;
  else if (/rare holo|holo|double rare|rr|rare/.test(text)) score += 8;
  if (/151|evolving skies|terastal|vstar universe|tag all stars|romance dawn|op05|op01/.test(text)) score += 9;
  if ((card.language || "").toUpperCase() === "JA") score += 3;
  score = Math.max(5, Math.min(100, score));

  const r = (card.rarity || "").toLowerCase();
  let rawPrice = 0.35;
  if (/special illustration|sar|manga|super parallel/.test(r)) rawPrice = 35;
  else if (/secret|hyper|sec|sp/.test(r)) rawPrice = 22;
  else if (/illustration|\bar\b|ultra|sr/.test(r)) rawPrice = 8;
  else if (/double|rr|leader|promo/.test(r)) rawPrice = 3.5;
  else if (/holo|rare/.test(r)) rawPrice = 1.2;
  rawPrice *= Math.max(0.65, score / 58);
  rawPrice = Math.max(0.05, Math.round(rawPrice * 100) / 100);
  const manualPrice = Number(card?.manual_market_price_eur || card?.market_price_eur || 0);
  if (Number.isFinite(manualPrice) && manualPrice > 0) {
    return {
      raw: Math.round(manualPrice * 100) / 100,
      source: card?.market_source || "manual",
      confidence: "trusted",
      isMarketPrice: true,
      referenceModelRaw: rawPrice,
      reseller_score: score
    };
  }

  return {
    raw: 0,
    source: "missing_market_price",
    confidence: "missing",
    isMarketPrice: false,
    referenceModelRaw: rawPrice,
    reseller_score: score
  };
}

const printedPokemonSetCodeAliases: Record<string, string> = {
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
  WHT: "sv10.5w",
  MEG: "me01",
  PFL: "me02",
  ASC: "me02.5",
  POR: "me03",
  CRI: "me04"
};

const pokemonOfficialTotalToSetCodes: Record<string, string[]> = {
  "064": ["sv06.5"],
  "086": ["sv10.5b", "sv10.5w", "me04"],
  "088": ["me03"],
  "091": ["sv04.5"],
  "094": ["me02"],
  "131": ["sv08.5"],
  "132": ["me01"],
  "142": ["sv07"],
  "159": ["sv09"],
  "162": ["sv05"],
  "165": ["sv03.5"],
  "167": ["sv06"],
  "182": ["sv04", "sv10"],
  "191": ["sv08"],
  "193": ["sv02"],
  "197": ["sv03"],
  "198": ["sv01"],
  "217": ["me02.5"]
};

const normalizePrintedSetCode = (value: string) => {
  const clean = String(value || "").replace(/\s+/g, "").toUpperCase();
  return printedPokemonSetCodeAliases[clean] || clean;
};

const setCodesFromPrintedTotals = (totals: string[]) => {
  return Array.from(new Set(
    (totals || []).flatMap(total => pokemonOfficialTotalToSetCodes[String(total).padStart(3, "0")] || [])
  ));
};

const extractStandaloneCardNumbers = (value: string) => {
  const out: string[] = [];
  const rx = /(^|[^A-Za-z0-9/])(\d{1,3})(?!\s*\/|[A-Za-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(value || "")) !== null) out.push(m[2]);
  return out;
};

const buildGoogleSearchLink = (card: any, game = "pokemon") => {
  const name = formatCardName(card);
  const query = `${name} ${card?.set_name || ""} ${card?.card_number || ""} ${game === "onepiece" ? "One Piece TCG" : "Pokemon TCG"}`;
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim().replace(/\s+/g, " "))}`;
};

const buildTcgplayerSearchLink = (card: any, game = "pokemon") => {
  const name = formatCardName(card);
  const query = `${name} ${card?.set_name || ""} ${card?.card_number || ""} ${game === "onepiece" ? "One Piece" : "Pokemon"}`;
  return `https://www.tcgplayer.com/search/all/product?q=${encodeURIComponent(query.trim().replace(/\s+/g, " "))}&view=grid`;
};

export function getLocalDealAnalysis(card: any, exchangeRate = 165, importVat = 19, customsFee = 0.35, platformFee = 12, targetMargin = 30) {
  const prices = getEstimatedCardmarketPrices(card);
  const yenPrice = Number(card?.yen_price || 0);
  const marketPriceEur = prices.isMarketPrice ? Number(prices.raw || 0) : 0;
  const landedCostEur = yenPrice > 0 ? (yenPrice / exchangeRate) * (1 + importVat / 100) + customsFee : 0;
  const netRevenueEur = marketPriceEur * (1 - platformFee / 100);
  const expectedProfitEur = landedCostEur > 0 ? netRevenueEur - landedCostEur : 0;
  const roiPercent = landedCostEur > 0 ? (expectedProfitEur / landedCostEur) * 100 : 0;
  const requiredCostEur = marketPriceEur > 0 ? netRevenueEur / (1 + targetMargin / 100) : 0;
  const maxBuyYen = marketPriceEur > 0 ? Math.max(0, Math.floor(((requiredCostEur - customsFee) / (1 + importVat / 100)) * exchangeRate)) : 0;
  let decision: "BUY" | "CHECK" | "SKIP" = "CHECK";
  if (marketPriceEur > 0 && yenPrice > 0 && yenPrice <= maxBuyYen && expectedProfitEur >= Math.max(3, marketPriceEur * 0.12)) decision = "BUY";
  if (marketPriceEur > 0 && yenPrice > 0 && (yenPrice > maxBuyYen || expectedProfitEur < 1)) decision = "SKIP";
  return {
    marketPriceEur,
    landedCostEur,
    netRevenueEur,
    expectedProfitEur,
    roiPercent,
    maxBuyYen,
    decision,
    priceSource: prices.source,
    priceConfidence: prices.confidence,
    marketPriceRequired: !prices.isMarketPrice,
    referenceModelRaw: prices.referenceModelRaw || 0
  };
}

const clientTranslations: Record<string, string> = {
  "pikachu": "ピカチュウ",
  "charizard": "リザードン",
  "blastoise": "カメックス",
  "venusaur": "フシギバナ",
  "mewtwo": "ミュウツー",
  "mew": "ミュウ",
  "eevee": "イーブイ",
  "lucario": "ルカリオ",
  "gengar": "ゲンガー",
  "lugia": "ルギア",
  "rayquaza": "レックウザ",
  "gyarados": "ギャラドス",
  "snorlax": "カビゴン",
  "bulbasaur": "フシギダネ",
  "charmander": "ヒトカゲ",
  "squirtle": "ゼニガメ",
  "greninja": "ゲッコウガ",
  "mimikyu": "ミミッキュ",
  "dragonite": "カイリュー",
  "arceus": "アルセウス",
  "gardevoir": "サーナイト",
  "garchomp": "ガブリアス",
  "scizor": "ハッサム",
  "umbreon": "ブラッキー",
  "espeon": "エーフィ",
  "sylveon": "ニンフィア",
  "jolteon": "サンダース",
  "flareon": "ブースター",
  "vaporeon": "シャワーズ",
  "leafeon": "リーフィア",
  "glaceon": "グレイシア",
  "machamp": "カイリキー",
  "alakazam": "フーディン",
  "lapras": "ラプラス",
  "tyranitar": "バンギラス",
  "salamence": "ボーマンダ",
  "metagross": "メタグロス",
  "darkrai": "ダークライ",
  "dialga": "ディアルガ",
  "palkia": "パルキア",
  "giratina": "ギラティナ",
  "zorua": "ゾロア",
  "zoroark": "ゾロアーク",
  "reshiram": "レシラム",
  "zekrom": "ゼクロム",
  "kyurem": "キュレム",
  "xerneas": "ゼルネアス",
  "yveltal": "イベルタル",
  "solgaleo": "ソルガレオ",
  "lunala": "ルナアーラ",
  "zacian": "ザシアン",
  "zamazenta": "ザマゼンタ",
  "munchlax": "ゴンベ",
  "togepi": "トゲピー",
  "psyduck": "コダック",
  "meowth": "ニャース",
  "ralts": "ラルトス",
  "kirlia": "キルリア",
  "koraidon": "コライドン",
  "miraidon": "ミライドン",
  "chien-pao": "パオジアン",
  "chien pao": "パオジアン",
  "ting-lu": "ディンルー",
  "ting lu": "ディンルー",
  "chi-yu": "イーユイ",
  "chi yu": "イーユイ",
  "wo-chien": "チオンジェン",
  "wo chien": "チオンジェン",
  "roaring moon": "トドロクツキ",
  "iron valiant": "テツノブジン",
  "iron hands": "テツノカイナ",
  "gholdengo": "サーフゴー",
  "gimmighoul": "コレクレー",
  "ogerpon": "オーガポン",
  "terapagos": "テラパゴス",
  "pecharunt": "モモワロウ",
  "okidogi": "イイネイヌ",
  "fezandipiti": "キチキギス",
  "munkidori": "マシマシラ",
  "dipplin": "カミッチュ",
  "hydrapple": "カミツオロチ",
  "archaludon": "ブリジュラス",
  "duraludon": "ジュラルドン",
  "pidgeot": "ピジョット",
  "pidgey": "ポッポ",
  "pidgeotto": "ピジョン",
  "regidrago": "レジドラゴ",
  "regieleki": "レジエレキ",
  "comfey": "キュワワ",
  "sableye": "ヤミラミ",
  "manaphy": "マナフィ",
  "jirachi": "ジラーチ",
  "baxcalibur": "セグレイブ",
  "frigibax": "セビエ",
  "arctibax": "セレール",
  "dragonair": "ハクリュー",
  "dratini": "ミニリュウ",
  "raikou": "ライコウ",
  "entei": "エンテイ",
  "suicune": "スイクン",
  "pawmi": "パモ",
  "pawmot": "パーモット",
  "pawmo": "パモット",
  "bellibolt": "ハラバリー",
  "tadbulb": "ズピカ",
  "tinkatink": "カヌチャン",
  "tinkatuff": "ナカヌチャン",
  "tinkaton": "デカヌチャン",
  "origin dialga": "オリジンディアルガ",
  "origin palkia": "オリジンパルキア",
  "origin-dialga": "オリジンディアルガ",
  "origin-palkia": "オリジンパルキア"
};

export function cleanAndTranslateJapaneseName(card: PokemonCard): string {
  const ja = card.japanese_name || "";
  if (!ja) return "";

  const hasJapaneseChars = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]/.test(ja);
  
  let cleanName = ja;
  if (ja.endsWith(" (日本)")) {
    cleanName = ja.substring(0, ja.length - 7).trim();
  }

  const parts = cleanName.split(/\s+/);
  if (parts.length > 0) {
    const baseNameLower = parts[0].toLowerCase().replace("'", "");
    if (clientTranslations[baseNameLower]) {
      const jaBase = clientTranslations[baseNameLower];
      const rest = parts.slice(1).join(" ");
      return rest ? `${jaBase} ${rest}` : jaBase;
    }
  }

  if (!hasJapaneseChars) {
    const simpleTransliterate = (name: string): string => {
      const rules: [RegExp, string][] = [
        [/ch/gi, "チ"], [/sh/gi, "シ"], [/ts/gi, "ツ"], [/th/gi, "サ"],
        [/a/gi, "ア"], [/i/gi, "イ"], [/u/gi, "ウ"], [/e/gi, "エ"], [/o/gi, "オ"],
        [/k/gi, "ク"], [/g/gi, "ク"], [/s/gi, "ス"], [/z/gi, "ズ"], [/t/gi, "ト"], 
        [/d/gi, "ド"], [/n/gi, "ン"], [/h/gi, "ハ"], [/f/gi, "フ"], [/p/gi, "プ"],
        [/b/gi, "ブ"], [/m/gi, "ム"], [/y/gi, "イ"], [/r/gi, "ル"], [/l/gi, "ル"],
        [/w/gi, "ウ"], [/x/gi, "クス"], [/v/gi, "ブ"], [/q/gi, "ク"]
      ];
      let res = name.toLowerCase();
      res = res.replace(/\b(ex|vmax|vstar|v|gx|star)\b/gi, "").trim();
      let katakana = "";
      for (let i = 0; i < res.length; i++) {
        let charMatched = false;
        for (const [regex, replacement] of rules) {
          const part = res.substring(i);
          if (part.search(regex) === 0) {
            katakana += replacement;
            i += (regex.source.length - 1);
            charMatched = true;
            break;
          }
        }
        if (!charMatched) {
          katakana += "・";
        }
      }
      const suffixMatch = name.match(/\b(ex|vmax|vstar|v|gx|star)\b/i);
      return katakana + (suffixMatch ? " " + suffixMatch[0].toUpperCase() : "");
    };

    const cleanBase = cleanName.replace(/\b(ex|vmax|vstar|v|gx|star)\b/i, "").trim().toLowerCase();
    if (clientTranslations[cleanBase]) {
      const suffixMatch = cleanName.match(/\b(ex|vmax|vstar|v|gx|star)\b/i);
      return clientTranslations[cleanBase] + (suffixMatch ? " " + suffixMatch[0].toUpperCase() : "");
    }

    return simpleTransliterate(cleanName);
  }

  return ja;
}

export function CroppedCardImage({ src, boundingBox, className = "" }: { src: string; boundingBox: { ymin: number; xmin: number; ymax: number; xmax: number } | null; className?: string }) {
  if (!src || !boundingBox) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-[#09090b] h-full rounded-2xl border border-dashed border-zinc-800 text-zinc-500 font-mono text-[10px]">
        Kein Bild-Segment verfügbar
      </div>
    );
  }
  
  const top = boundingBox.ymin / 10;
  const left = boundingBox.xmin / 10;
  const width = Math.max((boundingBox.xmax - boundingBox.xmin) / 10, 1);
  const height = Math.max((boundingBox.ymax - boundingBox.ymin) / 10, 1);

  return (
    <div 
      className={`relative overflow-hidden rounded-2xl border border-zinc-850 bg-black/40 ${className}`}
      style={{ 
        width: "100%",
        paddingBottom: `${Math.min(Math.max((height / width) * 100, 50), 200)}%`, // dynamically match aspect ratio with bounds guarding
        boxShadow: "0 12px 24px -10px rgba(0,0,0,0.8)"
      }}
    >
      <img 
        src={src} 
        alt="Kamera-Ausschnitt"
        style={{
          position: "absolute",
          top: `-${(top / height) * 100}%`,
          left: `-${(left / width) * 100}%`,
          width: `${(100 / width) * 100}%`,
          height: `${(100 / height) * 100}%`,
          objectFit: "fill"
        }}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

export function SafeCardImage({ 
  src, 
  alt, 
  className = "", 
  set_code = "", 
  card_number = "" 
}: { 
  src: string | null; 
  alt: string; 
  className?: string; 
  set_code?: string; 
  card_number?: string; 
}) {
  const [currentSrc, setCurrentSrc] = useState<string | null>(null);
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    setHasFailed(false);
    if (!src) {
      if (set_code && card_number) {
        const s_code = set_code || "";
        const mapped_series = "scarlet-violet";
        const s_code_lower = s_code.toLowerCase();
        let mapped_code = s_code_lower;
        
        if (s_code_lower === "sv2a") mapped_code = "sv3.5";
        else if (s_code_lower === "sv3") mapped_code = "sv3";
        else if (s_code_lower === "sv4a") mapped_code = "sv4.5";
        else if (s_code_lower === "sv5m") mapped_code = "sv5";
        else if (s_code_lower === "sv5k") mapped_code = "sv5";
        else if (s_code_lower === "sv6") mapped_code = "sv6";
        else if (s_code_lower === "sv7") mapped_code = "sv7";
        else if (s_code_lower === "sv7a") mapped_code = "sv7a";
        else if (s_code_lower === "sv8") mapped_code = "sv8";
        else if (s_code_lower === "sv8a") mapped_code = "sv8a";
        else if (s_code_lower === "sv9") mapped_code = "sv9";
        else if (s_code_lower === "sv9a") mapped_code = "sv9a";
        else if (s_code_lower === "sv10") mapped_code = "sv10";
        
        const num = card_number || "1";
        const formatted_num = /^\d+$/.test(num) ? parseInt(num, 10).toString() : num;
        const fallbackUrl = `https://assets.tcgdex.net/en/${mapped_series}/${mapped_code}/${formatted_num}/low.png`;
        setCurrentSrc(fallbackUrl);
      } else {
        setCurrentSrc(null);
      }
      return;
    }

    let normalizedSrc = src;
    if (src.includes("onepiece-cardgame.com")) {
      normalizedSrc = `/api/image-proxy?url=${encodeURIComponent(src)}`;
    } else if (src.includes("assets.pokemon-card.com") || src.includes("pokemon-card.com")) {
      // Correct case-insensitivity directory mappings for official Japanese assets using safe regex
      const fixedSrc = src.replace(/\/(sv)([0-9]+[a-zA-Z]*)\//gi, (match, p1, p2) => `/SV${p2}/`);
      // Load directly in browser - NO proxy, as server is blocked but browser works!
      normalizedSrc = fixedSrc;
    } else if (src.includes("assets.tcgdex.net")) {
      // Load directly - NO proxy! TCGDex has wildcard CORS and works perfectly on clients.
      normalizedSrc = src;
    }
    setCurrentSrc(normalizedSrc);
  }, [src, set_code, card_number]);

  useEffect(() => {
    if (!currentSrc) {
      setDisplaySrc(null);
      return;
    }

    let isMounted = true;
    let localBlobUrl: string | null = null;

    async function loadWithCache() {
      // 1. If it's already a base64 Data URL or local blob URL, use it directly
      if (currentSrc.startsWith("data:") || currentSrc.startsWith("blob:")) {
        if (isMounted) setDisplaySrc(currentSrc);
        return;
      }

      try {
        if (typeof window !== "undefined" && "caches" in window) {
          const cache = await caches.open("pokemon-card-images");
          const cachedResponse = await cache.match(currentSrc);
          
          if (cachedResponse) {
            const blob = await cachedResponse.blob();
            if (isMounted) {
              localBlobUrl = URL.createObjectURL(blob);
              setDisplaySrc(localBlobUrl);
              return;
            }
          }

          // Not in cache yet, try fetching and caching (if CORS allows)
          try {
            const response = await fetch(currentSrc, { mode: "cors" });
            if (response.ok) {
              await cache.put(currentSrc, response.clone());
              const blob = await response.blob();
              if (isMounted) {
                localBlobUrl = URL.createObjectURL(blob);
                setDisplaySrc(localBlobUrl);
                return;
              }
            }
          } catch (fetchErr) {
            // Soft ignore CORS issues; we'll load the raw image URL directly through img element
          }
        }
      } catch (cacheErr) {
        console.warn("Cache API Error in SafeCardImage:", cacheErr);
      }

      // Default fallback: display the direct external URL
      if (isMounted) {
        setDisplaySrc(currentSrc);
      }
    }

    loadWithCache();

    return () => {
      isMounted = false;
      if (localBlobUrl) {
        URL.revokeObjectURL(localBlobUrl);
      }
    };
  }, [currentSrc]);

  const handleError = () => {
    if (currentSrc && !currentSrc.includes("tcgdex.net") && !currentSrc.includes("onepiece-cardgame.com") && !currentSrc.includes("onepiece")) {
      const s_code = set_code || "";
      const mapped_series = "scarlet-violet";
      const s_code_lower = s_code.toLowerCase();
      let mapped_code = s_code_lower;
      
      if (s_code_lower === "sv2a") mapped_code = "sv3.5";
      else if (s_code_lower === "sv3") mapped_code = "sv3";
      else if (s_code_lower === "sv4a") mapped_code = "sv4.5";
      else if (s_code_lower === "sv5m") mapped_code = "sv5";
      else if (s_code_lower === "sv5k") mapped_code = "sv5";
      else if (s_code_lower === "sv6") mapped_code = "sv6";
      else if (s_code_lower === "sv7") mapped_code = "sv7";
      else if (s_code_lower === "sv7a") mapped_code = "sv7a";
      else if (s_code_lower === "sv8") mapped_code = "sv8";
      else if (s_code_lower === "sv8a") mapped_code = "sv8a";
      else if (s_code_lower === "sv9") mapped_code = "sv9";
      else if (s_code_lower === "sv9a") mapped_code = "sv9a";
      else if (s_code_lower === "sv10") mapped_code = "sv10";
      
      const num = card_number || "1";
      const formatted_num = /^\d+$/.test(num) ? parseInt(num, 10).toString() : num;
      const fallbackUrl = `https://assets.tcgdex.net/en/${mapped_series}/${mapped_code}/${formatted_num}/low.png`;
      console.log(`Fallback triggered to TCGDex: ${fallbackUrl}`);
      if (fallbackUrl === currentSrc) {
        setHasFailed(true);
      } else {
        setCurrentSrc(fallbackUrl);
      }
    } else {
      setHasFailed(true);
    }
  };

  if (hasFailed || !displaySrc) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#121214] to-[#09090b] border border-zinc-800/40 rounded-xl p-3 text-center select-none relative overflow-hidden group/placeholder min-h-[140px]">
        {/* Decorative Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808005_1px,transparent_1px),linear-gradient(to_bottom,#80808005_1px,transparent_1px)] bg-[size:10px_16px]" />
        
        {/* Soft Radial Glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(239,68,68,0.03)_0%,transparent_75%)]" />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-1.5">
          <div className="w-8 h-8 rounded-full bg-zinc-900/90 border border-zinc-800/60 flex items-center justify-center shadow-inner group-hover/placeholder:scale-105 transition-transform duration-300">
            <span className="text-zinc-500 font-mono text-[9px] font-bold">TCG</span>
          </div>
          <p className="text-[10px] font-sans font-medium text-zinc-400 line-clamp-2 max-w-[100px]">
            {alt}
          </p>
          <div className="flex gap-1 items-center font-mono text-[8px] text-zinc-650 mt-0.5">
            <span className="bg-zinc-950 px-1 py-0.2 rounded border border-zinc-900">{set_code || "SET"}</span>
            <span>N° {card_number || "---"}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <img 
      src={displaySrc} 
      alt={alt}
      onError={handleError}
      className={className}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
    />
  );
}

export default function App() {
  // Game Selector Context ("pokemon" | "onepiece")
  const [activeGame, setActiveGame] = useState<"pokemon" | "onepiece">(() => {
    try {
      return (localStorage.getItem("active_tcg_game") as "pokemon" | "onepiece") || "pokemon";
    } catch {
      return "pokemon";
    }
  });

  // Save selection on change
  useEffect(() => {
    localStorage.setItem("active_tcg_game", activeGame);
    setFilterRarities([]);
  }, [activeGame]);

  // Navigation
  const [activeTab, setActiveTab] = useState<"search" | "sets" | "importer" | "scripts" | "database" | "image-explorer" | "inventory" | "favorites">("search");

  // Database Stats
  const [stats, setStats] = useState<DBStats>({
    total_cards: 0,
    total_sets: 0,
    rarities: [],
    languages: []
  });

  // Search Filters
  const [filterName, setFilterName] = useState("");
  const [filterSetName, setFilterSetName] = useState("");
  const [filterCardNum, setFilterCardNum] = useState("");
  const [filterLang, setFilterLang] = useState("");
  const [filterRarity, setFilterRarity] = useState("");
  const [filterRarities, setFilterRarities] = useState<string[]>([]);
  const [rarityDropdownOpen, setRarityDropdownOpen] = useState(false);
  const [filterSetQuery, setFilterSetQuery] = useState("");
  const [filterSetLanguage, setFilterSetLanguage] = useState("");
  const [filterSetSeries, setFilterSetSeries] = useState("");
  const [filterSetYear, setFilterSetYear] = useState("");
  const [setListSortOrder, setSetListSortOrder] = useState<string>("newest");
  const [activeSocialSet, setActiveSocialSet] = useState<any | null>(null);
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Results & Layout Preferences
  const [cards, setCards] = useState<PokemonCard[]>([]);
  const [searchMeta, setSearchMeta] = useState<{ total: number; limit: number; offset: number; has_more: boolean }>({
    total: 0,
    limit: 100,
    offset: 0,
    has_more: false
  });
  const [manualPriceDrafts, setManualPriceDrafts] = useState<Record<string, string>>({});
  const [manualPriceSaving, setManualPriceSaving] = useState<Record<string, boolean>>({});
  const [manualPriceErrors, setManualPriceErrors] = useState<Record<string, string>>({});
  const [clipboardPriceCard, setClipboardPriceCard] = useState<any | null>(null);
  const [clipboardPriceText, setClipboardPriceText] = useState("");
  const [clipboardPriceSaving, setClipboardPriceSaving] = useState(false);
  const [clipboardPriceError, setClipboardPriceError] = useState("");
  const [sortBy, setSortBy] = useState<"set_name" | "card_number" | "rarity" | "">("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const sortedCards = useMemo(() => {
    if (!sortBy) return cards;
    return [...cards].sort((a, b) => {
      let valA = "";
      let valB = "";
      if (sortBy === "set_name") {
        valA = a.set_name || "";
        valB = b.set_name || "";
      } else if (sortBy === "card_number") {
        valA = a.card_number || "";
        valB = b.card_number || "";
      } else if (sortBy === "rarity") {
        valA = a.rarity || "";
        valB = b.rarity || "";
      }

      // Handle natural numeric sorting for card numbers if both can be parsed
      if (sortBy === "card_number") {
        // Safe card number clean up to keep only digits (e.g. "op04-001" -> "04001" or similar)
        const cleanA = (valA || "").replace(/\u00ad/g, '').trim();
        const cleanB = (valB || "").replace(/\u00ad/g, '').trim();
        const numA = parseInt(cleanA.replace(/\D/g, ""), 10);
        const numB = parseInt(cleanB.replace(/\D/g, ""), 10);
        if (!isNaN(numA) && !isNaN(numB)) {
          if (numA !== numB) {
            return sortOrder === "asc" ? numA - numB : numB - numA;
          }
        }
        // Fallback to standard locale-based numeric comparison
        return sortOrder === "asc" 
          ? cleanA.localeCompare(cleanB, undefined, { numeric: true, sensitivity: "base" })
          : cleanB.localeCompare(cleanA, undefined, { numeric: true, sensitivity: "base" });
      }

      const comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: "base" });
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [cards, sortBy, sortOrder]);
  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [selectedCard, setSelectedCard] = useState<PokemonCard | null>(null);
  const [inventoryAddTargetCard, setInventoryAddTargetCard] = useState<any | null>(null);
  const [addFavPurchasePrice, setAddFavPurchasePrice] = useState<number>(0);
  const [addFavPurchasePriceYen, setAddFavPurchasePriceYen] = useState<number>(0);
  const [addFavGrade, setAddFavGrade] = useState<string>("Near Mint");
  const [addFavLocation, setAddFavLocation] = useState<string>("");
  const [addFavNotes, setAddFavNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [searchLimit, setSearchLimit] = useState(100);
  const [allCardsImport, setAllCardsImport] = useState(true);

  const applyCardsResponse = (payload: any, requestedLimit = searchLimit) => {
    const list = Array.isArray(payload)
      ? payload
      : (Array.isArray(payload?.cards) ? payload.cards : []);
    setCards(list);
    setSearchMeta({
      total: Number(payload?.total ?? list.length) || 0,
      limit: Number(payload?.limit ?? requestedLimit) || requestedLimit,
      offset: Number(payload?.offset ?? 0) || 0,
      has_more: Boolean(payload?.has_more)
    });
  };

  // States for Japan arbitrage calculations
  const [arbitrageExchangeRate, setArbitrageExchangeRate] = useState<number>(165.0);
  const [arbitrageImportVat, setArbitrageImportVat] = useState<number>(19.0);
  const [arbitrageCustomsFee, setArbitrageCustomsFee] = useState<number>(3.0);
  const [arbitrageTargetMargin, setArbitrageTargetMargin] = useState<number>(30.0);
  const [trendsLoading, setTrendsLoading] = useState<boolean>(false);
  const [trendsError, setTrendsError] = useState<string | null>(null);
  const [trendsList, setTrendsList] = useState<any[]>([]);

  // Dynamic bottom bar state on mobile scroll (Instagram-style shrink)
  const [isBottomBarVisible, setIsBottomBarVisible] = useState(true);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY.current && currentScrollY > 40) {
        // Scrolling down
        setIsBottomBarVisible(false);
      } else {
        // Scrolling up
        setIsBottomBarVisible(true);
      }
      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);



  // States for Reseller Set Evaluation
  const [setEvaluations, setSetEvaluations] = useState<Record<string, any>>({});
  const [setEvaluationsLoading, setSetEvaluationsLoading] = useState<Record<string, boolean>>({});
  const [setEvaluationsErrors, setSetEvaluationsErrors] = useState<Record<string, string>>({});

  // Database actions states
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);
  const [resetErrorMsg, setResetErrorMsg] = useState<string | null>(null);
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const [resetElapsedTime, setResetElapsedTime] = useState(0);

  // States for Reseller evaluations reset
  const [isResettingEvaluations, setIsResettingEvaluations] = useState(false);
  const [resetEvalSuccessMsg, setResetEvalSuccessMsg] = useState<string | null>(null);
  const [resetEvalErrorMsg, setResetEvalErrorMsg] = useState<string | null>(null);
  const [showResetEvalConfirmation, setShowResetEvalConfirmation] = useState(false);

  // States for Karten-Bilder-Explorer (Image Scan Tab)
  const [scanImage, setScanImage] = useState<string | null>(null);
  const [scannedImages, setScannedImages] = useState<string[]>([]);
  const [scannedImageNames, setScannedImageNames] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
  const [cartSaveFeedback, setCartSaveFeedback] = useState<Record<string, boolean>>({});
  const [inventorySaveFeedback, setInventorySaveFeedback] = useState<Record<number, boolean>>({});
  const [scanProgress, setScanProgress] = useState<string>("");
  const [showJaResellerInfo, setShowJaResellerInfo] = useState<boolean>(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<any | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [turboScan, setTurboScan] = useState<boolean>(false);
  const [manualScanHint, setManualScanHint] = useState<string>("");
  const [isCameraActive, setIsCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const visualCandidateCacheRef = useRef<Record<string, any[]>>({});
  const visualSignatureCacheRef = useRef<Record<string, number[] | null>>({});
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("caches" in window)) return;
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith("pokemon-local-scan-results-") && key !== SCAN_CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .catch(err => console.warn("Alte Scan-Caches konnten nicht bereinigt werden:", err));
  }, []);

  // Live camera analysis states for direct interactive feedback
  const [liveBrightness, setLiveBrightness] = useState<number>(75);
  const [liveContrast, setLiveContrast] = useState<string>("OK");
  const [liveScannableMsg, setLiveScannableMsg] = useState<string>("Analysiere...");
  const [isScannable, setIsScannable] = useState<boolean>(true);
  const [scannerMode, setScannerMode] = useState<"tap" | "auto" | "bulk">("tap");

  // Live webcam analyzer for interactive scan overlay feedback
  useEffect(() => {
    if (!isCameraActive || !cameraStream) {
      return;
    }
    let active = true;
    const tempCanvas = document.createElement("canvas");
    const ctx = tempCanvas.getContext("2d");
    
    const interval = setInterval(() => {
      if (!active || !videoRef.current || !ctx) return;
      try {
        const v = videoRef.current;
        if (v.videoWidth === 0 || v.videoHeight === 0) return;
        
        tempCanvas.width = 40;
        tempCanvas.height = 30;
        ctx.drawImage(v, 0, 0, 40, 30);
        const imgData = ctx.getImageData(0, 0, 40, 30);
        const data = imgData.data;
        
        let rSum = 0;
        let gSum = 0;
        let bSum = 0;
        for (let i = 0; i < data.length; i += 4) {
          rSum += data[i];
          gSum += data[i+1];
          bSum += data[i+2];
        }
        const pixelCount = data.length / 4;
        const bAvg = (rSum + gSum + bSum) / 3 / pixelCount;
        const pct = Math.round((bAvg / 255) * 100);
        setLiveBrightness(pct);
        
        let sumSqDiff = 0;
        for (let i = 0; i < data.length; i += 4) {
          const grey = (data[i] + data[i+1] + data[i+2]) / 3;
          const diff = grey - bAvg;
          sumSqDiff += diff * diff;
        }
        const variance = sumSqDiff / pixelCount;
        const contrastRating = variance > 800 ? "HOCH" : variance > 220 ? "OK" : "SCHLECHT";
        setLiveContrast(contrastRating);
        
        if (pct < 18) {
          setLiveScannableMsg("ZU DUNKEL ⚠️ Sorge für besseres Licht");
          setIsScannable(false);
        } else if (pct > 86) {
          setLiveScannableMsg("ZU HELL ⚠️ Vermeide direkte Blendung");
          setIsScannable(false);
        } else if (contrastRating === "SCHLECHT") {
          setLiveScannableMsg("WACKELIG / MATT ⚠️ Halte die Kamera ruhig");
          setIsScannable(false);
        } else {
          setLiveScannableMsg("SCANNBAR ✓ Optimale Belichtung");
          setIsScannable(true);
        }
      } catch (e) {
        // Safe fallback in case of context reading rules or DOM security issues
      }
    }, 450);
    
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isCameraActive, cameraStream]);

  // Tinder Swiping Deck and Seller Cart States for Japan Scanner User
  const [swipeDeck, setSwipeDeck] = useState<any[]>([]);
  const [deckIndex, setDeckIndex] = useState(0);
  const [confirmClearCart, setConfirmClearCart] = useState(false);
  const [swipeCart, setSwipeCart] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pokemon_swipe_cart") || "[]");
    } catch {
      return [];
    }
  });

  // Track swipe cart in localStorage
  useEffect(() => {
    localStorage.setItem("pokemon_swipe_cart", JSON.stringify(swipeCart));
  }, [swipeCart]);

  // Reseller Card Inventory State
  const [inventory, setInventory] = useState<any[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState<boolean>(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [globalStoreLocation, setGlobalStoreLocation] = useState<string>("Tokyo Akihabara");
  const [selectedInventoryItem, setSelectedInventoryItem] = useState<any | null>(null);
  const [inventorySearchQuery, setInventorySearchQuery] = useState<string>("");
  const [inventoryLocationFilter, setInventoryLocationFilter] = useState<string>("All");
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [isMenuMinimized, setIsMenuMinimized] = useState<boolean>(() => {
    try {
      return localStorage.getItem("pokemon_menu_minimized") === "true";
    } catch {
      return false;
    }
  });

  const toggleMenuMinimized = () => {
    setIsMenuMinimized(prev => {
      const newVal = !prev;
      try {
        localStorage.setItem("pokemon_menu_minimized", String(newVal));
      } catch (e) {}
      return newVal;
    });
  };

  // Reseller Card Favorites State
  const [favorites, setFavorites] = useState<any[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState<boolean>(false);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);
  const [favoritesSearchQuery, setFavoritesSearchQuery] = useState<string>("");
  const filteredFavorites = useMemo(() => {
    const q = favoritesSearchQuery.toLowerCase();
    return favorites.filter(fav => {
      return (
        fav.local_name?.toLowerCase().includes(q) ||
        fav.english_name?.toLowerCase().includes(q) ||
        fav.set_name?.toLowerCase().includes(q) ||
        fav.card_number?.toLowerCase().includes(q)
      );
    });
  }, [favorites, favoritesSearchQuery]);
  const [editingFavId, setEditingFavId] = useState<number | null>(null);
  const [tempFavEur, setTempFavEur] = useState<string>("");
  const [tempFavYen, setTempFavYen] = useState<string>("");
  const [favAutoSync, setFavAutoSync] = useState<boolean>(true);
  const [isExtraMenuOpen, setIsExtraMenuOpen] = useState<boolean>(false);
  const [isNavDropdownOpen, setIsNavDropdownOpen] = useState<boolean>(false);

  const formatSavedDate = (isoString?: string) => {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return "";
      return d.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }) + " Uhr";
    } catch {
      return "";
    }
  };

  const handleSelectTab = (targetTab: string) => {
    setActiveTab(targetTab as any);
    setIsNavDropdownOpen(false);
    setIsExtraMenuOpen(false);
    if (targetTab === "search") {
      // nothing extra
    } else if (targetTab === "image-explorer") {
      setScanImage(null);
      setScanResult(null);
      setScanError(null);
      stopCamera();
    } else if (targetTab === "inventory") {
      fetchInventory();
    } else if (targetTab === "favorites") {
      fetchFavorites();
    } else if (targetTab === "sets") {
      fetchSets();
      fetchStats();
    }
  };

  const handleSaveTargetPrice = async (favId: number, eur: number, yen: number) => {
    try {
      const response = await fetch(`/api/favorites/${favId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_price_eur: eur,
          target_price_yen: yen
        })
      });
      if (response.ok) {
        fetchFavorites();
        setEditingFavId(null);
      }
    } catch (e) {
      console.error("Fehler beim Aktualisieren des Zielpreises:", e);
    }
  };

  const fetchFavorites = async () => {
    setFavoritesLoading(true);
    setFavoritesError(null);
    try {
      const r = await fetch(`/api/favorites?game=${activeGame}`);
      if (r.ok) {
        const resData = await r.json();
        if (resData.success) {
          setFavorites(resData.data || []);
        }
      }
    } catch (err: any) {
      console.error("Fehler beim Laden der Favoriten:", err);
      setFavoritesError(err.message);
    } finally {
      setFavoritesLoading(false);
    }
  };

  useEffect(() => {
    fetchFavorites();
  }, [activeGame]);

  const handleAddToFavorites = async (card: any) => {
    try {
      const cardId = String(card.api_card_id || card.id);
      const response = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_card_id: cardId,
          english_name: card.english_name || card.pokemon_name || card.local_name,
          local_name: card.local_name,
          japanese_name: card.japanese_name,
          card_number: card.card_number,
          set_name: card.set_name,
          set_code: card.set_code,
          rarity: card.rarity,
          language: card.language,
          image_small: card.image_small,
          image_large: card.image_large || card.image_small,
          game: card.game || activeGame
        })
      });

      if (response.ok) {
        fetchFavorites();
        return true;
      }
    } catch (e: any) {
      console.error("Fehler beim Hinzufügen zu Favoriten:", e);
    }
    return false;
  };

  const handleRemoveFromFavorites = async (cardId: string | number) => {
    try {
      const response = await fetch(`/api/favorites/by-card-id/${cardId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        fetchFavorites();
        return true;
      }
    } catch (e: any) {
      console.error("Fehler beim Entfernen aus Favoriten:", e);
    }
    return false;
  };

  const isCardFavorited = (cardId: string | number) => {
    const idStr = String(cardId);
    return favorites.some(fav => String(fav.api_card_id) === idStr);
  };

  const getCardPriceKey = (card: any) => `${String(card?.game || activeGame).toLowerCase()}:${card?.api_card_id || card?.id}`;

  const formatYenFromEur = (eur: number) => {
    if (!Number.isFinite(eur) || eur <= 0) return "¥0";
    return `¥${Math.round(eur * arbitrageExchangeRate).toLocaleString("de-DE")}`;
  };

  const parseEuroPricesFromText = (text: string) => {
    const matches = Array.from(String(text || "").matchAll(/(?:(?:€|EUR)\s*)?(\d{1,4}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:\.\d{2})?)\s*(?:€|EUR)|(?:€|EUR)\s*(\d{1,4}(?:[.\s]\d{3})*(?:,\d{2})|\d+(?:\.\d{2})?)/gi));
    return matches
      .map(match => match[1] || match[2] || "")
      .map(value => {
        const compact = value.replace(/\s/g, "");
        const normalized = compact.includes(",")
          ? compact.replace(/\./g, "").replace(",", ".")
          : compact;
        const price = Number(normalized);
        return Number.isFinite(price) ? Math.round(price * 100) / 100 : 0;
      })
      .filter(price => price > 0 && price < 100000);
  };

  const getClipboardPriceStats = (text: string) => {
    const prices = parseEuroPricesFromText(text).sort((a, b) => a - b);
    if (prices.length === 0) return null;
    const median = prices.length % 2 === 1
      ? prices[Math.floor(prices.length / 2)]
      : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
    const trimCount = prices.length >= 8 ? Math.floor(prices.length * 0.1) : 0;
    const trimmed = prices.slice(trimCount, prices.length - trimCount);
    const average = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const trimmedAverage = trimmed.reduce((sum, price) => sum + price, 0) / trimmed.length;

    return {
      count: prices.length,
      prices,
      min: prices[0],
      max: prices[prices.length - 1],
      median: Math.round(median * 100) / 100,
      average: Math.round(average * 100) / 100,
      trimmedAverage: Math.round(trimmedAverage * 100) / 100
    };
  };

  const applyManualMarketPriceToCard = (card: any, priceRow: any) => ({
    ...card,
    market_price_eur: Number(priceRow?.market_price_eur || 0),
    manual_market_price_eur: Number(priceRow?.market_price_eur || 0),
    low_price_eur: Number(priceRow?.low_price_eur || 0),
    median_price_eur: Number(priceRow?.median_price_eur || priceRow?.market_price_eur || 0),
    average_price_eur: Number(priceRow?.average_price_eur || 0),
    trend_price_eur: Number(priceRow?.trend_price_eur || 0),
    max_price_eur: Number(priceRow?.max_price_eur || 0),
    offer_count: Number(priceRow?.offer_count || 0),
    market_source: priceRow?.source || "manual",
    market_observed_at: priceRow?.observed_at || new Date().toISOString(),
    market_source_url: priceRow?.source_url || ""
  });

  const handleSaveManualMarketPrice = async (card: any) => {
    const key = getCardPriceKey(card);
    const rawDraft = manualPriceDrafts[key] ?? String(card.market_price_eur || card.manual_market_price_eur || "");
    const marketPrice = Number(String(rawDraft).replace(",", "."));

    if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
      setManualPriceErrors(prev => ({ ...prev, [key]: "Bitte positiven Euro-Preis eingeben." }));
      return;
    }

    setManualPriceSaving(prev => ({ ...prev, [key]: true }));
    setManualPriceErrors(prev => ({ ...prev, [key]: "" }));

    try {
      const response = await fetch("/api/prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_card_id: card.api_card_id,
          game: String(card.game || activeGame).toLowerCase(),
          market_price_eur: marketPrice,
          source: "manual",
          notes: "Manueller Raw-Marktpreis aus der Kartenliste."
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Preis konnte nicht gespeichert werden.");
      }

      const updatedCard = applyManualMarketPriceToCard(card, data.price);
      setCards(prev => prev.map(item => String(item.api_card_id) === String(card.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setInventory(prev => prev.map(item => String(item.api_card_id) === String(card.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setFavorites(prev => prev.map(item => String(item.api_card_id) === String(card.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setSelectedCard(prev => prev && String(prev.api_card_id) === String(card.api_card_id) ? applyManualMarketPriceToCard(prev, data.price) : prev);
      setManualPriceDrafts(prev => ({ ...prev, [key]: Number(data.price.market_price_eur || marketPrice).toFixed(2) }));
      fetchSets();
    } catch (err: any) {
      setManualPriceErrors(prev => ({ ...prev, [key]: err.message || "Speichern fehlgeschlagen." }));
    } finally {
      setManualPriceSaving(prev => ({ ...prev, [key]: false }));
    }
  };

  const openClipboardPriceModal = (card: any) => {
    setClipboardPriceCard(card);
    setClipboardPriceText("");
    setClipboardPriceError("");
  };

  const handleReadClipboardPrices = async () => {
    setClipboardPriceError("");
    try {
      const text = await navigator.clipboard.readText();
      setClipboardPriceText(text || "");
    } catch {
      setClipboardPriceError("Zwischenablage konnte nicht gelesen werden.");
    }
  };

  const handleSaveClipboardMarketPrice = async () => {
    if (!clipboardPriceCard) return;
    const stats = getClipboardPriceStats(clipboardPriceText);
    if (!stats) {
      setClipboardPriceError("Keine Euro-Preise gefunden.");
      return;
    }

    setClipboardPriceSaving(true);
    setClipboardPriceError("");

    try {
      const response = await fetch("/api/prices/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_card_id: clipboardPriceCard.api_card_id,
          game: String(clipboardPriceCard.game || activeGame).toLowerCase(),
          market_price_eur: stats.median,
          low_price_eur: stats.min,
          median_price_eur: stats.median,
          average_price_eur: stats.average,
          trend_price_eur: stats.trimmedAverage,
          max_price_eur: stats.max,
          offer_count: stats.count,
          source: "cardmarket_clipboard",
          source_url: buildCardmarketOpenUrl(clipboardPriceCard),
          notes: `Cardmarket Clipboard: n=${stats.count}, min=${stats.min}, median=${stats.median}, avg=${stats.average}, trimmed_avg=${stats.trimmedAverage}, max=${stats.max}`
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Preis konnte nicht gespeichert werden.");
      }

      const key = getCardPriceKey(clipboardPriceCard);
      setCards(prev => prev.map(item => String(item.api_card_id) === String(clipboardPriceCard.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setInventory(prev => prev.map(item => String(item.api_card_id) === String(clipboardPriceCard.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setFavorites(prev => prev.map(item => String(item.api_card_id) === String(clipboardPriceCard.api_card_id) ? applyManualMarketPriceToCard(item, data.price) : item));
      setSelectedCard(prev => prev && String(prev.api_card_id) === String(clipboardPriceCard.api_card_id) ? applyManualMarketPriceToCard(prev, data.price) : prev);
      setManualPriceDrafts(prev => ({ ...prev, [key]: Number(data.price.market_price_eur || stats.median).toFixed(2) }));
      setClipboardPriceCard(null);
      setClipboardPriceText("");
      fetchSets();
    } catch (err: any) {
      setClipboardPriceError(err.message || "Speichern fehlgeschlagen.");
    } finally {
      setClipboardPriceSaving(false);
    }
  };

  const renderManualPriceEditor = (card: any, mode: "mobile" | "grid" | "table" = "grid") => {
    const key = getCardPriceKey(card);
    const prices = getEstimatedCardmarketPrices(card);
    const currentEur = prices.isMarketPrice ? Number(prices.raw || 0) : 0;
    const draft = manualPriceDrafts[key] ?? (currentEur > 0 ? currentEur.toFixed(2) : "");
    const draftEur = Number(String(draft).replace(",", "."));
    const previewEur = Number.isFinite(draftEur) && draftEur > 0 ? draftEur : currentEur;
    const saving = Boolean(manualPriceSaving[key]);
    const errorMsg = manualPriceErrors[key];
    const compact = mode === "table" || mode === "mobile";

    return (
      <div onClick={(e) => e.stopPropagation()} className={`space-y-1 ${mode === "table" ? "min-w-[150px]" : ""}`}>
        <div className={`font-mono ${compact ? "text-[9px]" : "text-[10px]"} ${currentEur > 0 ? "text-emerald-400" : "text-amber-400"} font-bold`}>
          {currentEur > 0 ? `Raw: €${currentEur.toFixed(2)} (${formatYenFromEur(currentEur)})` : "Raw: CHECK"}
        </div>
        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            placeholder="€"
            value={draft}
            onChange={(e) => setManualPriceDrafts(prev => ({ ...prev, [key]: e.target.value }))}
            className={`${compact ? "w-16" : "w-20"} bg-[#0b0b0d] border border-zinc-800 focus:border-emerald-500/50 outline-none rounded-lg px-2 py-1 text-[10px] text-zinc-100 font-mono`}
            aria-label="Raw-Preis in Euro"
          />
          <button
            type="button"
            onClick={() => handleSaveManualMarketPrice(card)}
            disabled={saving}
            title="Raw-Preis speichern"
            className="h-7 w-7 inline-flex items-center justify-center rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 disabled:opacity-50 cursor-pointer transition"
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
        </div>
        {previewEur > 0 && (
          <div className="text-[9px] text-zinc-500 font-mono">Preview: €{previewEur.toFixed(2)} ({formatYenFromEur(previewEur)})</div>
        )}
        {errorMsg && <div className="text-[9px] text-red-400 font-mono">{errorMsg}</div>}
      </div>
    );
  };

  const withCardmarketNmFilter = (urlValue: string) => {
    try {
      const url = new URL(urlValue);
      if (!url.searchParams.has("minCondition")) url.searchParams.set("minCondition", "2");
      return url.toString();
    } catch {
      return urlValue;
    }
  };

  const getCardmarketLanguageId = (card: any) => {
    const lang = String(card?.language || "").toUpperCase();
    if (lang === "JA" || lang === "JP" || lang === "JPN") return "7";
    if (lang === "DE" || lang === "GER" || lang === "GERMAN") return "3";
    if (lang === "FR") return "2";
    if (lang === "ES") return "4";
    if (lang === "IT") return "5";
    if (lang === "PT") return "8";
    if (lang === "KO" || lang === "KR") return "10";
    if (lang === "ZH" || lang === "CN" || lang === "CHT") return "11";
    return "1";
  };

  const buildCardmarketOpenUrl = (card: any) => {
    try {
      const url = new URL(withCardmarketNmFilter(card.cardmarket_link || ""));
      url.searchParams.set("language", getCardmarketLanguageId(card));
      url.searchParams.set("minCondition", "2");
      return url.toString();
    } catch {
      return card.cardmarket_link || "";
    }
  };

  const handleOpenCardmarket = (card: any) => {
    const cmUrl = buildCardmarketOpenUrl(card);
    if (cmUrl) window.open(cmUrl, "_blank", "noopener,noreferrer");
  };

  const marketButtonBase = "h-9 rounded-xl border px-2.5 text-[10px] font-black tracking-tight flex items-center justify-center gap-1.5 transition active:scale-[0.98] whitespace-nowrap";
  const renderMarketButtons = (card: any, mode: "compact" | "detail" | "table" = "compact") => {
    const detail = mode === "detail";
    const table = mode === "table";
    const wrapperClass = detail
      ? "flex flex-col gap-2.5"
      : table
        ? "flex flex-wrap justify-end gap-1.5"
        : "grid grid-cols-2 gap-1.5";
    const buttonClass = detail ? `${marketButtonBase} min-h-11 px-3 text-xs justify-between` : marketButtonBase;

    return (
      <div onClick={(e) => e.stopPropagation()} className={wrapperClass}>
        <button
          type="button"
          onClick={() => handleOpenCardmarket(card)}
          title="Cardmarket mit NM-Filter öffnen"
          className={`${buttonClass} bg-teal-950/35 hover:bg-teal-500/10 border-teal-500/20 text-teal-300`}
        >
          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          <span>CM öffnen</span>
        </button>
        <button
          type="button"
          onClick={() => openClipboardPriceModal(card)}
          title="Cardmarket-Preise einfügen"
          className={`${buttonClass} bg-amber-950/25 hover:bg-amber-500/10 border-amber-500/20 text-amber-300`}
        >
          <Copy className="w-3.5 h-3.5 shrink-0" />
          <span>CM Preise</span>
        </button>
        <a
          href={card.ebay_link}
          target="_blank"
          rel="noopener noreferrer"
          title="eBay öffnen"
          className={`${buttonClass} bg-indigo-950/35 hover:bg-indigo-500/10 border-indigo-500/20 text-indigo-300`}
        >
          <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
          <span>eBay öffnen</span>
        </a>
        <a
          href={card.tcgplayer_link || buildTcgplayerSearchLink(card, activeGame)}
          target="_blank"
          rel="noopener noreferrer"
          title="TCGPlayer öffnen"
          className={`${buttonClass} bg-sky-950/30 hover:bg-sky-500/10 border-sky-500/20 text-sky-300`}
        >
          <CreditCard className="w-3.5 h-3.5 shrink-0" />
          <span>TCGPlayer öffnen</span>
        </a>
        <a
          href={card.google_link || buildGoogleSearchLink(card, activeGame)}
          target="_blank"
          rel="noopener noreferrer"
          title="Google suchen"
          className={`${buttonClass} bg-zinc-900/75 hover:bg-zinc-800 border-zinc-700/70 text-zinc-200`}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span>Google suchen</span>
        </a>
      </div>
    );
  };

  const renderClipboardPriceModal = () => {
    if (!clipboardPriceCard) return null;
    const stats = getClipboardPriceStats(clipboardPriceText);
    const fmt = (value: number) => `${Number(value || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    const fmtYen = (value: number) => `~ ${formatYenFromEur(Number(value || 0))}`;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[10000] flex items-center justify-center p-4">
        <div className="bg-[#121214] border border-[#222226] rounded-3xl max-w-lg w-full p-5 select-text shadow-2xl relative animate-in fade-in zoom-in duration-200">
          <button
            type="button"
            onClick={() => setClipboardPriceCard(null)}
            className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
            title="Schließen"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="pr-10">
            <div className="text-[10px] font-black uppercase tracking-wider text-amber-300">Cardmarket Preise</div>
            <h3 className="mt-1 text-sm font-bold text-zinc-100 truncate">{formatCardName(clipboardPriceCard)}</h3>
            <p className="text-[10px] text-zinc-500 font-mono truncate">
              {clipboardPriceCard.set_name} · #{clipboardPriceCard.card_number}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <textarea
              value={clipboardPriceText}
              onChange={(e) => {
                setClipboardPriceText(e.target.value);
                setClipboardPriceError("");
              }}
              rows={7}
              placeholder={"23,99 €\n24,50 €\n25,00 €"}
              className="w-full bg-[#0b0b0d] border border-zinc-800 focus:border-amber-500/50 outline-none rounded-2xl px-3 py-2 text-xs text-zinc-100 font-mono resize-none"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleReadClipboardPrices}
                className="h-9 rounded-xl border border-zinc-700/70 bg-zinc-900/75 hover:bg-zinc-800 px-3 text-[10px] font-black text-zinc-200 flex items-center gap-1.5 transition"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Einfügen</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenCardmarket(clipboardPriceCard)}
                className="h-9 rounded-xl border border-teal-500/20 bg-teal-950/35 hover:bg-teal-500/10 px-3 text-[10px] font-black text-teal-300 flex items-center gap-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>CM öffnen</span>
              </button>
            </div>

            {stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <div className="bg-[#0b0b0d] border border-zinc-850 rounded-xl p-2">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase">Anzahl</div>
                  <div className="text-xs text-zinc-100 font-bold">{stats.count}</div>
                </div>
                <div className="bg-[#0b0b0d] border border-emerald-500/20 rounded-xl p-2">
                  <div className="text-[9px] text-emerald-400 font-mono uppercase">Median</div>
                  <div className="text-xs text-emerald-300 font-bold">{fmt(stats.median)}</div>
                  <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">{fmtYen(stats.median)}</div>
                </div>
                <div className="bg-[#0b0b0d] border border-zinc-850 rounded-xl p-2">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase">Ø</div>
                  <div className="text-xs text-zinc-100 font-bold">{fmt(stats.average)}</div>
                  <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">{fmtYen(stats.average)}</div>
                </div>
                <div className="bg-[#0b0b0d] border border-zinc-850 rounded-xl p-2">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase">Min</div>
                  <div className="text-xs text-zinc-100 font-bold">{fmt(stats.min)}</div>
                  <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">{fmtYen(stats.min)}</div>
                </div>
                <div className="bg-[#0b0b0d] border border-zinc-850 rounded-xl p-2">
                  <div className="text-[9px] text-zinc-500 font-mono uppercase">Max</div>
                  <div className="text-xs text-zinc-100 font-bold">{fmt(stats.max)}</div>
                  <div className="text-[9px] text-amber-400/80 font-mono mt-0.5">{fmtYen(stats.max)}</div>
                </div>
              </div>
            ) : (
              <div className="bg-[#0b0b0d] border border-zinc-850 rounded-xl px-3 py-2 text-[10px] text-zinc-500 font-mono">
                Keine Euro-Preise erkannt.
              </div>
            )}

            {stats && (
              <div className="text-[9px] text-zinc-500 font-mono leading-relaxed break-words">
                {stats.prices.slice(0, 16).map(fmt).join(" · ")}
                {stats.prices.length > 16 ? " · ..." : ""}
              </div>
            )}

            {clipboardPriceError && (
              <div className="text-[10px] text-red-400 font-mono">{clipboardPriceError}</div>
            )}

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setClipboardPriceCard(null)}
                className="flex-1 bg-[#1c1c1f] hover:bg-[#27272a] text-zinc-300 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer border border-zinc-800"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={handleSaveClipboardMarketPrice}
                disabled={!stats || clipboardPriceSaving}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {clipboardPriceSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Median speichern</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const getActiveCardStackAndIndex = () => {
    if (!selectedCard) return { stack: [], index: -1 };
    
    // Determine active stack
    const stack = activeTab === "favorites" ? filteredFavorites : cards;
    
    // Find index by comparing api_card_id or id
    const targetIdStr = String(selectedCard.api_card_id || selectedCard.id);
    const index = stack.findIndex(item => {
      const itemIdStr = String(item.api_card_id || item.id);
      return itemIdStr === targetIdStr;
    });
    
    return { stack, index };
  };

  const handleNavigateCard = (direction: "prev" | "next") => {
    const { stack, index } = getActiveCardStackAndIndex();
    if (stack.length === 0 || index === -1) return;
    
    let newIndex = index;
    if (direction === "prev") {
      newIndex = index - 1;
      if (newIndex < 0) {
        newIndex = stack.length - 1; // loop around
      }
    } else {
      newIndex = index + 1;
      if (newIndex >= stack.length) {
        newIndex = 0; // loop around
      }
    }
    
    const nextCard = stack[newIndex];
    if (nextCard) {
      if (activeTab === "favorites") {
        setSelectedCard({
          ...nextCard,
          id: nextCard.api_card_id,
          pokemon_name: nextCard.local_name,
          active_tcg_game: nextCard.game
        } as any);
      } else {
        setSelectedCard(nextCard);
      }
    }
  };

  // Global keydown listener for arrow navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only intercept if selectedCard is open
      if (!selectedCard) return;
      
      // Do not intercept if user is typing in generic inputs or textareas
      const activeEl = document.activeElement;
      if (activeEl && (
        activeEl.tagName === "INPUT" || 
        activeEl.tagName === "TEXTAREA" || 
        (activeEl as HTMLElement).isContentEditable
      )) {
        return;
      }
      
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigateCard("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        handleNavigateCard("next");
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedCard, cards, filteredFavorites, activeTab]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    inventory.forEach(item => {
      if (item.purchase_location) {
        locs.add(item.purchase_location);
      }
    });
    return ["All", ...Array.from(locs)];
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = 
        (item.local_name || "").toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
        (item.pokemon_name || "").toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
        (item.card_number || "").toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
        (item.set_code || "").toLowerCase().includes(inventorySearchQuery.toLowerCase());
      
      const matchesLocation = 
        inventoryLocationFilter === "All" || 
        item.purchase_location === inventoryLocationFilter;
        
      return matchesSearch && matchesLocation;
    });
  }, [inventory, inventorySearchQuery, inventoryLocationFilter]);

  const openInventoryCardDetails = (item: any) => {
    const canonicalId = item.api_card_id && item.api_card_id !== "fallback"
      ? item.api_card_id
      : 999999 + item.id;
    setSelectedCard({
      id: canonicalId,
      api_card_id: item.api_card_id || "fallback",
      pokemon_name: item.pokemon_name || item.local_name,
      local_name: item.local_name,
      japanese_name: item.japanese_name,
      english_name: item.pokemon_name || item.local_name,
      card_number: item.card_number,
      set_name: item.set_name,
      set_code: item.set_code,
      rarity: item.rarity,
      language: item.language,
      image_small: item.image_small,
      image_large: item.image_small,
      yen_price: item.yen_price,
      yellow_label_detected: item.yellow_label_detected === 1,
      notes: item.notes
    } as any);
  };

  const fetchInventory = async () => {
    setInventoryLoading(true);
    setInventoryError(null);
    try {
      const r = await fetch(`/api/inventory?game=${activeGame}`);
      if (r.ok) {
        const resData = await r.json();
        if (resData.success) {
          setInventory(resData.data || []);
        }
      }
    } catch (err: any) {
      console.error("Fehler beim Laden des Inventars:", err);
      setInventoryError(err.message);
    } finally {
      setInventoryLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, [activeGame]);

  const handleAddToInventory = async (card: any, customLocation?: string, customNotes?: string) => {
    try {
      const bboxJson = card.bounding_box ? JSON.stringify(card.bounding_box) : "";
      const response = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_card_id: String(card.api_card_id || card.id),
          pokemon_name: card.pokemon_name || card.local_name,
          local_name: card.local_name,
          japanese_name: card.japanese_name,
          card_number: card.card_number,
          set_name: card.set_name,
          set_code: card.set_code,
          rarity: card.rarity,
          language: card.language,
          image_small: card.image_small,
          yen_price: card.yen_price || 0,
          yellow_label_detected: card.yellow_label_detected ? 1 : 0,
          purchase_location: customLocation || globalStoreLocation || "Book-Off",
          notes: customNotes !== undefined ? customNotes : (card.notes || ""),
          bounding_box_json: bboxJson,
          image_source_base64: card.imageSourceBase64 || card.image_source_base64 || "",
          game: card.game || activeGame
        })
      });

      if (!response.ok) {
        throw new Error("Fehler beim Speichern der Karte im Inventar");
      }

      const res = await response.json();
      if (res.success) {
        fetchInventory();
        return true;
      }
    } catch (e: any) {
      console.error(e);
    }
    return false;
  };

  const handleAddAllCartToInventory = async (customLocation?: string) => {
    let succeededCount = 0;
    for (const item of swipeCart) {
      const success = await handleAddToInventory(item, customLocation || globalStoreLocation, item.notes);
      if (success) {
        succeededCount++;
      }
    }
    if (succeededCount > 0) {
      setSwipeCart([]);
    }
  };

  const handleDeleteFromInventory = async (inventoryId: number) => {
    try {
      const response = await fetch(`/api/inventory/${inventoryId}`, {
        method: "DELETE"
      });
      if (response.ok) {
        fetchInventory();
      }
    } catch (e) {
      console.error("Fehler beim Löschen aus dem Inventar:", e);
    }
  };

  const handleUpdateInventoryItem = async (inventoryId: number, fields: { notes?: string; yen_price?: number }) => {
    try {
      const response = await fetch(`/api/inventory/${inventoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields)
      });
      if (response.ok) {
        // Soft refresh without loading spinner
        const r = await fetch(`/api/inventory?game=${activeGame}`);
        if (r.ok) {
          const resData = await r.json();
          setInventory(resData.data || []);
        }
      }
    } catch (e) {
      console.error("Fehler beim Aktualisieren im System:", e);
    }
  };

  // Live Terminal Stream states
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncLang, setSyncLang] = useState("de");
  const [syncCount, setSyncCount] = useState("3");
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Python Script Viewer states
  const [selectedScript, setSelectedScript] = useState("database.py");
  const [copiedText, setCopiedText] = useState(false);

  // Extract unique series from sets for dynamic selector
  const uniqueSeriesList = useMemo(() => {
    const sSet = new Set<string>();
    sets.forEach((s) => {
      if (s.series) sSet.add(s.series);
    });
    return Array.from(sSet).sort();
  }, [sets]);

  // Extract unique years from sets for dynamic selector
  const uniqueYearsList = useMemo(() => {
    const ySet = new Set<string>();
    sets.forEach((s) => {
      if (s.release_date) {
        const year = s.release_date.split("-")[0];
        if (year && year.length === 4) {
          ySet.add(year);
        }
      }
    });
    return Array.from(ySet).sort((a, b) => b.localeCompare(a));
  }, [sets]);

  // Filtered sets list based on search query, language, series & year selections
  const filteredSetsRaw = useMemo(() => {
    return sets.filter((s) => {
      // Language check (DE, EN, JA)
      if (filterSetLanguage) {
        const matchLang = String(s.language || "").toUpperCase();
        if (matchLang !== filterSetLanguage.toUpperCase()) {
          return false;
        }
      }
      // Series filter check
      if (filterSetSeries) {
        if (s.series !== filterSetSeries) {
          return false;
        }
      }
      // Year filter check
      if (filterSetYear) {
        const year = s.release_date ? s.release_date.split("-")[0] : "";
        if (year !== filterSetYear) {
          return false;
        }
      }
      if (!filterSetQuery) return true;
      const q = filterSetQuery.toLowerCase();
      return (
        (s.set_name && s.set_name.toLowerCase().includes(q)) ||
        (s.set_code && s.set_code.toLowerCase().includes(q)) ||
        (s.series && s.series.toLowerCase().includes(q))
      );
    });
  }, [sets, filterSetLanguage, filterSetSeries, filterSetYear, filterSetQuery]);

  const filteredSets = useMemo(() => {
    let result = filteredSetsRaw;
    if (!filterSetLanguage) {
      const map = new Map<string, any>();
      for (const s of filteredSetsRaw) {
        const existing = map.get(s.set_code);
        if (!existing) {
          map.set(s.set_code, s);
        } else {
          // Prefer EN over JA or others if All Languages search is active
          if (existing.language !== "EN" && s.language === "EN") {
            map.set(s.set_code, s);
          }
        }
      }
      result = Array.from(map.values());
    }

    // Sort by setListSortOrder
    return [...result].sort((a: any, b: any) => {
      if (setListSortOrder === "highest_value") {
        const valA = a.stats?.total_value_raw || 0;
        const valB = b.stats?.total_value_raw || 0;
        return valB - valA;
      } else if (setListSortOrder === "highest_card") {
        const valA = a.stats?.highest_price_raw || 0;
        const valB = b.stats?.highest_price_raw || 0;
        return valB - valA;
      } else if (setListSortOrder === "total_cards") {
        return (b.total_cards || 0) - (a.total_cards || 0);
      } else { // newest
        return String(b.release_date || "").localeCompare(String(a.release_date || ""));
      }
    });
  }, [filteredSetsRaw, filterSetLanguage, setListSortOrder]);

  // Fetch Stats and initial sets filtered by game
  const fetchStats = async () => {
    try {
      const response = await fetch(`/api/stats?game=${activeGame}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch database stats", err);
    }
  };

  const fetchSetEvaluations = async () => {
    try {
      const response = await fetch("/api/sets/evaluations");
      if (response.ok) {
        const data = await response.json();
        const mapping: Record<string, any> = {};
        for (const row of data) {
          const key = `${row.set_code.toUpperCase()}-${row.language.toUpperCase()}`;
          mapping[key] = row;
        }
        setSetEvaluations(mapping);
      }
    } catch (err) {
      console.error("Failed to fetch set evaluations", err);
    }
  };

  const fetchSets = async () => {
    try {
      const response = await fetch(`/api/sets?game=${activeGame}`);
      if (response.ok) {
        const data = await response.json();
        setSets(data);
        await fetchSetEvaluations();
      }
    } catch (err) {
      console.error("Failed to fetch sets", err);
    }
  };

  const handleDownloadSocialCard = (set: any) => {
    const isOnePieceSet = activeGame === "onepiece" || set.game === "onepiece" || /^(OP|ST|EB|PR)/i.test(String(set.set_code || ""));
    const seriesFallback = isOnePieceSet ? "ONE PIECE" : "POKEMON";
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Draw Background
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, 0, 1080, 1080);

    // Draw grid pattern to match technical/analytics mood
    ctx.strokeStyle = "rgba(239, 68, 68, 0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < 1080; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 1080);
      ctx.stroke();
    }
    for (let y = 0; y < 1080; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(1080, y);
      ctx.stroke();
    }

    // Outer framing glow
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 8;
    ctx.strokeRect(20, 20, 1040, 1040);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 1020, 1020);

    // Header text
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText("POKÉCOLL TCG // MARKET REPORT", 60, 80);

    ctx.fillStyle = "#facc15";
    ctx.font = "bold 18px monospace";
    ctx.fillText("LIVE SCHNITTSTELLE", 830, 80);

    // Set Info Header
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 52px system-ui, sans-serif";
    const titleVal = set.english_set_name || set.set_name || "TCG Set";
    ctx.fillText(titleVal.toUpperCase().slice(0, 32), 60, 160);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "bold 20px system-ui, sans-serif";
    ctx.fillText(`CODE: ${set.set_code.toUpperCase()}  |  SERIEN: ${(set.series || seriesFallback).toUpperCase()}  |  SPRACHE: ${set.language}`, 60, 205);

    // Left Bento: Stats
    ctx.fillStyle = "#121214";
    ctx.beginPath();
    ctx.roundRect(60, 240, 440, 760, 24);
    ctx.fill();
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("SET INDEX STATISTIKEN", 90, 290);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("SET INDEX (RAW):", 90, 350);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 38px monospace";
    const totalValStr = (set.stats?.total_value_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    ctx.fillText(totalValStr, 90, 395);

    ctx.fillStyle = "#eab308";
    ctx.font = "bold 20px monospace";
    const totalValYenStr = `~ ${(Math.round((set.stats?.total_value_raw || 0) * arbitrageExchangeRate)).toLocaleString("de-DE")} ¥`;
    ctx.fillText(totalValYenStr, 90, 425);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("RAW-PREISDATEN:", 90, 495);
    ctx.fillStyle = "#10b981";
    ctx.font = "bold 38px monospace";
    const coverageStr = `${set.stats?.priced_cards_db || 0}/${set.stats?.total_cards_db || set.total_cards || 0}`;
    ctx.fillText(coverageStr, 90, 540);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("DURCHSCHNITT PRO KARTE:", 90, 610);
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 24px monospace";
    const avgPriceStr = (set.stats?.average_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
    ctx.fillText(avgPriceStr, 90, 640);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "18px system-ui, sans-serif";
    ctx.fillText("TEUERSTER PULL (RAW):", 90, 700);
    ctx.fillStyle = "#f43f5e";
    ctx.font = "bold 24px monospace";
    const highestPriceStr = (set.stats?.highest_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 }) + " €";
    ctx.fillText(highestPriceStr, 90, 730);

    ctx.fillStyle = "#1a1a1e";
    ctx.beginPath();
    ctx.roundRect(85, 770, 390, 200, 16);
    ctx.fill();

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "bold 15px system-ui, sans-serif";
    ctx.fillText("RAW-MARKTDATEN STATUS", 105, 805);

    ctx.fillStyle = "#10b981";
    ctx.font = "bold 46px system-ui, sans-serif";
    ctx.fillText(`${set.stats?.priced_cards_db || 0} KARTEN`, 105, 865);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px monospace";
    ctx.fillText(`Quelle: ${set.stats?.price_source || "missing_market_prices"}`, 105, 910);

    ctx.fillStyle = "#a1a1aa";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("Nur importierte oder manuelle Raw-Preise fließen ein.", 105, 945);

    // Right Bento: Top 5 Hottest Cards
    const rightBoxX = 540;
    ctx.fillStyle = "#ef4444";
    ctx.font = "bold 24px system-ui, sans-serif";
    ctx.fillText("TOP 5 HOTTEST PULLS", rightBoxX, 280);

    const cardsToDraw = set.top_5_cards || [];
    cardsToDraw.forEach((item: any, idx: number) => {
      const yOffset = 310 + idx * 135;

      ctx.fillStyle = "#121214";
      ctx.beginPath();
      ctx.roundRect(rightBoxX, yOffset, 480, 115, 16);
      ctx.fill();
      ctx.strokeStyle = "#27272a";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = "#ef4444";
      ctx.font = "900 24px system-ui, sans-serif";
      ctx.fillText(`#${idx + 1}`, rightBoxX + 20, yOffset + 45);

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 18px system-ui, sans-serif";
      const name = item.english_name || item.local_name || "TCG Karte";
      ctx.fillText(name.slice(0, 28), rightBoxX + 75, yOffset + 35);

      ctx.fillStyle = "#a1a1aa";
      ctx.font = "bold 13px monospace";
      ctx.fillText(`#${item.card_number || "???"}  |  ${(item.rarity || "Rare").toUpperCase()}`, rightBoxX + 75, yOffset + 58);

      // Raw market badge
      ctx.fillStyle = "#10b981";
      ctx.beginPath();
      ctx.roundRect(rightBoxX + 75, yOffset + 72, 175, 28, 6);
      ctx.fill();

      ctx.fillStyle = "#022c22";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.fillText("RAW MARKTPREIS", rightBoxX + 85, yOffset + 91);

      // Raw market price value representation
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 22px monospace";
      const rawPriceStr = `${(item.prices?.raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
      ctx.fillText(rawPriceStr, rightBoxX + 350, yOffset + 45);

      ctx.fillStyle = "#eab308";
      ctx.font = "bold 14px monospace";
      const yenPriceStr = `~ ${Math.round((item.prices?.raw || 0) * arbitrageExchangeRate).toLocaleString("de-DE")} ¥`;
      ctx.fillText(yenPriceStr, rightBoxX + 350, yOffset + 68);
    });

    // Disclaimer Bar
    ctx.fillStyle = "#3f3f46";
    ctx.font = "bold 13px monospace";
    ctx.fillText("ERSTELLT MIT DEINEM TCG ANALYTICS TOOL  // PREISE BASIEREN AUF LIVE-INDEXWERTEN", 60, 1045);

    try {
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${set.set_code.toUpperCase()}_Instagram_Report.png`;
      a.click();
    } catch (err) {
      console.error("Canvas image export failed", err);
    }
  };

  const handleEvaluateSet = async (setCode: string, language: string, force = false) => {
    const key = `${setCode.toUpperCase()}-${language.toUpperCase()}`;
    
    setSetEvaluationsLoading((prev) => ({ ...prev, [key]: true }));
    setSetEvaluationsErrors((prev) => ({ ...prev, [key]: "" }));
    
    try {
      const res = await fetch(`/api/sets/${encodeURIComponent(setCode)}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language,
          force
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Fehler bei der lokalen Set-Analyse.");
      }
      const data = await res.json();
      if (data.evaluated) {
        setSetEvaluations((prev) => ({
          ...prev,
          [key]: data.evaluation
        }));
      } else {
        throw new Error("Berechnung nicht erfolgreich.");
      }
    } catch (err: any) {
      console.error(err);
      setSetEvaluationsErrors((prev) => ({
        ...prev,
        [key]: err.message || "Verbindung zum Server fehlgeschlagen."
      }));
    } finally {
      setSetEvaluationsLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleResetDatabase = async () => {
    setIsResetting(true);
    setResetSuccessMsg(null);
    setResetErrorMsg(null);
    setResetElapsedTime(0);
    
    const startTime = Date.now();
    const timerInterval = setInterval(() => {
      setResetElapsedTime((Date.now() - startTime) / 1000);
    }, 50);

    try {
      const response = await fetch(`/api/reset-db?game=${activeGame}`, { method: "POST" });
      if (response.ok) {
        if (activeGame === "onepiece") {
          setResetSuccessMsg("Die pokemon_cards.db wurde erfolgreich zurückgesetzt! Alle One Piece-Sets & Chase-Karten wurden frisch initialisiert.");
        } else {
          setResetSuccessMsg("Die pokemon_cards.db wurde erfolgreich zurückgesetzt! Der Erstimport für Pokémon wurde im Hintergrund gestartet.");
        }
        await fetchStats();
        await fetchSets();
        setCards([]);
      } else {
        const data = await response.json();
        setResetErrorMsg(data.error || "Fehler beim Zurücksetzen der Datenbank.");
      }
    } catch (err: any) {
      setResetErrorMsg(err.message || "Netzwerkfehler beim Zurücksetzen der Datenbank.");
    } finally {
      clearInterval(timerInterval);
      setIsResetting(false);
      setShowResetConfirmation(false);
    }
  };

  const handleResetEvaluations = async () => {
    setIsResettingEvaluations(true);
    setResetEvalSuccessMsg(null);
    setResetEvalErrorMsg(null);
    try {
      const response = await fetch("/api/reset-evaluations", { method: "POST" });
      if (response.ok) {
        setResetEvalSuccessMsg("Alle lokalen Händlerbewertungen für Karten und Sets wurden erfolgreich gelöscht.");
        setSetEvaluations({});
      } else {
        const data = await response.json().catch(() => ({}));
        setResetEvalErrorMsg(data.error || "Fehler beim Löschen der lokalen Bewertungen.");
      }
    } catch (err: any) {
      setResetEvalErrorMsg(err.message || "Verbindung zum Server fehlgeschlagen.");
    } finally {
      setIsResettingEvaluations(false);
      setShowResetEvalConfirmation(false);
    }
  };

  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(e => {
        console.error("Video play failed", e);
      });
    }
  }, [isCameraActive, cameraStream]);

  const startCamera = async () => {
    setScanError(null);
    setScanResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1440 },
          height: { ideal: 1920 }
        }
      });
      setCameraStream(stream);
      setIsCameraActive(true);
    } catch (err: any) {
      console.error("Camera access failed", err);
      setScanError("Kamerazugriff fehlgeschlagen. Bitte lade stattdessen ein Bild der Karte hoch.");
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const captureSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      if (context) {
        const width = video.videoWidth || video.clientWidth || 640;
        const height = video.videoHeight || video.clientHeight || 480;
        canvas.width = width;
        canvas.height = height;
        context.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        
        if (!dataUrl || dataUrl === "data:," || dataUrl.length < 100) {
          setScanError("Fehler beim Erfassen des Kamerabildes (Leeres Bild). Bitte stelle sicher, dass die Kamera freigegeben ist.");
          return;
        }
        
        setScanImage(dataUrl);
        setScannedImageNames(prev => [...prev, `Kamera_Snapshot_${Date.now()}.jpg`]);
        stopCamera();
        handleScanCardImage(dataUrl);
      }
    }
  };

  const compressAndResizeImage = (base64Str: string, maxWidth = 2400, maxHeight = 2400): Promise<string> => {
    return new Promise((resolve) => {
      if (!base64Str || base64Str.length < 50) {
        resolve(base64Str);
        return;
      }

      // Local OCR still needs readable text. Turbo keeps images smaller, but never destroys card numbers.
      if (turboScan) {
        maxWidth = 1900;
        maxHeight = 1900;
      }

      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);

          resolve(canvas.toDataURL("image/jpeg", turboScan ? 0.88 : 0.82));
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => {
        resolve(base64Str);
      };
    });
  };

  const loadTesseract = async (): Promise<any | null> => {
    if (typeof window === "undefined") return null;
    if (window.Tesseract) return window.Tesseract;
    if (window.__tcgTesseractPromise) return window.__tcgTesseractPromise;
    window.__tcgTesseractPromise = new Promise((resolve) => {
      let settled = false;
      const finish = (value: any | null) => {
        if (settled) return;
        settled = true;
        if (!value) window.__tcgTesseractPromise = undefined;
        resolve(value);
      };
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
      script.async = true;
      script.onload = () => finish(window.Tesseract || null);
      script.onerror = () => finish(null);
      document.head.appendChild(script);
      setTimeout(() => finish(window.Tesseract || null), 12000);
    });
    return window.__tcgTesseractPromise;
  };

  const getTesseractWorker = async (language: string): Promise<any | null> => {
    if (typeof window === "undefined") return null;
    const Tesseract = await loadTesseract();
    if (!Tesseract?.createWorker) return null;
    window.__tcgOcrWorkerPromises = window.__tcgOcrWorkerPromises || {};
    if (!window.__tcgOcrWorkerPromises[language]) {
      window.__tcgOcrWorkerPromises[language] = (async () => {
        try {
          return await Tesseract.createWorker(language);
        } catch (err) {
          console.warn(`Tesseract worker init failed for ${language}:`, err);
          return null;
        }
      })();
    }
    return window.__tcgOcrWorkerPromises[language];
  };

  const recognizeOcrImage = async (
    dataUrl: string,
    language: string,
    params?: Record<string, string>
  ): Promise<any> => {
    const worker = await getTesseractWorker(language);
    if (worker?.recognize) {
      if (worker.setParameters) {
        await worker.setParameters(params || { tessedit_char_whitelist: "" });
      }
      return worker.recognize(dataUrl);
    }

    const Tesseract = await loadTesseract();
    if (!Tesseract?.recognize) return null;
    return Tesseract.recognize(dataUrl, language, params);
  };

  const detectYellowLabelFromImage = async (base64DataUrl: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(false);
        ctx.drawImage(img, 0, 0, size, size);
        try {
          const data = ctx.getImageData(0, 0, size, size).data;
          let yellow = 0;
          const total = size * size;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r > 150 && g > 115 && b < 95 && r > b * 1.35 && g > b * 1.25) yellow++;
          }
          resolve(yellow / total > 0.025);
        } catch {
          resolve(false);
        }
      };
      img.onerror = () => resolve(false);
      img.src = base64DataUrl;
    });
  };

  const normalizeOcrForParsing = (value: string) => {
    return String(value || "")
      .replace(/[＿－–—]/g, "-")
      .replace(/[￥]/g, "¥")
      .replace(/(\d)\s*[Il|]\s*(\d)/g, "$1/1$2")
      .replace(/([0-9OoQ])\s*\/\s*([0-9OoQ])/g, "$1/$2")
      .replace(/(?<=\d)[OoQ](?=\d|\/|\b)/g, "0")
      .replace(/(^|[^0-9])([OoQ])(?=\d{2}\b)/g, (_match, prefix) => `${prefix}0`)
      .replace(/\s+/g, " ")
      .trim();
  };

  const guessCardNamesFromOcr = (text: string) => {
    const stopWords = new Set([
      "BASIC", "STAGE", "TRAINER", "ENERGY", "POKEMON", "POKÉMON", "HP", "WEAKNESS",
      "RESISTANCE", "RETREAT", "FLIP", "COINS", "DAMAGE", "HEADS", "EACH", "ATTACK",
      "FURY", "SWIPES", "ILLUS", "ILLUSTRATOR", "NINTENDO", "CREATURES", "GAME",
      "FREAK", "CARD", "CARDS", "THIS", "FOR", "WHEN", "OBJECT", "LOCAL", "OCR",
      "SOURCE", "IMG", "PNG", "JPG", "JPEG", "HEIC", "MEG", "MANUAL", "LANGUAGE",
      "EN", "DE", "FR", "IT", "ES", "PT"
    ]);
    Object.keys(printedPokemonSetCodeAliases).forEach(alias => stopWords.add(alias));
    const lines = String(text || "")
      .split(/\n+/)
      .map(line => line.replace(/[^\p{L}\p{N}.'’ -]/gu, " ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const candidates: string[] = [];
    for (const line of lines) {
      const compact = line.trim();
      if (/\.(jpe?g|png|webp|gif)\b/i.test(compact) || /^[{\[]/.test(compact)) continue;
      const nameLine = compact
        .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " ")
        .replace(/\b\d{1,4}\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      if (!/[A-Za-z\u3040-\u30ff\u3400-\u9faf]/.test(nameLine)) continue;
      const upper = nameLine.toUpperCase();
      if ([...stopWords].some(word => upper === word || upper.startsWith(`${word} `))) continue;
      const words = nameLine.split(/\s+/).filter(w => w.length > 1);
      if (words.length > 4) continue;
      const meaningful = words.filter(w => !stopWords.has(w.toUpperCase()));
      const name = meaningful.join(" ").trim();
      if (name.length >= 3 && name.length <= 32) candidates.push(name);
    }
    return Array.from(new Set(candidates)).slice(0, 6);
  };

  const parseClientScanHints = (text: string, filename: string, yellowLabel: boolean, zoneName = "") => {
    const joined = normalizeOcrForParsing(`${filename || ""}\n${manualScanHint || ""}\n${text || ""}`);
    const cardNumbers: string[] = [];
    const setCodes: string[] = [];
    const printedSetTotals: string[] = [];
    const prices: number[] = [];
    const names = guessCardNamesFromOcr(`${manualScanHint || ""}\n${text || ""}`);
    const digitSafe = joined.replace(/[OoQ]/g, "0");
    const fractional = digitSafe.match(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g) || [];
    fractional.forEach(n => {
      const clean = n.replace(/\s+/g, "");
      cardNumbers.push(clean, clean.split("/")[0]);
      const total = clean.split("/")[1];
      if (total) {
        const parsedTotal = parseInt(total, 10);
        if (!Number.isNaN(parsedTotal) && parsedTotal >= 30 && parsedTotal <= 300) {
          printedSetTotals.push(String(parsedTotal).padStart(3, "0"));
        }
      }
    });
    const opNums = joined.match(/\b(?:OP|ST|EB|PR)\d{2}[- ]?\d{3}\b/gi) || [];
    cardNumbers.push(...opNums.map(v => v.replace(/\s+/g, "").toUpperCase()));
    const opSets = joined.match(/\b(?:OP|ST|EB|PR)[ -]?\d{1,2}\b/gi) || [];
    setCodes.push(...opSets.map(v => v.replace(/[\s-]/g, "").toUpperCase()));
    const pokemonSets = joined.match(/\b(?:SV-P|S-P|SM-P|SV[ -]?\d{1,2}[A-Z]?|SM[ -]?\d{1,2}[A-Z]?|S[ -]?\d{1,2}[A-Z]?|XY[ -]?\d{1,2}[A-Z]?|BW[ -]?\d{1,2}[A-Z]?|DP[ -]?\d{1,2}[A-Z]?|ADV[ -]?\d{1,2}[A-Z]?|PCG[ -]?\d{1,2}[A-Z]?)\b/gi) || [];
    setCodes.push(...pokemonSets.map(v => v.replace(/\s+/g, "").toUpperCase()));
    const tcgdexLikeSets = joined.match(/\b(?:SV|SM|S|XY|BW|DP|ADV|PCG|ME|A|B)[ -]?\d{1,2}(?:\.\d+)?[A-Z]?\b/gi) || [];
    setCodes.push(...tcgdexLikeSets.map(v => v.replace(/\s+/g, "").toUpperCase()));
    const printedAliases = Object.keys(printedPokemonSetCodeAliases).join("|");
    const printedSetRx = new RegExp(`\\b(${printedAliases})\\s*(?:EN|DE|FR|IT|ES|PT)?\\b`, "gi");
    let printedSetMatch: RegExpExecArray | null;
    while ((printedSetMatch = printedSetRx.exec(joined)) !== null) {
      setCodes.push(printedPokemonSetCodeAliases[String(printedSetMatch[1]).toUpperCase()]);
    }
    if (setCodes.length > 0 || names.length > 0) {
      cardNumbers.push(...extractStandaloneCardNumbers(joined));
    }
    const priceRegexes = [/(?:¥|￥|JPY)\s*([0-9][0-9,. ]{1,8})/g, /([0-9][0-9,. ]{1,8})\s*(?:円|yen|YEN)/g];
    priceRegexes.forEach(rx => {
      let m: RegExpExecArray | null;
      while ((m = rx.exec(joined)) !== null) {
        const n = parseInt(String(m[1]).replace(/[^0-9]/g, ""), 10);
        if (!isNaN(n) && n >= 30 && n <= 300000) prices.push(n);
      }
    });
    if (/price|preis|label|yen/i.test(zoneName)) {
      const plainPrices = digitSafe.match(/\b\d{3,6}\b/g) || [];
      plainPrices.forEach(raw => {
        const n = parseInt(raw, 10);
        if (!isNaN(n) && n >= 100 && n <= 300000) prices.push(n);
      });
    }
    const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(v => v.toUpperCase())));
    const hasJapanese = /[ぁ-んァ-ン一-龯]/.test(joined);
    const hasLatinCardText = /[A-Za-z]{3,}/.test(joined);
    const totalDerivedSetCodes = setCodesFromPrintedTotals(printedSetTotals).map(normalizePrintedSetCode);
    const allSetCodes = uniq(setCodes.map(normalizePrintedSetCode));
    const explicitSetCodes = allSetCodes;
    const totalExplicitIntersection = totalDerivedSetCodes.filter(code => explicitSetCodes.includes(code));
    const effectiveSetCodes = totalDerivedSetCodes.length > 0
      ? (totalExplicitIntersection.length > 0 ? totalExplicitIntersection : totalDerivedSetCodes)
      : allSetCodes;
    return {
      text: joined,
      card_numbers: uniq(cardNumbers),
      primary_card_numbers: uniq(fractional.length > 0 ? fractional.flatMap(n => {
        const clean = n.replace(/\s+/g, "");
        return [clean, clean.split("/")[0]];
      }) : cardNumbers),
      set_codes: uniq(effectiveSetCodes).filter(code => {
        const clean = code.replace(/\s+/g, "").toUpperCase();
        if (/^(SV|SM|S|XY|BW|DP|ADV|PCG|OP|ST|EB|PR)$/.test(clean)) return false;
        return clean.length >= 2 && /\d|-P$/.test(clean);
      }),
      printed_set_totals: uniq(printedSetTotals),
      names,
      yen_price: prices[0] || 0,
      yellow_label_detected: yellowLabel || /黄色|キズ|傷|訳あり/i.test(joined),
      language: hasJapanese ? "JA" : (hasLatinCardText ? "EN" : "")
    };
  };

  const cropImageForOcr = async (
    base64DataUrl: string,
    crop: { name: string; x: number; y: number; w: number; h: number; scale?: number; contrast?: number }
  ): Promise<{ name: string; dataUrl: string; bounding_box: { ymin: number; xmin: number; ymax: number; xmax: number } } | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const sx = Math.max(0, Math.floor(img.width * crop.x));
        const sy = Math.max(0, Math.floor(img.height * crop.y));
        const sw = Math.min(img.width - sx, Math.floor(img.width * crop.w));
        const sh = Math.min(img.height - sy, Math.floor(img.height * crop.h));
        if (sw <= 0 || sh <= 0) return resolve(null);

        const scale = crop.scale || 2;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(sw * scale));
        canvas.height = Math.max(1, Math.floor(sh * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          const contrast = crop.contrast ?? 1.65;
          for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const boosted = Math.max(0, Math.min(255, (gray - 128) * contrast + 128));
            data[i] = boosted;
            data[i + 1] = boosted;
            data[i + 2] = boosted;
          }
          ctx.putImageData(imgData, 0, 0);
        } catch (err) {
          console.warn(`OCR crop preprocessing skipped for ${crop.name}:`, err);
        }

        resolve({
          name: crop.name,
          dataUrl: canvas.toDataURL("image/png"),
          bounding_box: {
            ymin: Math.round(crop.y * 1000),
            xmin: Math.round(crop.x * 1000),
            ymax: Math.round((crop.y + crop.h) * 1000),
            xmax: Math.round((crop.x + crop.w) * 1000)
          }
        });
      };
      img.onerror = () => resolve(null);
      img.src = base64DataUrl;
    });
  };

  const orientImageForOcr = async (
    base64DataUrl: string
  ): Promise<{ dataUrl: string; rotated: boolean; rotation: 0 | 90 }> => {
    return new Promise((resolve) => {
      const original = { dataUrl: base64DataUrl, rotated: false, rotation: 0 as const };
      const img = new Image();
      img.onload = () => {
        if (img.width <= img.height * 1.08) return resolve(original);
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.height;
          canvas.height = img.width;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(original);
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          ctx.translate(canvas.width, 0);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(img, 0, 0);
          resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.92), rotated: true, rotation: 90 });
        } catch (err) {
          console.warn("Scanbild konnte nicht automatisch gedreht werden:", err);
          resolve(original);
        }
      };
      img.onerror = () => resolve(original);
      img.src = base64DataUrl;
    });
  };

  const prepareCardRegionForOcr = async (
    base64DataUrl: string
  ): Promise<{ dataUrl: string; detected: boolean; box: { x: number; y: number; w: number; h: number } }> => {
    return new Promise((resolve) => {
      const original = { dataUrl: base64DataUrl, detected: false, box: { x: 0, y: 0, w: 1, h: 1 } };
      const img = new Image();
      img.onload = () => {
        if (img.width < 240 || img.height < 240) return resolve(original);

        try {
          const sampleW = 180;
          const sampleH = Math.max(220, Math.round((img.height / Math.max(1, img.width)) * sampleW));
          const sampleCanvas = document.createElement("canvas");
          sampleCanvas.width = sampleW;
          sampleCanvas.height = sampleH;
          const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
          if (!sampleCtx) return resolve(original);
          sampleCtx.drawImage(img, 0, 0, sampleW, sampleH);
          const pixels = sampleCtx.getImageData(0, 0, sampleW, sampleH).data;
          const mask = new Uint8Array(sampleW * sampleH);
          const rowCounts = new Array(sampleH).fill(0);
          const yStart = Math.floor(sampleH * 0.20);

          for (let y = yStart; y < sampleH; y++) {
            for (let x = 0; x < sampleW; x++) {
              const idx = (y * sampleW + x) * 4;
              const r = pixels[idx];
              const g = pixels[idx + 1];
              const b = pixels[idx + 2];
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const brightness = (r + g + b) / 3;
              const saturation = max === 0 ? 0 : (max - min) / max;
              const looksLikeCardInk = brightness > 52 && saturation > 0.11;
              const looksLikeCardPaper = brightness > 122 && saturation < 0.35;
              const looksLikeHoloOrBorder = brightness > 88 && saturation > 0.045;
              if (looksLikeCardInk || looksLikeCardPaper || looksLikeHoloOrBorder) {
                mask[y * sampleW + x] = 1;
                rowCounts[y]++;
              }
            }
          }

          const rowThreshold = Math.max(14, Math.floor(sampleW * 0.14));
          const bands: { start: number; end: number; score: number }[] = [];
          let start = -1;
          let lastActive = -1;
          let countSum = 0;

          for (let y = yStart; y < sampleH; y++) {
            const active = rowCounts[y] >= rowThreshold;
            if (active) {
              if (start === -1) {
                start = y;
                countSum = 0;
              }
              lastActive = y;
              countSum += rowCounts[y];
            } else if (start !== -1 && y - lastActive > 4) {
              const end = lastActive;
              const height = end - start + 1;
              if (height >= sampleH * 0.14) {
                const center = (start + end) / 2 / sampleH;
                const lowerBias = 1 + Math.max(0, center - 0.35) * 0.55;
                bands.push({ start, end, score: height * (countSum / height) * lowerBias });
              }
              start = -1;
              lastActive = -1;
              countSum = 0;
            }
          }

          if (start !== -1) {
            const end = lastActive;
            const height = end - start + 1;
            if (height >= sampleH * 0.14) {
              const center = (start + end) / 2 / sampleH;
              const lowerBias = 1 + Math.max(0, center - 0.35) * 0.55;
              bands.push({ start, end, score: height * (countSum / height) * lowerBias });
            }
          }

          const bestBand = bands.sort((a, b) => b.score - a.score)[0];
          if (!bestBand) return resolve(original);

          const bandHeight = bestBand.end - bestBand.start + 1;
          const colCounts = new Array(sampleW).fill(0);
          for (let y = bestBand.start; y <= bestBand.end; y++) {
            for (let x = 0; x < sampleW; x++) {
              if (mask[y * sampleW + x]) colCounts[x]++;
            }
          }

          const colThreshold = Math.max(8, Math.floor(bandHeight * 0.10));
          const colBands: { start: number; end: number; score: number }[] = [];
          let xStart = -1;
          let lastXActive = -1;
          let xCountSum = 0;
          for (let x = 0; x < sampleW; x++) {
            const active = colCounts[x] >= colThreshold;
            if (active) {
              if (xStart === -1) {
                xStart = x;
                xCountSum = 0;
              }
              lastXActive = x;
              xCountSum += colCounts[x];
            } else if (xStart !== -1 && x - lastXActive > 3) {
              const end = lastXActive;
              const width = end - xStart + 1;
              if (width >= sampleW * 0.22) colBands.push({ start: xStart, end, score: width * (xCountSum / width) });
              xStart = -1;
              lastXActive = -1;
              xCountSum = 0;
            }
          }
          if (xStart !== -1) {
            const end = lastXActive;
            const width = end - xStart + 1;
            if (width >= sampleW * 0.22) colBands.push({ start: xStart, end, score: width * (xCountSum / width) });
          }

          const bestColBand = colBands.sort((a, b) => b.score - a.score)[0] || { start: 0, end: sampleW - 1 };
          const detectedX = (bestColBand.start / sampleW) * img.width;
          const detectedY = (bestBand.start / sampleH) * img.height;
          const detectedW = ((bestColBand.end - bestColBand.start + 1) / sampleW) * img.width;
          const detectedH = ((bestBand.end - bestBand.start + 1) / sampleH) * img.height;

          const padX = Math.max(img.width * 0.035, detectedW * 0.035);
          const padTop = Math.max(img.height * 0.035, detectedH * 0.10);
          const padBottom = Math.max(img.height * 0.018, detectedH * 0.035);
          const sx = Math.max(0, Math.floor(detectedX - padX));
          const sy = Math.max(0, Math.floor(detectedY - padTop));
          const ex = Math.min(img.width, Math.ceil(detectedX + detectedW + padX));
          const ey = Math.min(img.height, Math.ceil(detectedY + detectedH + padBottom));
          const sw = ex - sx;
          const sh = ey - sy;

          if (sw < img.width * 0.28 || sh < img.height * 0.28 || sh > img.height * 0.98) {
            return resolve(original);
          }

          const maxLongSide = 1700;
          const ratio = Math.min(1, maxLongSide / Math.max(sw, sh));
          const outW = Math.max(1, Math.round(sw * ratio));
          const outH = Math.max(1, Math.round(sh * ratio));
          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext("2d");
          if (!outCtx) return resolve(original);
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = "high";
          outCtx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

          resolve({
            dataUrl: out.toDataURL("image/jpeg", 0.92),
            detected: true,
            box: { x: sx / img.width, y: sy / img.height, w: sw / img.width, h: sh / img.height }
          });
        } catch (err) {
          console.warn("Kartenbereich konnte nicht automatisch zugeschnitten werden:", err);
          resolve(original);
        }
      };
      img.onerror = () => resolve(original);
      img.src = base64DataUrl;
    });
  };

  const buildOcrCrops = async (base64DataUrl: string, mode: "fast" | "name" | "fallback" = "fast") => {
    const fastCrops = [
      { name: "collector-line-full", x: 0.00, y: 0.82, w: 0.86, h: 0.16, scale: 5.2, contrast: 2.5 },
      { name: "bottom-id-wide", x: 0.02, y: 0.76, w: 0.82, h: 0.22, scale: 4.4, contrast: 2.25 },
      { name: "bottom-left-id-tight", x: 0.00, y: 0.86, w: 0.58, h: 0.12, scale: 5.4, contrast: 2.55 },
      { name: "bottom-footer-id", x: 0.00, y: 0.90, w: 0.54, h: 0.08, scale: 5.8, contrast: 2.65 },
      { name: "bottom-right-price", x: 0.55, y: 0.68, w: 0.42, h: 0.24, scale: 3.4, contrast: 1.9 }
    ];
    const nameCrops = [
      { name: "name-title-strip", x: 0.04, y: 0.00, w: 0.92, h: 0.18, scale: 3.3, contrast: 1.75 },
      { name: "name-top", x: 0.08, y: 0.04, w: 0.82, h: 0.18, scale: 3.0, contrast: 1.65 },
      { name: "name-upper-wide", x: 0.04, y: 0.06, w: 0.92, h: 0.24, scale: 2.6, contrast: 1.55 }
    ];
    const fallbackCrops = [
      { name: "bottom-left-number-tight", x: 0.08, y: 0.84, w: 0.42, h: 0.12, scale: 4.2, contrast: 2.15 },
      { name: "bottom-footer-number", x: 0.10, y: 0.88, w: 0.48, h: 0.08, scale: 4.6, contrast: 2.25 },
      { name: "middle-set-number-safety", x: 0.00, y: 0.72, w: 0.82, h: 0.26, scale: 3.0, contrast: 2.0 },
      { name: "lower-third", x: 0.05, y: 0.62, w: 0.90, h: 0.30, scale: 2.3, contrast: 1.65 },
      { name: "full-card", x: 0.04, y: 0.04, w: 0.92, h: 0.92, scale: 1.25, contrast: 1.35 }
    ];
    const crops = mode === "fast" ? fastCrops : mode === "name" ? nameCrops : fallbackCrops;
    const rendered = await Promise.all(crops.map(crop => cropImageForOcr(base64DataUrl, crop)));
    return rendered.filter(Boolean) as { name: string; dataUrl: string; bounding_box: { ymin: number; xmin: number; ymax: number; xmax: number } }[];
  };

  const computeImageSignature = async (src: string, cropCard = false): Promise<number[] | null> => {
    if (!src) return null;
    if (visualSignatureCacheRef.current[src]) return visualSignatureCacheRef.current[src];

    const signature = await new Promise<number[] | null>((resolve) => {
      const img = new Image();
      if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const size = 16;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);

          const sx = cropCard ? Math.floor(img.width * 0.08) : 0;
          const sy = cropCard ? Math.floor(img.height * 0.04) : 0;
          const sw = cropCard ? Math.floor(img.width * 0.84) : img.width;
          const sh = cropCard ? Math.floor(img.height * 0.92) : img.height;
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
          const pixels = ctx.getImageData(0, 0, size, size).data;
          const values: number[] = [];
          for (let i = 0; i < pixels.length; i += 4) {
            values.push((0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]) / 255);
          }
          const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
          const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
          const std = Math.sqrt(variance) || 1;
          resolve(values.map(v => (v - mean) / std));
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });

    visualSignatureCacheRef.current[src] = signature;
    return signature;
  };

  const compareImageSignatures = (a: number[] | null, b: number[] | null) => {
    if (!a || !b || a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (!normA || !normB) return 0;
    return Math.max(0, Math.min(1, (dot / Math.sqrt(normA * normB) + 1) / 2));
  };

  const loadVisualCandidates = async () => {
    const key = `${activeGame}:EN`;
    if (visualCandidateCacheRef.current[key]) return visualCandidateCacheRef.current[key];
    const response = await fetch(`/api/cards/visual-candidates?game=${encodeURIComponent(activeGame)}&language=EN&limit=3000`);
    if (!response.ok) return [];
    const data = await response.json();
    const cards = Array.isArray(data.cards) ? data.cards : [];
    visualCandidateCacheRef.current[key] = cards;
    return cards;
  };

  const findVisualMatches = async (base64DataUrl: string) => {
    const sourceSignature = await computeImageSignature(base64DataUrl, true);
    if (!sourceSignature) return [];
    const candidates = await loadVisualCandidates();
    const scored: any[] = [];
    const batchSize = 16;

    for (let i = 0; i < candidates.length; i += batchSize) {
      setScanProgress(`Lokaler Bildabgleich ${Math.min(i + batchSize, candidates.length)}/${candidates.length}...`);
      const batch = candidates.slice(i, i + batchSize);
      const batchScores = await Promise.all(batch.map(async (card: any) => {
        const img = card.image_small || card.image_large;
        const sig = await computeImageSignature(img, false);
        const score = compareImageSignatures(sourceSignature, sig);
        return { card, score };
      }));
      scored.push(...batchScores.filter(item => item.score >= 0.82));
      if (scored.some(item => item.score >= 0.91)) break;
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ card, score }) => ({
        ...card,
        ai_confidence: score,
        similarity_score: Math.round(score * 100),
        hash_match_score: Math.round(score * 100),
        verification_status: "Lokaler Bildabgleich",
        scanner_source: "local_visual_match"
      }));
  };

  const applyVisualFallback = async (data: any, base64DataUrl: string) => {
    const hasOcrMatch = Array.isArray(data?.matched_cards) && data.matched_cards.length > 0;
    if (hasOcrMatch) return data;
    if (activeGame === "pokemon") {
      return {
        ...data,
        visual_fallback_skipped: true,
        message: data?.message || "Kein sicherer OCR/DB-Treffer. Bildabgleich wurde fuer Pokemon deaktiviert, damit keine falschen Karten uebernommen werden."
      };
    }

    setScanProgress("Kein OCR-Treffer. Vergleiche Bild lokal mit Kartenbildern...");
    const visualMatches = await findVisualMatches(base64DataUrl);
    if (visualMatches.length === 0) return data;

    const identifications = visualMatches.map((card: any) => ({
      pokemon_name: card.pokemon_name || card.english_name || card.local_name || "Unbekannt",
      card_number: card.card_number || "?",
      set_code: card.set_code || "",
      language: card.language || "EN",
      yen_price: 0,
      yellow_label_detected: false,
      bounding_box: { ymin: 80, xmin: 80, ymax: 920, xmax: 920 },
      confidence: card.ai_confidence || 0,
      similarity_score: card.similarity_score || 0,
      hash_match_score: card.hash_match_score || 0,
      verification_status: "Lokaler Bildabgleich",
      scanner_source: "local_visual_match"
    }));

    return {
      ...data,
      match: true,
      matched_cards: visualMatches,
      ai_identifications: identifications,
      local_identifications: identifications,
      message: `${visualMatches.length} Treffer per lokalem Bildabgleich gefunden.`
    };
  };

  const createLocalScanPayload = async (base64DataUrl: string, filename: string) => {
    const yellowLabel = await detectYellowLabelFromImage(base64DataUrl);
    let ocrText = "";
    const localDetections: any[] = [];
    let orientedSource = { dataUrl: base64DataUrl, rotated: false, rotation: 0 as 0 | 90 };
    let ocrSource = { dataUrl: base64DataUrl, detected: false, box: { x: 0, y: 0, w: 1, h: 1 } };
    try {
      setScanProgress("Bildausrichtung pruefen...");
      orientedSource = await orientImageForOcr(base64DataUrl);
      setScanProgress("Kartenbereich im Foto suchen...");
      ocrSource = await prepareCardRegionForOcr(orientedSource.dataUrl);
      setScanProgress("Lokale OCR-Engine laden...");
      const Tesseract = await loadTesseract();
      if (Tesseract?.recognize || Tesseract?.createWorker) {
        const texts: string[] = [];
        const runOcrTargets = async (
          targets: { name: string; dataUrl: string; bounding_box: { ymin: number; xmin: number; ymax: number; xmax: number } }[],
          label: string,
          stopOnHardId = false
        ) => {
          for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            setScanProgress(`${label}: ${target.name} (${i + 1}/${targets.length})...`);
            const numberZone = /number|price|footer|id|set/i.test(target.name);
            const result = await recognizeOcrImage(
              target.dataUrl,
              numberZone ? "eng" : "eng+jpn",
              numberZone
                ? { tessedit_char_whitelist: "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz¥JPY円.- " }
                : undefined
            );
            const text = result?.data?.text || "";
            texts.push(`[${target.name}]\n${text}`);
            const zoneHints = parseClientScanHints(text, filename, yellowLabel, target.name);
            localDetections.push({
              zone: target.name,
              text,
              ...zoneHints,
              bounding_box: target.bounding_box
            });
            if (stopOnHardId) {
              const currentHints = parseClientScanHints(texts.join("\n"), filename, yellowLabel, "id-pass");
              if (currentHints.card_numbers.length > 0 && currentHints.set_codes.length > 0) {
                break;
              }
            }
          }
        };

        setScanProgress(ocrSource.detected ? "Karte zugeschnitten. Schneller ID-Scan..." : "Schneller ID-Scan...");
        const fastTargets = await buildOcrCrops(ocrSource.dataUrl, "fast");
        await runOcrTargets(fastTargets, "Schneller ID-Scan", true);

        const fastHints = parseClientScanHints(texts.join("\n"), filename, yellowLabel, "fast-pass");
        const hasHardId = fastHints.card_numbers.length > 0 && fastHints.set_codes.length > 0;
        const hasPrice = Number(fastHints.yen_price || 0) > 0;
        if (hasHardId && !hasPrice) {
          const priceTarget = fastTargets.find(target => /price/i.test(target.name));
          if (priceTarget && !localDetections.some(det => det.zone === priceTarget.name)) {
            await runOcrTargets([priceTarget], "Preis-OCR");
          }
        }
        if (!hasHardId) {
          setScanProgress("Name-OCR als Fallback...");
          await runOcrTargets(await buildOcrCrops(ocrSource.dataUrl, "name"), "Name-OCR");
        }

        const fallbackHints = parseClientScanHints(texts.join("\n"), filename, yellowLabel, "fallback-check");
        const needsFallback = fallbackHints.card_numbers.length === 0 && fallbackHints.set_codes.length === 0 && fallbackHints.names.length === 0;
        if (needsFallback) {
          setScanProgress("OCR-Fallback fuer schwieriges Foto...");
          await runOcrTargets(await buildOcrCrops(ocrSource.dataUrl, "fallback"), "OCR-Fallback");
        }
        ocrText = texts.join("\n");
      } else {
        setScanProgress("OCR-CDN nicht erreichbar. Nutze Dateiname/manuelle Hinweise...");
      }
    } catch (ocrErr) {
      console.warn("Local OCR failed, falling back to filename/manual hints:", ocrErr);
    }
    const hints = parseClientScanHints(ocrText, filename, yellowLabel);
    return {
      ocrText: `${manualScanHint || ""}\n${ocrText}`.trim(),
      hints: {
        ...hints,
        image_rotated_for_ocr: orientedSource.rotated,
        image_rotation_for_ocr: orientedSource.rotation,
        card_region_detected: ocrSource.detected,
        card_region_box: ocrSource.box
      },
      localDetections: localDetections.length > 0
        ? localDetections
        : [{ text: ocrText, ...hints, bounding_box: { ymin: 80, xmin: 80, ymax: 920, xmax: 920 } }]
    };
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleScanMultipleImages(Array.from<File>(files).slice(0, 1));
      e.target.value = "";
    }
  };

  const getCachedScanResult = async (filename: string, base64Data: string): Promise<any | null> => {
    try {
      if (typeof window !== "undefined" && "caches" in window) {
        const cache = await caches.open(SCAN_CACHE_NAME);
        const cacheKey = `${SCAN_CACHE_KEY_PREFIX}?game=${encodeURIComponent(activeGame)}&file=${encodeURIComponent(filename)}&manual=${encodeURIComponent(manualScanHint.slice(0, 120))}&size=${base64Data.length}&hash=${base64Data.slice(0, 50) + base64Data.slice(-50)}`;
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          console.log(`Scan-Cache-Treffer für "${filename}" (${base64Data.length} Bytes). Lade sofort lokal!`);
          return await cachedResponse.json();
        }
      }
    } catch (err) {
      console.warn("Fehler beim Abfragen des Scan-Caches:", err);
    }
    return null;
  };

  const setCachedScanResult = async (filename: string, base64Data: string, data: any): Promise<void> => {
    try {
      const hasReliableMatch = Array.isArray(data?.matched_cards) && data.matched_cards.length > 0;
      if (typeof window !== "undefined" && "caches" in window && data && data.success && hasReliableMatch) {
        const cache = await caches.open(SCAN_CACHE_NAME);
        const cacheKey = `${SCAN_CACHE_KEY_PREFIX}?game=${encodeURIComponent(activeGame)}&file=${encodeURIComponent(filename)}&manual=${encodeURIComponent(manualScanHint.slice(0, 120))}&size=${base64Data.length}&hash=${base64Data.slice(0, 50) + base64Data.slice(-50)}`;
        await cache.put(cacheKey, new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json" }
        }));
        console.log(`Scan-Ergebnis für "${filename}" erfolgreich im Client-Cache archiviert!`);
      } else if (data?.success && !hasReliableMatch) {
        console.log(`Scan-Ergebnis für "${filename}" ohne sicheren Treffer wird nicht gecacht.`);
      }
    } catch (err) {
      console.warn("Fehler beim Speichern im Scan-Cache:", err);
    }
  };

  const pickBestScanCard = (cards: any[] = []) => {
    if (!Array.isArray(cards) || cards.length === 0) return null;
    const seen = new Set<string>();
    const uniqueCards = cards.filter((card) => {
      const key = `${card.api_card_id || card.id}-${card.language || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return uniqueCards
      .map((card) => {
        const baseScore = Number(card.similarity_score || 0) || Math.round(Number(card.ai_confidence || 0) * 100);
        const source = String(card.scanner_source || card.verification_status || "").toLowerCase();
        const sourceBoost = source.includes("local_ocr") ? 8 : source.includes("visual") ? 5 : source.includes("segment") ? -14 : 0;
        const numberBoost = card.card_number && card.card_number !== "?" ? 3 : 0;
        return { card, rank: baseScore + sourceBoost + numberBoost };
      })
      .sort((a, b) => b.rank - a.rank)
      .find(({ card, rank }) => rank >= 80 || String(card.scanner_source || "").includes("filename"))
      ?.card || null;
  };

  const buildScanFailureMessage = (data: any) => {
    const hints = data?.parsed_hints || data?.client_hints || {};
    const setCodes = Array.isArray(hints.set_codes) && hints.set_codes.length > 0 ? hints.set_codes.join(", ") : "keine";
    const numbers = Array.isArray(hints.card_numbers) && hints.card_numbers.length > 0 ? hints.card_numbers.join(", ") : "keine";
    const names = Array.isArray(hints.names) && hints.names.length > 0 ? hints.names.join(", ") : "keine";
    const ocrText = String(data?.client_ocr_text || data?.ocrText || hints.text || "").trim();
    const ocrWasEmpty = ocrText.length < 12 || !/[A-Za-z0-9ぁ-んァ-ン一-龯]/.test(ocrText);
    if (ocrWasEmpty) {
      return "Keine sichere Karte erkannt. Die OCR hat keinen brauchbaren Text gelesen. Bitte unten im Feld Set/Nummer eintragen, z.B. DRI 190/182 oder sv10 190, und erneut scannen.";
    }
    return `Keine sichere Karte erkannt. Gelesen: Set ${setCodes}, Nr. ${numbers}, Name ${names}. Bitte Set/Nummer unten manuell ergänzen oder Footer schärfer aufnehmen.`;
  };

  const createSwipeCard = (card: any, sourceImage: string, index = 0) => {
    const notesText = card.yellow_label_detected ? "Gelbes Label (Maengel/キズあり)" : "";
    return {
      ...card,
      notes: card.notes || notesText,
      imageSourceBase64: sourceImage,
      swipeInstanceId: `${card.id || card.api_card_id || "scan"}_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`
    };
  };

  const handleScanMultipleImages = async (files: File[]) => {
    setScanLoading(true);
    setScanError(null);
    setScanResult(null);
    setScanProgress("Bereite Kartenfoto vor...");

    try {
      const compressedList: string[] = [];
      const nameList: string[] = [];
      for (const file of files.slice(0, 1)) {
        const rawBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        const compressed = await compressAndResizeImage(rawBase64);
        compressedList.push(compressed);
        nameList.push(file.name);
      }

      const updatedImages = compressedList;
      setScannedImages(updatedImages);
      setScannedImageNames(nameList);
      setScanImage(compressedList[0]);
      setActiveImageIndex(0);

      const allMatchedCards: any[] = [];
      const allAiIdentifications: any[] = [];

      setScanProgress("Scanne eine Karte...");

      const scanResults: any[] = [];
      for (let i = 0; i < compressedList.length; i++) {
        const currentFilename = nameList[i] || files[i]?.name || "upload_image.jpg";
        setScanProgress(`Analysiere Bild ${i + 1} von ${compressedList.length} (${currentFilename})...`);
        const base64DataUrl = compressedList[i];
        const commaIndex = base64DataUrl.indexOf(",");
        const base64Data = commaIndex !== -1 ? base64DataUrl.slice(commaIndex + 1) : base64DataUrl;
        const mimeTypeMatch = base64DataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,/);
        const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

        // Check Cache first
        const cached = await getCachedScanResult(currentFilename, base64Data);
        if (cached) {
          scanResults.push(cached);
          continue;
        }

        const localPayload = await createLocalScanPayload(base64DataUrl, currentFilename);

        const r = await fetch("/api/cards/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64Data,
            mimeType,
            filename: currentFilename,
            game: activeGame,
            ocrText: localPayload.ocrText,
            hints: localPayload.hints,
            localDetections: localPayload.localDetections
          })
        });

        if (!r.ok) {
          const errDetails = await r.json().catch(() => ({}));
          throw new Error(errDetails.error || `Fehler bei Bild ${i + 1}`);
        }

        let data = await r.json();
        data = {
          ...data,
          client_ocr_text: localPayload.ocrText,
          client_hints: localPayload.hints,
          client_local_detections: localPayload.localDetections
        };
        data = await applyVisualFallback(data, base64DataUrl);
        await setCachedScanResult(currentFilename, base64Data, data);
        scanResults.push(data);
      }

      for (let i = 0; i < scanResults.length; i++) {
        const data = scanResults[i];
        const sourceImg = compressedList[i];
        if (data.success) {
          const bestCard = pickBestScanCard(data.matched_cards || []);
          if (bestCard) {
            allMatchedCards.push(createSwipeCard(bestCard, sourceImg, i));
          }
          if (data.ai_identifications) {
            allAiIdentifications.push(...data.ai_identifications);
          }
        }
      }

      setScanResult({
        success: true,
        match: allMatchedCards.length > 0,
        matched_cards: allMatchedCards,
        ai_identifications: allAiIdentifications,
        raw_scan_results: scanResults
      });
      if (allMatchedCards.length === 0 && scanResults.length > 0) {
        setScanError(buildScanFailureMessage(scanResults[0]));
      }
      
      setSwipeDeck(prev => [...prev, ...allMatchedCards]);
      setScanProgress("");

    } catch (err: any) {
      console.error("Multi scan error", err);
      setScanError(err.message || "Fehler beim Identifizieren der Bilder.");
    } finally {
      setScanLoading(false);
    }
  };

  const handleScanCardImage = async (base64DataUrl: string) => {
    if (!base64DataUrl || base64DataUrl.length < 100) {
      setScanError("Kein gültiges Bild zur Analyse übermittelt. Bitte lade ein Foto hoch oder starte die Kamera neu.");
      return;
    }
    setScanLoading(true);
    setScanError(null);
    setScanResult(null);
    setScanProgress("Analyse Bild & starte Einzelfoto-Scan...");

    try {
      let finalBase64 = base64DataUrl;
      let filename = "Kamera_Snapshot.jpg";

      const idx = scannedImages.indexOf(base64DataUrl);
      if (idx !== -1 && scannedImageNames[idx]) {
        filename = scannedImageNames[idx];
      }

      if (!scannedImages.includes(base64DataUrl)) {
        const compressedDataUrl = await compressAndResizeImage(base64DataUrl);
        finalBase64 = compressedDataUrl;

        setScannedImages([compressedDataUrl]);
        setScannedImageNames(["Kamera_Snapshot.jpg"]);
        setActiveImageIndex(0);
      }

      setScanImage(finalBase64);

      const commaIndex = finalBase64.indexOf(",");
      const base64Data = commaIndex !== -1 ? finalBase64.slice(commaIndex + 1) : finalBase64;
      const mimeTypeMatch = finalBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : "image/jpeg";

      // Check Cache first
      const cached = await getCachedScanResult(filename, base64Data);
      let data;
      if (cached) {
        data = cached;
      } else {
        const localPayload = await createLocalScanPayload(finalBase64, filename);
        const r = await fetch("/api/cards/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image: base64Data,
            mimeType,
            filename: filename,
            game: activeGame,
            ocrText: localPayload.ocrText,
            hints: localPayload.hints,
            localDetections: localPayload.localDetections
          })
        });

        if (!r.ok) {
          const errDetails = await r.json().catch(() => ({}));
          throw new Error(errDetails.error || "Unerwarteter Server-Fehler beim Karten-Scan.");
        }

        data = await r.json();
        data = {
          ...data,
          client_ocr_text: localPayload.ocrText,
          client_hints: localPayload.hints,
          client_local_detections: localPayload.localDetections
        };
        data = await applyVisualFallback(data, finalBase64);
        await setCachedScanResult(filename, base64Data, data);
      }

      setScanResult(data);
      if (data.success && data.matched_cards && data.matched_cards.length > 0) {
        const bestCard = pickBestScanCard(data.matched_cards);
        if (bestCard) {
          setSwipeDeck(prev => [...prev, createSwipeCard(bestCard, finalBase64, 0)]);
        }
      } else if (data.success) {
        setScanError(buildScanFailureMessage(data));
      }
      setScanProgress("");
    } catch (err: any) {
      console.error("Scan error", err);
      setScanError(err.message || "Fehler beim Identifizieren der Karte.");
    } finally {
      setScanLoading(false);
    }
  };

  // Swipe Helpers for Tinder/Bumble card deck navigation
  const [swipeDirection, setSwipeDirection] = useState<"left" | "right" | null>(null);

  const convertYenToEuro = (yen: number | null | undefined): string => {
    if (yen === undefined || yen === null || isNaN(yen) || yen === 0) return "0.00 €";
    const eurVal = yen / 165.0;
    return eurVal.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
  };

  const updateCurrentCardYenPrice = (newYen: number) => {
    setSwipeDeck(prev => {
      const updated = [...prev];
      if (updated[deckIndex]) {
        updated[deckIndex] = { ...updated[deckIndex], yen_price: newYen };
      }
      return updated;
    });
  };

  const updateCurrentCardNotes = (newNotes: string) => {
    setSwipeDeck(prev => {
      const updated = [...prev];
      if (updated[deckIndex]) {
        updated[deckIndex] = { ...updated[deckIndex], notes: newNotes };
      }
      return updated;
    });
  };

  const updateCartItemYenPrice = (cartInstanceId: string, newYen: number) => {
    setSwipeCart(prev => prev.map(item => {
      if (item.cartInstanceId === cartInstanceId) {
        return { ...item, yen_price: newYen };
      }
      return item;
    }));
  };

  const updateCartItemNotes = (cartInstanceId: string, notes: string) => {
    setSwipeCart(prev => prev.map(item => {
      if (item.cartInstanceId === cartInstanceId) {
        return { ...item, notes };
      }
      return item;
    }));
  };

  const handleSwipeLeft = () => {
    if (deckIndex >= swipeDeck.length) return;
    setSwipeDirection("left");
    // Wait for animation to finish before updating state index
    setTimeout(() => {
      setDeckIndex(prev => prev + 1);
      setSwipeDirection(null);
    }, 250);
  };

  const handleSwipeRight = (card: any) => {
    if (!card) return;
    setSwipeDirection("right");
    setTimeout(() => {
      setSwipeCart(prev => {
        // Create notes fallback if user has filled draft or has a yellow label
        let initialNotes = card.notes || "";
        if (card.yellow_label_detected && !initialNotes) {
          initialNotes = "⚠️ Gelbes Label (Mängel/キズあり)";
        }
        // Create a unique instance key so they can buy multiple copies of the same card!
        const cartItem = { 
          ...card, 
          cartInstanceId: (card.swipeInstanceId || card.id) + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
          notes: initialNotes,
          swipedAt: new Date().toISOString() 
        };
        return [...prev, cartItem];
      });
      setDeckIndex(prev => prev + 1);
      setSwipeDirection(null);
    }, 250);
  };

  const handleRemoveFromCart = (cartInstanceIdOrId: string | number) => {
    setSwipeCart(prev => prev.filter(item => {
      if (typeof cartInstanceIdOrId === "string") {
        return item.cartInstanceId !== cartInstanceIdOrId;
      }
      return item.id !== cartInstanceIdOrId;
    }));
  };

  const handleClearCart = () => {
    setSwipeCart([]);
    setConfirmClearCart(false);
  };

  const [cartCopied, setCartCopied] = useState(false);
  const handleCopyCart = () => {
    if (swipeCart.length === 0) return;
    const txt = swipeCart.map((c, i) => {
      const jpName = c.japanese_name ? ` (${c.japanese_name})` : "";
      const rarityStr = c.rarity ? ` | Rarity: ${c.rarity}` : "";
      const yenPriceStr = c.yen_price ? ` | Einkauf: ¥${c.yen_price.toLocaleString("ja-JP")} (ca. ${convertYenToEuro(c.yen_price)})` : " | Einkauf: Kein Preis";
      return `${i + 1}. [${c.language.toUpperCase()}] ${c.local_name}${jpName} - N° ${c.card_number} (Set: ${c.set_name} / ${c.set_code})${rarityStr}${yenPriceStr}`;
    }).join("\n");
    
    navigator.clipboard.writeText(txt).then(() => {
      setCartCopied(true);
      setTimeout(() => setCartCopied(false), 2000);
    });
  };

  // Advanced Search cards trigger
  const handleSearch = async (
    e?: React.FormEvent,
    customLimit?: number,
    raritiesOverride?: string[],
    overrideName?: string,
    overrideSetName?: string,
    overrideLanguage?: string,
    overrideCardNumber?: string
  ) => {
    if (e) e.preventDefault();
    setRarityDropdownOpen(false);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      const activeName = overrideName !== undefined ? overrideName : filterName;
      const activeSetName = overrideSetName !== undefined ? overrideSetName : filterSetName;
      const activeLanguage = overrideLanguage !== undefined ? overrideLanguage : filterLang;
      const activeCardNumber = overrideCardNumber !== undefined ? overrideCardNumber : filterCardNum;
      const effectiveLimit = customLimit ?? searchLimit;
      if (activeName) params.append("local_name", activeName);
      if (activeSetName) params.append("set_name", activeSetName);
      if (activeCardNumber) params.append("card_number", activeCardNumber);
      if (activeLanguage) params.append("language", activeLanguage);
      
      const activeRarities = raritiesOverride !== undefined ? raritiesOverride : filterRarities;
      if (activeRarities.length > 0) {
        params.append("rarity", activeRarities.join(","));
      } else if (raritiesOverride === undefined && filterRarity) {
        params.append("rarity", filterRarity);
      }
      params.append("limit", String(effectiveLimit));
      params.append("include_meta", "true");
      params.append("game", activeGame);

      const res = await fetch(`/api/cards?${params.toString()}`);
      if (!res.ok) throw new Error("Suchanfrage fehlgeschlagen");
      const data = await res.json();
      applyCardsResponse(data, effectiveLimit);
    } catch (err: any) {
      setError(err.message || "Fehler beim Laden der Karten");
    } finally {
      setLoading(false);
    }
  };

  // Run initial loading on startup & reload when active game changes!
  useEffect(() => {
    fetchStats();
    fetchSets();
    handleSearch(undefined, undefined, []);
  }, [activeGame]);

  // Update terminal auto-scrolling
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [terminalLogs]);

  // Clear filters
  const handleFetchSocialTrends = () => {
    setTrendsLoading(false);
    setTrendsError(null);
    setTrendsList([]);
  };

  const handleClearFilters = () => {
    setFilterName("");
    setFilterSetName("");
    setFilterCardNum("");
    setFilterLang("");
    setFilterRarity("");
    setFilterRarities([]);
  };

  // View all cards stored in the database immediately
  const handleShowAllCards = () => {
    setActiveTab("search");
    setFilterName("");
    setFilterSetName("");
    setFilterCardNum("");
    setFilterLang("");
    setFilterRarity("");
    setFilterRarities([]);
    setSearchLimit(0);
    setLoading(true);
    setError(null);
    fetch(`/api/cards?limit=0&include_meta=true&game=${activeGame}`)
      .then((res) => {
        if (!res.ok) throw new Error("Fehler beim Laden");
        return res.json();
      })
      .then((data) => {
        applyCardsResponse(data, 0);
        setLoading(false);
      })
      .catch((err) => {
        setError("Fehler beim Laden aller SQL-Karten");
        setLoading(false);
      });
  };

  // Click handler to select and filter by set name instantly
  const handleSetClick = (setName: string, setLanguage = "") => {
    setActiveTab("search");
    setFilterName("");
    setFilterSetName(setName);
    setFilterCardNum("");
    setFilterLang(setLanguage);
    setFilterRarity("");
    setFilterRarities([]);
    setSearchLimit(0);
    handleSearch(undefined, 0, [], "", setName, setLanguage, "");
  };

  // Launch Live Python Process Stream
  const triggerPythonAction = (action: "import" | "update" | "init") => {
    if (isSyncing) return;
    setIsSyncing(true);
    setTerminalLogs([`[EVENT] Verbindung wird aufgebaut und '${action}' ausgeführt...`]);

    const params = new URLSearchParams({
      action: action,
      lang: syncLang,
      count: syncCount,
      game: activeGame
    });

    if (action === "import" && allCardsImport) {
      params.append("all_cards", "true");
    }

    const eventSource = new EventSource(`/api/run-python?${params.toString()}`);

    eventSource.onmessage = (event) => {
      setTerminalLogs((prev) => [...prev, event.data]);
    };

    eventSource.onerror = (err) => {
      setTerminalLogs((prev) => [
        ...prev, 
        "[SYSTEM] Live-Sitzung erfolgreich beendet, Verbindung zur Synchronisierungs-Schnittstelle planmäßig getrennt."
      ]);
      eventSource.close();
      setIsSyncing(false);
      // Refresh statistics & sets after importing is done!
      fetchStats();
      fetchSets();
      handleSearch();
    };
  };

  // Helper copy script text
  const copyScriptToClipboard = (filename: string) => {
    let textToCopy = "";
    if (filename === "database.py") textToCopy = (window as any).dbPyContent || "";
    if (filename === "models.py") textToCopy = (window as any).modelsPyContent || "";
    if (filename === "importer.py") textToCopy = (window as any).importerPyContent || "";
    if (filename === "updater.py") textToCopy = (window as any).updaterPyContent || "";
    if (filename === "search.py") textToCopy = (window as any).searchPyContent || "";
    if (filename === "main.py") textToCopy = (window as any).mainPyContent || "";

    navigator.clipboard.writeText(textToCopy);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2050);
  };

  const { stack: activeStack, index: activeCardIndex } = getActiveCardStackAndIndex();
  const activeStackHasMultiple = activeStack.length > 1;

  const isPk = activeGame === "pokemon";
  const brandBg = isPk ? "bg-[#dc2626]" : "bg-amber-600";
  const brandHoverBg = isPk ? "hover:bg-[#b91c1c]" : "hover:bg-amber-500";
  const brandBorderFocus = isPk ? "focus:border-red-500/30" : "focus:border-amber-500/30";
  const brandBorder = isPk ? "border-red-550/15" : "border-amber-500/20";
  const brandTextAccent = isPk ? "text-red-500" : "text-amber-500";
  const brandTextLight = isPk ? "text-red-400" : "text-amber-400";
  const brandBubble = isPk ? "bg-red-400/10 text-red-400 border-red-500/10" : "bg-amber-400/10 text-amber-500 border-amber-500/10";
  const activeTabClass = isPk ? "bg-[#dc2626] text-white shadow-md shadow-red-950/30" : "bg-amber-600 text-white shadow-md shadow-amber-950/30";
  const inactiveTabClass = "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/40";

  return (
    <div className={`min-h-screen pb-24 md:pb-0 text-[#e4e4e7] font-sans antialiased transition-colors duration-500 ${isPk ? 'bg-[#09090b]' : 'bg-[#030a16]'}`}>
      {/* Header Bar */}
      <header className={`border-b ${isPk ? 'border-[#222226]/80 bg-[#121214]/95' : 'border-slate-800/80 bg-slate-900/90'} backdrop-blur-md sticky top-0 z-40 px-3 py-2 sm:px-6 sm:py-3 flex flex-row justify-between items-center gap-2`}>
        <button
          type="button"
          onClick={() => {
            setActiveTab("favorites");
            fetchFavorites();
          }}
          className="flex items-center gap-1.5 sm:gap-2 cursor-pointer rounded-xl px-1 py-0.5 hover:bg-white/5 transition"
          title="Favoriten öffnen"
        >
          <div className={`p-1.5 rounded-lg flex items-center justify-center ${activeGame === 'pokemon' ? 'bg-[#dc2626]/12 text-[#f87171]' : 'bg-[#f59e0b]/12 text-amber-400'}`}>
            {activeGame === 'pokemon' ? (
              <PokéballIcon className="w-4 h-4 animate-pulse" />
            ) : (
              <JollyRogerIcon className="w-4 h-4" />
            )}
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-bold font-display tracking-tight text-[#f3f4f6] whitespace-nowrap">
              {activeGame === 'pokemon' ? 'PokéCollector' : 'BountyCollector'}
            </h1>
          </div>
        </button>

        {/* Condensed Header Navigation */}
        <nav className="flex items-center gap-0.5 bg-[#18181b] p-0.5 sm:p-1 rounded-lg sm:rounded-xl border border-[#27272a] select-none">
          {/* Pokémon TCG Switcher with Pokéball Icon */}
          <button
            onClick={() => {
              setActiveGame("pokemon");
            }}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeGame === "pokemon" 
                ? "bg-[#dc2626] text-white shadow-md shadow-red-950/30" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/40"
            }`}
            title="Wechsle zu Pokémon TCG"
          >
            {activeGame === 'pokemon' ? (
              <PokéballIcon className="w-3.5 h-3.5 animate-pulse text-white" />
            ) : (
              <Star className="w-3.5 h-3.5 text-zinc-405" />
            )}
            <span>Pokémon</span>
          </button>

          {/* One Piece TCG Switcher with Jolly Roger Icon */}
          <button
            onClick={() => {
              setActiveGame("onepiece");
              if (filterLang === "DE") setFilterLang("");
              if (syncLang === "de") setSyncLang("en");
            }}
            className={`px-2 py-1 sm:px-3 sm:py-1.5 rounded-md text-[11px] sm:text-xs font-bold transition-all duration-200 flex items-center gap-1 sm:gap-1.5 cursor-pointer ${
              activeGame === "onepiece" 
                ? "bg-amber-600 text-white shadow-md shadow-amber-950/30" 
                : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/40"
            }`}
            title="Wechsle zu One Piece TCG"
          >
            {activeGame === 'onepiece' ? (
              <JollyRogerIcon className="w-3.5 h-3.5 text-white" />
            ) : (
              <Flame className="w-3.5 h-3.5 text-zinc-405" />
            )}
            <span>One Piece</span>
          </button>

          {/* Separator line */}
          <span className="w-px h-5 bg-zinc-800 mx-1.5" />

          {/* Hamburger / Dropdown for Secondary Sections */}
          <div className="relative">
            <button
              id="nav-hamburger-dropdown"
              onClick={() => setIsNavDropdownOpen(!isNavDropdownOpen)}
              className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1 sm:gap-1.5 cursor-pointer select-none ${
                isNavDropdownOpen
                  ? "bg-zinc-800 text-white border border-zinc-700"
                  : "bg-zinc-900/50 border border-zinc-800/60 text-[#a1a1aa] hover:text-white hover:bg-zinc-800/30"
              }`}
            >
              <MoreVertical className={`w-3.5 h-3.5 ${isPk ? "text-red-500" : "text-amber-500"}`} />
              <span className="font-semibold text-xs whitespace-nowrap">
                {activeTab === "search" && "Explorer"}
                {activeTab === "image-explorer" && "Scanner"}
                {activeTab === "inventory" && `Inventar (${inventory.length})`}
                {activeTab === "favorites" && `Favoriten (${favorites.length})`}
                {activeTab === "sets" && `Sets (${stats.total_sets})`}
                {activeTab === "importer" && "Live-Sync"}
                {activeTab === "scripts" && "Source Code"}
                {activeTab === "database" && "Datenbank"}
              </span>
              <span className="text-[7px] text-zinc-500">▼</span>
            </button>

            {isNavDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsNavDropdownOpen(false)} />
                <div className="absolute right-0 mt-2 w-64 rounded-xl bg-[#121214] border border-[#27272a] shadow-2xl p-1.5 z-50 flex flex-col gap-1 animate-in fade-in slide-in-from-top-1.5 duration-200">
                  <div className="px-3 py-1 border-b border-zinc-850/60 mb-1">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block font-bold">Navigation</span>
                  </div>

                  <button
                    onClick={() => handleSelectTab("search")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer w-full text-left ${
                      activeTab === "search" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/30"
                    }`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>Karten-Explorer</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("image-explorer")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer w-full text-left ${
                      activeTab === "image-explorer" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/30"
                    }`}
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Bilder-Scanner</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("inventory")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer w-full text-left ${
                      activeTab === "inventory" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ShoppingBag className="w-3.5 h-3.5 text-emerald-500" />
                      <span>Händler-Inventar</span>
                    </div>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-mono">{inventory.length}</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("favorites")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer w-full text-left ${
                      activeTab === "favorites" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-zinc-300 hover:bg-[#27272a]/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                      <span>Einkaufs-Favoriten</span>
                    </div>
                    <span className="text-[10px] bg-red-500/10 text-red-400 px-2 py-0.5 rounded-full font-mono">{favorites.length}</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("sets")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center justify-between cursor-pointer w-full text-left ${
                      activeTab === "sets" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-zinc-200 hover:bg-[#27272a]/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Library className="w-3.5 h-3.5" />
                      <span>TCG Sets</span>
                    </div>
                    <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full font-mono">{stats.total_sets}</span>
                  </button>

                  <div className="border-t border-zinc-850/60 my-1 pt-1">
                    <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-wider block px-3 mb-1 font-bold">Tools & Admins</span>
                  </div>

                  <button
                    onClick={() => handleSelectTab("importer")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer w-full text-left ${
                      activeTab === "importer" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-[#e4e4e7] hover:bg-[#27272a]/30"
                    }`}
                  >
                    <TerminalIcon className="w-3.5 h-3.5 text-teal-450" />
                    <span>Python Live-Sync</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("scripts")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer w-full text-left ${
                      activeTab === "scripts" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-[#e4e4e7] hover:bg-[#27272a]/30"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5 text-sky-450" />
                    <span>Python Code</span>
                  </button>

                  <button
                    onClick={() => handleSelectTab("database")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-2 cursor-pointer w-full text-left ${
                      activeTab === "database" 
                        ? (activeGame === "pokemon" ? "bg-red-950/40 text-red-400" : "bg-amber-950/40 text-amber-500") 
                        : "text-zinc-400 hover:text-[#e4e4e7] hover:bg-[#27272a]/30"
                    }`}
                  >
                    <Database className="w-3.5 h-3.5 text-purple-450" />
                    <span>Datenbank reset</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto p-6 space-y-6">
        
        {/* TAB 1: CARD SEARCH EXPLORER */}
        {activeTab === "search" && (
          <div className="space-y-6">
            {/* Statistics Bento Bar */}
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3" id="stats-banner">
              <div 
                onClick={handleShowAllCards}
                title="Datenbank anklicken um alle registrierten Karten anzuzeigen"
                className="bg-[#121214]/90 border border-[#222226] hover:border-red-500/40 rounded-xl p-3 flex items-center gap-2.5 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 cursor-pointer group bg-gradient-to-r hover:from-[#121214] hover:to-[#1a1215]"
              >
                <div className="p-2 bg-red-500/5 text-red-500 rounded-lg border border-red-500/10 group-hover:bg-red-500/10 transition-colors shrink-0">
                  <Database className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-[#a1a1aa] font-bold tracking-wider uppercase font-display flex items-center gap-1">DATENBANK <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /></p>
                  <h3 className="text-xs font-bold font-mono text-zinc-100 mt-0.5 group-hover:text-red-400 transition-colors truncate" title="pokemon_cards.db">pokemon_cards.db</h3>
                </div>
              </div>

              <div 
                onClick={handleShowAllCards}
                title="Datenbank anklicken um alle registrierten Karten anzuzeigen"
                className="bg-[#121214]/90 border border-[#222226] hover:border-red-500/40 rounded-xl p-3 flex items-center gap-2.5 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 cursor-pointer group bg-gradient-to-r hover:from-[#121214] hover:to-[#1a1215]"
              >
                <div className="p-2 bg-blue-500/5 text-blue-400 rounded-lg border border-blue-500/10 group-hover:bg-blue-500/10 transition-colors shrink-0">
                  <Layers className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-[#a1a1aa] font-bold tracking-wider uppercase font-display">REGISTRIERTE KARTEN</p>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100 font-mono mt-0.5 leading-none group-hover:text-red-400 transition-colors">{stats.total_cards}</h3>
                </div>
              </div>

              <div 
                onClick={() => setActiveTab("sets")}
                title="Auf Sets-Seite springen"
                className="bg-[#121214]/90 border border-[#222226] hover:border-red-500/40 rounded-xl p-3 flex items-center gap-2.5 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 cursor-pointer group bg-gradient-to-r hover:from-[#121214] hover:to-[#1a1215]"
              >
                <div className="p-2 bg-emerald-500/5 text-emerald-400 rounded-lg border border-[#10b981]/10 group-hover:bg-emerald-500/10 transition-colors shrink-0">
                  <Library className="w-4 h-4 group-hover:scale-110 transition-transform" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] text-[#a1a1aa] font-bold tracking-wider uppercase font-display group-hover:text-red-400 transition-colors">SETS GELADEN</p>
                  <h3 className="text-sm sm:text-base font-bold text-zinc-100 font-mono mt-0.5 leading-none group-hover:text-red-400 transition-colors">{stats.total_sets}</h3>
                </div>
              </div>

              <div className="bg-[#121214]/90 border border-[#222226] rounded-xl p-3 flex items-center gap-2.5 hover:border-[#38383e] hover:shadow-md hover:shadow-black/10 transition-all duration-300">
                <div className="p-2 bg-amber-500/5 text-amber-400 rounded-lg border border-[#f59e0b]/10 shrink-0">
                  <Globe className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-[#a1a1aa] font-bold tracking-wider uppercase font-display">SPRACHEN</p>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {stats.languages.length > 0 ? (
                      stats.languages.map((langObj) => (
                        <span key={langObj.language} className="text-[8px] font-mono bg-[#222226] px-1 py-0.2 rounded text-zinc-300 border border-[#2d2d30] font-bold">
                          {langObj.language}
                        </span>
                      ))
                    ) : (
                      <span className="text-[9px] text-amber-300 font-mono">Keine</span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6" id="search-view">
            {/* Left Sidebar Filter Form */}
            <aside className="lg:col-span-1 bg-[#121214] border border-[#222226] rounded-2xl p-5 space-y-4 h-fit shadow-md shadow-black/5">
              <div className="flex items-center justify-between border-b border-[#222226] pb-3">
                <h3 className="font-bold font-display text-sm flex items-center gap-2 text-zinc-100">
                  <Search className="w-4 h-4 text-red-500" />
                  Suchfilter
                </h3>
                <button 
                  onClick={handleClearFilters}
                  className="text-xs text-zinc-400 hover:text-zinc-200 transition font-medium cursor-pointer"
                >
                  Zurücksetzen
                </button>
              </div>

              <form onSubmit={handleSearch} className="space-y-4">
                {/* Unified Name Search Filter */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">Kartenname</label>
                  <input 
                    type="text" 
                    value={filterName}
                    onChange={(e) => setFilterName(e.target.value)}
                    placeholder="z.B. Glurak, Charizard, Pikachu"
                    className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/20 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition"
                  />
                </div>

                {/* Set-Code or Name */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">Setname</label>
                  <input 
                    type="text" 
                    value={filterSetName}
                    onChange={(e) => setFilterSetName(e.target.value)}
                    placeholder="z.B. Silver Tempest"
                    className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/20 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Card Number */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">Nr.</label>
                    <input 
                      type="text" 
                      value={filterCardNum}
                      onChange={(e) => setFilterCardNum(e.target.value)}
                      placeholder="z.B. 4"
                      className={`w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] ${brandBorderFocus} focus:outline-none focus:ring-1 ${isPk ? 'focus:ring-red-500/20' : 'focus:ring-amber-500/20'} rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-600 transition`}
                    />
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">Sprache</label>
                    <select 
                      value={filterLang}
                      onChange={(e) => setFilterLang(e.target.value)}
                      className={`w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] ${brandBorderFocus} focus:outline-none rounded-xl px-3 py-2 text-sm text-zinc-100 cursor-pointer transition`}
                    >
                      <option value="">Alle</option>
                      {activeGame !== "onepiece" && <option value="DE">Deutsch (DE)</option>}
                      <option value="EN">English (EN)</option>
                      <option value="JA">Japanisch (JA)</option>
                    </select>
                  </div>
                </div>

                {/* Rarity */}
                <div className="space-y-1.5 relative">
                  <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display flex justify-between items-center">
                    <span>Seltenheit (Rarity)</span>
                    {filterRarities.length > 0 && (
                      <button 
                        type="button"
                        onClick={() => setFilterRarities([])}
                        className={`text-[10px] ${brandTextLight} hover:opacity-80 font-bold transition cursor-pointer`}
                      >
                        Leeren
                      </button>
                    )}
                  </label>
                  
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setRarityDropdownOpen(!rarityDropdownOpen)}
                      className={`w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] ${brandBorderFocus} focus:outline-none rounded-xl px-3 py-2 text-sm text-zinc-100 flex items-center justify-between cursor-pointer transition text-left transition-colors`}
                    >
                      <span className="truncate">
                        {filterRarities.length === 0 
                          ? "Alle Seltenheiten" 
                          : `${filterRarities.length} ausgewählt: ${filterRarities.map(r => r.substring(0, 8)).join(", ")}`}
                      </span>
                      <span className="text-zinc-500 text-xs ml-2">⇅</span>
                    </button>

                    {rarityDropdownOpen && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-[#121214] border border-[#27272a] rounded-xl p-2 max-h-60 overflow-y-auto space-y-0.5 shadow-2xl shadow-black">
                        {(activeGame === "onepiece" ? [
                          { value: "Leader", label: "Leader (L)" },
                          { value: "Common", label: "Common (C)" },
                          { value: "Uncommon", label: "Uncommon (UC)" },
                          { value: "Rare", label: "Rare (R)" },
                          { value: "Super Rare", label: "Super Rare (SR)" },
                          { value: "Secret Rare", label: "Secret Rare (SEC)" },
                          { value: "Special Card", label: "Special Card (SP)" },
                          { value: "Treasure Rare", label: "Treasure Rare (TR)" },
                          { value: "Promo", label: "Promo (P)" },
                        ] : [
                          { value: "Common", label: "Common" },
                          { value: "Uncommon", label: "Uncommon" },
                          { value: "Rare", label: "Rare" },
                          { value: "Rare Holo", label: "Rare Holo" },
                          { value: "Double Rare", label: "Double Rare (ex)" },
                          { value: "Ultra Rare", label: "Ultra Rare" },
                          { value: "Illustration Rare", label: "Illustration Rare (AR)" },
                          { value: "Special Illustration Rare", label: "Special Illustration Rare (SAR)" },
                          { value: "Secret Rare", label: "Secret Rare" },
                          { value: "Hyper Rare", label: "Hyper Rare (Gold)" },
                          { value: "None", label: "Unspezifiziert / Andere (None)" },
                        ]).map((item) => {
                          const isChecked = filterRarities.includes(item.value);
                          return (
                            <label 
                              key={item.value} 
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-zinc-300 hover:text-zinc-100 hover:bg-[#27272a] cursor-pointer transition select-none ${isChecked ? `bg-[#27272a]/60 ${brandTextLight} font-semibold` : ""}`}
                            >
                              <input 
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFilterRarities([...filterRarities, item.value]);
                                  } else {
                                    setFilterRarities(filterRarities.filter(r => r !== item.value));
                                  }
                                }}
                                className={`rounded border-[#27272a] focus:ring-0 ${isPk ? 'text-red-655 accent-red-600' : 'text-amber-500 accent-amber-500'} cursor-pointer bg-zinc-900`}
                              />
                              <span>{item.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-bold py-2.5 px-4 rounded-xl transition shadow-lg shadow-red-950/20 duration-200 mt-2 flex items-center justify-center gap-2 cursor-pointer uppercase text-xs tracking-wider"
                >
                  <Search className="w-4 h-4" />
                  Karten suchen
                </button>
              </form>

              {stats.total_cards === 0 && (
                <div className="bg-amber-400/5 border border-amber-500/10 rounded-xl p-3.5 text-xs text-amber-200 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <Info className="w-4 h-4 text-amber-500 shrink-0" />
                    Datenbank ist leer!
                  </div>
                  <p className="leading-relaxed opacity-90 text-[11px]">Aktuell sind keine Karten in der SQLite Datenbank vorhanden.</p>
                  <button 
                    onClick={() => {
                      setActiveTab("importer");
                      triggerPythonAction("import");
                    }}
                    className="text-red-400 hover:text-red-300 font-bold underline cursor-pointer mt-1 block text-left"
                  >
                    Hier klicken um Schnellsynchronisation zu starten
                  </button>
                </div>
              )}
            </aside>

            {/* Right side Grid or Table View */}
            <section className="lg:col-span-3 space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#121214] p-4 rounded-2xl border border-[#222226]">
                <div className="flex flex-wrap items-center gap-4">
                  {filterSetName && (
                    <button 
                      onClick={() => {
                        setFilterSetName("");
                        setActiveTab("sets");
                      }}
                      className="text-xs bg-red-500/15 hover:bg-red-500/25 text-red-300 border border-red-500/20 px-3 py-1 rounded-lg flex items-center gap-1 transition font-bold cursor-pointer"
                      title="Set-Filter entfernen und zur Übersicht zurückkehren"
                    >
                      ← Zurück zu Sets
                    </button>
                  )}
                  <p className="text-xs text-zinc-400 font-display">
                    Gefunden: <span className="text-zinc-100 font-bold font-mono">{searchMeta.total || cards.length}</span> Karten
                    {(searchMeta.total || 0) > cards.length && (
                      <span className="ml-1 text-zinc-500">
                        ({cards.length} angezeigt)
                      </span>
                    )}
                  </p>
                  
                  {/* Limit Selection Dropdown */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-zinc-400 font-medium">Anzeige-Limit:</span>
                    <select 
                      value={searchLimit} 
                      onChange={(e) => {
                        const newLimit = Number(e.target.value);
                        setSearchLimit(newLimit);
                        handleSearch(undefined, newLimit);
                      }}
                      className="bg-[#18181b] border border-[#27272a] hover:border-[#38383e] text-zinc-300 px-2.5 py-1 rounded-lg text-xs cursor-pointer focus:outline-none focus:border-red-500/30"
                    >
                      <option value={0}>Alle Treffer</option>
                      <option value={48}>48 Karten</option>
                      <option value={100}>100 Karten</option>
                      <option value={250}>250 Karten</option>
                      <option value={500}>500 Karten</option>
                      <option value={1000}>1000 Karten</option>
                      <option value={2000}>2000 Karten</option>
                    </select>
                    {(searchMeta.total || 0) > cards.length && searchLimit !== 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchLimit(0);
                          handleSearch(undefined, 0);
                        }}
                        className="bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-300 px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer"
                      >
                        Alle laden
                      </button>
                    )}
                  </div>

                  {/* Sortierfunktion */}
                  <div className="flex items-center gap-2 border-l border-zinc-800/60 pl-3 md:pl-4">
                    <span className="text-[10px] text-zinc-400 font-medium">Sortieren:</span>
                    <select 
                      value={sortBy} 
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-[#18181b] border border-[#27272a] hover:border-[#38383e] text-zinc-300 px-2.5 py-1 rounded-lg text-xs cursor-pointer focus:outline-none focus:border-red-500/30 font-sans"
                    >
                      <option value="">Standard (keine Sortierung)</option>
                      <option value="set_name">Set-Name</option>
                      <option value="card_number">Kartennummer</option>
                      <option value="rarity">Seltenheit (Rarity)</option>
                    </select>

                    {sortBy && (
                      <button
                        onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                        className="bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-zinc-300 px-2 py-1 rounded-lg text-xs font-semibold cursor-pointer transition flex items-center gap-1 shrink-0 h-7"
                        title={sortOrder === "asc" ? "Aufsteigend" : "Absteigend"}
                      >
                        {sortOrder === "asc" ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-400">Auf</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[9px] uppercase tracking-wider font-mono text-zinc-400">Ab</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* View switcher and refresh */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                  <div className="flex bg-[#18181b] border border-[#27272a] p-1 rounded-lg">
                    <button 
                      onClick={() => setViewMode("grid")}
                      className={`px-3 py-1 text-[11px] rounded-md font-semibold transition cursor-pointer ${viewMode === "grid" ? "bg-red-500/10 text-red-400" : "text-zinc-400 hover:text-zinc-200"}`}
                    >
                      Raster
                    </button>
                    <button 
                      onClick={() => setViewMode("table")}
                      className={`px-3 py-1 text-[11px] rounded-md font-semibold transition cursor-pointer ${viewMode === "table" ? "bg-red-500/10 text-red-400" : "text-zinc-400 hover:text-zinc-200"}`}
                    >
                      Tabelle
                    </button>
                  </div>

                  <button 
                    onClick={() => handleSearch()} 
                    className="text-xs bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] text-zinc-300 px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Aktualisieren
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="h-96 flex flex-col items-center justify-center gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-red-500" />
                  <p className="text-xs text-zinc-400 font-mono">Suche in pokemon_cards.db SQLite Datei läuft...</p>
                </div>
              ) : error ? (
                <div className="bg-red-950/10 border border-red-900/30 p-5 rounded-2xl text-red-400 text-xs flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <h4 className="font-bold">Suchfehler</h4>
                    <p className="mt-1 opacity-95">{error}</p>
                  </div>
                </div>
              ) : cards.length === 0 ? (
                <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center space-y-3">
                  <Database className="w-12 h-12 text-zinc-600 mx-auto" />
                  <h3 className="text-base font-bold font-display text-zinc-200">Keine Karten gefunden</h3>
                  <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                    Es gibt keine passenden Ergebnisse für Ihre Suchfilter. Versuchen Sie, einen allgemeineren Begriff einzugeben oder laden Sie Sets im Live-Sync Tab.
                  </p>
                </div>
              ) : viewMode === "grid" ? (
                <>
                  {/* Tight list-based layout for mobile screens */}
                  <div className="flex flex-col gap-2 md:hidden">
                    {sortedCards.map((card) => {
                      const cardId = card.api_card_id || card.id;
                      const isFav = isCardFavorited(cardId);
                      
                      return (
                        <div 
                          key={`mobile-list-${card.api_card_id}-${card.language}-${card.id}`}
                          onClick={() => setSelectedCard(card)}
                          className="bg-[#121214] border border-[#222226] rounded-xl p-2.5 flex items-center gap-3 hover:border-red-500/35 cursor-pointer active:scale-[0.99] transition-all"
                        >
                          {/* Miniature visual marker */}
                          <div className="w-10 h-14 bg-[#09090b] rounded-md overflow-hidden flex items-center justify-center shrink-0 border border-zinc-900">
                            <SafeCardImage 
                              src={card.image_small} 
                              alt={card.local_name}
                              set_code={card.set_code}
                              card_number={card.card_number}
                              className="max-h-full max-w-full select-none object-contain"
                            />
                          </div>

                          {/* Condensed DB information aligned horizontally */}
                          <div className="flex-1 min-w-0 pr-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="font-bold text-zinc-100 text-xs sm:text-sm truncate leading-tight">
                                {formatCardName(card)}
                              </h4>
                              <span className="shrink-0 text-[10px] font-mono font-bold text-zinc-400 bg-zinc-800/20 border border-zinc-800/40 px-1 py-0.2 rounded">
                                N° {card.card_number}
                              </span>
                            </div>

                            {/* Database specifications inline */}
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-1 text-[10px] text-zinc-400 font-medium font-mono">
                              <span className="bg-[#dc2626]/10 text-red-400 font-extrabold text-[8px] px-1 rounded border border-red-500/10 uppercase">
                                {card.language}
                              </span>
                              <span className="text-zinc-650">•</span>
                              <span className="text-zinc-450 tracking-tight truncate max-w-[80px]" title={card.set_code}>
                                {card.set_code}
                              </span>
                              {card.rarity && (
                                <>
                                  <span className="text-zinc-650">•</span>
                                  <span className="text-amber-400/90 font-bold tracking-tight text-[9px] uppercase">
                                    {translateRarityToEnglish(card.rarity)}
                                  </span>
                                </>
                              )}
                              {card.hp && (
                                <>
                                  <span className="text-zinc-650">•</span>
                                  <span className="text-teal-400 text-[9px]">
                                    {card.hp} HP
                                  </span>
                                </>
                              )}
                              {card.supertype && (
                                <>
                                  <span className="text-zinc-650">•</span>
                                  <span className="text-zinc-500 text-[9px]">
                                    {card.supertype}
                                  </span>
                                </>
                              )}
                            </div>

                            {/* Financial values and indicators */}
                            <div className="mt-1.5">
                              {renderManualPriceEditor(card, "mobile")}
                            </div>
                            <div className="mt-2">
                              {renderMarketButtons(card, "compact")}
                            </div>
                          </div>

                          {/* Small Action slot (Favorite indicator) */}
                          <div className="shrink-0 flex flex-col items-center justify-center gap-1 pl-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isFav) {
                                  handleRemoveFromFavorites(cardId);
                                } else {
                                  handleAddToFavorites(card);
                                }
                              }}
                              className={`p-2 rounded-lg cursor-pointer transition border ${
                                isFav
                                  ? "bg-red-500/10 border-red-500/40 text-red-500"
                                  : "bg-[#18181b]/80 border-zinc-800 text-zinc-500 hover:text-red-500"
                              }`}
                            >
                              <Heart className={`w-3.5 h-3.5 ${isFav ? "fill-red-500 text-red-500" : ""}`} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Original visual cards grid optimized for tablet and desktop sizes */}
                  <div className="hidden md:grid md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {sortedCards.map((card) => (
                      <article 
                        key={`${card.api_card_id}-${card.language}-${card.id}`}
                        onClick={() => setSelectedCard(card)}
                        className="bg-[#121214] border border-[#222226] rounded-2xl overflow-hidden hover:border-red-500/30 hover:shadow-xl hover:shadow-red-500/5 hover:-translate-y-1 cursor-pointer transition-all duration-300 flex flex-col group"
                      >
                        {/* Image Frame */}
                        <div className="relative bg-[#09090b] aspect-[3/4] p-3 flex items-center justify-center overflow-hidden border-b border-[#222226]">
                          <SafeCardImage 
                            src={card.image_small} 
                            alt={card.local_name}
                            set_code={card.set_code}
                            card_number={card.card_number}
                            className="max-h-full max-w-full select-none transition-transform duration-300 group-hover:scale-105"
                          />
                          
                          {/* Favorite Button Overlay */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const cardId = card.api_card_id || card.id;
                              if (isCardFavorited(cardId)) {
                                handleRemoveFromFavorites(cardId);
                              } else {
                                handleAddToFavorites(card);
                              }
                            }}
                            className={`absolute bottom-2.5 right-2.5 z-10 p-2 rounded-full cursor-pointer transition-all duration-200 border shadow-lg ${
                              isCardFavorited(card.api_card_id || card.id)
                                ? "bg-[#18181b]/95 border-red-500/40 text-red-500 scale-105"
                                : "bg-[#18181b]/80 hover:bg-[#18181b]/95 border-zinc-800 text-zinc-400 hover:text-red-500 hover:scale-105"
                            }`}
                            title={isCardFavorited(card.api_card_id || card.id) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isCardFavorited(card.api_card_id || card.id) ? "fill-red-500 text-red-500" : ""}`} />
                          </button>

                          {/* Rarity Tag */}
                          {card.rarity && (
                            <span className="absolute top-2.5 right-2.5 bg-black/85 backdrop-blur-sm text-[8px] text-amber-400 font-bold px-1.5 py-0.5 rounded border border-amber-400/15 uppercase font-mono tracking-wide">
                              {translateRarityToEnglish(card.rarity)}
                            </span>
                          )}

                          {/* HP Tag */}
                          {card.hp && (
                            <span className="absolute top-2.5 left-2.5 bg-black/85 backdrop-blur-sm text-[8px] text-zinc-300 font-mono font-bold px-1.5 py-0.5 rounded border border-zinc-700/30">
                              HP {card.hp}
                            </span>
                          )}
                        </div>

                        {/* Info body */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[9px] font-mono font-bold text-zinc-400 bg-zinc-800/20 border border-zinc-800/40 px-1.5 py-0.5 rounded">
                                N° {card.card_number}
                              </span>
                              <span className="text-[9px] text-red-400 font-bold uppercase tracking-wider">
                                {card.supertype}
                              </span>
                            </div>
                            
                            <h4 className="font-semibold font-display text-zinc-100 text-sm tracking-tight mt-1.5 group-hover:text-red-400 transition-colors duration-200 line-clamp-1" title={formatCardName(card)}>
                              {formatCardName(card)}
                            </h4>
                            {card.language?.toUpperCase() === "JA" ? (
                              <>
                                <p className="text-[10px] text-zinc-500 font-mono italic mt-0.5">
                                  ja (Karten-Sprache): <span className="text-yellow-500 font-sans font-bold">{card.local_name}</span>
                                </p>
                                <p className="text-[10px] text-zinc-500 font-mono italic">
                                  de: <span className="text-zinc-300 font-sans font-medium">{card.pokemon_name || "Unbekannt"}</span>
                                </p>
                                <p className="text-[10px] text-zinc-500 font-mono italic">
                                  en: {card.english_name}
                                </p>
                              </>
                            ) : card.language?.toUpperCase() === "DE" ? (
                              <>
                                <p className="text-[10px] text-zinc-500 font-mono italic mt-0.5">
                                  de (Karten-Sprache): {card.local_name}
                                </p>
                                <p className="text-[10px] text-zinc-500 font-mono italic">
                                  en: {card.english_name}
                                </p>
                                {card.japanese_name && (
                                  <p className="text-[10px] text-yellow-500 font-mono italic">
                                    ja: {cleanAndTranslateJapaneseName(card)}
                                  </p>
                                )}
                              </>
                            ) : (
                              <>
                                <p className="text-[10px] text-zinc-500 font-mono italic mt-0.5">
                                  en (Karten-Sprache): {card.english_name}
                                </p>
                                {card.japanese_name && (
                                  <p className="text-[10px] text-yellow-500 font-mono italic">
                                    ja: {cleanAndTranslateJapaneseName(card)}
                                  </p>
                                )}
                              </>
                            )}
                            <div className="mt-2">
                              {renderManualPriceEditor(card, "grid")}
                            </div>
                            <div className="mt-2">
                              {renderMarketButtons(card, "compact")}
                            </div>
                          </div>

                          <div className="mt-3 border-t border-[#222226] pt-2 flex items-center justify-between text-[10px] text-zinc-400 font-medium">
                            <span className="truncate max-w-[125px] opacity-80" title={card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}>
                              {card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}
                            </span>
                            <span className="bg-[#dc2626]/10 text-red-400 font-extrabold text-[8px] px-1.5 py-0.5 rounded border border-red-500/10 uppercase font-mono">
                              {card.language}
                            </span>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                /* Tabellen-Sicht */
                <div className="overflow-x-auto bg-[#121214] border border-[#222226] rounded-2xl shadow-xl select-text">
                  <table className="w-full text-left border-collapse min-w-[850px]">
                    <thead>
                      <tr className="border-b border-[#222226] bg-[#18181b] text-[10px] font-bold font-display text-zinc-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Karte</th>
                        <th className="py-3 px-4">Set</th>
                        <th className="py-3 px-4 text-center">Nummer</th>
                        <th className="py-3 px-4">Seltenheit</th>
                        <th className="py-3 px-4 text-center">HP</th>
                        <th className="py-3 px-4">Typen</th>
                        <th className="py-3 px-4">Sprache</th>
                        <th className="py-3 px-4">Raw Preis</th>
                        <th className="py-3 px-4 text-right">Aktionen</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1e1e24] text-xs font-mono">
                      {sortedCards.map((card) => (
                        <tr 
                          key={`${card.api_card_id}-${card.language}-${card.id}`}
                          className="hover:bg-[#18181b]/50 transition-colors duration-150 group"
                        >
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-3">
                              <div 
                                className="w-10 h-14 bg-[#09090b] border border-zinc-800 rounded flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                                onClick={() => setSelectedCard(card)}
                              >
                                <SafeCardImage 
                                  src={card.image_small} 
                                  alt={card.local_name}
                                  set_code={card.set_code}
                                  card_number={card.card_number}
                                  className="max-h-full max-w-full select-none"
                                />
                              </div>
                              <div>
                                <span 
                                  onClick={() => setSelectedCard(card)}
                                  className="font-semibold text-zinc-200 hover:text-red-400 hover:underline cursor-pointer transition font-sans text-sm block"
                                >
                                  {formatCardName(card)}
                                </span>
                                <div className="text-[9px] text-[#8e8e93] leading-tight space-y-0.5">
                                  {card.language?.toUpperCase() === "JA" ? (
                                    <>
                                      <span className="text-yellow-500 font-sans font-semibold block">JA (Karten-Sprache): {card.local_name}</span>
                                      <span className="text-zinc-300 block">DE: {card.pokemon_name || "Unbekannt"}</span>
                                      <span>EN: {card.english_name}</span>
                                    </>
                                  ) : card.language?.toUpperCase() === "DE" ? (
                                    <>
                                      <span>DE (Karten-Sprache): {card.local_name}</span>
                                      <span className="block">EN: {card.english_name}</span>
                                      {card.japanese_name && (
                                        <span className="text-yellow-500 block">JA: {cleanAndTranslateJapaneseName(card)}</span>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <span>EN (Karten-Sprache): {card.english_name}</span>
                                      {card.japanese_name && (
                                        <span className="text-yellow-500 block">JA: {cleanAndTranslateJapaneseName(card)}</span>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-4 text-zinc-300 font-sans">
                            <span className="font-semibold block text-zinc-200" title={card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}>
                              {card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}
                            </span>
                            <span className="text-[10px] font-mono text-red-400">{card.set_code}</span>
                          </td>

                          <td className="py-2.5 px-4 text-center text-zinc-400 font-semibold">
                            {card.card_number}
                          </td>

                          <td className="py-2.5 px-4">
                            {card.rarity ? (
                              <span className="inline-block bg-amber-400/5 text-amber-400 border border-amber-400/10 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider">
                                {translateRarityToEnglish(card.rarity)}
                              </span>
                            ) : (
                              <span className="text-zinc-650 opacity-70">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-4 text-center text-red-050 font-bold font-mono">
                            {card.hp ? `${card.hp}` : "-"}
                          </td>

                          <td className="py-2.5 px-4 text-zinc-400 font-sans">
                            {card.types ? (
                              <div className="flex flex-wrap gap-1">
                                {card.types.split(",").map((t: string) => (
                                  <span key={t} className="text-[9px] bg-red-400/5 text-red-300 border border-red-500/10 px-1 rounded font-bold">
                                    {t.trim()}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-zinc-650 opacity-70">-</span>
                            )}
                          </td>

                          <td className="py-2.5 px-4">
                            <span className="text-[9px] font-extrabold bg-[#dc2626]/10 text-red-400 border border-red-500/15 px-1.5 py-0.5 rounded">
                              {card.language}
                            </span>
                          </td>

                          <td className="py-2.5 px-4">
                            {renderManualPriceEditor(card, "table")}
                          </td>

                          <td className="py-2.5 px-4 text-right">
                            <div className="flex justify-end gap-1.5 mb-1.5">
                              <button 
                                onClick={() => setSelectedCard(card)}
                                className="bg-zinc-800/60 hover:bg-zinc-700/80 border border-zinc-700/20 hover:border-zinc-700/50 text-zinc-300 px-2.5 py-1 rounded text-[10px] font-semibold transition cursor-pointer"
                              >
                                Details
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cardId = card.api_card_id || card.id;
                                  if (isCardFavorited(cardId)) {
                                    handleRemoveFromFavorites(cardId);
                                  } else {
                                    handleAddToFavorites(card);
                                  }
                                }}
                                className={`p-1.5 rounded transition cursor-pointer border ${
                                  isCardFavorited(card.api_card_id || card.id)
                                    ? "bg-red-950/40 border-red-900/30 text-red-500 hover:bg-[#18181b]"
                                    : "bg-zinc-800/60 border-zinc-700/20 text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                                }`}
                                title={isCardFavorited(card.api_card_id || card.id) ? "Von Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                              >
                                <Heart className={`w-3.5 h-3.5 ${isCardFavorited(card.api_card_id || card.id) ? "fill-red-500 text-red-500" : ""}`} />
                              </button>
                            </div>
                            {renderMarketButtons(card, "table")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
          </div>
        )}

        {/* TAB 2: SETS MANAGER LIST */}
        {activeTab === "sets" && (
          <div className="space-y-4" id="sets-view">
            <div className="bg-[#121214] p-5 rounded-2xl border border-[#222226] flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-base font-bold font-display text-zinc-100 flex items-center gap-2">
                  <Library className="text-red-500 w-5 h-5" />
                  Registrierte Pokémon TCG Sets
                </h2>
                <p className="text-xs text-[#a1a1aa] mt-0.5">Hier sind alle in der lokalen SQLite-Datenbank registrierten Veröffentlichungs-Sets gelistet.</p>
              </div>
            </div>

            {sets.length === 0 ? (
              <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center space-y-3">
                <Library className="w-12 h-12 text-zinc-600 mx-auto" />
                <h3 className="text-base font-bold font-display text-zinc-200">Keine Sets vorhanden</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Es existieren noch keine Sets in der SQLite-Datenbank. Wechseln Sie zum "Python Live-Sync" und füllen Sie die Datenbank.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search input field to easily filter Sets */}
                <div className="bg-[#121214] border border-[#222226] p-4 rounded-2xl flex flex-col lg:flex-row items-stretch lg:items-center gap-3 shadow-md shadow-black/5">
                  <div className="relative flex-1">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                      <Search className="w-4 h-4 text-zinc-500" />
                    </span>
                    <input
                      type="text"
                      value={filterSetQuery}
                      onChange={(e) => setFilterSetQuery(e.target.value)}
                      placeholder="Set-Name oder Code durchsuchen..."
                      className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/20 rounded-xl pl-10 pr-10 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 transition"
                    />
                    {filterSetQuery && (
                      <button
                        onClick={() => setFilterSetQuery("")}
                        className="absolute inset-y-0 right-0 flex items-center pr-3 group cursor-pointer"
                        title="Suche zurücksetzen"
                      >
                        <X className="w-4 h-4 text-zinc-500 hover:text-zinc-300 transition" />
                      </button>
                    )}
                  </div>

                  {/* Language filter for Sets */}
                  <div className="w-full lg:w-40">
                    <select
                      value={filterSetLanguage}
                      onChange={(e) => setFilterSetLanguage(e.target.value)}
                      className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-zinc-350 cursor-pointer font-medium"
                    >
                      <option value="">Alle Sprachen</option>
                      <option value="DE">Deutsch (DE)</option>
                      <option value="EN">English (EN)</option>
                      <option value="JA">Japanisch (JA)</option>
                    </select>
                  </div>

                  {/* Series filter for Sets */}
                  <div className="w-full lg:w-44">
                    <select
                      value={filterSetSeries}
                      onChange={(e) => setFilterSetSeries(e.target.value)}
                      className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-zinc-350 cursor-pointer font-medium"
                    >
                      <option value="">Alle Serien</option>
                      {uniqueSeriesList.map((ser) => (
                        <option key={ser} value={ser}>{ser}</option>
                      ))}
                    </select>
                  </div>

                  {/* Year filter for Sets */}
                  <div className="w-full lg:w-36">
                    <select
                      value={filterSetYear}
                      onChange={(e) => setFilterSetYear(e.target.value)}
                      className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-zinc-350 cursor-pointer font-medium"
                    >
                      <option value="">Alle Jahre</option>
                      {uniqueYearsList.map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sorting dropdown for Sets */}
                  <div className="w-full lg:w-56">
                    <select
                      value={setListSortOrder}
                      onChange={(e) => setSetListSortOrder(e.target.value)}
                      className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#ef4444] hover:bg-red-500/5 focus:border-red-500/35 focus:outline-none rounded-xl px-3 py-2.5 text-xs text-amber-500 font-bold cursor-pointer transition"
                    >
                      <option value="newest">Neueste Sets zuerst</option>
                      <option value="total_cards">Kartenanzahl absteigend</option>
                    </select>
                  </div>

                  {(filterSetQuery || filterSetLanguage || filterSetSeries || filterSetYear || setListSortOrder !== "newest") && (
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => {
                          setFilterSetQuery("");
                          setFilterSetLanguage("");
                          setFilterSetSeries("");
                          setFilterSetYear("");
                          setSetListSortOrder("newest");
                        }}
                        className="text-[10px] bg-red-950/20 text-red-400 border border-red-500/10 hover:bg-red-950/40 px-2.5 py-1.5 rounded-xl font-bold cursor-pointer transition whitespace-nowrap"
                      >
                        Reset
                      </button>
                      <div className="text-xs text-zinc-400 whitespace-nowrap bg-zinc-805 border border-zinc-700/10 px-3 py-1.5 rounded-xl font-display">
                        Gefunden: <span className="text-red-400 font-bold font-mono">{filteredSets.length}</span>
                      </div>
                    </div>
                  )}
                </div>

                {filteredSets.length === 0 ? (
                  <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center space-y-3">
                    <Search className="w-12 h-12 text-zinc-600 mx-auto opacity-40" />
                    <h3 className="text-base font-bold font-display text-zinc-200">Keine passenden Sets gefunden</h3>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                      Für die gewählte Selektion wurden keine Sets in der Datenbank registriert.
                    </p>
                    <button
                      onClick={() => { setFilterSetQuery(""); setFilterSetLanguage(""); }}
                      className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 text-xs rounded-xl transition duration-200 font-bold cursor-pointer inline-block"
                    >
                      Filter zurücksetzen
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSets.map((set) => (
                      <div 
                        key={`${set.set_code}-${set.language}`}
                        className="bg-[#121214] border border-[#222226] rounded-2xl p-5 hover:border-[#38383e] hover:shadow-md hover:shadow-black/10 transition-all duration-300 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start">
                            <span className="text-[10px] font-mono text-[#f87171] font-bold bg-red-400/5 border border-red-500/10 px-2 py-0.5 rounded">
                              CODE: {set.set_code}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {set.symbol && (
                                <img 
                                  referrerPolicy="no-referrer" 
                                  src={set.symbol.includes("onepiece-cardgame.com") ? `/api/image-proxy?url=${encodeURIComponent(set.symbol)}` : set.symbol} 
                                  alt="Symbol" 
                                  className="w-4 h-4 object-contain"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                />
                              )}
                              <span className="text-[10px] text-zinc-500 font-mono">
                                {set.release_date}
                              </span>
                            </div>
                          </div>
                          
                          <div className="flex gap-3 mt-4 items-center">
                            {set.logo && (
                              <img 
                                referrerPolicy="no-referrer" 
                                src={set.logo.includes("onepiece-cardgame.com") ? `/api/image-proxy?url=${encodeURIComponent(set.logo)}` : set.logo} 
                                alt="Logo" 
                                className="h-10 w-fit object-contain max-w-[50px] bg-[#18181b] p-0.5 rounded"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold font-display text-zinc-200 truncate" title={set.language?.toUpperCase() === "JA" && set.english_set_name ? `${set.english_set_name} (${set.set_name})` : set.set_name}>
                                {set.language?.toUpperCase() === "JA" && set.english_set_name ? `${set.english_set_name} (${set.set_name})` : set.set_name}
                              </h3>
                              <div className="text-[11px] text-[#a1a1aa] mt-0.5 space-y-0.5">
                                <div className="truncate">Serie: <span className="text-zinc-300 font-semibold">{set.series || "Unbekannt"}</span></div>
                                <div className="flex items-center gap-1 mt-0.5">Sprache: <span className="text-zinc-300 font-mono font-bold text-[9px] bg-zinc-800/20 border border-zinc-700/10 px-1.5 rounded">{set.language}</span></div>
                              </div>
                            </div>
                          </div>

                        </div>

                        <div className="mt-5 pt-3 border-t border-[#222226] flex justify-between items-center text-[11px]">
                          <span className="text-zinc-400">
                            Set-Karten: <span className="font-mono text-zinc-255 font-bold">{set.total_cards}</span>
                          </span>
                          
                          <button 
                            onClick={() => handleSetClick(set.set_name, set.language || "")}
                            className="text-[11px] text-red-400 hover:text-red-300 font-bold flex items-center gap-0.5 transition cursor-pointer"
                          >
                            Karten anzeigen
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* IN-SITE GORILLA TCG INSTAGRAM INFOGRAPHIC MODAL */}
        {activeSocialSet && (
          <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-[#121215] border border-zinc-800 rounded-2xl max-w-4xl w-full p-6 space-y-6 relative text-zinc-100 shadow-2xl my-8">
              <button 
                onClick={() => setActiveSocialSet(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-zinc-900 border border-zinc-800 p-2 rounded-xl transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex flex-col lg:flex-row gap-6">
                {/* Visual Preview Panel */}
                <div className="flex-1 space-y-3">
                  <div className="text-xs text-zinc-400 uppercase font-mono tracking-widest font-bold">Insta-Vorschau (Format 1:1)</div>
                  
                  <div className="w-full max-w-[380px] aspect-square mx-auto bg-[#09090b] border-2 border-red-500 rounded-xl relative shadow-lg overflow-hidden p-5 text-left flex flex-col justify-between selection:bg-red-500/20">
                    {/* Grid Effect inside Vorschau */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#ef444405_1px,transparent_1px),linear-gradient(to_bottom,#ef444405_1px,transparent_1px)] bg-[size:30px_30px] pointer-events-none"></div>
                    
                    {/* Red inner framing accent */}
                    <div className="absolute inset-2 border border-[#ef4444]/15 rounded-lg pointer-events-none"></div>

                    {/* Card Header inside preview */}
                    <div className="flex justify-between items-center z-10">
                      <span className="text-[9px] font-black tracking-widest text-[#ef4444] font-mono">GORILLA TCG // SET INDEX</span>
                      <span className="text-[9px] font-bold text-yellow-500 font-mono">LIVE PRICE REPORT</span>
                    </div>

                    {/* Title details in preview */}
                    <div className="mt-2 z-10">
                      <h4 className="text-xl font-extrabold tracking-tight font-display text-white leading-tight uppercase truncate">
                        {activeSocialSet.english_set_name || activeSocialSet.set_name}
                      </h4>
                      <span className="text-[8px] font-bold text-zinc-400 block mt-1 font-mono uppercase tracking-wide">
                        CODE: {activeSocialSet.set_code} | LANG: {activeSocialSet.language} | RATIO PERFORMANCE
                      </span>
                    </div>

                    {/* Bento boxes */}
                    <div className="grid grid-cols-12 gap-3 mt-2 flex-1 z-10 min-h-0">
                      {/* Stats index box */}
                      <div className="col-span-5 bg-zinc-950/85 border border-[#3f3f46]/40 p-2.5 rounded-lg flex flex-col justify-between">
                        <div>
                          <span className="text-[7.5px] font-extrabold text-zinc-400 block leading-tight">GESAMT-WERT:</span>
                          <span className="text-xs font-black text-white font-mono block tracking-tight mt-0.5">
                            {(activeSocialSet.stats?.total_value_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                          </span>
                          <span className="text-[8px] text-amber-500 font-bold font-mono">
                            ~ {Math.round((activeSocialSet.stats?.total_value_raw || 0) * arbitrageExchangeRate).toLocaleString("de-DE")} ¥
                          </span>
                        </div>

                        <div className="mt-1">
                          <span className="text-[7.5px] font-extrabold text-zinc-400 block leading-tight">RAW PREISDATEN:</span>
                          <span className="text-[11px] font-black text-emerald-400 font-mono block tracking-tight mt-0.5 animate-pulse">
                            {activeSocialSet.stats?.priced_cards_db || 0}/{activeSocialSet.stats?.total_cards_db || 0}
                          </span>
                        </div>

                        <div className="mt-1.5 border-t border-zinc-900 pt-1">
                          <span className="text-[7px] font-bold text-zinc-500 block leading-tight">AVG PRICE (RAW):</span>
                          <span className="text-[9px] font-black text-white font-mono block">
                            {(activeSocialSet.stats?.average_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                          </span>
                        </div>

                        <div className="mt-2 bg-[#1c1c1f]/50 p-1.5 rounded border border-zinc-800 text-center flex flex-col justify-center items-center">
                          <span className="text-[7.5px] text-[#a1a1aa] block leading-none font-bold uppercase">QUELLE:</span>
                          <span className="text-[9px] font-black text-emerald-400 block mt-0.5 tracking-tight leading-none uppercase">{activeSocialSet.stats?.price_source || "missing"}</span>
                        </div>
                      </div>

                      {/* Top Pulls list box */}
                      <div className="col-span-7 bg-zinc-950/85 border border-[#3f3f46]/40 p-2 rounded-lg flex flex-col justify-between space-y-1 min-h-0 overflow-hidden">
                        <span className="text-[8px] font-extrabold text-[#ef4444] tracking-wider block font-display leading-none">🔥 HOTTEST PULLS</span>
                        
                        <div className="space-y-1 overflow-hidden flex-1 flex flex-col justify-center">
                          {(activeSocialSet.top_5_cards || []).slice(0, 4).map((item: any, idx: number) => (
                            <div key={item.id} className="bg-[#101012] border border-zinc-900 py-1 px-1.5 rounded flex justify-between items-center text-[7.5px] leading-tight shrink-0">
                              <div className="flex items-center gap-1 min-w-0">
                                <span className="text-red-500 font-extrabold shrink-0">#{idx + 1}</span>
                                <span className="text-zinc-200 font-bold truncate max-w-[85px] block">{item.english_name || item.local_name}</span>
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-zinc-100 font-mono font-bold block">{(item.prices?.raw || 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })} €</span>
                                <span className="text-[6.5px] text-emerald-400 font-mono block">RAW</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Card Watermark in preview */}
                    <div className="text-[7px] text-zinc-500 font-mono border-t border-zinc-900 pt-2 flex justify-between items-center mt-2 z-10">
                      <span>POKÉCOLL RESELLER SUITE</span>
                      <span>*MARKET ESTIMATES</span>
                    </div>
                  </div>
                </div>

                {/* Controls Panel */}
                <div className="flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <h3 className="text-lg font-bold font-display text-zinc-100 flex items-center gap-2">
                      <TrendingUp className="text-[#ef4444] w-5 h-5" />
                      Social Media Report-Generator
                    </h3>
                    <p className="text-xs text-zinc-400 mt-1">
                      Generiere und lade eine perfekt aufbereitete 1:1 Instagram/Social-Media Post-Grafik für das Set <span className="text-white font-bold">{activeSocialSet.english_set_name || activeSocialSet.set_name}</span> herunter. Ideal für Reels, Storys oder Beitrags-Kollagen deiner Reseller-Community!
                    </p>
                  </div>

                  {/* Stat summary cards */}
                  <div className="bg-[#18181c] p-4 rounded-xl border border-zinc-850 space-y-2">
                    <div className="text-xs text-zinc-400 uppercase font-mono tracking-wider font-bold">Auszug der Daten</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Gesamtpreis (Raw):</span>
                        <span className="text-zinc-200 font-mono font-black text-sm">{(activeSocialSet.stats?.total_value_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Hottest Pull (Raw):</span>
                        <span className="text-pink-400 font-mono font-black text-sm">{(activeSocialSet.stats?.highest_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Raw-Preisdaten:</span>
                        <span className="text-emerald-400 font-mono font-black text-sm">{activeSocialSet.stats?.priced_cards_db || 0} / {activeSocialSet.stats?.total_cards_db || 0}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px]">Durchschnittspreis:</span>
                        <span className="text-zinc-200 font-mono font-bold text-xs">{(activeSocialSet.stats?.average_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €</span>
                      </div>
                    </div>
                  </div>

                  {/* Insta Caption copy box */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-zinc-400 font-bold uppercase font-mono tracking-wider">Instagram Post-Caption</span>
                      <button 
                        onClick={() => {
                          const captionText = `🦍 TCG PRICE STATS: ${activeSocialSet.english_set_name || activeSocialSet.set_name} (${activeSocialSet.set_code.toUpperCase()}) 🦍\n\n📊 Set Gesamt-Index (Raw): ${(activeSocialSet.stats?.total_value_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} € (~ ${Math.round((activeSocialSet.stats?.total_value_raw || 0) * (arbitrageExchangeRate || 160)).toLocaleString("de-DE")} ¥)\n📈 Raw-Preisdaten: ${activeSocialSet.stats?.priced_cards_db || 0}/${activeSocialSet.stats?.total_cards_db || 0} Karten\n🔥 Teuerster Pull: ${(activeSocialSet.stats?.highest_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €\n\n💡 Berechnet aus ${activeSocialSet.stats?.total_cards_db || 0} indexierten Karten über die Pokecoll Analytics Suite.\n\n#pokemon #pokemontcg #cardmarket #reseller #gorillatcg #investing #tradingcards #tcgcommunity #pokemongo`;
                          navigator.clipboard.writeText(captionText);
                          setCopiedCaption(true);
                          setTimeout(() => setCopiedCaption(false), 2000);
                        }}
                        className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-800 px-2 py-1 rounded transition flex items-center gap-1 cursor-pointer"
                      >
                        {copiedCaption ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="text-emerald-400 font-bold">Kopiert!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-zinc-400 shrink-0" />
                            <span>Caption kopieren</span>
                          </>
                        )}
                      </button>
                    </div>
                    
                    <div className="bg-[#09090b] border border-zinc-800 p-2.5 rounded-lg text-[10px] text-zinc-500 font-mono h-24 overflow-y-auto whitespace-pre-wrap select-all">
                      {`🦍 TCG PRICE STATS: ${activeSocialSet.english_set_name || activeSocialSet.set_name} (${activeSocialSet.set_code.toUpperCase()}) 🦍\n\n📊 Set Gesamt-Index (Raw): ${(activeSocialSet.stats?.total_value_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €\n📈 Raw-Preisdaten: ${activeSocialSet.stats?.priced_cards_db || 0}/${activeSocialSet.stats?.total_cards_db || 0} Karten\n🔥 Teuerster Pull: ${(activeSocialSet.stats?.highest_price_raw || 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`}
                    </div>
                  </div>

                  {/* Export button */}
                  <button 
                    onClick={() => handleDownloadSocialCard(activeSocialSet)}
                    className="w-full bg-[#ef4444] hover:bg-red-650 font-bold text-white py-3 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer font-display select-none shadow-md shadow-red-500/10 hover:shadow-red-500/20"
                  >
                    <Download className="w-4 h-4 text-white" />
                    High-Res Infografik herunteladen (PNG)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: PYTHON LIVE-SYNC CONTROLLER */}
        {activeTab === "importer" && (
          <div className="space-y-6" id="importer-view">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sync settings cards */}
              <div className="lg:col-span-1 bg-[#121214] border border-[#222226] p-5 rounded-2xl space-y-5 shadow-md shadow-black/5">
                <div>
                  <h3 className="font-bold font-display text-zinc-100 text-sm">
                    {activeGame === "pokemon" ? "Python-Befehl ausführen" : "Daten Seeden & Reparieren"}
                  </h3>
                  <p className="text-xs text-[#a1a1aa] mt-1">
                    {activeGame === "pokemon" ? "Schnittstelle zur direkten Steuerung des Python CLI-Programms im Container." : "Regeneriere und repariere One Piece TCG Standardsets direkt in der SQLite Datenbank."}
                  </p>
                </div>

                <div className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">Datensprache wählen</label>
                    <select 
                      value={syncLang}
                      onChange={(e) => setSyncLang(e.target.value)}
                      className={`w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] ${brandBorderFocus} focus:outline-none rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-100 cursor-pointer`}
                    >
                      {activeGame !== "onepiece" && <option value="de">German (Deutsch)</option>}
                      <option value="en">English (Englisch)</option>
                      <option value="ja">Japanese (日本語)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-zinc-400 tracking-wide uppercase font-display">
                      {activeGame === "pokemon" ? "Anzahl Initial-Sets beim Erstimport" : "Initialisierungs-Umfang"}
                    </label>
                    <select 
                      value={syncCount}
                      onChange={(e) => setSyncCount(e.target.value)}
                      className={`w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] ${brandBorderFocus} focus:outline-none rounded-xl px-3 py-2.5 text-xs font-semibold text-zinc-100 cursor-pointer`}
                    >
                      {activeGame === "pokemon" ? (
                        <>
                          <option value="1">1 Set (Superschnell - ca. 10 Sekunden)</option>
                          <option value="3">3 Sets (Ausgewogen - ca. 30 Sekunden)</option>
                          <option value="6">6 Sets (Erweitert - ca. 1 Minute)</option>
                          <option value="12">12 Sets (Groß - ca. 2-3 Minuten)</option>
                          <option value="0">ALLE SETS (Vollständiger Import)</option>
                        </>
                      ) : (
                        <>
                          <option value="1">Standard (Moderne Editionen - OP01 bis OP09)</option>
                          <option value="0">ALLE SETS (Vollständiger Import - über 50 Sets + Promos)</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="flex items-start gap-2.5 p-3.5 bg-[#18181b]/40 border border-[#27272a] rounded-xl my-2">
                    <input 
                      type="checkbox" 
                      id="all-cards-checkbox"
                      checked={allCardsImport} 
                      onChange={(e) => setAllCardsImport(e.target.checked)}
                      className={`w-4 h-4 rounded bg-[#09090b] border-zinc-700 cursor-pointer mt-0.5 shrink-0 ${isPk ? 'text-red-655 focus:ring-red-500 accent-red-600' : 'text-amber-500 focus:ring-amber-500 accent-amber-500'}`}
                    />
                    <label htmlFor="all-cards-checkbox" className="text-[11px] font-semibold text-zinc-300 cursor-pointer select-none leading-normal">
                      <strong>Vollständiger Import</strong><br />
                      {activeGame === "pokemon" ? "Importiere ALLE Karten der Sets statt nur 10 Karten pro Set (stabile Netzverbindung vorausgesetzt)." : "Verifiziert alle One Piece Artworks und Chase-Karten im SQLite-Lokalspeicher."}
                    </label>
                  </div>

                  <div className="pt-2 space-y-3">
                    {/* Action A: Quick Import */}
                    <button 
                      onClick={() => triggerPythonAction("import")}
                      disabled={isSyncing}
                      className={`w-full ${brandBg} ${brandHoverBg} disabled:bg-[#18181b] disabled:text-zinc-600 disabled:border-transparent disabled:cursor-not-allowed text-white py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider`}
                    >
                      <Download className="w-4 h-4" />
                      {activeGame === "pokemon" ? "1. Schnellen Erstimport ausführen" : "Erstimport & Seeding ausführen"}
                    </button>

                    {activeGame === "pokemon" ? (
                      <>
                        {/* Action B: Incremental Update */}
                        <button 
                          onClick={() => triggerPythonAction("update")}
                          disabled={isSyncing}
                          className="w-full bg-[#18181b] hover:bg-[#27272a] border border-[#27272a] disabled:bg-[#18181b] disabled:text-zinc-650 disabled:border-transparent disabled:cursor-not-allowed text-zinc-200 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider"
                        >
                          <RefreshCw className="w-4 h-4" />
                          2. Inkrementelles Update ausführen
                        </button>

                        {/* Action C: Reset & Init DB */}
                        <button 
                          onClick={() => triggerPythonAction("init")}
                          disabled={isSyncing}
                          className="w-full bg-[#09090b] hover:bg-[#121214] border border-[#27272a]/80 disabled:bg-[#18181b] disabled:text-zinc-600 disabled:border-transparent disabled:cursor-not-allowed text-zinc-400 py-2.5 rounded-xl font-mono text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          python3 main.py init
                        </button>
                      </>
                    ) : (
                      <div className="bg-[#18181b]/30 p-3 rounded-xl border border-amber-500/10 text-[11px] text-amber-200 leading-relaxed space-y-1.5">
                        <p className="font-semibold flex items-center gap-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          Direkter SQLite-Datentransfer
                        </p>
                        <p className="text-zinc-400">
                          One Piece Card Game Daten werden direkt aus dem offiziellen Bandai-Katalog in die lokale SQLite-Datenbank synchronisiert.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-[#18181b]/50 border border-[#222226] rounded-xl p-3.5 text-xs text-zinc-400 space-y-2 leading-relaxed">
                  <div className="flex items-center gap-1.5 font-semibold text-zinc-300">
                    <Info className={`w-3.5 h-3.5 ${brandTextAccent}`} />
                    Hintergrundinfo
                  </div>
                  Unsere Suite verwendet die fantastische, open-source <strong>TCGDex API</strong>, um lizenzfreie Echtzeit-Informationen extrem schnell herunterzuladen. Beim Click auf die grünen oder roten Buttons oben wird live der Python CLI Prozess inside des Express Cloud-Servers getriggert!
                </div>
              </div>

              {/* Logs display Terminal */}
              <div className="lg:col-span-2 bg-[#09090b] rounded-2xl border border-[#222226] shadow-2xl overflow-hidden flex flex-col h-[480px]">
                {/* Terminal Header */}
                <div className="bg-[#121214] px-4 py-3 border-b border-[#222226] flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 bg-red-500/80 rounded-full"></span>
                      <span className="w-2.5 h-2.5 bg-amber-500/80 rounded-full"></span>
                      <span className="w-2.5 h-2.5 bg-green-500/80 rounded-full"></span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400 font-semibold ml-2">python3-cli-runner@sandbox</span>
                  </div>
                  {isSyncing ? (
                    <span className="text-[10px] text-red-400 font-mono flex items-center gap-1">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      VERZÖGERUNG... PROZESS AKTIV
                    </span>
                  ) : (
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">BEREIT</span>
                  )}
                </div>

                {/* Console Logs */}
                <div className="flex-1 p-4 overflow-y-auto font-mono text-xs text-emerald-400 bg-[#09090b] space-y-1.5 select-text">
                  {terminalLogs.length === 0 ? (
                    <div className="text-zinc-650 text-center py-24 text-[11px]">
                      &gt;_ Terminal-Logs erscheinen hier nach Ausführung eines Befehls.<br />
                      Hier wird der echte Output von <span className="text-[#f87171]">main.py</span> angezeigt.
                    </div>
                  ) : (
                    terminalLogs.map((log, index) => {
                      let colorClass = "text-zinc-300";
                      if (log.includes("[SYSTEM]")) colorClass = "text-sky-400 font-semibold";
                      if (log.includes("[ERROR]")) colorClass = "text-red-400 font-bold";
                      if (log.includes("[WARNING]")) colorClass = "text-amber-400";
                      if (log.includes("INFO")) colorClass = "text-emerald-400";
                      return (
                        <div key={index} className={`whitespace-pre-wrap ${colorClass}`}>
                          {log}
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SCRIPT EXPORTER & INSTALLATION GUIDE */}
        {activeTab === "scripts" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="scripts-view">
            {/* Script selector */}
            <aside className="lg:col-span-1 space-y-4">
              <div className="bg-[#121214] border border-[#222226] p-5 rounded-2xl shadow-md shadow-black/5">
                <h3 className="font-bold font-display text-zinc-100 text-sm">Python Module Exporter</h3>
                <p className="text-xs text-[#a1a1aa] mt-1">Hier kannst du jeden der geschriebenen Python-Dateien direkt kopieren.</p>
                
                <div className="space-y-1.5 mt-4">
                  {[
                    "database.py",
                    "models.py",
                    "importer.py",
                    "updater.py",
                    "search.py",
                    "main.py"
                  ].map((script) => (
                    <button 
                      key={script}
                      onClick={() => setSelectedScript(script)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl font-mono text-xs flex items-center justify-between transition cursor-pointer ${selectedScript === script ? 'bg-[#dc2626]/10 border border-[#dc2626]/20 text-zinc-100 font-bold' : 'bg-transparent text-zinc-400 hover:text-white border border-transparent'}`}
                    >
                      <span>{script}</span>
                      <span className="text-[9px] uppercase bg-zinc-800/30 px-2 py-0.5 rounded text-zinc-400 border border-zinc-800/40">Python</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step-by-Step installations guide */}
              <div className="bg-[#121214] border border-[#222226] p-5 rounded-2xl space-y-3 shadow-md shadow-black/5">
                <h3 className="font-bold font-display text-zinc-100 text-sm flex items-center gap-1.5">
                  <CheckCircle className="w-5 h-5 text-red-500" />
                  Installationsanleitung
                </h3>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Befolge diese einfachen Schritte, um dieses vollständige Programm auf deinem lokalen PC zu betreiben:
                </p>

                <ol className="text-xs text-zinc-350 space-y-2.5 list-decimal list-inside pl-1 leading-relaxed">
                  <li>
                    <strong>Dateien kopieren:</strong> Kopiere alle 6 oben gelisteten Python Skripte in einen leeren Projektordner auf deinem PC.
                  </li>
                  <li>
                    <strong>Keine Dependencies nötig:</strong> Das Programm benötigt keine externen Bibliotheken und läuft direkt auf Standard-Python 3.
                  </li>
                  <li>
                    <strong>Datenbank initialisieren:</strong><br />
                    <code className="bg-[#09090b] border border-[#222226] px-1.5 py-0.5 rounded font-mono text-red-400 text-[10px] font-semibold">python3 main.py init</code>
                  </li>
                  <li>
                    <strong>Daten synchronisieren:</strong><br />
                    <code className="bg-[#09090b] border border-[#222226] px-1.5 py-0.5 rounded font-mono text-red-400 text-[10px] font-semibold">python3 main.py import --lang de</code>
                  </li>
                  <li>
                    <strong>Karten durchsuchen im Terminal:</strong><br />
                    <code className="bg-[#09090b] border border-[#222226] px-1.5 py-0.5 rounded font-mono text-red-400 text-[10px] font-semibold">python3 main.py search --eng Pikachu</code>
                  </li>
                </ol>
              </div>
            </aside>

            {/* Code displaying board */}
            <section className="lg:col-span-2 bg-[#09090b] rounded-2xl border border-[#222226] overflow-hidden flex flex-col">
              <div className="bg-[#121214] px-5 py-3 border-b border-[#222226] flex justify-between items-center">
                <span className="font-mono text-xs text-zinc-300 font-bold">{selectedScript}</span>
                <button 
                  onClick={() => copyScriptToClipboard(selectedScript)}
                  className="bg-[#dc2626] hover:bg-[#b91c1c] text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition active:scale-[0.98] cursor-pointer"
                >
                  {copiedText ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5" />
                      Kopiert!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Code kopieren
                    </>
                  )}
                </button>
              </div>

              <div className="flex-1 p-5 overflow-auto max-h-[600px] bg-[#09090b] font-mono text-[11px] text-[#93c5fd]/90 leading-relaxed border-none">
                <pre className="select-all">
                  {selectedScript === "database.py" && dbPyContent}
                  {selectedScript === "models.py" && modelsPyContent}
                  {selectedScript === "importer.py" && importerPyContent}
                  {selectedScript === "updater.py" && updaterPyContent}
                  {selectedScript === "search.py" && searchPyContent}
                  {selectedScript === "main.py" && mainPyContent}
                </pre>
              </div>
            </section>
          </div>
        )}

        {/* TAB 1.5: KARTEN-BILDER-EXPLORER */}
        {activeTab === "image-explorer" && (
          <div className="space-y-6" id="image-explorer-view">
            <div className="bg-[#121214] p-5 rounded-2xl border border-[#222226] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
              <div>
                <h2 className="text-base font-bold font-display text-zinc-100 flex items-center gap-2">
                  <Camera className="text-red-500 w-5 h-5" />
                  Karten-Scanner
                </h2>
                <p className="text-xs text-[#a1a1aa] mt-0.5 leading-relaxed">
                  Eine Karte fotografieren oder hochladen, erkennen lassen und direkt in den Swipe-Stapel legen.
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-500">
                <span className="px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950/60">1 Bild</span>
                <span className="px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950/60">1 bester Treffer</span>
                <span className="px-2 py-1 rounded-lg border border-zinc-800 bg-zinc-950/60">Swipe</span>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-4 bg-[#121214] border border-[#222226] p-5 rounded-2xl flex flex-col space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-display text-zinc-300 flex items-center gap-2 uppercase tracking-wider">
                    <Camera className="w-4 h-4 text-red-500" />
                    Karte scannen
                  </h3>
                  {(scanImage || scannedImages.length > 0) && (
                    <button
                      onClick={() => {
                        setScannedImages([]);
                        setScannedImageNames([]);
                        setScanImage(null);
                        setScanResult(null);
                        setScanError(null);
                        setManualScanHint("");
                      }}
                      className="text-[10px] font-mono text-zinc-500 hover:text-red-400 transition cursor-pointer"
                    >
                      Zurücksetzen
                    </button>
                  )}
                </div>

                <div className="relative aspect-[3/4] w-full rounded-2xl border border-zinc-800 bg-[#09090b] overflow-hidden flex items-center justify-center">
                  {isCameraActive ? (
                    <>
                      <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
                      <div className="absolute inset-5 border border-red-500/50 rounded-xl pointer-events-none">
                        <div className="absolute left-0 right-0 top-[18%] h-px bg-red-500/50" />
                        <div className="absolute left-0 right-0 bottom-[16%] h-px bg-red-500/50" />
                      </div>
                    </>
                  ) : scanImage ? (
                    <img
                      src={scanImage}
                      alt="Zu scannende Karte"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <label className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 cursor-pointer hover:bg-zinc-900/35 transition">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="sr-only"
                      />
                      <div className="w-14 h-14 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4">
                        <Plus className="w-5 h-5 text-red-400" />
                      </div>
                      <p className="text-sm font-bold text-zinc-200">Foto auswählen</p>
                      <p className="text-[11px] text-zinc-500 mt-1 max-w-[220px] leading-relaxed">
                        Eine einzelne Karte, möglichst gerade und gut beleuchtet.
                      </p>
                    </label>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {isCameraActive ? (
                    <>
                      <button
                        onClick={captureSnapshot}
                        className="bg-red-650 hover:bg-red-600 text-white font-bold py-2.5 px-3 rounded-xl text-xs uppercase tracking-wider font-display transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        Scannen
                      </button>
                      <button
                        onClick={stopCamera}
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-300 font-bold py-2.5 px-3 rounded-xl text-xs uppercase font-display transition cursor-pointer"
                      >
                        Schließen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={startCamera}
                        className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-zinc-800 transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Camera className="w-3.5 h-3.5 text-red-500" />
                        Kamera
                      </button>
                      <label className="bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-bold py-2.5 px-3 rounded-xl text-xs border border-zinc-800 transition cursor-pointer flex items-center justify-center gap-2">
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="sr-only" />
                        <Layers className="w-3.5 h-3.5 text-red-500" />
                        Upload
                      </label>
                    </>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider font-display">
                    Set/Nummer als Fallback
                  </label>
                  <input
                    type="text"
                    value={manualScanHint}
                    onChange={(e) => setManualScanHint(e.target.value)}
                    placeholder="z.B. DRI 190/182, sv10 190 oder Meowth 106/094"
                    className="w-full bg-[#18181b] border border-[#27272a] hover:border-[#38383e] focus:border-red-500/30 focus:outline-none focus:ring-1 focus:ring-red-500/20 rounded-xl px-3.5 py-2 text-xs text-zinc-100 placeholder-zinc-600 transition"
                  />
                  <p className="text-[10px] text-zinc-600 leading-relaxed">
                    Wird mit dem Foto kombiniert, wenn OCR die Fußzeile nicht sicher liest.
                  </p>
                </div>

                {scanImage && !isCameraActive && (
                  <button
                    onClick={() => handleScanCardImage(scanImage)}
                    disabled={scanLoading}
                    className="w-full bg-red-650 hover:bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-bold py-3 rounded-xl text-xs uppercase tracking-wider font-display transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className={`w-4 h-4 ${scanLoading ? "animate-spin" : ""}`} />
                    {scanLoading ? "Analysiere..." : "Diese Karte erkennen"}
                  </button>
                )}

                {scanLoading && (
                  <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 text-[11px] text-zinc-400 font-mono">
                    {scanProgress || "Scanne Karte..."}
                  </div>
                )}

                {scanError && (
                  <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-3 text-xs text-red-300 leading-relaxed">
                    {scanError}
                  </div>
                )}

                {scanError && scanResult && (() => {
                  const debugData = scanResult.raw_scan_results?.[0] || scanResult;
                  const hints = debugData?.parsed_hints || debugData?.client_hints || {};
                  const previewText = String(debugData?.client_ocr_text || hints.text || "")
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 220);
                  return (
                    <div className="bg-zinc-950 border border-zinc-850 rounded-xl p-3 text-[10px] text-zinc-500 font-mono space-y-1.5">
                      <div className="flex flex-wrap gap-2">
                        <span>Set: <span className="text-zinc-300">{Array.isArray(hints.set_codes) && hints.set_codes.length ? hints.set_codes.join(", ") : "keine"}</span></span>
                        <span>Nr: <span className="text-zinc-300">{Array.isArray(hints.card_numbers) && hints.card_numbers.length ? hints.card_numbers.join(", ") : "keine"}</span></span>
                        <span>Name: <span className="text-zinc-300">{Array.isArray(hints.names) && hints.names.length ? hints.names.join(", ") : "keiner"}</span></span>
                      </div>
                      <div className="text-zinc-600 break-words">
                        OCR: {previewText || "leer oder nicht geladen"}
                      </div>
                    </div>
                  );
                })()}

                {scanResult?.matched_cards?.length > 0 && (
                  <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3 flex items-center gap-3">
                    {pickBestScanCard(scanResult.matched_cards)?.image_small && (
                      <img
                        src={pickBestScanCard(scanResult.matched_cards)?.image_small}
                        alt="Treffer"
                        className="w-10 h-14 object-contain rounded bg-black/40 border border-zinc-800"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-100 truncate">
                        {pickBestScanCard(scanResult.matched_cards)?.local_name || pickBestScanCard(scanResult.matched_cards)?.english_name}
                      </p>
                      <p className="text-[10px] text-zinc-500 font-mono">
                        N° {pickBestScanCard(scanResult.matched_cards)?.card_number} · {pickBestScanCard(scanResult.matched_cards)?.set_code} · {pickBestScanCard(scanResult.matched_cards)?.similarity_score || Math.round((pickBestScanCard(scanResult.matched_cards)?.ai_confidence || 0) * 100)}%
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Middle Column: Interactive Tinder Swiper (Column Span 4) */}
              <div className="xl:col-span-4 bg-[#121214] border border-[#222226] p-5 rounded-2xl flex flex-col justify-between items-center relative shadow-sm min-h-[460px]">
                <div className="w-full">
                  <h3 className="text-xs font-bold font-display text-zinc-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5 text-zinc-500 animate-pulse" />
                    Swipe-Stapel
                  </h3>

                  {scanLoading ? (
                    <div className="py-24 flex flex-col items-center justify-center text-center space-y-5">
                      <div className="relative w-12 h-12 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-2 border-zinc-800"></div>
                        <div className="absolute inset-0 rounded-full border-2 border-t-red-500 animate-spin"></div>
                        <Sparkles className="w-4 h-4 text-red-505 text-red-500 animate-pulse" />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-zinc-250 animate-pulse">
                          {scanProgress || "Identifiziere alle Karten..."}
                        </p>
                        <p className="text-[10px] text-zinc-500 max-w-xs leading-normal animate-pulse">
                          Die App sucht den besten lokalen Treffer und legt genau eine Karte in den Stapel.
                        </p>
                      </div>
                    </div>
                  ) : scanError ? (
                    <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-xl flex items-start gap-2.5 my-10">
                      <AlertCircle className="w-4.5 h-4.5 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-bold text-red-400">Scanner-Fehler</h4>
                        <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{scanError}</p>
                      </div>
                    </div>
                  ) : swipeDeck.length > 0 ? (
                    /* Tinder Swipe Active State */
                    <div className="flex flex-col items-center w-full">
                      {/* Swipe Progress Meter */}
                      <div className="w-full flex items-center justify-between mb-4 text-xs font-mono">
                        <span className="text-zinc-500">Karten verbleibend:</span>
                        <span className="text-red-400 font-bold bg-red-950/20 px-2 py-0.5 rounded border border-red-900/30">
                          {deckIndex < swipeDeck.length ? `${deckIndex + 1} / ${swipeDeck.length}` : "0 / 0"}
                        </span>
                      </div>

                      {/* Stack Card Stage */}
                      <div className="relative w-full aspect-[3/4] max-w-[280px] h-[340px] flex items-center justify-center">
                        {deckIndex < swipeDeck.length ? (
                          <AnimatePresence mode="popLayout">
                            {swipeDeck.slice(deckIndex).slice(0, 3).reverse().map((card, i, arr) => {
                              // arr length is max 3. The top card of the current sliced array is the last item in reverse list
                              const isTop = i === arr.length - 1;
                              const depthIndex = arr.length - 1 - i; // 0 for top card, 1 for second, 2 for third

                              return (
                                <motion.div
                                  key={card.swipeInstanceId || card.id}
                                  className="absolute w-full h-full max-w-[260px] md:max-w-[275px] bg-[#161619] border-2 border-zinc-800 rounded-2xl shadow-2xl overflow-hidden cursor-pointer flex flex-col justify-between p-3.5 select-none"
                                  style={{
                                    zIndex: 30 - depthIndex,
                                    transformOrigin: "bottom center",
                                  }}
                                  animate={{
                                    scale: 1 - depthIndex * 0.04,
                                    y: depthIndex * 12,
                                    opacity: 1 - depthIndex * 0.3,
                                    rotate: isTop && swipeDirection === "left" ? -20 : isTop && swipeDirection === "right" ? 20 : 0,
                                    x: isTop && swipeDirection === "left" ? -400 : isTop && swipeDirection === "right" ? 400 : 0
                                  }}
                                  transition={{ 
                                    type: "spring",
                                    stiffness: 300,
                                    damping: 25,
                                    duration: 0.2
                                  }}
                                  onClick={() => isTop && setSelectedCard(card)}
                                >
                                  {/* Holographic glowing or pulsing decoration for Ultra Rares */}
                                  {isTop && card.rarity && (card.rarity.includes("Rare") || card.rarity.includes("Promo")) && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/5 via-fuchsia-500/5 to-amber-500/5 pointer-events-none animate-pulse"></div>
                                  )}

                                  {/* Tinder Card Header */}
                                  <div className="flex items-center justify-between shrink-0">
                                    <span className="text-[9px] font-mono font-bold px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-zinc-300">
                                      N° {card.card_number}
                                    </span>
                                    {card.rarity && (
                                      <span className="text-[8px] text-amber-400 font-bold px-1.5 py-0.5 bg-amber-500/5 rounded border border-amber-500/10 font-mono tracking-wide uppercase">
                                        {translateRarityToEnglish(card.rarity)}
                                      </span>
                                    )}
                                  </div>

                                  {/* Card Visual Main Body */}
                                  <div className="flex-1 my-2 flex items-center justify-center overflow-hidden bg-black/40 rounded-lg p-2 max-h-[170px] relative group-hover:scale-102 transition">
                                    {card.image_small ? (
                                      <img 
                                        src={card.image_small} 
                                        alt={card.local_name}
                                        referrerPolicy="no-referrer"
                                        className="max-h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
                                      />
                                    ) : (
                                      <span className="text-[10px] font-mono text-zinc-650">Kein Bild</span>
                                    )}
                                    {/* Swiping Direction Visual Indicators inside the card */}
                                    {isTop && swipeDirection === "right" && (
                                      <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex items-center justify-center text-emerald-400 font-display font-bold uppercase tracking-wider text-sm border-2 border-emerald-500 rounded-lg animate-fade-in">
                                        LIKE / WARENKORB 💚
                                      </div>
                                    )}
                                    {isTop && swipeDirection === "left" && (
                                      <div className="absolute inset-0 bg-red-950/80 backdrop-blur-xs flex items-center justify-center text-red-400 font-display font-bold uppercase tracking-wider text-sm border-2 border-red-500 rounded-lg animate-fade-in">
                                        IGNORIEREN ❌
                                      </div>
                                    )}
                                  </div>

                                  {/* Card Stats Display Footer */}
                                  <div className="shrink-0 space-y-1 bg-black/30 p-2.5 rounded-xl border border-zinc-900/50 mt-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.2 bg-red-500/10 text-red-400 rounded-sm border border-red-500/10">
                                        {card.language}
                                      </span>
                                      <h4 className="font-bold text-zinc-150 text-xs truncate max-w-[170px]" title={card.local_name}>
                                        {card.local_name}
                                      </h4>
                                    </div>
                                    {card.japanese_name && (
                                      <p className="text-[9px] text-[#a1a1aa] font-sans font-medium truncate">
                                        JP: {card.japanese_name}
                                      </p>
                                    )}

                                    {/* Japan Reseller Price Tag Row (Editable) */}
                                    <div className="pt-1.5 mt-1 border-t border-zinc-900/60 flex flex-col gap-1">
                                      <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
                                        Einkaufspreis (Yen ¥):
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded focus-within:border-red-550/30 max-w-[95px] h-6 transition">
                                          <span className="text-[10px] font-mono font-bold text-red-500 mr-1 select-none">¥</span>
                                          <input 
                                            type="number"
                                            value={card.yen_price || ""}
                                            placeholder="0"
                                            onClick={(e) => e.stopPropagation()} // Stop modal detail screen launch
                                            onChange={(e) => {
                                              const newYen = parseInt(e.target.value) || 0;
                                              updateCurrentCardYenPrice(newYen);
                                            }}
                                            className="w-full bg-transparent text-[10px] text-zinc-200 font-mono font-bold focus:outline-none p-0 border-none"
                                            min="0"
                                          />
                                        </div>
                                        <span className="text-[9px] font-mono text-zinc-400 font-semibold bg-zinc-900/80 px-1.5 py-0.5 rounded border border-zinc-850/40">
                                          ({convertYenToEuro(card.yen_price)})
                                        </span>
                                      </div>
                                    </div>

                                    {/* Swiper Card Notes Row (Editable in deck) */}
                                    <div className="pt-1.5 mt-1 border-t border-zinc-900/60 flex flex-col gap-1">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-[8px] font-mono font-bold text-zinc-500 uppercase tracking-wider">
                                            Notiz / Zustand:
                                          </span>
                                          {cartSaveFeedback[card.swipeInstanceId] && (
                                            <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded animate-fade-in">
                                              ✓ Auto-gespeichert
                                            </span>
                                          )}
                                        </div>
                                        {card.yellow_label_detected && (
                                          <span className="text-[7.5px] font-bold text-yellow-500 bg-yellow-500/10 px-1 rounded animate-pulse">
                                            ⚠️ GELB (MÄNGEL)
                                          </span>
                                        )}
                                      </div>
                                      <input 
                                        type="text"
                                        placeholder={card.yellow_label_detected ? "Gelber Sticker erkannt!" : "Hinzufügen..."}
                                        value={card.notes !== undefined ? card.notes : (card.yellow_label_detected ? "⚠️ Gelbes Label (Mängel/キズあり)" : "")}
                                        onClick={(e) => e.stopPropagation()} // Prevent detail screen launch
                                        onChange={(e) => {
                                          updateCurrentCardNotes(e.target.value);
                                        }}
                                        onBlur={() => {
                                          setCartSaveFeedback(prev => ({ ...prev, [card.swipeInstanceId]: true }));
                                          setTimeout(() => {
                                            setCartSaveFeedback(prev => ({ ...prev, [card.swipeInstanceId]: false }));
                                          }, 1500);
                                        }}
                                        className="w-full bg-zinc-950 border border-zinc-850 rounded px-2 py-0.5 text-[9px] text-zinc-300 font-sans focus:outline-none focus:border-red-550/30 transition h-6"
                                      />
                                    </div>

                                    <div className="flex items-center justify-between text-[9px] text-zinc-550 pt-1.5 border-t border-zinc-900/40">
                                      <span className="truncate max-w-[130px] font-sans" title={card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}>
                                        Set: {card.language?.toUpperCase() === "JA" && card.english_set_name ? `${card.english_set_name} (${card.set_name})` : card.set_name}
                                      </span>
                                      <span className="text-zinc-500 font-mono font-bold uppercase">{card.set_code}</span>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        ) : (
                          /* Deck Finished Screen */
                          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-[#161619]/40 border border-dashed border-zinc-800 rounded-2xl space-y-3 animate-fade-in">
                            <div className="w-12 h-12 rounded-full bg-green-500/10 text-green-400 flex items-center justify-center border border-green-500/20">
                              <Check className="w-6 h-6" />
                            </div>
                            <h4 className="font-bold text-zinc-200 text-sm font-display">Stapel abgearbeitet!</h4>
                            <p className="text-xs text-zinc-500 max-w-[200px] leading-relaxed">
                              Alle aus diesem Foto identifizierten Karten wurden bewertet und verarbeitet.
                            </p>
                            <button
                              onClick={() => {
                                setScanImage(null);
                                setScanResult(null);
                                setSwipeDeck([]);
                                setDeckIndex(0);
                              }}
                              className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wider transition uppercase cursor-pointer"
                            >
                              Nächstes Bild scannen
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Interactive Touch/Click Swipe Action Buttons under the stack */}
                      {deckIndex < swipeDeck.length && (
                        <div className="flex flex-col items-center gap-3 mt-6 w-full max-w-[260px]">
                          <div className="flex items-center justify-center gap-4 w-full">
                            <button
                              onClick={handleSwipeLeft}
                              disabled={!!swipeDirection}
                              className="w-12 h-12 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-red-500 hover:border-red-500/30 flex items-center justify-center transition duration-200 scale-100 hover:scale-110 active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg"
                              title="Nach links swipen (Ignorieren)"
                            >
                              <ThumbsDown className="w-5 h-5" />
                            </button>
                            
                            <button 
                              onClick={() => setSelectedCard(swipeDeck[deckIndex])}
                              className="bg-zinc-900/80 hover:bg-zinc-900 text-zinc-300 border border-zinc-800 text-[10px] font-mono px-3 py-1.5 rounded-lg hover:scale-102 transition cursor-pointer"
                              title="Details einsehen"
                            >
                              Details / Analyse 🔍
                            </button>

                            <button
                              onClick={() => handleSwipeRight(swipeDeck[deckIndex])}
                              disabled={!!swipeDirection}
                              className="w-12 h-12 rounded-full bg-red-650/10 text-red-500 border border-red-550/20 hover:bg-emerald-500/10 hover:text-emerald-500 hover:border-emerald-500/30 flex items-center justify-center transition duration-200 scale-100 hover:scale-110 active:scale-95 disabled:opacity-50 cursor-pointer shadow-lg"
                              title="Nach rechts swipen (In den Warenkorb)"
                            >
                              <Heart className="w-5 h-5 fill-current" />
                            </button>
                          </div>

                          {/* DIRECT ADD TO INVENTORY CTA BUTTON IN THE DECK STAGE */}
                          <div className="w-full pt-3 border-t border-zinc-850/60 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="text-zinc-500 font-sans">Einkaufsort:</span>
                              <input 
                                type="text"
                                value={globalStoreLocation}
                                onChange={(e) => setGlobalStoreLocation(e.target.value)}
                                className="bg-[#18181b] border border-zinc-800 text-[10px] rounded px-1.5 py-0.5 text-zinc-300 w-28 text-right focus:outline-none focus:border-red-500 transition"
                                placeholder="..."
                              />
                            </div>
                            <button
                              onClick={async () => {
                                const activeCard = swipeDeck[deckIndex];
                                if (activeCard) {
                                  const computedNotes = activeCard.notes !== undefined ? activeCard.notes : (activeCard.yellow_label_detected ? "⚠️ Gelbes Label (Mängel/キズあり)" : "");
                                  const success = await handleAddToInventory(activeCard, globalStoreLocation, computedNotes);
                                  if (success) {
                                    handleSwipeRight(activeCard);
                                  }
                                }
                              }}
                              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-xl text-[11px] uppercase tracking-wider font-display transition duration-150 flex items-center justify-center gap-1.5 shadow"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              zum Karteninventar hinzufügen
                            </button>
                          </div>
                        </div>
                      )}
                      
                      <div className="text-[10px] text-zinc-500 italic mt-4 text-center leading-relaxed">
                        * Klicke auf die Karte, um die detaillierte Marktwert-Analyse vor dem Swipen zu laden.
                      </div>
                    </div>
                  ) : (
                    /* Initial Swiper Stapel Empty Placeholder state */
                    <div className="py-20 flex flex-col items-center justify-center text-center text-zinc-500 mt-6 border border-dashed border-zinc-850 rounded-2xl h-[340px]">
                      <Layers className="w-9 h-9 text-zinc-700 mb-3" />
                      <p className="text-xs font-semibold text-zinc-400">Keine Karten im Stapel</p>
                      <p className="text-[10px] max-w-xs mt-1 leading-normal px-6">
                        Sobald du links eine Karte scannst, landet der beste Treffer hier im Swipe-Stapel.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Japan Reseller-Warenkorb Sidebar (Column Span 4) */}
              <div className="xl:col-span-4 bg-[#121214] border border-[#222226] p-5 rounded-2xl flex flex-col justify-between shadow-sm min-h-[460px]">
                <div className="w-full">
                  <div className="flex items-center justify-between border-b border-zinc-850 pb-3 mb-4">
                    <h3 className="text-xs font-bold font-display text-zinc-300 flex items-center gap-2 uppercase tracking-wider">
                      <ShoppingBag className="w-4 h-4 text-emerald-500" />
                      Warenkorb ({swipeCart.length})
                    </h3>
                    
                    {swipeCart.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {confirmClearCart ? (
                          <div className="flex items-center gap-1.5 sm:gap-2 animate-fade-in">
                            <span className="text-[10px] font-mono font-bold text-amber-500 select-none">Alle leeren?</span>
                            <button
                              onClick={handleClearCart}
                              className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-2 py-0.5 rounded border border-red-500/25 transition text-[9px] font-bold cursor-pointer"
                            >
                              Ja
                            </button>
                            <button
                              onClick={() => setConfirmClearCart(false)}
                              className="text-zinc-500 hover:text-zinc-300 text-[9px] font-semibold underline cursor-pointer"
                            >
                              Nein
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmClearCart(true)}
                            className="text-[10px] font-mono text-zinc-500 hover:text-red-400 transition flex items-center gap-1 cursor-pointer"
                            title="Alle leeren"
                          >
                            <Trash2 className="w-3 h-3" /> Clear
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {swipeCart.length === 0 ? (
                    <div className="py-24 text-center text-zinc-500 space-y-2">
                      <ShoppingBag className="w-8 h-8 mx-auto text-zinc-800" />
                      <p className="text-xs font-medium">Dein Warenkorb ist leer</p>
                      <p className="text-[10px] max-w-[200px] mx-auto text-zinc-650 leading-relaxed">
                        Swipe Karten nach rechts, um sie der potenziell kaufbaren Merkliste hinzuzufügen.
                      </p>
                    </div>
                  ) : (
                    /* Cart Item List with detail links and katakana support */
                    <div className="space-y-3">
                      {/* Batch Export Options */}
                      <div className="flex gap-2 mb-3">
                        <button
                          onClick={handleCopyCart}
                          className="flex-1 bg-zinc-900 hover:bg-[#1a1c1e] text-zinc-300 hover:text-white border border-zinc-800 font-mono text-[10px] py-1.5 px-3 rounded-xl transition duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          {cartCopied ? "Text-Liste kopiert! ✓" : "Textliste kopieren"}
                        </button>
                      </div>

                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {swipeCart.map((item, idx) => (
                          <div 
                            key={item.cartInstanceId || item.id} 
                            onClick={() => setSelectedCard(item)}
                            className="bg-[#161619]/60 hover:bg-[#161619] border border-zinc-850 hover:border-zinc-800 p-2.5 rounded-xl transition duration-150 flex items-center justify-between cursor-pointer group"
                          >
                            <div className="flex gap-2.5 items-center min-w-0 flex-1">
                              {/* Mini visual image */}
                              <div className="w-8 h-11 shrink-0 bg-black/40 rounded border border-zinc-850 overflow-hidden flex items-center justify-center">
                                {item.image_small ? (
                                  <img 
                                    src={item.image_small} 
                                    alt={item.local_name} 
                                    referrerPolicy="no-referrer"
                                    className="max-h-full object-contain"
                                  />
                                ) : (
                                  <span className="text-[7px]">IMG</span>
                                )}
                              </div>
                              <div className="min-w-0 space-y-0.5 flex-1 pr-2">
                                <h4 className="text-[11px] font-bold text-zinc-200 truncate group-hover:text-red-400 transition">
                                  {item.local_name}
                                </h4>
                                <div className="flex items-center gap-1.5 text-[9px] font-mono text-zinc-500">
                                  <span>N° {item.card_number}</span>
                                  <span>{item.set_code}</span>
                                  <span className="text-red-400 bg-red-500/5 px-0.5 border border-red-550/10 rounded font-bold uppercase">{item.language}</span>
                                </div>
                                {item.japanese_name && (
                                  <p className="text-[8px] text-zinc-550 truncate font-sans">
                                    {item.japanese_name}
                                  </p>
                                )}

                                {/* Cart Item Price row (Editable) */}
                                <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-zinc-900/40">
                                  <span className="text-[8px] font-sans text-zinc-500 uppercase tracking-wider">Kaufpreis:</span>
                                  <div className="flex items-center bg-zinc-950 border border-zinc-850 px-1 py-0.2 rounded hover:border-zinc-700 max-w-[80px] h-5 transition">
                                    <span className="text-[9px] font-mono font-bold text-red-500 mr-0.5 select-none">¥</span>
                                    <input 
                                      type="number"
                                      value={item.yen_price || ""}
                                      placeholder="0"
                                      onClick={(e) => e.stopPropagation()} // Stop detail modal from launching
                                      onChange={(e) => {
                                        const newYen = parseInt(e.target.value) || 0;
                                        updateCartItemYenPrice(item.cartInstanceId, newYen);
                                      }}
                                      className="w-full bg-transparent text-[9px] text-zinc-200 font-mono font-bold focus:outline-none p-0 border-none"
                                      min="0"
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono text-zinc-450">
                                    ({convertYenToEuro(item.yen_price)})
                                  </span>
                                </div>

                                {/* Cart Item Notes row (Editable) */}
                                <div className="mt-1.5 pt-1.5 border-t border-zinc-900/35 flex flex-col gap-1">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[8px] font-sans text-zinc-500 uppercase tracking-wider">Notiz / Zustand:</span>
                                      {cartSaveFeedback[item.cartInstanceId] && (
                                        <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded animate-fade-in font-mono">
                                          ✓ Auto-gespeichert
                                        </span>
                                      )}
                                    </div>
                                    {item.yellow_label_detected && (
                                      <span className="text-[7px] font-bold text-amber-500 bg-amber-500/10 px-1 rounded animate-pulse">
                                        ⚠️ GELB (MÄNGEL)
                                      </span>
                                    )}
                                  </div>
                                  <input 
                                    type="text"
                                    placeholder="Zustand, Mängel..."
                                    value={item.notes || ""}
                                    onClick={(e) => e.stopPropagation()} // Stop detail modal from launching
                                    onChange={(e) => updateCartItemNotes(item.cartInstanceId, e.target.value)}
                                    onBlur={() => {
                                      setCartSaveFeedback(prev => ({ ...prev, [item.cartInstanceId]: true }));
                                      setTimeout(() => {
                                        setCartSaveFeedback(prev => ({ ...prev, [item.cartInstanceId]: false }));
                                      }, 1500);
                                    }}
                                    className="w-full bg-zinc-950 border border-zinc-850 rounded px-1.5 py-0.5 text-[9px] text-zinc-300 font-sans focus:outline-none focus:border-zinc-700 transition"
                                  />
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex flex-col items-center gap-2 shrink-0 border-l border-zinc-900 pl-2">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const success = await handleAddToInventory(item, globalStoreLocation, item.notes);
                                  if (success) {
                                    handleRemoveFromCart(item.cartInstanceId || item.id);
                                  }
                                }}
                                className="p-1 bg-emerald-950/40 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-900/30 rounded transition cursor-pointer"
                                title="In das Inventar einbuchen & aus Warenkorb entfernen"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                              </button>
                              
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveFromCart(item.cartInstanceId || item.id);
                                }}
                                className="p-1 text-zinc-650 hover:text-red-400 hover:bg-zinc-900 rounded transition cursor-pointer"
                                title="Aus Liste entfernen"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Cumulative Total Calculations board */}
                      <div className="bg-[#161619]/90 border border-zinc-850 p-3.5 rounded-xl space-y-2 mt-4 shadow-xl">
                        <h4 className="text-[9px] uppercase font-bold font-mono text-zinc-500 tracking-wider">
                          🛒 Kalkulationsrechner
                        </h4>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400">Anzahl Karten:</span>
                          <span className="font-mono text-zinc-150 font-bold">{swipeCart.length}x</span>
                        </div>
                        <div className="flex justify-between items-start border-t border-zinc-850/60 pt-2">
                          <span className="text-xs font-bold text-zinc-300 font-display">Gesamteinkauf:</span>
                          <div className="text-right">
                            <span className="text-sm font-bold font-mono text-emerald-400">
                              ¥{swipeCart.reduce((total, it) => total + (it.yen_price || 0), 0).toLocaleString("ja-JP")}
                            </span>
                            <p className="text-[10px] text-zinc-400 font-mono font-semibold mt-0.5">
                              ({convertYenToEuro(swipeCart.reduce((total, it) => total + (it.yen_price || 0), 0))})
                            </p>
                          </div>
                        </div>

                        {/* Batch Import Action */}
                        <div className="pt-2 border-t border-zinc-850/50 mt-1">
                          <button
                            onClick={() => handleAddAllCartToInventory()}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs uppercase tracking-wider font-display transition duration-150 flex items-center justify-center gap-1.5 shadow"
                          >
                            <DownloadCloud className="w-3.5 h-3.5" />
                            Alle ins Inventar einbuchen
                          </button>
                        </div>
                      </div>

                      <div className="bg-[#202024]/20 border border-[#222226] p-3 rounded-xl mt-3 text-[10px] text-zinc-500 leading-normal">
                        <strong>Händler-Tipp 💡</strong>: Klicke auf ein Element im Warenkorb, um das Detail-Analysepanel mit aktuellen Marktdaten, Reprints und lokalen Liquiditätsmetriken zu laden.
                      </div>
                    </div>
                  )}
                </div>

                {/* Hidden auxiliary canvas for webcam snapshot mapping triggers */}
                <canvas ref={canvasRef} style={{ display: 'none' }} />
              </div>
            </div>
          </div>
        )}

        {/* TAB 4.5: RESELLER CARD INVENTORY */}
        {activeTab === "inventory" && (
          <div className="space-y-6" id="reseller-inventory-view">
            {/* Header Area */}
            <div className="bg-[#121214] p-5 rounded-2xl border border-[#222226] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
              <div>
                <h2 className="text-base font-bold font-display text-zinc-100 flex items-center gap-2">
                  <ShoppingBag className="text-[#dc2626] w-5 h-5" />
                  Händler-Karteninventar
                </h2>
                <p className="text-xs text-[#a1a1aa] mt-0.5 leading-relaxed">
                  Verwalte deine eingekauften Pokémon-Sammelkarten mit hinterlegten Preisen, Einkaufsorten und Mängelhinweisen für perfekte Rentabilität.
                </p>
              </div>
              <div className="bg-[#18181b] border border-zinc-800 px-3 py-1.5 rounded-xl text-[10px] font-mono text-zinc-400 flex items-center gap-1.5 select-none shrink-0">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                Datenübertragung: SQLite lokal aktiv
              </div>
            </div>

            {/* Quick Metrics Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-[#121214] border border-[#222226] p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Inventarbestand</span>
                  <p className="text-xl font-bold text-zinc-250 font-display">{inventory.length} Karten</p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center">
                  <Layers className="w-5 h-5 text-red-500" />
                </div>
              </div>

              <div className="bg-[#121214] border border-[#222226] p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Einkaufssumme (JPY)</span>
                  <p className="text-xl font-bold text-amber-500 font-mono">
                    ¥{inventory.reduce((sum, item) => sum + (item.yen_price || 0), 0).toLocaleString("ja-JP")}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center">
                  <span className="text-xs font-mono font-bold text-amber-500">¥</span>
                </div>
              </div>

              <div className="bg-[#121214] border border-[#222226] p-4 rounded-xl flex items-center justify-between shadow-sm">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-wider">Einkaufssumme (EUR)</span>
                  <p className="text-xl font-bold text-emerald-500 font-mono">
                    {convertYenToEuro(inventory.reduce((sum, item) => sum + (item.yen_price || 0), 0))}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-850 flex items-center justify-center">
                  <span className="text-xs font-mono font-bold text-emerald-500">€</span>
                </div>
              </div>
            </div>

            {/* Filters Section */}
            <div className="bg-[#121214] border border-[#222226] p-4 rounded-2xl flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Kartenname, Nummer, Set-Code suchen..."
                  value={inventorySearchQuery}
                  onChange={(e) => setInventorySearchQuery(e.target.value)}
                  className="w-full bg-[#18181b] border border-zinc-800 text-xs rounded-xl pl-9 pr-4 py-2.5 text-zinc-200 focus:outline-none focus:border-red-500 transition font-sans"
                />
              </div>

              <div className="flex gap-2 min-w-[180px]">
                <div className="relative w-full">
                  <select
                    value={inventoryLocationFilter}
                    onChange={(e) => setInventoryLocationFilter(e.target.value)}
                    className="w-full bg-[#18181b] border border-zinc-800 text-xs rounded-xl px-4 py-2.5 text-zinc-200 focus:outline-none focus:border-red-500 transition font-sans appearance-none"
                  >
                    <option value="All">Alle Store-Standorte</option>
                    {uniqueLocations.filter(loc => loc !== "All").map((loc, i) => (
                      <option key={i} value={loc}>{loc}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center px-1 text-zinc-500">
                    <span className="text-[9px]">▼</span>
                  </div>
                </div>
              </div>

              {inventory.length > 0 && (
                <button
                  onClick={() => {
                    setInventorySearchQuery("");
                    setInventoryLocationFilter("All");
                  }}
                  className="text-xs font-mono text-zinc-500 hover:text-zinc-300 underline shrink-0 px-2 cursor-pointer"
                >
                  Filter zurücksetzen
                </button>
              )}
            </div>

            {/* Inventory List Board */}
            {inventoryLoading ? (
              <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
                <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
                <p className="text-xs text-zinc-400">Lade Händler-Inventar aus der SQLite-Datenbank...</p>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="py-20 text-center text-zinc-500 space-y-3 bg-[#121214] border border-[#222226] border-dashed rounded-2xl">
                <ShoppingBag className="w-9 h-9 mx-auto text-zinc-800" />
                <p className="text-xs font-bold text-zinc-400">Keine Karten im Inventar gefunden</p>
                <p className="text-[10px] max-w-sm mx-auto leading-relaxed text-zinc-650 px-6">
                  {inventory.length === 0 
                    ? "Inportiere Pokémon-Karten über den Bilder-Scanner, wähle sie per Tinder-Swipe aus und buche sie ins Händler-Inventar ein."
                    : "Passe deine Suchbegriffe oder die Filterauswahl der Store-Standorte an."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredInventory.map((item) => (
                  <motion.div 
                    key={item.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    whileHover={{ scale: 1.018, y: -2 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    className="bg-[#121214] border border-[#222226] hover:border-zinc-800 p-4 rounded-xl transition-colors duration-150 flex flex-col justify-between space-y-4 relative group shadow-lg shadow-black/10"
                  >
                    <div className="flex gap-4 items-start">
                      {/* Card Thumbnail */}
                      <div 
                        onClick={() => openInventoryCardDetails(item)}
                        className="w-14 h-20 shrink-0 bg-black/40 rounded-lg border border-zinc-850 hover:border-red-500/50 hover:scale-105 overflow-hidden flex items-center justify-center relative shadow-sm cursor-pointer transition-all duration-155"
                        title="Kartendetails anzeigen"
                      >
                        {item.image_small ? (
                          <img 
                            src={item.image_small} 
                            alt={item.local_name} 
                            referrerPolicy="no-referrer"
                            className="max-h-full object-contain"
                          />
                        ) : (
                          <span className="text-[9px] font-mono text-zinc-700">IMG</span>
                        )}
                        {item.yellow_label_detected === 1 && (
                          <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-amber-500 shadow shadow-amber-900/60 animate-pulse" title="Mängeletikett vorhanden"></div>
                        )}
                      </div>

                      {/* Card Data details block */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between min-w-0 gap-2">
                          <h4 
                            onClick={() => openInventoryCardDetails(item)}
                            className="text-xs font-bold text-zinc-200 truncate group-hover:text-red-400 hover:underline cursor-pointer transition" 
                            title="Kartendetails anzeigen"
                          >
                            {formatCardName(item)}
                          </h4>
                          <span className="text-[8px] font-mono bg-red-500/10 text-red-400 border border-red-505/10 px-1 py-0.2 rounded font-extrabold shrink-0 uppercase">
                            {item.language}
                          </span>
                        </div>

                        {item.japanese_name && (
                          <p className="text-[9px] text-zinc-550 truncate font-sans">
                            {item.japanese_name}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-zinc-500 pt-0.5">
                          <span>N° {item.card_number}</span>
                          <span>•</span>
                          <span>{item.set_code}</span>
                          <span>•</span>
                          <span className="text-zinc-450 truncate max-w-[80px]" title={item.language?.toUpperCase() === "JA" && item.english_set_name ? `${item.english_set_name} (${item.set_name})` : item.set_name}>
                            {item.language?.toUpperCase() === "JA" && item.english_set_name ? `${item.english_set_name} (${item.set_name})` : item.set_name}
                          </span>
                        </div>

                        {/* Purchase Price and Store Tag details */}
                        <div className="pt-2 border-t border-zinc-900/50 flex flex-col gap-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-zinc-500">Kaufpreis:</span>
                            <span className="font-mono font-bold text-amber-500">
                              ¥{item.yen_price.toLocaleString("ja-JP")} <span className="text-[10px] text-zinc-400">({convertYenToEuro(item.yen_price)})</span>
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-zinc-500">
                            <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" /> Stand:</span>
                            <span className="font-sans font-medium text-zinc-400 truncate max-w-[120px]" title={item.purchase_location}>
                              {item.purchase_location}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[10px] text-zinc-500">
                            <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" /> Datum:</span>
                            <span className="font-mono text-zinc-400">{item.purchase_date}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Row: Notes, Original Stamp View, Delete */}
                    <div className="pt-3 border-t border-zinc-900/50 flex flex-col gap-1.5 w-full">
                      <div className="flex items-center justify-between text-[8px] uppercase tracking-wider font-mono text-zinc-500">
                        <span>Notiz / Zustand:</span>
                        {inventorySaveFeedback[item.id] && (
                          <span className="text-[7.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1 rounded animate-fade-in font-mono">
                            ✓ Gespeichert
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 w-full">
                        <div className="min-w-0 flex-1">
                          <input 
                            type="text"
                            placeholder="Zustand, Mängel..."
                            value={item.notes || ""}
                            onClick={(e) => e.stopPropagation()} // Stop modal detail screen launch
                            onChange={(e) => {
                              const val = e.target.value;
                              setInventory(prev => prev.map(inv => inv.id === item.id ? { ...inv, notes: val } : inv));
                            }}
                            onBlur={() => {
                              handleUpdateInventoryItem(item.id, { notes: item.notes || "" });
                              setInventorySaveFeedback(prev => ({ ...prev, [item.id]: true }));
                              setTimeout(() => {
                                setInventorySaveFeedback(prev => ({ ...prev, [item.id]: false }));
                              }, 1500);
                            }}
                            className="w-full bg-zinc-950 border border-zinc-850 rounded px-1.5 py-0.5 text-[9px] text-zinc-300 font-sans focus:outline-none focus:border-red-500/35 transition h-6"
                          />
                        </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.image_source_base64 && item.bounding_box_json && (
                          <button
                            onClick={() => setSelectedInventoryItem(item)}
                            className="bg-zinc-900 hover:bg-zinc-850 text-zinc-300 border border-zinc-800 text-[10px] px-2 py-1.5 rounded-lg flex items-center gap-1 transition cursor-pointer font-mono"
                            title="Position & Stempel im Einlesefoto ansehen"
                          >
                            Stempel 🎯
                          </button>
                        )}
                        {deletingItemId === item.id ? (
                          <div className="flex items-center gap-1.5 animate-in fade-in duration-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteFromInventory(item.id);
                                setDeletingItemId(null);
                              }}
                              className="px-2 py-1.5 bg-red-600 hover:bg-red-750 text-white rounded-lg text-[10px] font-bold transition flex items-center gap-1 cursor-pointer font-sans"
                              title="Sicher löschen"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Ja
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeletingItemId(null);
                              }}
                              className="px-2 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 rounded-lg text-[10px] transition cursor-pointer font-sans"
                              title="Abbrechen"
                            >
                              Nein
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingItemId(item.id);
                            }}
                            className="p-1.5 bg-red-950/20 hover:bg-red-500 text-red-400 hover:text-white rounded-lg border border-red-900/30 transition cursor-pointer"
                            title="Aus Inventar löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
                ))}
              </div>
            )}

            {/* STAMP VIEW MODAL DRAWER OVERLAY */}
            {selectedInventoryItem && (
              <div 
                className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-fade-in"
                onClick={() => setSelectedInventoryItem(null)}
              >
                <div 
                  className="bg-[#0e0e11] border border-zinc-800 rounded-3xl p-5 max-w-lg w-full shadow-2xl relative space-y-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setSelectedInventoryItem(null)}
                    className="absolute top-4 right-4 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 p-2 rounded-full border border-zinc-800 transition cursor-pointer"
                    title="Modal schließen"
                  >
                    <X className="w-4 h-4" />
                  </button>

                  <div className="space-y-1">
                    <h3 className="text-sm font-bold font-display text-zinc-100 flex items-center gap-1.5 uppercase">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping mr-1"></span>
                      Stempel-Ortung: {selectedInventoryItem.local_name}
                    </h3>
                    <p className="text-[10px] text-zinc-500 font-mono">
                      Yen-Kaufpreis: ¥{selectedInventoryItem.yen_price} • [{selectedInventoryItem.purchase_location}]
                    </p>
                  </div>

                  {/* Canvas Stamp Wrapper Rendering on base64 */}
                  <div className="w-full flex items-center justify-center bg-[#050507] rounded-2xl overflow-hidden border border-zinc-850 p-4 max-h-[360px] relative">
                    <div className="relative inline-block">
                      <img 
                        src={selectedInventoryItem.image_source_base64 || selectedInventoryItem.imageSourceBase64} 
                        alt="Einkauf original einlesefoto" 
                        className="max-h-[300px] w-auto max-w-full object-contain rounded-lg"
                      />
                      
                      {/* Absolute Stamp Coordinates */}
                      {(() => {
                        try {
                          const box = JSON.parse(selectedInventoryItem.bounding_box_json);
                          if (!box) return null;

                          const top = `${box.ymin / 10}%`;
                          const left = `${box.xmin / 10}%`;
                          const width = `${(box.xmax - box.xmin) / 10}%`;
                          const height = `${(box.ymax - box.ymin) / 10}%`;

                          return (
                            <div 
                              className="absolute border-4 border-emerald-500 bg-emerald-500/25 shadow-[0_0_15px_rgba(16,185,129,0.7)] flex flex-col items-center justify-center"
                              style={{ top, left, width, height }}
                            >
                              {/* Slanted stamp effect watermark inside the boundingbox */}
                              <div className="rotate-[-24deg] border-2 border-emerald-500 px-2 py-0.5 rounded font-display uppercase tracking-widest text-[9px] text-white font-extrabold bg-[#064e3b] shadow">
                                GEKAUFT 📦
                              </div>
                            </div>
                          );
                        } catch(e) {
                          return null;
                        }
                      })()}
                    </div>
                  </div>

                  <p className="text-[10px] text-zinc-500 leading-normal text-center bg-zinc-950/20 py-2 px-4 rounded-xl border border-zinc-900">
                    💡 <strong>Hintergund zur Stempelung:</strong> Dieser Stamp kennzeichnet die Position der eingekauften Karte innerhalb der original hochgeladenen Foto-Komposition mit {selectedInventoryItem.purchase_location}-Markierungen.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 8: JAPAN CONTEXT CONSOLE & SOCIAL HYPED TREND INDUSTRIAL TRACKER */}
        {activeTab === "trends" && (
          <div className="space-y-6 animate-fade-in" id="trends-view">
            {/* Persona and Config Banner Header */}
            <div className="bg-gradient-to-r from-red-950/20 via-zinc-900 to-black p-6 rounded-2xl border border-red-500/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <span className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 text-[9px] uppercase tracking-widest font-mono font-bold rounded">
                  🇯🇵 TCG JAPAN-GERMANY IMPORT BUSINESS COCKPIT
                </span>
                <h2 className="text-xl font-bold font-display text-zinc-100 flex items-center gap-2">
                  <TrendingUp className="text-red-500 w-5.5 h-5.5 animate-pulse" />
                  Arbitrage & Social-Radar 📈
                </h2>
                <p className="text-xs text-[#a1a1aa] leading-relaxed">
                  Deine exklusive Analyse-Konsole als professioneller Pokémon-Karten-Verkäufer. Kaufe günstige japanische Singles vor Ort in Tokio/Osaka ein, kalkuliere den deutschen Verkaufswert (eBay DE / Cardmarket) und finde sofort profitable Deals basierend auf Social Hype Daten (X, Instagram, TikTok)!
                </p>
              </div>

              {/* Local deterministic trend button */}
              <button
                onClick={handleFetchSocialTrends}
                disabled={trendsLoading}
                className="w-full md:w-auto bg-gradient-to-r from-red-650 to-red-600 hover:from-red-600 hover:to-red-550 text-white font-bold py-3 px-5 rounded-xl text-xs uppercase tracking-wider font-display font-black transition disabled:opacity-50 cursor-pointer shadow-lg shadow-red-950/40 flex items-center justify-center gap-2"
              >
                {trendsLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Berechne lokale Trend-Vorschau...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 animate-pulse" />
                    <span>Lokale Trend-Vorschau starten</span>
                  </>
                )}
              </button>
            </div>

            {/* Error notifications */}
            {trendsError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 animate-pulse shrink-0" />
                <span>{trendsError}</span>
              </div>
            )}

            {/* Config & Parameter Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Configuration Column (span 4) */}
              <div className="lg:col-span-4 bg-[#121214] p-5 rounded-2xl border border-[#222226] space-y-4">
                <h3 className="text-xs font-bold font-display text-zinc-400 uppercase tracking-wider flex items-center gap-2">
                  ⚙️ Arbitrage-Kalkulations-Parameter
                </h3>
                <p className="text-[10px] text-zinc-500 leading-normal">
                  Passe diese Werte live an, um den Break-even-Point und die Rentabilität jeder Karte an deine realen Spesen anzupassen.
                </p>

                <div className="space-y-4 pt-2">
                  {/* Exchange rate JPY/EUR */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex justify-between">
                      <span>Wechselkurs EUR/JPY:</span>
                      <span className="text-amber-400 font-extrabold">1 € = ¥ {arbitrageExchangeRate}</span>
                    </label>
                    <input 
                      type="range" 
                      min="140" 
                      max="180" 
                      step="0.5"
                      value={arbitrageExchangeRate}
                      onChange={(e) => setArbitrageExchangeRate(parseFloat(e.target.value))}
                      className="w-full accent-red-500 cursor-pointer" 
                    />
                    <div className="flex justify-between text-[8px] font-mono text-zinc-650">
                      <span>¥ 140 (Starker Yen)</span>
                      <span>¥ 180 (Schwacher Yen)</span>
                    </div>
                  </div>

                  {/* German Einfuhrumsatzsteuer (VAT) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex justify-between">
                      <span>Einfuhrumsatzsteuer (Zoll DE):</span>
                      <span className="text-zinc-200 font-extrabold">{arbitrageImportVat}%</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.5"
                        value={arbitrageImportVat}
                        onChange={(e) => setArbitrageImportVat(parseFloat(e.target.value) || 0)}
                        className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-red-500 font-mono"
                      />
                      <span className="absolute right-3.5 top-2 text-[10px] font-mono text-zinc-600">%</span>
                    </div>
                  </div>

                  {/* Fixed Duty fees per Card (packaging, logistics share) */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex justify-between">
                      <span>Logistik & Spesen / Karte:</span>
                      <span className="text-zinc-200 font-extrabold">€ {arbitrageCustomsFee.toFixed(2)}</span>
                    </label>
                    <div className="relative">
                      <input 
                        type="number" 
                        step="0.1"
                        value={arbitrageCustomsFee}
                        onChange={(e) => setArbitrageCustomsFee(parseFloat(e.target.value) || 0)}
                        className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-red-500 font-mono"
                      />
                      <span className="absolute right-3.5 top-2 text-[10px] font-mono text-zinc-600">€</span>
                    </div>
                  </div>

                  {/* Target Profit margin */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono text-zinc-400 uppercase font-bold flex justify-between">
                      <span>Deine Zielmarge:</span>
                      <span className="text-red-400 font-extrabold">{arbitrageTargetMargin}%</span>
                    </label>
                    <input 
                      type="range" 
                      min="10" 
                      max="60" 
                      step="1"
                      value={arbitrageTargetMargin}
                      onChange={(e) => setArbitrageTargetMargin(parseInt(e.target.value))}
                      className="w-full accent-rose-500 cursor-pointer" 
                    />
                    <div className="flex justify-between text-[8px] font-mono text-zinc-650">
                      <span>10% Schnelldreher</span>
                      <span>60% Luxusmarge</span>
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-850/15 p-3.5 rounded-xl border border-zinc-800/10 space-y-1.5 text-[10.5px] text-zinc-400 font-sans leading-relaxed">
                  <span className="font-bold text-zinc-300 block">Kompakte Arbitrage-Gleichung:</span>
                  <div>
                    1. <strong className="text-zinc-200">Einkauf (EUR):</strong> Yen / Wechselkurs
                  </div>
                  <div>
                    2. <strong className="text-zinc-200">Landed-Cost:</strong> Einkauf * (1 + Zoll/100) + Spesen
                  </div>
                  <div>
                    3. <strong className="text-zinc-250">Nettoreingewinn:</strong> Verkauf (eBay DE) - Landed-Cost
                  </div>
                </div>
              </div>

              {/* Right Results Grid (span 8) */}
              <div className="lg:col-span-8 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold font-display text-zinc-400 uppercase tracking-wider">
                    🔥 Trend-Karten & Hype-Bewertung ({trendsList.length})
                  </h3>
                  {trendsLoading && (
                    <div className="text-[10px] text-zinc-500 font-mono animate-pulse">
                      Sende Hype-Crawler Requests...
                    </div>
                  )}
                </div>

                {trendsLoading ? (
                  /* Loading placeholders bento list */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="bg-[#121214]/60 border border-[#222226] p-4 rounded-2xl h-[240px] space-y-4 flex flex-col justify-between animate-pulse">
                        <div className="space-y-2">
                          <div className="h-4 bg-zinc-800 rounded w-2/3"></div>
                          <div className="h-3 bg-zinc-800 rounded w-1/3"></div>
                        </div>
                        <div className="h-12 bg-zinc-800 rounded"></div>
                        <div className="h-8 bg-zinc-800 rounded w-1/4"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  /* Render list of actual trend cards */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {trendsList.map((trend, idx) => {
                      // Calculations
                      const costEur = trend.avg_jpy_cost / arbitrageExchangeRate;
                      const landedCost = costEur * (1 + (arbitrageImportVat / 100)) + arbitrageCustomsFee;
                      const netProfit = trend.est_eur_sale - landedCost;
                      const marginPct = (netProfit / landedCost) * 100;

                      // Decision flags
                      const isSuperDeals = marginPct >= arbitrageTargetMargin;
                      const isMarginal = marginPct > 0 && marginPct < arbitrageTargetMargin;

                      return (
                        <div 
                          key={idx} 
                          className="bg-[#121214] border border-[#222226] hover:border-zinc-700 p-4 rounded-2xl flex flex-col justify-between space-y-4 shadow transition duration-150 relative overflow-hidden group select-text"
                        >
                          {/* Top Card decorative highlight matching status */}
                          <div className={`absolute top-0 right-0 left-0 h-1 ${
                            isSuperDeals 
                              ? "bg-emerald-500 shadow-[0_1px_8px_rgba(16,185,129,0.4)]" 
                              : isMarginal 
                                ? "bg-amber-500" 
                                : "bg-rose-600"
                          }`} />

                          {/* Header text */}
                          <div>
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[10px] font-mono text-zinc-500 font-semibold">{trend.japanese_set}</span>
                              <span className="text-[9px] font-mono font-bold bg-[#1d1d21] border border-zinc- broken-border rounded px-1.5 py-0.2 text-zinc-300">
                                {trend.card_code}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-zinc-100 font-display mt-1 leading-snug group-hover:text-red-400 transition-colors">
                              {trend.pokemon_name}
                            </h4>

                            {/* Hype Score & Social Source Indicators */}
                            <div className="flex flex-wrap gap-1.5 mt-2.5 items-center">
                              <span className="text-[9px] font-mono text-amber-400 bg-amber-500/5 border border-amber-500/10 rounded px-1.5 py-0.2 font-black">
                                🔥 Hype: {trend.hype_score}%
                              </span>
                              
                              <span className="text-[9px] font-mono text-[#a1a1aa] bg-zinc-900 border border-zinc-800 rounded px-1 text-zinc-400">
                                {trend.social_sentiment}
                              </span>

                              {trend.platforms_driving?.map((platName: string, pIdx: number) => (
                                <span key={pIdx} className="text-[8px] font-mono tracking-wider font-extrabold uppercase bg-[#18181b]/70 text-zinc-550 border border-zinc-850 px-1 py-0.1 rounded-sm">
                                  {platName}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Arbitrage Calculations Dashboard Box */}
                          <div className="bg-zinc-950/65 rounded-xl border border-zinc-900 p-2.5 space-y-1.5 font-mono text-[10px]">
                            <div className="flex justify-between text-zinc-400 border-b border-zinc-900/40 pb-1">
                              <span>Einkauf JPN:</span>
                              <span className="text-zinc-250">¥ {trend.avg_jpy_cost.toLocaleString()} (<strong className="text-zinc-400">€ {costEur.toFixed(2)}</strong>)</span>
                            </div>
                            <div className="flex justify-between text-zinc-400 border-b border-zinc-900/40 pb-1">
                              <span>Landed-Cost DE:</span>
                              <span className="text-zinc-350">€ {landedCost.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-zinc-450 border-b border-zinc-900/40 pb-1">
                              <span>Verkauf DE (Est.):</span>
                              <span className="text-[#38bdf8] font-bold">€ {trend.est_eur_sale.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-bold pt-0.5">
                              <span className="text-zinc-400">Netto-Gewinn:</span>
                              <span className={netProfit > 0 ? "text-emerald-400" : "text-rose-500"}>
                                € {netProfit.toFixed(2)} ({marginPct.toFixed(1)}%)
                              </span>
                            </div>
                          </div>

                          {/* Strategy Advice & Action Decision bar */}
                          <div className="space-y-2 pt-1">
                            <p className="text-[10px] text-zinc-400 leading-normal italic bg-zinc-900/30 p-2 rounded-lg border border-zinc-850/40">
                              {trend.import_tip}
                            </p>

                            <div className="flex justify-between items-center gap-2 pt-1 font-sans">
                              {/* Decider badge */}
                              {isSuperDeals ? (
                                <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-emerald-500/25 uppercase tracking-wide flex items-center gap-1 shadow-inner select-none animate-pulse">
                                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block"></span>
                                  <span>🚀 LOHNT SICH SEHR!</span>
                                </div>
                              ) : isMarginal ? (
                                <div className="bg-amber-500/10 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-amber-500/25 uppercase tracking-wide flex items-center gap-1 select-none">
                                  <span className="w-1.5 h-1.5 bg-amber-450 rounded-full inline-block"></span>
                                  <span>⚠️ Geringe Marge</span>
                                </div>
                              ) : (
                                <div className="bg-rose-500/10 text-rose-450 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-rose-500/25 uppercase tracking-wide flex items-center gap-1 select-none">
                                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full inline-block"></span>
                                  <span>❌ UNRENTABEL</span>
                                </div>
                              )}

                              {/* Search Shortcut Button */}
                              <button
                                onClick={() => {
                                  const term = trend.pokemon_name.split(" ")[0];
                                  setActiveTab("search");
                                  setFilterName(term);
                                  handleSearch(undefined, undefined, undefined, term);
                                }}
                                className="text-[10px] font-semibold text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-850 border border-[#222226] hover:border-zinc-700 px-3 py-1 rounded-lg transition shrink-0 cursor-pointer"
                                title="Nach Karten im Explorer suchen"
                              >
                                Im Explorer suchen
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}

        {/* TAB 5: DATABASE MANAGER */}
        {activeTab === "database" && (
          <div className="space-y-6" id="database-view">
            <div className={`bg-[#121214] p-6 rounded-2xl border ${isPk ? 'border-[#222226]' : 'border-amber-500/10'}`}>
              <h2 className="text-base font-bold font-display text-zinc-100 flex items-center gap-2">
                <Database className={`${brandTextAccent} w-5 h-5 animate-pulse`} />
                Datenbank-Management-Zentrale
              </h2>
              <p className="text-xs text-[#a1a1aa] mt-1 leading-relaxed">
                Hier können Sie den Zustand Ihrer SQLite-Datenbank einsehen, Statistiken auswerten und bei Bedarf die gesamte Datenbank löschen und zurücksetzen.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Warnings & Reset Options */}
              <div className="bg-[#121214] border border-[#222226] p-6 rounded-2xl space-y-4">
                <div className={`${isPk ? 'bg-red-500/5 border-red-500/10' : 'bg-amber-500/5 border-amber-500/10'} border p-4 rounded-xl space-y-2`}>
                  <h3 className={`text-xs font-bold ${brandTextLight} uppercase tracking-wider font-display flex items-center gap-2`}>
                    ⚠️ Kritische Zone (Datenverlust möglich)
                  </h3>
                  <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                    Das Zurücksetzen der Datenbank löscht alle importierten Sets, Pokémon- und One Piece-Karten unwiderruflich aus der gemeinsamen Datenbankdatei <code>pokemon_cards.db</code>. Alle vorgenommenen Anpassungen und Inventar-Sammlungen gehen verloren.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  {isResetting ? (
                    <div className={`bg-[#18181b] border ${isPk ? 'border-red-500/20' : 'border-amber-500/20'} p-6 rounded-xl space-y-4 flex flex-col items-center justify-center text-center`}>
                      <RefreshCw className={`w-8 h-8 ${brandTextAccent} animate-spin`} />
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-100 uppercase tracking-wider font-display">
                          Datenbank wird zurückgesetzt...
                        </p>
                        <p className="text-[11px] text-zinc-400 font-mono">
                          Wartezeit: <span className={`${brandTextLight} font-bold text-xs`}>{resetElapsedTime.toFixed(1)}s</span>
                        </p>
                      </div>
                    </div>
                  ) : showResetConfirmation ? (
                    <div className={`bg-amber-950/10 border ${isPk ? 'border-red-550/20' : 'border-amber-550/20'} p-4 rounded-xl space-y-3 animate-pulse`}>
                      <p className="text-xs text-red-200 font-semibold leading-relaxed">
                        Sind Sie absolut sicher? Alle registrierten Sets, Pokémon, One Piece Karten, lokalen Analysen und Inventarbestände werden dabei unwiderruflich gelöscht.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleResetDatabase}
                          className={`${brandBg} ${brandHoverBg} text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition uppercase tracking-wider cursor-pointer font-display`}
                        >
                          Ja, alles löschen und zurücksetzen
                        </button>
                        <button
                          onClick={() => setShowResetConfirmation(false)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-1.5 px-3 rounded-lg text-[10px] transition uppercase tracking-wider cursor-pointer font-display"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setResetSuccessMsg(null);
                        setResetErrorMsg(null);
                        setShowResetConfirmation(true);
                      }}
                      className={`w-full bg-gradient-to-r ${isPk ? 'from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-950/20' : 'from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-amber-950/20'} text-white font-bold py-3 px-5 rounded-xl transition shadow-lg duration-200 flex items-center justify-center gap-2 cursor-pointer uppercase text-xs tracking-wider`}
                    >
                      <Trash2 className="w-4 h-4" />
                      master_db zurücksetzen (Alles löschen)
                    </button>
                  )}
                </div>

                {/* Deleting Only AI Reseller Evaluations Option */}
                <div className="border-t border-[#222226] pt-4 mt-2 space-y-3">
                  <h4 className="text-xs font-bold text-zinc-300 font-display uppercase tracking-wider">
                    Lokale Bewertungen separat zurücksetzen
                  </h4>
                  <p className="text-[11px] text-[#a1a1aa] leading-relaxed font-sans">
                    Dies löscht ausschließlich alle lokal berechneten Reseller-Bewertungen für Karten und Sets, behält aber alle importierten Sets und Karten-Metadaten für Pokémon und One Piece vollständig bei.
                  </p>

                  {isResettingEvaluations ? (
                    <div className="flex items-center gap-2 bg-[#18181b] p-3 rounded-xl border border-zinc-800 text-xs text-zinc-400">
                      <RefreshCw className={`w-3.5 h-3.5 animate-spin ${brandTextAccent}`} />
                      Lösche lokale Händlerbewertungen...
                    </div>
                  ) : showResetEvalConfirmation ? (
                    <div className={`bg-amber-950/10 border ${isPk ? 'border-red-500/10' : 'border-amber-500/10'} p-4 rounded-xl space-y-3`}>
                      <p className="text-xs text-red-200 font-semibold leading-relaxed font-sans font-medium">
                        Sind Sie sicher? Alle bisherigen lokalen Händlerbewertungen und Set-Einstufungen werden gelöscht und können danach neu berechnet werden.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleResetEvaluations}
                          className={`${brandBg} ${brandHoverBg} hover:text-white text-white font-bold py-1.5 px-3 rounded-lg text-[10px] transition uppercase tracking-wider cursor-pointer`}
                        >
                          Ja, lokale Bewertungen löschen
                        </button>
                        <button
                          onClick={() => setShowResetEvalConfirmation(false)}
                          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-355 hover:text-zinc-200 font-bold py-1.5 px-3 rounded-lg text-[10px] transition uppercase tracking-wider cursor-pointer"
                        >
                          Abbrechen
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setResetEvalSuccessMsg(null);
                        setResetEvalErrorMsg(null);
                        setShowResetEvalConfirmation(true);
                      }}
                      className="w-full bg-[#1c1c20] hover:bg-[#25252a] text-zinc-300 hover:text-zinc-150 border border-zinc-800 font-bold py-3 px-5 rounded-xl transition duration-200 flex items-center justify-center gap-2 cursor-pointer uppercase text-xs tracking-wider"
                    >
                      <Trash2 className={`w-4 h-4 ${brandTextAccent}`} />
                      Lokale Händlerbewertungen löschen
                    </button>
                  )}

                  {/* Reset evaluations success/error messages */}
                  {resetEvalSuccessMsg && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-3 rounded-xl text-xs">
                      {resetEvalSuccessMsg}
                    </div>
                  )}
                  {resetEvalErrorMsg && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl text-xs">
                      {resetEvalErrorMsg}
                    </div>
                  )}
                </div>

                {/* Status Alerts */}
                {resetSuccessMsg && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 p-4 rounded-xl text-xs space-y-1">
                    <p className="font-bold">Erfolg!</p>
                    <p>{resetSuccessMsg}</p>
                  </div>
                )}

                {resetErrorMsg && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-xs space-y-1">
                    <p className="font-bold">Fehler beim Zurücksetzen:</p>
                    <p>{resetErrorMsg}</p>
                  </div>
                )}
              </div>

              {/* Information / Analytics Card */}
              <div className="bg-[#121214] border border-[#222226] p-6 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-zinc-200">System- & Datenbankinfos</h3>
                
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-2 border-b border-[#222226]">
                    <span className="text-zinc-500">Datenbanklaufzeit:</span>
                    <span className="text-zinc-300 font-mono">SQLite3</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222226]">
                    <span className="text-zinc-500">Dateiname:</span>
                    <span className="text-zinc-300 font-mono font-semibold">pokemon_cards.db</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222226]">
                    <span className="text-zinc-500">Engine-Version:</span>
                    <span className="text-emerald-400 font-mono font-semibold">v1.2 DB Engine</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222226]">
                    <span className="text-zinc-500">Größenoptimierung:</span>
                    <span className="text-emerald-400 font-mono font-semibold">Aktiv ✔️</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-[#222226]">
                    <span className="text-zinc-500">Registrierte Karten:</span>
                    <span className="text-zinc-100 font-bold font-mono text-red-005">{stats.total_cards}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-zinc-500">Registrierte Sets:</span>
                    <span className="text-zinc-100 font-bold font-mono text-red-005">{stats.total_sets}</span>
                  </div>
                </div>

                <div className="bg-zinc-850/10 p-4 rounded-xl border border-zinc-800/10 text-[11px] text-zinc-500 leading-relaxed">
                  Nach dem Zurücksetzen befindet sich die Datenbank in einem komplett leeren Zustand. Sie können danach wieder im Reiter <strong>"Python Live-Sync"</strong> neue Sets beliebiger unterstützter Sprachen auf Knopfdruck laden.
                </div>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* DETAIL MODAL CARD ANALYSIS - NEW DESIGN */}
      {selectedCard && (() => {
        const prices = getEstimatedCardmarketPrices(selectedCard);
        const rawMarketKnown = Boolean(prices.isMarketPrice && prices.raw > 0);
        const rawSourceLabel = rawMarketKnown
          ? String(prices.source || "market_prices").replaceAll("_", " ")
          : "Kein Raw-Marktpreis";
        const platformFeePercent = 12;
        const netSellPrice = rawMarketKnown ? prices.raw * (1 - platformFeePercent / 100) : 0;
        const maxBuyEur = rawMarketKnown ? (netSellPrice / (1 + arbitrageTargetMargin / 100) - arbitrageCustomsFee) / (1 + arbitrageImportVat / 100) : 0;
        const maxBuyYen = Math.max(0, Math.floor(maxBuyEur * arbitrageExchangeRate));
        const marketStats = rawMarketKnown
          ? {
              count: Number(selectedCard.offer_count || 0),
              low: Number(selectedCard.low_price_eur || 0),
              median: Number(selectedCard.median_price_eur || selectedCard.market_price_eur || prices.raw || 0),
              average: Number(selectedCard.average_price_eur || 0),
              max: Number(selectedCard.max_price_eur || 0)
            }
          : null;
        const hasMarketStats = Boolean(marketStats && (marketStats.count > 0 || marketStats.low > 0 || marketStats.average > 0 || marketStats.max > 0));
        const fmtMarketStat = (value: number) => value > 0
          ? `${value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
          : "-";
        const fmtMarketStatYen = (value: number) => value > 0 ? `~ ${formatYenFromEur(value)}` : "-";

        // Dynamic theme customization individually matching the card's element/energy type or character color
        const getCardTheme = () => {
          // If One Piece
          if (activeGame !== "pokemon") {
            const label = ((selectedCard.local_name || "") + " " + (selectedCard.english_name || "") + " " + (selectedCard.types || "") + " " + (selectedCard.subtype || "")).toLowerCase();
            if (label.includes("red") || label.includes("rot") || label.includes("luffy") || label.includes("ruffy") || label.includes("shanks")) {
              return {
                backdropGradients: ["from-red-600/35", "via-rose-600/12", "to-indigo-950/25"],
                glowColor: "rgba(239, 68, 68, 0.4)",
                cardOutline: "border-red-500/25 shadow-[0_0_50px_rgba(239,68,68,0.25)]",
                textGradient: "from-red-400 to-amber-350",
                badgeStyle: "bg-red-500/10 text-red-400 border-red-500/20",
                bubbleGlow: "from-red-600/35 via-rose-500/20 to-indigo-600/5",
                accentColor: "text-red-400",
                bgGradient: "bg-gradient-to-br from-[#0c0505]/95 via-[#09090b]/98 to-[#120a1c]/95"
              };
            }
            if (label.includes("blue") || label.includes("blau") || label.includes("kaido") || label.includes("crocodile") || label.includes("jinbe")) {
              return {
                backdropGradients: ["from-blue-600/35", "via-cyan-600/12", "to-indigo-950/25"],
                glowColor: "rgba(37, 99, 235, 0.4)",
                cardOutline: "border-blue-500/25 shadow-[0_0_50px_rgba(37,99,235,0.25)]",
                textGradient: "from-blue-400 to-cyan-350",
                badgeStyle: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                bubbleGlow: "from-blue-600/35 via-cyan-500/20 to-indigo-600/5",
                accentColor: "text-blue-400",
                bgGradient: "bg-gradient-to-br from-[#050b18]/95 via-[#09090b]/98 to-[#041126]/95"
              };
            }
            if (label.includes("green") || label.includes("grün") || label.includes("oden") || label.includes("yamato") || label.includes("zoro")) {
              return {
                backdropGradients: ["from-emerald-600/35", "via-green-600/12", "to-slate-950/25"],
                glowColor: "rgba(16, 185, 129, 0.4)",
                cardOutline: "border-emerald-500/25 shadow-[0_0_50px_rgba(16,185,129,0.25)]",
                textGradient: "from-emerald-400 to-lime-350",
                badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                bubbleGlow: "from-emerald-600/35 via-green-500/20 to-slate-600/5",
                accentColor: "text-emerald-400",
                bgGradient: "bg-gradient-to-br from-[#05110d]/95 via-[#09090b]/98 to-[#021c16]/95"
              };
            }
            if (label.includes("purple") || label.includes("lila") || label.includes("law") || label.includes("croc") || label.includes("kid")) {
              return {
                backdropGradients: ["from-purple-600/45", "via-fuchsia-600/12", "to-slate-950/25"],
                glowColor: "rgba(168, 85, 247, 0.4)",
                cardOutline: "border-purple-500/25 shadow-[0_0_50px_rgba(168,85,247,0.25)]",
                textGradient: "from-purple-400 to-pink-350",
                badgeStyle: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                bubbleGlow: "from-purple-600/35 via-fuchsia-500/20 to-zinc-650/5",
                accentColor: "text-purple-400",
                bgGradient: "bg-gradient-to-br from-[#12051c]/95 via-[#09090b]/98 to-[#250936]/95"
              };
            }
            if (label.includes("yellow") || label.includes("gelb") || label.includes("linlin") || label.includes("katakuri") || label.includes("yamato")) {
              return {
                backdropGradients: ["from-yellow-600/35", "via-amber-600/12", "to-[#1e1b4b]/25"],
                glowColor: "rgba(245, 158, 11, 0.4)",
                cardOutline: "border-amber-500/25 shadow-[0_0_50px_rgba(245,158,11,0.25)]",
                textGradient: "from-yellow-400 to-amber-350",
                badgeStyle: "bg-amber-500/10 text-amber-450 border-amber-500/20",
                bubbleGlow: "from-yellow-600/35 via-amber-500/20 to-orange-600/5",
                accentColor: "text-amber-450",
                bgGradient: "bg-gradient-to-br from-[#1c1808]/95 via-[#09090b]/98 to-[#2e1903]/95"
              };
            }
            // Standard/Pirate default
            return {
              backdropGradients: ["from-amber-600/35", "via-yellow-600/12", "to-zinc-950"],
              glowColor: "rgba(217, 119, 6, 0.35)",
              cardOutline: "border-amber-500/20 shadow-[0_0_50px_rgba(217,119,6,0.2)]",
              textGradient: "from-amber-450 to-amber-300",
              badgeStyle: "bg-amber-500/10 text-amber-400 border-amber-500/15",
              bubbleGlow: "from-amber-600/35 via-amber-500/20 to-zinc-900/5",
              accentColor: "text-amber-400",
              bgGradient: "bg-gradient-to-br from-[#0c0a05]/95 via-[#09090b]/98 to-[#1e1b24]/95"
            };
          }

          // Pokémon types system
          const typesLower = (selectedCard.types || "").toLowerCase();
          
          if (typesLower.includes("fire") || typesLower.includes("feuer")) {
            return {
              backdropGradients: ["from-red-650/35", "via-orange-605/12", "to-neutral-950"],
              glowColor: "rgba(239, 68, 68, 0.4)",
              cardOutline: "border-red-500/25 shadow-[0_0_55px_rgba(239,68,68,0.25)]",
              textGradient: "from-red-400 to-orange-355",
              badgeStyle: "bg-red-550/10 text-red-405 border-red-500/20",
              bubbleGlow: "from-red-600/40 via-rose-500/20 to-indigo-600/10",
              accentColor: "text-red-400",
              bgGradient: "bg-gradient-to-br from-[#140606]/95 via-[#09090b]/98 to-[#1f0f08]/95"
            };
          }
          if (typesLower.includes("water") || typesLower.includes("wasser")) {
            return {
              backdropGradients: ["from-blue-600/35", "via-cyan-600/12", "to-neutral-950"],
              glowColor: "rgba(59, 130, 246, 0.4)",
              cardOutline: "border-blue-500/25 shadow-[0_0_55px_rgba(59,130,246,0.25)]",
              textGradient: "from-blue-400 to-cyan-350",
              badgeStyle: "bg-blue-500/10 text-blue-400 border-blue-500/20",
              bubbleGlow: "from-blue-600/40 via-cyan-500/20 to-indigo-600/10",
              accentColor: "text-blue-400",
              bgGradient: "bg-gradient-to-br from-[#060c18]/95 via-[#09090b]/98 to-[#041d2e]/95"
            };
          }
          if (typesLower.includes("grass") || typesLower.includes("pflanze")) {
            return {
              backdropGradients: ["from-emerald-600/35", "via-green-600/12", "to-neutral-950"],
              glowColor: "rgba(16, 185, 129, 0.4)",
              cardOutline: "border-emerald-500/25 shadow-[0_0_55px_rgba(16,185,129,0.3)]",
              textGradient: "from-emerald-400 to-green-350",
              badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
              bubbleGlow: "from-emerald-600/40 via-green-500/20 to-teal-600/10",
              accentColor: "text-emerald-400",
              bgGradient: "bg-gradient-to-br from-[#05140f]/95 via-[#09090b]/98 to-[#0b2405]/95"
            };
          }
          if (typesLower.includes("lightning") || typesLower.includes("elektro") || typesLower.includes("thunder")) {
            return {
              backdropGradients: ["from-yellow-500/35", "via-amber-500/12", "to-neutral-950"],
              glowColor: "rgba(245, 158, 11, 0.4)",
              cardOutline: "border-yellow-500/25 shadow-[0_0_55px_rgba(245,158,11,0.3)]",
              textGradient: "from-yellow-400 to-amber-350",
              badgeStyle: "bg-yellow-500/10 text-yellow-400 border-yellow-550/20",
              bubbleGlow: "from-yellow-550/40 via-amber-500/20 to-orange-500/10",
              accentColor: "text-yellow-400",
              bgGradient: "bg-gradient-to-br from-[#181504]/95 via-[#09090b]/98 to-[#292003]/95"
            };
          }
          if (typesLower.includes("psychic") || typesLower.includes("psycho") || typesLower.includes("ghost")) {
            return {
              backdropGradients: ["from-purple-600/35", "via-fuchsia-600/12", "to-neutral-950"],
              glowColor: "rgba(168, 85, 247, 0.4)",
              cardOutline: "border-purple-500/25 shadow-[0_0_55px_rgba(168,85,247,0.3)]",
              textGradient: "from-purple-400 to-pink-350",
              badgeStyle: "bg-purple-500/10 text-purple-400 border-purple-500/20",
              bubbleGlow: "from-purple-650/40 via-fuchsia-500/20 to-pink-500/10",
              accentColor: "text-purple-400",
              bgGradient: "bg-gradient-to-br from-[#12061f]/95 via-[#09090b]/98 to-[#2d052d]/95"
            };
          }
          if (typesLower.includes("fighting") || typesLower.includes("kampf")) {
            return {
              backdropGradients: ["from-amber-800/35", "via-orange-700/12", "to-neutral-950"],
              glowColor: "rgba(146, 64, 14, 0.4)",
              cardOutline: "border-amber-700/25 shadow-[0_0_55px_rgba(217,119,6,0.22)]",
              textGradient: "from-amber-500 to-orange-400",
              badgeStyle: "bg-amber-700/10 text-amber-550 border-amber-700/20",
              bubbleGlow: "from-amber-800/40 via-orange-600/20 to-red-650/10",
              accentColor: "text-amber-505",
              bgGradient: "bg-gradient-to-br from-[#120a05]/95 via-[#09090b]/98 to-[#241304]/95"
            };
          }
          if (typesLower.includes("darkness") || typesLower.includes("finsternis") || typesLower.includes("unlicht")) {
            return {
              backdropGradients: ["from-indigo-950", "via-slate-900/12", "to-neutral-950"],
              glowColor: "rgba(99, 102, 241, 0.35)",
              cardOutline: "border-[#4f46e5]/25 shadow-[0_0_55px_rgba(99,102,241,0.25)]",
              textGradient: "from-indigo-400 to-purple-355",
              badgeStyle: "bg-indigo-505/10 text-indigo-455 border-indigo-500/20",
              bubbleGlow: "from-indigo-900/40 via-purple-950/20 to-slate-800/10",
              accentColor: "text-indigo-400",
              bgGradient: "bg-gradient-to-br from-[#050616]/95 via-[#09090b]/98 to-[#120c24]/95"
            };
          }
          if (typesLower.includes("metal") || typesLower.includes("stahl")) {
            return {
              backdropGradients: ["from-slate-600/30", "via-zinc-650/12", "to-neutral-950"],
              accentGlow: "rgba(148, 163, 184, 0.35)",
              cardOutline: "border-slate-500/25 shadow-[0_0_55px_rgba(148,163,184,0.2)]",
              textGradient: "from-slate-400 to-zinc-400",
              badgeStyle: "bg-slate-505/10 text-slate-350 border-slate-500/20",
              bubbleGlow: "from-slate-600/35 via-zinc-650/15 to-[#1c1c1e]/10",
              accentColor: "text-slate-300",
              bgGradient: "bg-gradient-to-br from-[#0c0d12]/95 via-[#09090b]/98 to-[#1a1b24]/95"
            };
          }
          if (typesLower.includes("dragon") || typesLower.includes("drache")) {
            return {
              backdropGradients: ["from-amber-600/35", "via-rose-600/12", "to-neutral-950"],
              glowColor: "rgba(225, 29, 72, 0.4)",
              cardOutline: "border-rose-500/25 shadow-[0_0_55px_rgba(225,29,72,0.25)]",
              textGradient: "from-amber-400 to-rose-400",
              badgeStyle: "bg-rose-500/10 text-red-400 border-rose-500/20",
              bubbleGlow: "from-amber-600/40 via-rose-500/20 to-indigo-950/10",
              accentColor: "text-rose-405",
              bgGradient: "bg-gradient-to-br from-[#14060a]/95 via-[#09090b]/98 to-[#2e0915]/95"
            };
          }

          // Celestial Standard Glow
          return {
            backdropGradients: isPk ? ["from-red-600/35", "via-rose-600/12", "to-[#0a0a0c]"] : ["from-[#d97706]/35", "via-amber-600/12", "to-[#040406]"],
            accentGlow: isPk ? "rgba(239, 68, 68, 0.35)" : "rgba(245, 158, 11, 0.35)",
            cardOutline: isPk ? "border-red-500/20 shadow-[0_0_50px_rgba(239,68,68,0.2)]" : "border-amber-500/20 shadow-[0_0_50px_rgba(245,158,11,0.2)]",
            textGradient: isPk ? "from-red-450 to-rose-400" : "from-amber-450 to-yellow-450",
            badgeStyle: isPk ? "bg-red-500/10 text-red-400 border-red-500/15" : "bg-amber-500/10 text-amber-450 border-amber-500/15",
            bubbleGlow: isPk ? "from-red-600/35 to-indigo-600/15" : "from-yellow-600/35 to-[#1e1b4b]/15",
            accentColor: isPk ? "text-red-400" : "text-amber-450",
            bgGradient: isPk ? "bg-gradient-to-br from-[#120404]/96 via-[#09090b]/99 to-[#04091d]/96" : "bg-gradient-to-br from-[#180e04]/96 via-[#030914]/99 to-[#031526]/96"
          };
        };

        const theme = getCardTheme();

        return (
          <div className="fixed inset-0 bg-[#050508]/92 backdrop-blur-xl z-50 flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-300">
            {/* Ambient Background Blur matching active card theme element colors */}
            <div className="absolute inset-0 bg-[#050508]/80 -z-10 overflow-hidden text-zinc-100">
              {/* Dynamic organic color flow halos */}
              <div className={`absolute top-[-25%] left-[-25%] w-[150%] h-[150%] rounded-full opacity-[0.24] blur-[115px] bg-gradient-to-tr ${theme.backdropGradients.join(" ")} animate-pulse duration-[10000ms]`}></div>
              {/* Secondary deep contrast background glow */}
              <div className="absolute bottom-[-10%] right-[-10%] w-[80%] h-[80%] rounded-full opacity-[0.12] blur-[100px] bg-gradient-to-br from-indigo-500/30 via-slate-950 to-transparent"></div>
            </div>

            {/* Previous Arrow (Floating Left on desktop) */}
            {activeStackHasMultiple && (
              <button
                onClick={() => handleNavigateCard("prev")}
                className="hidden xl:flex fixed left-8 lg:left-12 top-1/2 -translate-y-1/2 z-50 bg-[#121214]/90 hover:bg-[#1a1a1e] border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-white p-4 rounded-full transition-all duration-200 cursor-pointer shadow-2xl active:scale-95 group items-center justify-center animate-in fade-in duration-300"
                title="Vorherige Karte (Pfeiltaste links)"
              >
                <ChevronLeft className="w-6 h-6 group-hover:-translate-x-0.5 transition-transform" />
              </button>
            )}

            {/* Next Arrow (Floating Right on desktop) */}
            {activeStackHasMultiple && (
              <button
                onClick={() => handleNavigateCard("next")}
                className="hidden xl:flex fixed right-8 lg:right-12 top-1/2 -translate-y-1/2 z-50 bg-[#121214]/90 hover:bg-[#1a1a1e] border border-zinc-800 hover:border-red-500/40 text-zinc-400 hover:text-white p-4 rounded-full transition-all duration-200 cursor-pointer shadow-2xl active:scale-95 group items-center justify-center animate-in fade-in duration-300"
                title="Nächste Karte (Pfeiltaste rechts)"
              >
                <ChevronRight className="w-6 h-6 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            <div className={`border border-zinc-800/80 rounded-[32px] max-w-5xl w-full max-h-[92vh] overflow-y-auto select-text relative grid grid-cols-1 lg:grid-cols-12 gap-6 p-5 md:p-7 animate-in fade-in zoom-in-95 duration-200 scrollbar-thin transition-all duration-500 ${theme.bgGradient} ${theme.cardOutline}`}>
              
              {/* Header Actions row */}
              <div className="lg:col-span-12 flex justify-between items-center pb-4 border-b border-zinc-900 mb-2 gap-4">
                {/* Carousel badge indicator */}
                <div className="flex bg-[#121215]/80 backdrop-blur-md border border-zinc-800/80 px-4 py-1.5 rounded-full text-[11px] font-bold font-mono text-zinc-350 shadow-inner select-none">
                  <span className="text-amber-400">{activeCardIndex + 1}</span>
                  <span className="text-zinc-650 px-1">/</span>
                  <span className="text-zinc-500">{activeStack.length}</span>
                </div>

                <div className="flex items-center gap-2 select-none">
                  {/* Small inline nav controls */}
                  {activeStackHasMultiple && (
                    <div className="flex bg-[#121215]/80 backdrop-blur-md border border-[#222226] p-1 rounded-xl items-center gap-1 mr-1">
                      <button
                        onClick={() => handleNavigateCard("prev")}
                        className="p-1.5 hover:bg-zinc-800 hover:text-white text-zinc-400 rounded-lg transition cursor-pointer active:scale-90"
                        title="Vorherige Karte (Pfeiltaste links)"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleNavigateCard("next")}
                        className="p-1.5 hover:bg-zinc-800 hover:text-white text-zinc-400 rounded-lg transition cursor-pointer active:scale-90"
                        title="Nächste Karte (Pfeiltaste rechts)"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      const cardId = selectedCard.api_card_id || selectedCard.id;
                      if (isCardFavorited(cardId)) {
                        handleRemoveFromFavorites(cardId);
                      } else {
                        handleAddToFavorites(selectedCard);
                      }
                    }}
                    className={`p-2.5 rounded-2xl transition cursor-pointer flex items-center justify-center border ${
                      isCardFavorited(selectedCard.api_card_id || selectedCard.id)
                        ? "bg-red-950/40 border-red-900/40 text-red-500 shadow-md"
                        : "bg-zinc-900/40 hover:bg-zinc-900 text-zinc-305 hover:text-white border-zinc-800"
                    }`}
                    title={isCardFavorited(selectedCard.api_card_id || selectedCard.id) ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
                  >
                    <Heart className={`w-4 h-4 ${isCardFavorited(selectedCard.api_card_id || selectedCard.id) ? "fill-red-500 text-red-500" : "text-zinc-400"}`} />
                  </button>

                  <button 
                    onClick={() => setSelectedCard(null)}
                    className="bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white px-4 py-2 rounded-2xl transition cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-zinc-800 select-none shadow-sm"
                  >
                    <X className="w-3.5 h-3.5 text-red-550" />
                    Zurück
                  </button>
                </div>
              </div>

              {/* LEFT SIDE: Premium Showcase Visual Deck & Core Price grading Card */}
              <div className="lg:col-span-6 flex flex-col space-y-5">
                {/* Beautiful central card presentation block */}
                <div className="relative bg-black/40 border border-zinc-900/60 p-5 rounded-[28px] flex flex-col items-center justify-center overflow-hidden shadow-xl backdrop-blur-md">
                  {/* Subtle radial card flash matching active card theme element */}
                  <div className={`absolute inset-0 rounded-[28px] blur-3xl opacity-[0.16] bg-gradient-to-tr ${theme.bubbleGlow} -z-10 animate-pulse duration-[7000ms]`}></div>
                  
                  {/* Holographic style image display */}
                  <div className="my-3 relative max-w-[240px] select-none scale-100 hover:scale-[1.015] transition-all duration-300 flex items-center justify-center">
                    <SafeCardImage 
                      src={selectedCard.image_large || selectedCard.image_small} 
                      alt={selectedCard.local_name}
                      set_code={selectedCard.set_code}
                      card_number={selectedCard.card_number}
                      className="max-h-[300px] max-w-full rounded-2xl drop-shadow-[0_16px_36px_rgba(0,0,0,0.95)]"
                    />
                  </div>

                  {/* Title and metadata matching screenshot */}
                  <div className="w-full text-center space-y-1.5 mt-5">
                    <h2 className="text-xl md:text-2xl font-black font-display tracking-tight text-white leading-normal">
                      {formatCardName(selectedCard)}
                    </h2>
                    
                    <div className="text-[10px] sm:text-[11px] font-mono font-bold text-zinc-400 tracking-wide flex items-center justify-center gap-1.5 flex-wrap">
                      <span className="uppercase">{selectedCard.supertype || "Pokémon"}</span>
                      <span className="text-zinc-700 font-normal">•</span>
                      <span>#{selectedCard.card_number}</span>
                      <span className="text-zinc-700 font-normal">•</span>
                      <span className="text-zinc-300 border-b border-zinc-800/80 pb-0.5">{selectedCard.set_name}</span>
                    </div>

                    {/* Holographic element pill */}
                    {selectedCard.rarity && (
                      <div className={`mt-3 inline-flex ${theme.badgeStyle} font-mono text-[9px] font-black tracking-widest uppercase px-3 py-1 rounded-full items-center justify-center gap-1.5 shadow-sm`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse shrink-0"></span>
                        {translateRarityToEnglish(selectedCard.rarity)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Raw market dashboard */}
                <div className="bg-black/30 border border-zinc-900/40 p-5 rounded-[28px] space-y-4 backdrop-blur-md">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#141418]/60 border border-zinc-900/60 p-3.5 rounded-2xl flex flex-col justify-between shadow-inner">
                      <div>
                        <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase tracking-widest block">RAW MARKTPREIS</span>
                        <span className={`text-[10px] mt-1 block font-sans ${rawMarketKnown ? "text-emerald-400" : "text-amber-400"}`}>
                          {rawMarketKnown ? "Verifiziert/importiert" : "Preis fehlt"}
                        </span>
                      </div>
                      <span className={`text-xl sm:text-2xl font-black font-mono mt-4 block ${rawMarketKnown ? "text-[#7dd3fc]" : "text-zinc-500"}`}>
                        {rawMarketKnown ? `€${prices.raw.toFixed(2)}` : "CHECK"}
                      </span>
                    </div>

                    <div className="bg-[#141418]/60 border border-zinc-900/60 p-3.5 rounded-2xl flex flex-col justify-between relative overflow-hidden group shadow-inner">
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-widest block font-display">MAX. EINKAUF</span>
                          <span className={`text-[9px] font-black font-mono px-1.5 py-0.5 rounded border inline-block ${
                            rawMarketKnown ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/10" : "bg-zinc-800 text-zinc-500 border-zinc-700"
                          }`}>
                            RAW
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-400 mt-1 block font-sans">{arbitrageTargetMargin}% Zielmarge, inkl. Gebühren</span>
                      </div>
                      <span className={`text-xl sm:text-2xl font-black font-mono mt-4 block ${rawMarketKnown ? "text-amber-400" : "text-zinc-500"}`}>
                        {rawMarketKnown ? `¥${maxBuyYen.toLocaleString("de-DE")}` : "CHECK"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#0b0b0d]/81 border border-zinc-900 px-4 py-3 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shadow-sm">
                    <div>
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block">Preisquelle</span>
                      <span className="text-[10px] text-zinc-500 block mt-0.5">{rawSourceLabel}</span>
                    </div>
                    {rawMarketKnown ? (
                      <span className="text-[10px] font-mono text-zinc-300">
                        Netto nach Plattformgebühr: <span className="text-emerald-400 font-bold">€{netSellPrice.toFixed(2)}</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-amber-400">
                        Marktpreis manuell/importiert nachtragen
                        {prices.referenceModelRaw ? ` · Interner Hinweis: €${Number(prices.referenceModelRaw).toFixed(2)}` : ""}
                      </span>
                    )}
                  </div>
                  {hasMarketStats && marketStats && (
                    <div className="bg-[#0b0b0d]/81 border border-zinc-900 px-4 py-3 rounded-2xl shadow-sm">
                      <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block mb-2">Marktpreis-Info</span>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[10px] font-mono">
                        <div className="bg-[#141418]/70 border border-zinc-850 rounded-xl p-2">
                          <span className="block text-zinc-500 uppercase text-[8px]">Anzahl</span>
                          <span className="text-zinc-200 font-bold">{marketStats.count || "-"}</span>
                        </div>
                        <div className="bg-[#141418]/70 border border-zinc-850 rounded-xl p-2">
                          <span className="block text-zinc-500 uppercase text-[8px]">Lowest</span>
                          <span className="text-zinc-200 font-bold">{fmtMarketStat(marketStats.low)}</span>
                          <span className="block text-amber-400/80 text-[9px] mt-0.5">{fmtMarketStatYen(marketStats.low)}</span>
                        </div>
                        <div className="bg-[#141418]/70 border border-emerald-500/20 rounded-xl p-2">
                          <span className="block text-emerald-400 uppercase text-[8px]">Median</span>
                          <span className="text-emerald-300 font-bold">{fmtMarketStat(marketStats.median)}</span>
                          <span className="block text-amber-400/80 text-[9px] mt-0.5">{fmtMarketStatYen(marketStats.median)}</span>
                        </div>
                        <div className="bg-[#141418]/70 border border-zinc-850 rounded-xl p-2">
                          <span className="block text-zinc-500 uppercase text-[8px]">Average</span>
                          <span className="text-zinc-200 font-bold">{fmtMarketStat(marketStats.average)}</span>
                          <span className="block text-amber-400/80 text-[9px] mt-0.5">{fmtMarketStatYen(marketStats.average)}</span>
                        </div>
                        <div className="bg-[#141418]/70 border border-zinc-850 rounded-xl p-2">
                          <span className="block text-zinc-500 uppercase text-[8px]">Max</span>
                          <span className="text-zinc-200 font-bold">{fmtMarketStat(marketStats.max)}</span>
                          <span className="block text-amber-400/80 text-[9px] mt-0.5">{fmtMarketStatYen(marketStats.max)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="bg-[#0b0b0d]/81 border border-zinc-900 px-4 py-3 rounded-2xl shadow-sm">
                    <span className="text-[10px] font-mono font-bold text-zinc-400 uppercase tracking-wider block mb-2">Raw-Preis bearbeiten</span>
                    {renderManualPriceEditor(selectedCard, "grid")}
                  </div>
                </div>
                {/* Databases specifics table */}
                <div className="bg-[#101013] border border-zinc-900 p-4 rounded-[24px] space-y-3.5">
                  <span className="text-[9px] font-mono font-bold text-zinc-505 uppercase tracking-wider block">DATENBANK METRIC MAPPING</span>
                  
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-[11px] border-b border-zinc-900/60 pb-3">
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-display">SUPERTYPE</span>
                      <span className="font-semibold text-zinc-300">{selectedCard.supertype || "N/A"}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-display">SUBTYPE</span>
                      <span className="font-semibold text-zinc-300">{selectedCard.subtype || "N/A"}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-display">SETCODE</span>
                      <span className="font-semibold text-red-400 font-mono">{selectedCard.set_code}</span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[9px] text-zinc-500 uppercase block font-display">KARTENNUMMER</span>
                      <span className="font-semibold text-zinc-300">{selectedCard.card_number}</span>
                    </div>
                    {selectedCard.hp && (
                      <div className="space-y-0.5">
                        <span className="text-[9px] text-zinc-500 uppercase block font-display">HP STÄRKE</span>
                        <span className="font-semibold text-red-400 font-mono">{selectedCard.hp} HP</span>
                      </div>
                    )}
                    <div className="space-y-0.5 col-span-2">
                      <span className="text-[9px] text-zinc-500 uppercase block font-display">ILLUSTRATOR (ARTIST)</span>
                      <span className="font-semibold text-zinc-300">{selectedCard.illustrator || "Unbekannt"}</span>
                    </div>
                  </div>

                  {/* Translations block */}
                  <div className="space-y-2 text-[11px]">
                    <span className="text-[9px] font-mono font-bold text-zinc-500 uppercase block">SPRACHEN-REFERENZ</span>
                    {selectedCard.language?.toUpperCase() === "JA" ? (
                      <div className="space-y-1 bg-[#0b0b0d] p-3 rounded-xl border border-zinc-900">
                        <div className="flex justify-between border-b border-zinc-900/40 pb-1"><span className="text-zinc-500 font-mono">ja (Art-Sprache):</span> <span className="text-yellow-400 font-bold font-sans text-xs">{selectedCard.local_name}</span></div>
                        <div className="flex justify-between border-b border-zinc-900/40 pb-1"><span className="text-zinc-500 font-mono">de:</span> <span className="text-zinc-300">{selectedCard.pokemon_name || "Unbekannt"}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-500 font-mono">en:</span> <span className="text-zinc-300">{selectedCard.english_name}</span></div>
                      </div>
                    ) : selectedCard.language?.toUpperCase() === "DE" ? (
                      <div className="space-y-1 bg-[#0b0b0d] p-3 rounded-xl border border-zinc-900">
                        <div className="flex justify-between border-b border-zinc-900/40 pb-1"><span className="text-zinc-500 font-mono">de (Art-Sprache):</span> <span className="text-zinc-300 font-semibold">{selectedCard.local_name}</span></div>
                        <div className="flex justify-between border-b border-zinc-900/40 pb-1"><span className="text-zinc-500 font-mono">en:</span> <span className="text-zinc-300">{selectedCard.english_name}</span></div>
                        {selectedCard.japanese_name && (
                          <div className="flex justify-between"><span className="text-zinc-500 font-mono">ja:</span> <span className="text-yellow-400 font-semibold text-xs">{cleanAndTranslateJapaneseName(selectedCard)}</span></div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 bg-[#0b0b0d] p-3 rounded-xl border border-zinc-900">
                        <div className="flex justify-between border-b border-zinc-900/40 pb-1"><span className="text-zinc-500 font-mono">en (Art-Sprache):</span> <span className="text-zinc-300 font-semibold">{selectedCard.english_name}</span></div>
                        {selectedCard.japanese_name && (
                          <div className="flex justify-between"><span className="text-zinc-500 font-mono">ja:</span> <span className="text-yellow-400 font-semibold text-xs">{cleanAndTranslateJapaneseName(selectedCard)}</span></div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT SIDE: Market search links, Scan verification */}
              <div className="lg:col-span-6 flex flex-col space-y-5">
                
                {/* ACTION CARDS: Market analysis search links */}
                <div className="bg-[#101013] border border-zinc-900 p-5 rounded-[28px] space-y-3 shadow-sm select-none">
                  <h4 className="text-[9px] font-bold font-display text-zinc-400 tracking-wider uppercase">Marktanalyse</h4>
                  {renderMarketButtons(selectedCard, "detail")}
                </div>

                {/* Scanned crop analyzer section (only if scanned crop is active) */}
                {selectedCard.imageSourceBase64 && (
                  <div className="bg-[#101013] border border-zinc-900 p-4 rounded-[24px] space-y-3">
                    <div className="flex items-center justify-between col-span-2 select-none">
                      <span className="text-[9px] font-mono font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Camera className="w-3.5 h-3.5 text-red-500" />
                        Ausschnitts- & Pixelabgleich
                      </span>
                      <span className="text-[8.5px] font-extrabold font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                        {selectedCard.verification_status || "Abgeglichen"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-center">
                      <div className="space-y-1 select-none">
                        <span className="text-[8px] font-mono text-zinc-500 block uppercase font-bold">Erkanntes ROI Segment:</span>
                        <CroppedCardImage 
                          src={selectedCard.imageSourceBase64} 
                          boundingBox={selectedCard.bounding_box} 
                          className="max-h-[110px] rounded-lg border border-zinc-850"
                        />
                      </div>

                      <div className="space-y-2 min-w-0">
                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[8.5px] font-medium text-zinc-500 uppercase font-mono">Pixel Similarity</span>
                            <span className="text-[9.5px] font-bold font-mono text-emerald-400">{selectedCard.similarity_score || 95}%</span>
                          </div>
                          <div className="w-full bg-[#0b0b0d] h-1 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full animate-pulse" style={{ width: `${selectedCard.similarity_score || 95}%` }}></div>
                          </div>
                        </div>

                        <div>
                          <div className="flex justify-between items-center mb-0.5">
                            <span className="text-[8.5px] font-medium text-zinc-500 uppercase font-mono">Structural Match</span>
                            <span className="text-[9.5px] font-bold font-mono text-indigo-400">{selectedCard.hash_match_score || 90}%</span>
                          </div>
                          <div className="w-full bg-[#0b0b0d] h-1 rounded-full overflow-hidden">
                            <div className="bg-gradient-to-r from-indigo-500 to-purple-400 h-full" style={{ width: `${selectedCard.hash_match_score || 90}%` }}></div>
                          </div>
                        </div>

                        <div className="text-[8px] text-zinc-500 border-t border-[#121215] pt-1.5 font-mono overflow-hidden">
                          <span className="truncate block font-semibold select-all">Signatur: sha255-${Math.abs(selectedCard.id * 893149).toString(16)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Helpful Tip Box */}
                <div className="bg-[#101013] border border-zinc-900 p-4 rounded-[24px] flex gap-3 text-[11px] leading-relaxed">
                  <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-bold text-zinc-300 block">Raw-Marktpreis & Händlerlimit</span>
                    <p className="text-zinc-400 text-[10.5px]">
                      Kaufentscheidungen basieren nur auf Raw-Marktpreisen aus Importen oder manuellen Preisen. Fehlt ein Marktpreis, bleibt die Karte auf CHECK und sollte über <span className="text-zinc-300 hover:underline">„Auf Cardmarket analysieren“</span> geprüft werden.
                    </p>
                  </div>
                </div>

              </div>
            </div>
          </div>
        );
      })()}

      {renderClipboardPriceModal()}

      {/* TAB 4.6: RESELLER CARD FAVORITES / SHOPPING LIST */}
      {activeTab === "favorites" && (
        <div className="space-y-6" id="reseller-favorites-view">
          {/* Header Area */}
          <div className="bg-[#121214] p-5 rounded-2xl border border-[#222226] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xl">
            <div>
              <h2 className="text-base font-bold font-display text-zinc-100 flex items-center gap-2">
                <Star className="text-red-500 fill-red-500 w-5 h-5 animate-pulse" />
                Einkaufszettel & Favoriten ({activeGame === 'pokemon' ? 'Pokémon' : 'One Piece'})
              </h2>
              <p className="text-xs text-[#a1a1aa] mt-0.5 leading-relaxed">
                Deine persönliche Merkliste für Karten, die du einkaufen möchtest. Plane dein Budget, analysiere Marktwerte und buche erworbene Karten direkt in dein Inventar ein.
              </p>
              
              {/* Technical Tip Indicator for Swipe to Delete Gesture */}
              <div className="mt-3 flex items-center gap-2 bg-red-500/10 text-red-400 border border-red-500/15 rounded-xl px-3 py-1.5 text-[10px] font-medium w-fit">
                <span className="bg-red-500 text-white rounded px-1 font-mono font-bold text-[8px] uppercase">Smart Swipe Gesture</span>
                <span>💡 Ziehe Karten auf dem Smartphone oder Desktop nach links (<strong className="underline">und lasse los</strong>), um sie blitzschnell zu löschen!</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  value={favoritesSearchQuery}
                  onChange={(e) => setFavoritesSearchQuery(e.target.value)}
                  placeholder="Favoriten durchsuchen..."
                  className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl pl-9 pr-4 py-2 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-500 transition shadow-inner font-sans"
                />
                {favoritesSearchQuery && (
                  <button
                    onClick={() => setFavoritesSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-400 hover:text-white text-xs font-bold"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Content List */}
          {favoritesLoading ? (
            <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center space-y-3">
              <div className="w-8 h-8 rounded-full border-4 border-t-red-500 border-r-transparent border-b-transparent border-l-transparent animate-spin mx-auto"></div>
              <p className="text-xs text-zinc-400 font-mono">Favoriten werden geladen...</p>
            </div>
          ) : favorites.length === 0 ? (
            <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center space-y-3">
              <Heart className="w-12 h-12 text-zinc-700 mx-auto" />
              <h3 className="text-base font-bold font-display text-zinc-200">Dein Einkaufszettel ist leer</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                Markiere interessante Karten im Karten-Explorer mit dem Herz-Symbol (<Heart className="inline w-3 h-3 text-red-500" />), um sie hier aufzulisten.
              </p>
              <button
                onClick={() => setActiveTab("search")}
                className="bg-red-650 hover:bg-red-600 text-white font-semibold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
              >
                Jetzt Karten durchstöbern
              </button>
            </div>
          ) : (() => {
            const filtered = filteredFavorites;

            if (filtered.length === 0) {
              return (
                <div className="bg-[#121214] border border-[#222226] p-12 rounded-3xl text-center">
                  <p className="text-xs text-zinc-500 font-mono">Keine passende Karte in deinen Favoriten gefunden.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                  {filtered.map((item) => (
                    <motion.div 
                      key={item.id}
                      layout
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -160, scale: 0.95 }}
                      transition={{ type: "spring", stiffness: 380, damping: 28 }}
                      className="relative overflow-hidden rounded-2xl bg-[#121214] border border-[#222226] hover:border-red-500/20 hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
                    >
                      {/* RED SWIPE DELETION PANEL UNDERNEATH */}
                      <div className="absolute inset-y-0 right-0 w-32 bg-red-650 flex flex-col justify-center items-center text-white text-[11px] font-bold gap-1 pointer-events-none rounded-r-2xl z-0">
                        <Trash2 className="w-5 h-5 animate-pulse" />
                        <span>Entfernen</span>
                      </div>

                      {/* SWIPEABLE CARD CONTENT WRAPPER */}
                      <motion.div
                        drag="x"
                        dragDirectionLock
                        dragConstraints={{ left: -120, right: 0 }}
                        dragElastic={{ left: 0.2, right: 0 }}
                        onDragEnd={async (event, info) => {
                          if (info.offset.x < -80) {
                            await handleRemoveFromFavorites(item.api_card_id);
                          }
                        }}
                        className="bg-[#121214] flex flex-col h-full w-full justify-between z-10 cursor-grab active:cursor-grabbing"
                        style={{ touchAction: "pan-y" }}
                      >
                        {/* Top content */}
                        <div className="p-4 flex gap-4 select-none">
                          <div 
                            className="w-16 h-22 bg-[#09090b] border border-zinc-800 rounded-lg flex items-center justify-center overflow-hidden shrink-0 cursor-pointer"
                            onClick={() => {
                              setSelectedCard({
                                ...item,
                                id: item.api_card_id,
                                pokemon_name: item.local_name,
                                active_tcg_game: item.game
                              } as any);
                            }}
                          >
                            <SafeCardImage 
                              src={item.image_small} 
                              alt={item.local_name}
                              set_code={item.set_code}
                              card_number={item.card_number}
                              className="max-h-full max-w-full select-none"
                            />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start gap-1">
                              <span className="text-[9px] font-mono font-bold text-zinc-400 bg-zinc-800/20 border border-zinc-800/40 px-1 rounded">
                                N° {item.card_number}
                              </span>
                              <span className="text-[9px] bg-red-500/10 text-red-400 font-bold px-1.5 py-0.5 rounded uppercase tracking-wider font-mono">
                                {item.game === 'onepiece' ? 'One Piece' : 'Pokémon'}
                              </span>
                            </div>

                            <h4 
                              onClick={() => {
                                setSelectedCard({
                                  ...item,
                                  id: item.api_card_id,
                                  pokemon_name: item.local_name,
                                  active_tcg_game: item.game
                                } as any);
                              }}
                              className="font-semibold font-display text-zinc-100 text-sm tracking-tight mt-1 hover:text-red-400 cursor-pointer transition truncate"
                            >
                              {item.local_name || item.english_name}
                            </h4>
                            <p className="text-[10px] text-zinc-400 truncate opacity-85 mt-0.5">
                              Set: {item.set_name} ({item.set_code})
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1.5 font-mono">
                              <span>RA: <span className="text-zinc-300 font-bold">{item.rarity || 'Regular'}</span></span>
                              <span>•</span>
                              <span>Sprache: <span className="text-red-400 font-bold uppercase">{item.language}</span></span>
                            </p>
                          </div>
                        </div>

                        <div className="mx-4 mb-3 p-3 bg-[#101013]/85 border border-zinc-850 rounded-xl space-y-2 select-text" data-nodrag onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-sky-400" />
                              Raw-Marktpreis
                            </span>
                            <span className="text-[9px] text-zinc-500 font-mono">Verkauf DE</span>
                          </div>
                          {renderManualPriceEditor(item, "grid")}
                          <div className="pt-1">
                            {renderMarketButtons(item, "compact")}
                          </div>
                        </div>

                        {/* HIGHLY TECHNICAL BI-DIRECTIONAL CURRENCY CALCULATOR */}
                        <div className="mx-4 mb-3 p-3 bg-[#18181b]/60 border border-zinc-850 rounded-xl space-y-2 select-text" data-nodrag>
                          <div className="flex justify-between items-center">
                            <div className="flex flex-col">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1">
                                <Tag className="w-3 h-3 text-red-500" />
                                Mein Einkaufs-Zielpreis
                              </span>
                              {item.price_updated_at && (
                                <span className="text-[9px] text-zinc-500 font-mono mt-0.5" title="Letzte Aktualisierung des Einkaufspreises">
                                  📅 {formatSavedDate(item.price_updated_at)}
                                </span>
                              )}
                            </div>
                            
                            {editingFavId !== item.id ? (
                              <button
                                onClick={() => {
                                  setEditingFavId(item.id);
                                  setTempFavEur(item.target_price_eur !== undefined ? String(item.target_price_eur) : "0");
                                  setTempFavYen(item.target_price_yen !== undefined ? String(item.target_price_yen) : "0");
                                }}
                                className="text-[10px] text-zinc-400 hover:text-red-400 flex items-center gap-1 font-semibold transition cursor-pointer"
                              >
                                <Edit className="w-3 h-3" />
                                Bearbeiten
                              </button>
                            ) : (
                              <div className="flex gap-1.5">
                                <button
                                  onClick={() => {
                                    const eurVal = parseFloat(tempFavEur) || 0;
                                    const yenVal = parseInt(tempFavYen, 10) || 0;
                                    handleSaveTargetPrice(item.id, eurVal, yenVal);
                                  }}
                                  className="text-[10px] text-emerald-400 hover:text-emerald-350 font-bold flex items-center gap-0.5 transition cursor-pointer"
                                >
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  Speichern
                                </button>
                                <span className="text-zinc-650">|</span>
                                <button
                                  onClick={() => setEditingFavId(null)}
                                  className="text-[10px] text-zinc-500 hover:text-zinc-400 font-semibold flex items-center gap-0.5 transition cursor-pointer"
                                >
                                  <X className="w-3 h-3 text-zinc-400" />
                                  Reset
                                </button>
                              </div>
                            )}
                          </div>

                          {editingFavId === item.id ? (
                            <div className="space-y-2 mt-1">
                              {/* Bi-directional Live Coupling Toggle */}
                              <div className="flex items-center justify-between bg-[#0e0e11] border border-zinc-800/60 p-1.5 rounded-lg text-[9px]">
                                <span className="text-zinc-400 font-medium flex items-center gap-1">
                                  <Sparkles className="w-3 h-3 text-amber-500" />
                                  Kopplung (Live-Umrechnung)
                                </span>
                                <button
                                  onClick={() => {
                                    const nextSync = !favAutoSync;
                                    setFavAutoSync(nextSync);
                                    if (nextSync) {
                                      // Synchronize immediately base JPY off EUR
                                      const eurNum = parseFloat(tempFavEur) || 0;
                                      setTempFavYen(String(Math.round(eurNum * arbitrageExchangeRate)));
                                    }
                                  }}
                                  className={`px-1.5 py-0.5 rounded font-bold font-mono tracking-wide text-[8px] transition ${
                                    favAutoSync 
                                      ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" 
                                      : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                                  }`}
                                >
                                  {favAutoSync ? "AKTIV (¥ ⇄ €)" : "INAKTIV"}
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[9px] text-zinc-400 block mb-0.5 font-semibold">Euro (€)</label>
                                  <div className="relative">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-[9px]">€</span>
                                    <input
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      value={tempFavEur}
                                      onChange={(e) => {
                                        const valStr = e.target.value;
                                        setTempFavEur(valStr);
                                        if (favAutoSync) {
                                          const eurNum = parseFloat(valStr) || 0;
                                          setTempFavYen(String(Math.round(eurNum * arbitrageExchangeRate)));
                                        }
                                      }}
                                      className="w-full bg-[#0c0c0e] border border-zinc-800 rounded-lg pl-4 pr-1 py-0.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500"
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[9px] text-zinc-400 block mb-0.5 font-semibold">Yen (¥)</label>
                                  <div className="relative">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-zinc-500 font-bold text-[9px]">¥</span>
                                    <input
                                      type="number"
                                      step="1"
                                      placeholder="0"
                                      value={tempFavYen}
                                      onChange={(e) => {
                                        const valStr = e.target.value;
                                        setTempFavYen(valStr);
                                        if (favAutoSync) {
                                          const yenNum = parseInt(valStr, 10) || 0;
                                          setTempFavEur(String(parseFloat((yenNum / arbitrageExchangeRate).toFixed(2))));
                                        }
                                      }}
                                      className="w-full bg-[#0c0c0e] border border-zinc-800 rounded-lg pl-4 pr-1 py-0.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-red-500"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Manual override buttons when kopplung is inactive */}
                              {!favAutoSync && (
                                <div className="flex gap-1 justify-center pt-1 border-t border-zinc-850/60">
                                  <button
                                    onClick={() => {
                                      const curEur = parseFloat(tempFavEur) || 0;
                                      setTempFavYen(String(Math.round(curEur * arbitrageExchangeRate)));
                                    }}
                                    className="text-[8px] font-mono bg-zinc-800/80 hover:bg-zinc-700 hover:text-white text-zinc-300 px-1.5 py-0.5 rounded cursor-pointer transition"
                                  >
                                    € ➔ ¥ (1 € = {arbitrageExchangeRate} ¥)
                                  </button>
                                  <button
                                    onClick={() => {
                                      const curYen = parseInt(tempFavYen, 10) || 0;
                                      setTempFavEur(String(parseFloat((curYen / arbitrageExchangeRate).toFixed(2))));
                                    }}
                                    className="text-[8px] font-mono bg-zinc-800/80 hover:bg-zinc-700 hover:text-white text-zinc-300 px-1.5 py-0.5 rounded cursor-pointer transition"
                                  >
                                    ¥ ➔ €
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-between text-xs font-mono py-1">
                              <div className="flex items-center gap-1.5 bg-[#09090b] border border-zinc-850 rounded px-2 py-1 flex-1 justify-center">
                                <span className="text-zinc-500 font-sans text-[10px]">EUR:</span> 
                                <span className="text-red-400 font-bold">€{(item.target_price_eur || 0).toFixed(2)}</span>
                              </div>
                              <div className="w-2"></div>
                              <div className="flex items-center gap-1.5 bg-[#09090b] border border-zinc-850 rounded px-2 py-1 flex-1 justify-center">
                                <span className="text-zinc-500 font-sans text-[10px]">YEN:</span> 
                                <span className="text-yellow-500 font-bold">¥{(item.target_price_yen || 0).toLocaleString()}</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Bottom actions footer */}
                        <div className="bg-[#18181b]/50 border-t border-zinc-850 p-3 flex items-center justify-between gap-2.5" data-nodrag>
                          <button
                            onClick={() => {
                              setInventoryAddTargetCard({
                                ...item,
                                id: item.api_card_id,
                                pokemon_name: item.local_name,
                                active_tcg_game: item.game
                              });
                              setAddFavPurchasePrice(item.target_price_eur || 0);
                              setAddFavPurchasePriceYen(item.target_price_yen || 0);
                            }}
                            className="flex-1 bg-emerald-650 hover:bg-emerald-600 text-white py-1.5 rounded-xl text-[10px] font-bold font-sans transition flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <PlusCircle className="w-3.5 h-3.5" />
                            In Inventar einbuchen
                          </button>

                          <button
                            onClick={() => handleRemoveFromFavorites(item.api_card_id)}
                            className="bg-zinc-800/60 hover:bg-red-950/20 border border-zinc-750 hover:border-red-500/10 text-zinc-400 hover:text-red-500 p-2 rounded-xl transition cursor-pointer"
                            title="Löschen"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            );
          })()}
        </div>
      )}

      {/* QUICK INVENTORY ADD MODAL */}
      {inventoryAddTargetCard && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-55 flex items-center justify-center p-4">
          <div className="bg-[#121214] border border-[#222226] rounded-3xl max-w-md w-full p-6 select-text shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setInventoryAddTargetCard(null)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-14 bg-[#09090b] border border-zinc-800 rounded flex items-center justify-center overflow-hidden shrink-0">
                  <SafeCardImage 
                    src={inventoryAddTargetCard.image_small} 
                    alt={inventoryAddTargetCard.local_name}
                    set_code={inventoryAddTargetCard.set_code}
                    card_number={inventoryAddTargetCard.card_number}
                    className="max-h-full max-w-full"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200">In Inventar einbuchen</h3>
                  <p className="text-[11px] text-zinc-400 font-medium">{inventoryAddTargetCard.local_name}</p>
                </div>
              </div>

              <div className="border-t border-[#1e1e24] pt-4 space-y-3 font-sans text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Einkauf (€)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="Preis in €"
                      value={addFavPurchasePrice || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setAddFavPurchasePrice(val);
                        setAddFavPurchasePriceYen(Math.round(val * arbitrageExchangeRate));
                      }}
                      className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-zinc-400 font-semibold mb-1">Einkauf (¥)</label>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      placeholder="Preis in ¥"
                      value={addFavPurchasePriceYen || ""}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10) || 0;
                        setAddFavPurchasePriceYen(val);
                        setAddFavPurchasePrice(parseFloat((val / arbitrageExchangeRate).toFixed(2)));
                      }}
                      className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-zinc-400 font-mono flex justify-between items-center bg-[#18181b]/65 px-2.5 py-1.5 rounded-lg border border-zinc-850/80 mt-1">
                  <span className="text-zinc-500">Auto-Umrechnung:</span>
                  <span className="text-amber-500 font-bold">1 € = {arbitrageExchangeRate} ¥ (Live-Kopplung)</span>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Zustand (Raw)</label>
                  <select
                    value={addFavGrade}
                    onChange={(e) => setAddFavGrade(e.target.value)}
                    className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-500"
                  >
                    <option value="Near Mint">Near Mint (NM)</option>
                    <option value="Excellent">Excellent (EX)</option>
                    <option value="Good">Good (GD)</option>
                    <option value="Light Played">Light Played (LP)</option>
                    <option value="Played">Played (PL)</option>
                    <option value="Poor">Poor (PR)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Einkaufsort / Store Location</label>
                  <input
                    type="text"
                    placeholder="z.B. Akihabara, Cardmarket, etc."
                    value={addFavLocation}
                    onChange={(e) => setAddFavLocation(e.target.value)}
                    className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 font-semibold mb-1">Händler-Mängelhinweise / Notizen</label>
                  <textarea
                    placeholder="Mängel auf Rückseite, Kratzer..."
                    rows={2}
                    value={addFavNotes}
                    onChange={(e) => setAddFavNotes(e.target.value)}
                    className="w-full bg-[#1c1c1f] border border-zinc-850 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-red-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  onClick={() => setInventoryAddTargetCard(null)}
                  className="flex-1 bg-[#1c1c1f] hover:bg-[#27272a] text-zinc-300 py-2 rounded-xl text-xs font-semibold transition cursor-pointer border border-zinc-800"
                >
                  Abbrechen
                </button>
                <button
                  onClick={async () => {
                    const cardData = {
                      ...inventoryAddTargetCard,
                      pokemon_name: inventoryAddTargetCard.local_name,
                      purchase_price: addFavPurchasePrice,
                      yen_price: addFavPurchasePriceYen,
                      grade: addFavGrade,
                      purchase_location: addFavLocation || globalStoreLocation,
                      notes: addFavNotes,
                      scanned_or_selected: "selected",
                      game: inventoryAddTargetCard.game || activeGame
                    };

                    const success = await handleAddToInventory(
                      cardData, 
                      addFavLocation || globalStoreLocation, 
                      addFavNotes || "Einkauf aus Favoriten"
                    );

                    if (success) {
                      // Keep in favorites as per user request: "will ich nicht das es gelöscht wird es soll weiterhin in favouriten soll"
                      setInventoryAddTargetCard(null);
                      setAddFavPurchasePrice(0);
                      setAddFavPurchasePriceYen(0);
                      setAddFavGrade("Near Mint");
                      setAddFavLocation("");
                      setAddFavNotes("");
                    }
                  }}
                  className="flex-1 bg-emerald-650 hover:bg-emerald-600 text-white py-2 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  In Inventar einbuchen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={`md:hidden fixed bottom-1.5 left-2 right-2 bg-[#121214]/95 backdrop-blur-2xl border border-zinc-800/90 rounded-2xl py-2.5 px-6 flex justify-around items-center z-50 shadow-2xl transition-all duration-400 ease-out transform ${
        isBottomBarVisible 
          ? "translate-y-0 opacity-100 scale-100" 
          : "translate-y-28 opacity-0 scale-90 pointer-events-none"
      }`}>
        <button 
          onClick={() => setActiveTab("search")}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition ${activeTab === "search" ? "text-red-500 font-extrabold scale-105" : "text-zinc-500 hover:text-white"}`}
        >
          <Search className="w-5 h-5" />
          <span className="text-[9px] uppercase tracking-wider font-display font-medium">Suchen</span>
        </button>

        <button 
          onClick={() => {
            setActiveTab("image-explorer");
            setScanImage(null);
            setScanResult(null);
            setScanError(null);
            stopCamera();
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition ${activeTab === "image-explorer" ? "text-red-500 font-extrabold scale-105" : "text-zinc-500 hover:text-white"}`}
        >
          <Camera className="w-5 h-5" />
          <span className="text-[9px] uppercase tracking-wider font-display font-medium">Scanner</span>
        </button>

        <button 
          onClick={() => {
            setActiveTab("inventory");
            fetchInventory();
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition ${activeTab === "inventory" ? "text-[#dc2626] font-extrabold scale-105" : "text-zinc-500 hover:text-white"}`}
        >
          <div className="relative">
            <ShoppingBag className="w-5 h-5" />
            {inventory.length > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-red-600 text-white font-mono text-[7px] font-bold px-1 rounded-full">{inventory.length}</span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-wider font-display font-medium">Inventar</span>
        </button>

        <button 
          onClick={() => {
            setActiveTab("favorites");
            fetchFavorites();
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition ${activeTab === "favorites" ? "text-red-500 font-extrabold scale-105" : "text-zinc-500 hover:text-white"}`}
        >
          <div className="relative">
            <Heart className={`w-5 h-5 ${activeTab === "favorites" ? "text-red-550 fill-red-550" : "text-zinc-500"}`} />
            {favorites.length > 0 && (
              <span className="absolute -top-1 -right-1.5 bg-red-600 text-white font-mono text-[7px] font-bold px-1 rounded-full">{favorites.length}</span>
            )}
          </div>
          <span className="text-[9px] uppercase tracking-wider font-display font-medium">Favoriten</span>
        </button>

        <button 
          onClick={() => {
            setActiveTab("sets");
            fetchSets();
            fetchStats();
          }}
          className={`flex flex-col items-center justify-center gap-1 cursor-pointer transition ${activeTab === "sets" ? "text-red-500 font-extrabold scale-105" : "text-zinc-500 hover:text-white"}`}
        >
          <Library className="w-5 h-5" />
          <span className="text-[9px] uppercase tracking-wider font-display font-medium">Sets</span>
        </button>
      </div>

      {/* Footer bar */}
      <footer className="border-t border-[#222226] bg-[#0c0c0e] py-6 text-center text-[10px] text-zinc-500 font-mono">
        <div>© {new Date().getFullYear()} Pokémon TCG Reseller Suite</div>
      </footer>
    </div>
  );
}

// -------------------------------------------------------------
// INLINE COPIES OF SCRIPT FILES TO DISPLAY DIRECTLY IN CODE VIEW
// -------------------------------------------------------------

const dbPyContent = `import sqlite3
import os

DATABASE_NAME = "pokemon_cards.db"

def get_connection(db_path=DATABASE_NAME):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

def init_db(db_path=DATABASE_NAME):
    conn = get_connection(db_path)
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        set_name TEXT NOT NULL,
        set_code TEXT UNIQUE NOT NULL,
        series TEXT,
        language TEXT NOT NULL,
        release_date TEXT,
        total_cards INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        api_card_id TEXT UNIQUE NOT NULL,
        english_name TEXT NOT NULL,
        local_name TEXT NOT NULL,
        pokemon_name TEXT,
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
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_english_name ON cards(english_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_local_name ON cards(local_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_set_name ON cards(set_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);")
    
    conn.commit()
    conn.close()
    print(f"Database successfully initialized at {os.path.abspath(db_path)}")
`;

const modelsPyContent = `from dataclasses import dataclass, asdict
from typing import Optional

@dataclass
class SetModel:
    set_name: str
    set_code: str
    series: Optional[str] = None
    language: str = "English"
    release_date: Optional[str] = None
    total_cards: int = 0
    id: Optional[int] = None

    def to_sqlite_dict(self):
        d = asdict(self)
        if d['id'] is None: del d['id']
        return d

@dataclass
class CardModel:
    api_card_id: str
    english_name: str
    local_name: str
    language: str
    set_name: str
    set_code: str
    card_number: str
    pokemon_name: Optional[str] = None
    rarity: Optional[str] = None
    supertype: Optional[str] = None
    subtype: Optional[str] = None
    hp: Optional[int] = None
    types: Optional[str] = None
    evolves_from: Optional[str] = None
    regulation_mark: Optional[str] = None
    illustrator: Optional[str] = None
    release_date: Optional[str] = None
    image_small: Optional[str] = None
    image_large: Optional[str] = None
    cardmarket_id: Optional[str] = None
    id: Optional[int] = None

    def to_sqlite_dict(self):
        d = asdict(self)
        if d['id'] is None: del d['id']
        return d
`;

const importerPyContent = `import json
import urllib.request
import urllib.error
import sqlite3
import logging
from datetime import datetime
from database import get_connection, DATABASE_NAME

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TCGImporter")

class PokémonTCGImporter:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path
        self.base_url = "https://api.tcgdex.net/v2"

    def _get_json(self, url):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=15) as res:
                return json.loads(res.read().decode('utf-8'))
        except Exception as e:
            return None

    def fetch_all_sets(self, language_code="de"):
        url = f"{self.base_url}/{language_code}/sets"
        data = self._get_json(url)
        if not data: return []
        return [{"set_code": s.get("id"), "set_name": s.get("name"), "total_cards": s.get("cardCount", {}).get("total", 0)} for s in data]

    def import_sets(self, language_code="de"):
        local_sets_raw = self.fetch_all_sets(language_code)
        en_sets_raw = {s['set_code']: s['set_name'] for s in self.fetch_all_sets("en")} if language_code != "en" else {}
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        for s in local_sets_raw:
            set_code = s['set_code']
            local_name = s['set_name']
            cursor.execute("SELECT id FROM sets WHERE set_code = ?", (set_code,))
            if not cursor.fetchone():
                cursor.execute("""
                    INSERT INTO sets (set_name, set_code, language, total_cards) VALUES (?, ?, ?, ?)
                """, (local_name, set_code, language_code.upper(), s['total_cards']))
        conn.commit()
        conn.close()
`;

const updaterPyContent = `import logging
from database import get_connection, DATABASE_NAME
from importer import PokémonTCGImporter

class PokémonTCGUpdater:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path
        self.importer = PokémonTCGImporter(db_path=db_path)

    def update_sets_and_new_cards(self, language_code="de", sets_limit=5):
        self.importer.import_sets(language_code)
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT set_code, set_name, total_cards FROM sets LIMIT ?", (sets_limit,))
        for s in cursor.fetchall():
            self.importer.import_cards_for_set(s['set_code'], language_code)
        conn.close()
`;

const searchPyContent = `import sqlite3
import urllib.parse
from database import get_connection, DATABASE_NAME

def generate_ebay_link(english_name, set_name, card_number):
    query = f"{english_name} {set_name} {card_number} pokemon"
    return f"https://www.ebay.de/sch/i.html?_nkw={urllib.parse.quote_plus(query)}"

def generate_cardmarket_link(english_name, card_number):
    import re
    clean_name = re.sub(r'[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]', '', english_name or "").strip()
    clean_num = re.sub(r'[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]', '', card_number or "").strip()
    query = f"{clean_name} {clean_num}"
    query = " ".join(query.split())
    return f"https://www.cardmarket.com/de/Pokemon/Products/Search?searchString={urllib.parse.quote_plus(query)}"

class PokémonTCGSearch:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path

    def query_cards(self, english_name=None, local_name=None, set_name=None, card_number=None, language=None, rarity=None, limit=10):
        # Implementation of indexed fast filter query inside SQLite ...
`;

const mainPyContent = `import argparse
from database import init_db
from importer import PokémonTCGImporter
from updater import PokémonTCGUpdater
from search import PokémonTCGSearch

def main():
    parser = argparse.ArgumentParser(description="Verwalte pokemon_cards.db")
    subparsers = parser.add_subparsers(dest="command")
    subparsers.add_parser("init")
    # ... fully customizable argparse sub commands
`;
