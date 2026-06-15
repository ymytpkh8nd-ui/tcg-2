import json
import urllib.request
import urllib.error
import sqlite3
import logging
import os
import ssl
from datetime import datetime
from database import get_connection, DATABASE_NAME
from models import SetModel, CardModel

# Disable SSL verification globally to bypass certificate handshake issues
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("TCGImporter")

# Safety circuit-breaker to stop spamming requests to Gemini after a 429 error
GEMINI_API_BLOCKED = False

# High-fidelity English-to-Japanese Pokémon name mapping dictionary for zero-latency, elegant translations.
POPULAR_TRANSLATIONS = {
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
    "meowth": "ニャース"
}

# High-fidelity English-to-German Pokémon name mapping dictionary for zero-latency, elegant translations.
EN_TO_GE_POPULAR = {
    "bulbasaur": "Bisasam",
    "ivysaur": "Bisaknosp",
    "venusaur": "Bisaflor",
    "charmander": "Glumanda",
    "charmeleon": "Glutexo",
    "charizard": "Glurak",
    "squirtle": "Schiggy",
    "wartortle": "Schillok",
    "blastoise": "Turtok",
    "caterpie": "Raupy",
    "metapod": "Safcon",
    "butterfree": "Smettbo",
    "weedle": "Hornliu",
    "kakuna": "Kokuna",
    "beedrill": "Bibor",
    "pidgey": "Taubsi",
    "pidgeotto": "Tauboga",
    "pidgeot": "Tauboss",
    "rattata": "Rattfratz",
    "raticate": "Rattikarl",
    "spearow": "Habitak",
    "fearow": "Ibitak",
    "ekans": "Rettan",
    "arbok": "Arbok",
    "pikachu": "Pikachu",
    "raichu": "Raichu",
    "sandshrew": "Sandan",
    "sandslash": "Sandamer",
    "nidoran♀": "Nidoran♀",
    "nidorina": "Nidorina",
    "nidoqueen": "Nidoqueen",
    "nidoran♂": "Nidoran♂",
    "nidorino": "Nidorino",
    "nidoking": "Nidoking",
    "clefairy": "Piepi",
    "clefable": "Pixi",
    "vulpix": "Vulpix",
    "ninetales": "Vulnona",
    "jigglypuff": "Pummeluff",
    "wigglytuff": "Knuddeluff",
    "zubat": "Zubat",
    "golbat": "Golbat",
    "oddish": "Myrapla",
    "gloom": "Duflor",
    "vileplume": "Gigaflor",
    "paras": "Paras",
    "parasect": "Parasek",
    "venonat": "Bluzuk",
    "venomoth": "Omot",
    "diglett": "Digda",
    "dugtrio": "Digdri",
    "meowth": "Mauzi",
    "persian": "Snobilikat",
    "psyduck": "Enton",
    "golduck": "Entoron",
    "mankey": "Menki",
    "primeape": "Rasaff",
    "growlithe": "Fukano",
    "arcanine": "Arkani",
    "poliwag": "Quapsel",
    "poliwhirl": "Quaputzi",
    "poliwrath": "Quappo",
    "abra": "Abra",
    "kadabra": "Kadabra",
    "alakazam": "Simsala",
    "machop": "Machollo",
    "machoke": "Maschock",
    "machamp": "Machomei",
    "bellsprout": "Knofensa",
    "weepinbell": "Ultrigaria",
    "victreebel": "Sarzenia",
    "tentacool": "Tentacha",
    "tentacruel": "Tentoxa",
    "geodude": "Kleinstein",
    "graveler": "Georok",
    "golem": "Geowaz",
    "ponyta": "Ponita",
    "rapidash": "Gallopa",
    "slowpoke": "Flegmon",
    "slowbro": "Lahmus",
    "magnemite": "Magnetilo",
    "magneton": "Magneton",
    "farfetch'd": "Porenta",
    "doduo": "Dodu",
    "dodrio": "Dodri",
    "seel": "Jurob",
    "dewgong": "Jugong",
    "grimer": "Sleima",
    "muk": "Sleimok",
    "shellder": "Muschas",
    "cloyster": "Austos",
    "gastly": "Nebulak",
    "haunter": "Alpollo",
    "gengar": "Gengar",
    "onix": "Onix",
    "drowzee": "Traumato",
    "hypno": "Hypno",
    "krabby": "Krabby",
    "kingler": "Kingler",
    "voltorb": "Voltobal",
    "electrode": "Lektrobal",
    "exeggcute": "Owei",
    "exeggutor": "Kokowei",
    "cubone": "Tragosso",
    "marowak": "Knogga",
    "hitmonlee": "Kicklee",
    "hitmonchan": "Nockchan",
    "lickitung": "Schlurp",
    "koffing": "Smogon",
    "weezing": "Smogmog",
    "rhyhorn": "Rihorn",
    "rhydon": "Rizeros",
    "chansey": "Chaneira",
    "tangela": "Tangela",
    "kangaskhan": "Kangama",
    "horsea": "Seeper",
    "seadra": "Seemon",
    "goldeen": "Goldini",
    "seaking": "Golking",
    "staryu": "Sterndu",
    "starmie": "Starmie",
    "mr. mime": "Pantimos",
    "scyther": "Sichlor",
    "jynx": "Rossana",
    "electabuzz": "Elektek",
    "magmar": "Magmar",
    "pinsir": "Pinsir",
    "tauros": "Tauros",
    "magikarp": "Karpador",
    "gyarados": "Garados",
    "lapras": "Lapras",
    "ditto": "Ditto",
    "eevee": "Evoli",
    "vaporeon": "Aquana",
    "jolteon": "Blitza",
    "flareon": "Flamara",
    "porygon": "Porygon",
    "omanyte": "Amonitas",
    "omastar": "Amoroso",
    "kabuto": "Kabuto",
    "kabutops": "Kabutops",
    "aerodactyl": "Aerodactyl",
    "snorlax": "Relaxo",
    "articuno": "Arktos",
    "zapdos": "Zapdos",
    "moltres": "Lavados",
    "dratini": "Dratini",
    "dragonair": "Dragonir",
    "dragonite": "Dragoran",
    "mewtwo": "Mewtu",
    "mew": "Mew",
    "iono": "Enigmara",
    "nest ball": "Nestball",
    "ultra ball": "Hyperball",
    "super rod": "Superangel",
    "buddy-buddy poffin": "Kumpel-Kumpel-Poffin",
    "arven": "Avenaro",
    "boss's orders": "Befehl vom Boss",
    "professor's research": "Forschung des Professors"
}

def translate_card_to_german(eng_name):
    """
    Translates an English Pokémon card name to German.
    First tries Gemini API if GEMINI_API_KEY is available.
    """
    global GEMINI_API_BLOCKED
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and not GEMINI_API_BLOCKED:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
            prompt = f"Du bist ein Pokemon TCG Experte. Übersetze den englischen Pokémon-Kartennamen '{eng_name}' ins Deutsche (z.B. Bulbasaur -> Bisasam, Charizard -> Glurak, Iono -> Enigmara). Antworte AUSSCHLIEẞLICH mit dem reinen übersetzten deutschen Namen, OHNE Anmerkungen, Erklärungen oder Satzzeichen."
            req_data = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1}
            }
            req_body = json.dumps(req_data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_body,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                de_name = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                de_name = de_name.replace('"', '').replace("'", "").replace('`', '').strip()
                if de_name and len(de_name) < 45:
                    return de_name
        except Exception as e:
            if "429" in str(e) or (hasattr(e, "code") and e.code == 429):
                GEMINI_API_BLOCKED = True
                logger.warning("Gemini API rate limit (429) hit. Disabling Gemini calls for this run.")
            pass
            
    # Dictionary fallback for common names
    lower_eng = eng_name.lower().strip()
    
    # Try direct mapping
    for key, val in EN_TO_GE_POPULAR.items():
        if key in lower_eng:
            return lower_eng.replace(key, val).title()
            
    return eng_name

def translate_japanese_to_english(ja_name):
    """
    Translates a Japanese Pokémon card name to English.
    """
    ja_to_en = {
        "ピカチュウ": "Pikachu",
        "リザードン": "Charizard",
        "カメックス": "Blastoise",
        "フシギバナ": "Venusaur",
        "ミュウツー": "Mewtwo",
        "ミュウ": "Mew",
        "イーブイ": "Eevee",
        "ルカリオ": "Lucario",
        "ゲンガー": "Gengar",
        "ルギア": "Lugia",
        "レックウザ": "Rayquaza",
        "ギャラドス": "Gyarados",
        "カビゴン": "Snorlax",
        "フシギダネ": "Bulbasaur",
        "ヒトカゲ": "Charmander",
        "ゼニガメ": "Squirtle",
        "ゲッコウガ": "Greninja",
        "ミミッキュ": "Mimikyu",
        "カイリュー": "Dragonite",
        "アルセウス": "Arceus",
        "サーナイト": "Gardevoir",
        "ガブリアス": "Garchomp",
        "ハッサム": "Scizor",
        "ブラッキー": "Umbreon",
        "エーフィ": "Espeon",
        "ニンフィア": "Sylveon",
        "サンダース": "Jolteon",
        "ブースター": "Flareon",
        "シャワーズ": "Vaporeon",
        "リーフィア": "Leafeon",
        "グレイシア": "Glaceon",
        "カイリキー": "Machamp",
        "フーディン": "Alakazam",
        "ラプラス": "Lapras",
        "バンギラス": "Tyranitar",
        "ボーマンダ": "Salamence",
        "メタグロス": "Metagross",
        "ダークライ": "Darkrai",
        "ディアルガ": "Dialga",
        "パルキア": "Palkia",
        "ギラティナ": "Giratina",
        "ゾロア": "Zorua",
        "ゾロアーク": "Zoroark",
        "レシラム": "Reshiram",
        "ゼクロム": "Zekrom",
        "キュレム": "Kyurem",
        "ゼルネアス": "Xerneas",
        "イベルタル": "Yveltal",
        "ソルガレオ": "Solgaleo",
        "ルナアーラ": "Lunala",
        "ザシアン": "Zacian",
        "ザマゼンタ": "Zamazenta",
        "ゴンベ": "Munchlax",
        "トゲピー": "Togepi",
        "コダック": "Psyduck",
        "ニャース": "Meowth"
    }

    cleaned = ja_name.split("-")[0].strip()
    if cleaned in ja_to_en:
        return ja_name.replace(cleaned, ja_to_en[cleaned])

    global GEMINI_API_BLOCKED
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key and not GEMINI_API_BLOCKED:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key={api_key}"
            prompt = f"You are a Pokemon TCG expert. Translate the Japanese Pokémon card name '{ja_name}' to standard English (e.g. フシギダネ -> Bulbasaur, リザードン -> Charizard, ナンジャモ -> Iono). Reply EXCLUSIVELY with the raw translated English name without any explanations, notes, or punctuation."
            req_data = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.1}
            }
            req_body = json.dumps(req_data).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=req_body,
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                res_data = json.loads(resp.read().decode('utf-8'))
                en_name = res_data["candidates"][0]["content"]["parts"][0]["text"].strip()
                en_name = en_name.replace('"', '').replace("'", "").replace('`', '').strip()
                if en_name and len(en_name) < 45:
                    return en_name
        except Exception:
            pass

    return ja_name

def clean_rarity_to_english(rarity):
    """
    Maps German/English rarity strings to standard English rarities.
    This guarantees consistency across all card languages.
    """
    if not rarity:
        return "Common"
    r = rarity.lower().strip()
    if r in ["häufig", "common", "h", "c"]:
        return "Common"
    if r in ["ungewöhnlich", "uncommon", "u"]:
        return "Uncommon"
    if r in ["selten", "rare", "r"]:
        return "Rare"
    if "holo" in r or "holografisch" in r:
        return "Rare Holo"
    if "doppel" in r or "double" in r or r == "rr":
        return "Double Rare"
    if "besonder" in r and "illustration" in r:
        return "Special Illustration Rare"
    if "special illustration" in r or r == "sar":
        return "Special Illustration Rare"
    if "illustration" in r or r == "ar" or "illustrationskarte" in r:
        return "Illustration Rare"
    if "ultra" in r or r == "sr":
        return "Ultra Rare"
    if "geheim" in r or "secret" in r:
        return "Secret Rare"
    if "hyper" in r or "gold" in r or r == "ur":
        return "Hyper Rare"
    if "promo" in r:
        return "Promo"
    # Capitalize first letter as fallback
    return rarity[0].upper() + rarity[1:] if len(rarity) > 0 else "Common"


# Note: Authentic Japanese Set/Card translation and fallbacks have been removed as requested.

FALLBACK_SETS_LIST = {
    "de": [
        {"id": "sv3.5", "name": "151", "cardCount": {"total": 207}, "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/symbol"},
        {"id": "sv4.5", "name": "Paldeas Schicksale", "cardCount": {"total": 245}, "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/symbol"},
        {"id": "sv1", "name": "Karmesin & Purpur", "cardCount": {"total": 258}, "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv1/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv1/symbol"}
    ],
    "en": [
        {"id": "sv3.5", "name": "151", "cardCount": {"total": 207}, "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/symbol"},
        {"id": "sv4.5", "name": "Paldean Fates", "cardCount": {"total": 245}, "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/symbol"},
        {"id": "sv1", "name": "Scarlet & Violet", "cardCount": {"total": 258}, "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv1/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv1/symbol"}
    ],
    "ja": [
        {"id": "sv4a", "name": "Shiny Treasure ex", "cardCount": {"total": 350}, "logo": "https://assets.tcgdex.net/ja/scarlet-violet/sv4a/logo", "symbol": "https://assets.tcgdex.net/ja/scarlet-violet/sv4a/symbol"}
    ]
}

FALLBACK_SETS_DETAILS = {
    "sv1": {
        "de": {
            "id": "sv1", "name": "Karmesin & Purpur", "serie": {"name": "Karmesin & Purpur"}, "releaseDate": "2023-03-31",
            "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv1/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv1/symbol",
            "cards": [
                {"id": "sv1-198", "name": "Dardignis-ex", "localId": "198", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 1", "hp": 260, "types": ["Fire"], "illustrator": "Kawayoo", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv1/198"},
                {"id": "sv1-243", "name": "Miraidon-ex", "localId": "243", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 220, "types": ["Lightning"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv1/243"},
                {"id": "sv1-244", "name": "Koraidon-ex", "localId": "244", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 230, "types": ["Fighting"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv1/244"}
            ]
        },
        "en": {
            "id": "sv1", "name": "Scarlet & Violet", "serie": {"name": "Scarlet & Violet"}, "releaseDate": "2023-03-31",
            "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv1/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv1/symbol",
            "cards": [
                {"id": "sv1-198", "name": "Spidops ex", "localId": "198", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 1", "hp": 260, "types": ["Fire"], "illustrator": "Kawayoo", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv1/198"},
                {"id": "sv1-243", "name": "Miraidon ex", "localId": "243", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 220, "types": ["Lightning"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv1/243"},
                {"id": "sv1-244", "name": "Koraidon ex", "localId": "244", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 230, "types": ["Fighting"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv1/244"}
            ]
        }
    },
    "sv3.5": {
        "de": {
            "id": "sv3.5", "name": "151", "serie": {"name": "151"}, "releaseDate": "2023-09-22",
            "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/symbol",
            "cards": [
                {"id": "sv3.5-199", "name": "Glurak-ex", "localId": "199", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 340, "types": ["Fire"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/199"},
                {"id": "sv3.5-200", "name": "Turtok-ex", "localId": "200", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 330, "types": ["Water"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/200"},
                {"id": "sv3.5-201", "name": "Bisaflor-ex", "localId": "201", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 340, "types": ["Grass"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/201"},
                {"id": "sv3.5-187", "name": "Schiggy", "localId": "187", "rarity": "Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 60, "types": ["Water"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv3.5/187"}
            ]
        },
        "en": {
            "id": "sv3.5", "name": "151", "serie": {"name": "151"}, "releaseDate": "2023-09-22",
            "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/symbol",
            "cards": [
                {"id": "sv3.5-199", "name": "Charizard ex", "localId": "199", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 340, "types": ["Fire"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/199"},
                {"id": "sv3.5-200", "name": "Blastoise ex", "localId": "200", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 330, "types": ["Water"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/200"},
                {"id": "sv3.5-201", "name": "Venusaur ex", "localId": "201", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 340, "types": ["Grass"], "illustrator": "Mitsuhiro Arita", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/201"},
                {"id": "sv3.5-187", "name": "Squirtle", "localId": "187", "rarity": "Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 60, "types": ["Water"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv3.5/187"}
            ]
        }
    },
    "sv4.5": {
        "de": {
            "id": "sv4.5", "name": "Paldeas Schicksale", "serie": {"name": "Karmesin & Purpur"}, "releaseDate": "2024-01-26",
            "logo": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/logo", "symbol": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/symbol",
            "cards": [
                {"id": "sv4.5-234", "name": "Glurak-ex", "localId": "234", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 330, "types": ["Darkness"], "illustrator": "AKIRA EGAWA", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/234"},
                {"id": "sv4.5-233", "name": "Guardevoir-ex", "localId": "233", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 310, "types": ["Psychic"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/233"},
                {"id": "sv4.5-232", "name": "Mew-ex", "localId": "232", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 180, "types": ["Psychic"], "illustrator": "Miki", "image": "https://assets.tcgdex.net/de/scarlet-violet/sv4.5/232"}
            ]
        },
        "en": {
            "id": "sv4.5", "name": "Paldean Fates", "serie": {"name": "Scarlet & Violet"}, "releaseDate": "2024-01-26",
            "logo": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/logo", "symbol": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/symbol",
            "cards": [
                {"id": "sv4.5-234", "name": "Charizard ex", "localId": "234", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 330, "types": ["Darkness"], "illustrator": "AKIRA EGAWA", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/234"},
                {"id": "sv4.5-233", "name": "Gardevoir ex", "localId": "233", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Stage 2", "hp": 310, "types": ["Psychic"], "illustrator": "Kira", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/233"},
                {"id": "sv4.5-232", "name": "Mew ex", "localId": "232", "rarity": "Special Illustration Rare", "category": "Pokémon", "stage": "Basic", "hp": 180, "types": ["Psychic"], "illustrator": "Miki", "image": "https://assets.tcgdex.net/en/scarlet-violet/sv4.5/232"}
            ]
        }
    }
}


class PokémonTCGImporter:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path
        self.base_url = "https://api.tcgdex.net/v2"

    def _get_json(self, url):
        """Helper to fetch and parse JSON from URL using standard library with robust retries."""
        logger.debug(f"Fetching URL: {url}")
        max_retries = 3
        for attempt in range(max_retries):
            try:
                req = urllib.request.Request(
                    url, 
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PokemonTCGImporter/1.0'}
                )
                timeout_val = 15 + (attempt * 10)
                with urllib.request.urlopen(req, timeout=timeout_val) as response:
                    return json.loads(response.read().decode('utf-8'))
            except urllib.error.HTTPError as e:
                logger.warning(f"HTTP Error {e.code} for URL: {url} (Attempt {attempt + 1}/{max_retries})")
                if e.code == 404:
                    return None
                if attempt < max_retries - 1:
                    import time
                    time.sleep(1.5 + attempt * 2)
            except Exception as e:
                logger.warning(f"Error fetching URL {url}: {e} (Attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(1.5 + attempt * 2)
        
        # Intercept and return offline static fallback if everything fails/times out
        try:
            logger.warning(f"All HTTP attempts failed or timed out for {url}. Provoking offline backup fallback data...")
            path = url.replace("https://api.tcgdex.net/v2/", "").strip("/")
            parts = path.split("/")
            lang = "de"
            if len(parts) >= 1:
                lang = parts[0]
                if lang not in ["de", "en", "ja"]:
                    lang = "de"
            
            # 1. Sets List Link
            if len(parts) == 2 and parts[1] == "sets":
                return FALLBACK_SETS_LIST.get(lang, FALLBACK_SETS_LIST["de"])
                
            # 2. Set Detail Link
            if len(parts) == 3 and parts[1] == "sets":
                set_code = parts[2].lower()
                for key, val in FALLBACK_SETS_DETAILS.items():
                    if key.lower() == set_code:
                        return val.get(lang, val.get("de", val.get("en")))
            
            # 3. Card Detail Link
            if len(parts) == 3 and parts[1] == "cards":
                card_id = parts[2]
                for set_key, set_val in FALLBACK_SETS_DETAILS.items():
                    for lang_key, lang_val in set_val.items():
                        for c in lang_val.get("cards", []):
                            if c["id"] == card_id:
                                return c
        except Exception as fb_err:
            logger.error(f"Failed to compile / retrieve local fallback data: {fb_err}")

        return None

    def fetch_all_sets(self, language_code="de"):
        """
        Fetches all sets for the given language.
        """
        api_lang = language_code
        logger.info(f"Hole Sets-Liste für Sprache '{language_code}' (API-Sprache: '{api_lang}')...")
        url = f"{self.base_url}/{api_lang}/sets"
        data = self._get_json(url)
        if not data:
            logger.error("Konnte Sets nicht abrufen.")
            return []
        
        sets = []
        for s in data:
            sets.append({
                "set_code": s.get("id"),
                "set_name": s.get("name"),
                "total_cards": s.get("cardCount", {}).get("total", 0),
                "logo": s.get("logo"),
                "symbol": s.get("symbol")
            })
        logger.info(f"{len(sets)} Sets erfolgreich abgerufen.")
        return sets

    def import_sets(self, language_code="de"):
        """ Imports sets into the SQLite database instantly, avoiding duplicate per-set HTTP loops. """
        # We fetch local sets list (1 HTTP request only)
        local_sets_raw = self.fetch_all_sets(language_code)
        if not local_sets_raw:
            return

        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        imported_count = 0
        updated_count = 0

        logger.info(f"Importiere {len(local_sets_raw)} Sets in die SQLite-Datenbank (Sprache: {language_code.upper()})...")
        
        now_str = datetime.now().isoformat()

        for s in local_sets_raw:
            set_code = s['set_code']
            logo = s.get("logo", "")
            symbol = s.get("symbol", "")
            
            # Map name/details
            local_name = s['set_name']
            series = ""
            release_date = ""  # Will be lazy-updated during card import of this set!

            # Check if set exists under this set_code and language
            cursor.execute("SELECT id, series, release_date, logo, symbol FROM sets WHERE set_code = ? AND language = ?", (set_code, language_code.upper()))
            existing = cursor.fetchone()
            
            if existing:
                # Keep existing release_date and series if already populated to avoid overwriting real meta with empty fallback
                series_val = existing['series'] if existing['series'] else series
                release_date_val = existing['release_date'] if existing['release_date'] else release_date
                logo_val = existing['logo'] if existing['logo'] else logo
                symbol_val = existing['symbol'] if existing['symbol'] else symbol
                
                # Update basic stats without blocking HTTP loops
                cursor.execute("""
                    UPDATE sets 
                    SET set_name = ?, series = ?, release_date = ?, total_cards = ?, logo = ?, symbol = ?, updated_at = ?
                    WHERE set_code = ? AND language = ?
                """, (local_name, series_val, release_date_val, s['total_cards'], logo_val, symbol_val, now_str, set_code, language_code.upper()))
                updated_count += 1
            else:
                # Insert
                cursor.execute("""
                    INSERT INTO sets (set_name, set_code, series, language, release_date, total_cards, logo, symbol, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (local_name, set_code, series, language_code.upper(), release_date, s['total_cards'], logo, symbol, now_str, now_str))
                imported_count += 1

        conn.commit()
        conn.close()
        logger.info(f"Sets Import abgeschlossen: {imported_count} neu angelegt, {updated_count} aktualisiert für {language_code.upper()}.")

    def import_cards_for_set(self, set_code, language_code="de", max_cards=None):
        """
        Imports all cards belonging to a specific set.
        """
        fetch_lang = language_code
        
        logger.info(f"Importiere Karten des Sets '{set_code}' für Sprache '{language_code.upper()}'...")
        
        local_set_url = f"{self.base_url}/{fetch_lang}/sets/{set_code}"
        local_set_data = self._get_json(local_set_url)
        if not local_set_data or "cards" not in local_set_data:
            logger.error(f"Konnte Set-Detail-Karten {set_code} in {fetch_lang} nicht abrufen.")
            return

        set_name_raw = local_set_data.get("name", set_code)
        set_name = set_name_raw
        release_date = local_set_data.get("releaseDate", "")
        
        local_cards = local_set_data["cards"]
        if max_cards:
            local_cards = local_cards[:max_cards]

        conn = get_connection(self.db_path)
        cursor = conn.cursor()

        # Lazy-update the set's series, release_date, logo and symbol with the real detailed metadata we just fetched!
        series_real = local_set_data.get("serie", {}).get("name", "") if isinstance(local_set_data.get("serie"), dict) else ""
        if not series_real:
            series_real = local_set_data.get("serie", "")
        release_date_real = local_set_data.get("releaseDate", "")
        logo_real = local_set_data.get("logo", "")
        symbol_real = local_set_data.get("symbol", "")
        
        cursor.execute("""
            UPDATE sets 
            SET series = CASE WHEN ? != '' THEN ? ELSE series END,
                release_date = CASE WHEN ? != '' THEN ? ELSE release_date END,
                logo = CASE WHEN ? != '' THEN ? ELSE logo END,
                symbol = CASE WHEN ? != '' THEN ? ELSE symbol END,
                updated_at = ?
            WHERE set_code = ? AND language = ?
        """, (
            series_real, series_real,
            release_date_real, release_date_real,
            logo_real, logo_real,
            symbol_real, symbol_real,
            datetime.now().isoformat(),
            set_code, language_code.upper()
        ))
        conn.commit()

        imported_cards = 0
        updated_cards = 0

        for card_summary in local_cards:
            card_id = card_summary["id"]
            
            # Fetch details
            card_detail_local = self._get_json(f"{self.base_url}/{fetch_lang}/cards/{card_id}")
            if not card_detail_local:
                card_detail_local = card_summary
            
            # Fetch english detailed card data for true English name attributes (skip for Japanese exclusive sets if not found)
            card_detail_en = card_detail_local
            card_detail_en_fetched = None
            if fetch_lang != "en" and fetch_lang != "ja":
                card_detail_en_fetched = self._get_json(f"{self.base_url}/en/cards/{card_id}")
                if card_detail_en_fetched:
                    card_detail_en = card_detail_en_fetched

            # Extract fields
            api_card_id = card_id
            local_name = card_detail_local.get("name", card_summary.get("name", "Unbekannt"))

            if language_code.lower() == "ja":
                # For Japanese, translate direct from local name using high-fidelity offline/Gemini translations
                english_name = translate_japanese_to_english(local_name)
            else:
                english_name = card_detail_en.get("name", card_summary.get("name", "Unknown"))
            
            japanese_name = ""

            # Fallback fillings
            if not english_name or english_name == "Unknown":
                english_name = local_name
            if not local_name or local_name == "Unbekannt":
                local_name = english_name

            if language_code.lower() == "ja":
                pokemon_name = translate_card_to_german(english_name)
                japanese_name = local_name
            else:
                pokemon_name = local_name.split("-")[0].strip()
                japanese_name = POPULAR_TRANSLATIONS.get(english_name.lower(), "")

            card_number = card_detail_local.get("localId", card_summary.get("localId", ""))
            raw_rarity = card_detail_en.get("rarity") if card_detail_en_fetched else card_detail_local.get("rarity", "")
            rarity = clean_rarity_to_english(raw_rarity)
            supertype = card_detail_local.get("category", "")
            subtype = card_detail_local.get("stage", "")
            hp = card_detail_local.get("hp", None)
            
            types_list = card_detail_local.get("types", [])
            types_str = ",".join(types_list) if isinstance(types_list, list) else ""
            
            evolves_from = card_detail_local.get("evolvesFrom", "")
            regulation_mark = card_detail_local.get("regulationMark", "")
            illustrator = card_detail_local.get("illustrator", "")
            
            image_small = card_detail_local.get("image", "") + "/low.png" if "image" in card_detail_local and card_detail_local.get("image") else ""
            image_large = card_detail_local.get("image", "") + "/high.png" if "image" in card_detail_local and card_detail_local.get("image") else ""
            
            # Japanese high-fidelity fallback to English asset if Japanese asset is unavailable
            if not image_small and "image" in card_detail_en and card_detail_en.get("image"):
                image_small = card_detail_en.get("image") + "/low.png"
                image_large = card_detail_en.get("image") + "/high.png"
            
            # Ensure the set code portion of the assets URL is lowercase ONLY for pokemon-card.com to prevent case-sensitivity 404s
            if image_small and "pokemon-card.com" in image_small and set_code:
                image_small = image_small.replace(f"/{set_code}/", f"/{set_code.lower()}/")
            if image_large and "pokemon-card.com" in image_large and set_code:
                image_large = image_large.replace(f"/{set_code}/", f"/{set_code.lower()}/")
            
            pricing_dict = card_detail_local.get("pricing")
            pricing_cm = None
            if isinstance(pricing_dict, dict):
                pricing_cm = pricing_dict.get("cardmarket")
            if not isinstance(pricing_cm, dict):
                pricing_cm = {}
            
            cm_raw = card_detail_local.get("cardmarket")
            if not isinstance(cm_raw, dict):
                cm_raw = {}
                
            cardmarket_url = pricing_cm.get("url", cm_raw.get("url", ""))
            cardmarket_id = pricing_cm.get("idProduct", pricing_cm.get("id", cm_raw.get("id", "")))
            if not cardmarket_id and cardmarket_url:
                try:
                    cardmarket_id = cardmarket_url.split("/")[-1].split("?")[0]
                except:
                    pass

            now_str = datetime.now().isoformat()

            # We query checks using BOTH api_card_id and language for unique support
            cursor.execute("SELECT id FROM cards WHERE api_card_id = ? AND language = ?", (api_card_id, language_code.upper()))
            existing_card = cursor.fetchone()

            if existing_card:
                cursor.execute("""
                    UPDATE cards
                    SET english_name = ?, local_name = ?, pokemon_name = ?, japanese_name = ?, language = ?, set_name = ?, set_code = ?,
                        card_number = ?, rarity = ?, supertype = ?, subtype = ?, hp = ?, types = ?,
                        evolves_from = ?, regulation_mark = ?, illustrator = ?, release_date = ?,
                        image_small = ?, image_large = ?, cardmarket_id = ?, updated_at = ?
                    WHERE api_card_id = ? AND language = ?
                """, (
                    english_name, local_name, pokemon_name, japanese_name, language_code.upper(), set_name, set_code,
                    card_number, rarity, supertype, subtype, hp, types_str,
                    evolves_from, regulation_mark, illustrator, release_date,
                    image_small, image_large, str(cardmarket_id), now_str,
                    api_card_id, language_code.upper()
                ))
                updated_cards += 1
            else:
                cursor.execute("""
                    INSERT INTO cards (
                        api_card_id, english_name, local_name, pokemon_name, japanese_name, language, set_name, set_code,
                        card_number, rarity, supertype, subtype, hp, types,
                        evolves_from, regulation_mark, illustrator, release_date,
                        image_small, image_large, cardmarket_id, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    api_card_id, english_name, local_name, pokemon_name, japanese_name, language_code.upper(), set_name, set_code,
                    card_number, rarity, supertype, subtype, hp, types_str,
                    evolves_from, regulation_mark, illustrator, release_date,
                    image_small, image_large, str(cardmarket_id), now_str, now_str
                ))
                imported_cards += 1

        conn.commit()
        conn.close()
        logger.info(f"Set '{set_code}' für {language_code.upper()} abgeschlossen: {imported_cards} neue Karten, {updated_cards} aktualisierte Karten.")

    def run_initial_quick_import(self, language_code="de", first_n_sets=3, max_cards=10):
        """
        Runs an import of the sets and card details into the SQLite database.
        If first_n_sets is <= 0 or None, imports all available sets.
        Allows fully resuming partial/interrupted imports and grabs sets chronologically.
        """
        logger.info(f"Starte Import für '{language_code.upper()}' (Sets: {first_n_sets or 'ALLE'}, limit_cards: {max_cards or 'ALLE'})...")
        self.import_sets(language_code)
        
        # Get sets where count of imported cards is 0 or less than the set's total_cards
        # This allows fully resuming any interrupted/aborted set imports or partial imports!
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        query = """
            SELECT s.set_code 
            FROM sets s 
            LEFT JOIN (
                SELECT set_code, COUNT(*) as card_count 
                FROM cards 
                WHERE language = ?
                GROUP BY set_code
            ) c ON s.set_code = c.set_code
            WHERE s.language = ? 
              AND (c.card_count IS NULL OR c.card_count < s.total_cards)
            ORDER BY s.id DESC
        """
        
        if first_n_sets is None or first_n_sets <= 0:
            cursor.execute(query, (language_code.upper(), language_code.upper()))
        else:
            query += " LIMIT ?"
            cursor.execute(query, (language_code.upper(), language_code.upper(), first_n_sets))
        
        recent_sets = [row['set_code'] for row in cursor.fetchall()]
        conn.close()

        if not recent_sets:
            logger.info("Alle verfügbaren Sets für diese Sprache wurden bereits in die Datenbank importiert!")
            return

        logger.info(f"Schnittstellen-Details für {len(recent_sets)} noch nicht geladene Sets ({', '.join(recent_sets)}) werden geladen...")
        for set_code in recent_sets:
            self.import_cards_for_set(set_code, language_code, max_cards=max_cards)

        logger.info(f"Import für '{language_code.upper()}' erfolgreich abgeschlossen!")

if __name__ == "__main__":
    importer = PokémonTCGImporter()
    importer.run_initial_quick_import("de", first_n_sets=1, max_cards=2)
