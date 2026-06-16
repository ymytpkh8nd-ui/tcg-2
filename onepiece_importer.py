import urllib.request
import urllib.parse
import urllib.error
import sqlite3
import re
import os
import sys
import ssl
import html
import time
from database import get_connection, DATABASE_NAME

# Disable SSL verification to prevent handshake errors on specific networks
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

def log(msg, level="INFO"):
    print(f"[{level}] {msg}", flush=True)

# Helper to load HTML safely using urllib with custom headers
def load_html(url, retries=3):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://asia-en.onepiece-cardgame.com/"
    }
    req = urllib.request.Request(url, headers=headers)
    for i in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read().decode('utf-8', errors='ignore')
        except Exception as e:
            if i == retries - 1:
                log(f"Failed to fetch {url} after {retries} retries: {e}", "WARNING")
                return None
            time.sleep(1)
    return None

def normalize_set_code(option_text, option_value):
    # Try matching brackets [OP-01] or Japanese 【OP-01】
    m = re.search(r'[\[【]([A-Za-z0-9\-]+)[\]】]', option_text)
    if m:
        code = m.group(1).upper()
        return code.replace("-", "")
    
    # Fallback to standard conventions
    text_lower = option_text.lower()
    if "promotion" in text_lower:
        return "PR"
    if "limited" in text_lower:
        return "PR"
    if "family" in text_lower:
        return "ST01"
    
    # Try looking at ST-xx or OP-xx inside text
    m_alt = re.search(r'(OP|ST|EB|PRB|PR)-\d+', option_text, re.IGNORECASE)
    if m_alt:
        return m_alt.group(0).upper().replace("-", "")
        
    return "PR"

def clean_set_name(text):
    text = html.unescape(text)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', ' ', text)
    # Extract name inside hyphens if present, e.g., "-ROMANCE DAWN-"
    hyphen_match = re.search(r'[-–•]([^-–•]+)[-–•]', text)
    if hyphen_match:
        name = hyphen_match.group(1).strip()
        if name:
            return name
            
    # Or extract name before bracket, e.g. "STARTER DECK -Straw Hat Crew-"
    bracket_pos = text.find('[')
    if bracket_pos == -1:
        bracket_pos = text.find('【')
    if bracket_pos != -1:
        text = text[:bracket_pos].strip()
        
    # Standardize cleanup
    text = text.replace("BOOSTER PACK", "").replace("STARTER DECK EX", "").replace("STARTER DECK", "").replace("EXTRA BOOSTER", "").replace("PREMIUM BOOSTER", "").replace("ULTIMATE DECK", "")
    text = text.strip("- ")
    return text.strip() or "Promotional Cards"

def extract_field(label, text):
    pattern = r'<div class="' + label + r'">\s*<h3>[^<]+</h3>(.*?)</div>'
    m = re.search(pattern, text, re.DOTALL | re.IGNORECASE)
    if m:
        val = m.group(1).strip()
        val = re.sub(r'<[^>]+>', ' ', val)
        return " ".join(val.split()).strip()
    return ""

def parse_cards_from_html(html_content, set_code, set_name, language):
    # Regex to find all card dl blocks
    blocks = re.findall(r'<dl class="modalCol"[^>]*id="([^"]+)"[^>]*>(.*?)</dl>', html_content, re.DOTALL)
    cards = []
    
    for card_id, block_text in blocks:
        # 1. InfoCol for code/rarity/type
        spans = re.findall(r'<span>(.*?)</span>', block_text, re.DOTALL)
        card_number = spans[0].strip() if len(spans) > 0 else card_id
        rarity_val = spans[1].strip() if len(spans) > 1 else ""
        supertype_val = spans[2].strip() if len(spans) > 2 else ""
        
        # Normalize rarity
        if rarity_val.lower() == "l": rarity_val = "Leader"
        elif rarity_val.lower() == "c": rarity_val = "Common"
        elif rarity_val.lower() == "uc" or rarity_val.lower() == "u": rarity_val = "Uncommon"
        elif rarity_val.lower() == "r": rarity_val = "Rare"
        elif rarity_val.lower() == "sr": rarity_val = "Super Rare"
        elif rarity_val.lower() == "sec": rarity_val = "Secret Rare"
        elif rarity_val.lower() == "sp": rarity_val = "Special Card"
        elif rarity_val.lower() == "p": rarity_val = "Promo"
        
        # 2. Card Name
        name_match = re.search(r'<div class="cardName">(.*?)</div>', block_text, re.DOTALL)
        card_name = html.unescape(name_match.group(1).strip()) if name_match else ""
        if language == "EN":
            card_name = add_parallel_suffix(card_name, card_id)
        
        # 3. Image URL
        img_match = re.search(r'data-src="([^"]+)"', block_text)
        relative_image = img_match.group(1).strip() if img_match else ""
        
        if relative_image:
            relative_image = relative_image.split('?')[0] # remove query strings
            if relative_image.startswith('../'):
                relative_image = relative_image[2:]
            if not relative_image.startswith('/'):
                relative_image = '/' + relative_image
        else:
            relative_image = f"/images/cardlist/card/{card_number}.png"
            
        base_domain = "https://onepiece-cardgame.com" if language == "JA" else "https://asia-en.onepiece-cardgame.com"
        image_url = base_domain + relative_image
        
        # 4. Extract power, counter, color, subtype, effect, trigger
        power = extract_field("power", block_text)
        counter = extract_field("counter", block_text)
        color = extract_field("color", block_text)
        subtype = extract_field("feature", block_text) # Feature is the subtype
        effect = extract_field("text", block_text)
        trigger = extract_field("trigger", block_text)
        
        # Build cards mapping
        card_obj = {
            "card_id": card_id,
            "card_number": card_number,
            "english_name": card_name if language == "EN" else "",
            "japanese_name": card_name if language == "JA" else "",
            "local_name": card_name,
            "rarity": rarity_val or "Common",
            "supertype": supertype_val or "Character",
            "subtype": subtype,
            "color": color,
            "power": power,
            "counter": counter,
            "effect": effect,
            "trigger": trigger,
            "image_small": image_url,
            "image_large": image_url,
            "set_code": set_code,
            "set_name": set_name,
            "language": language
        }
        cards.append(card_obj)
        
    return cards

def is_parallel_card_id(card_id):
    return bool(re.search(r'_p\d+$', str(card_id or ""), re.IGNORECASE))

def base_card_id(card_id):
    return re.sub(r'_p\d+$', '', str(card_id or ""), flags=re.IGNORECASE)

def add_parallel_suffix(name, card_id):
    clean_name = (name or "").strip()
    if not clean_name:
        return clean_name
    if is_parallel_card_id(card_id) and "parallel" not in clean_name.lower():
        return f"{clean_name} (Parallel)"
    return clean_name

def build_name_indexes(cards, name_key):
    by_id = {}
    base_by_number = {}
    first_by_number = {}

    for card in cards:
        card_id = str(card.get("card_id") or "")
        card_number = card.get("card_number")
        name = (card.get(name_key) or "").strip()
        if not card_id or not name:
            continue

        by_id[card_id.lower()] = name
        if card_number and card_number not in first_by_number:
            first_by_number[card_number] = name
        if card_number and not is_parallel_card_id(card_id):
            base_by_number[card_number] = name

    return by_id, base_by_number, first_by_number

def paired_name(card, exact_by_id, base_by_number, first_by_number, fallback=""):
    card_id = str(card.get("card_id") or "")
    card_number = card.get("card_number")
    exact = exact_by_id.get(card_id.lower())
    if exact:
        return add_parallel_suffix(exact, card_id)

    base_id_name = exact_by_id.get(base_card_id(card_id).lower())
    if base_id_name:
        return add_parallel_suffix(base_id_name, card_id)

    number_name = base_by_number.get(card_number) or first_by_number.get(card_number) or fallback
    return add_parallel_suffix(number_name, card_id)

def clear_one_piece_catalog(cursor):
    log("Bereinige alte One-Piece-Katalogdaten vor dem offiziellen Neuimport...")
    cursor.execute("DELETE FROM cards WHERE game = 'onepiece'")
    cursor.execute("DELETE FROM sets WHERE game = 'onepiece'")

def heal_saved_one_piece_rows(cursor):
    # Inventory/favorites keep snapshots for export. Refresh those snapshots from
    # the authoritative card catalog while preserving price, notes and dates.
    log("Synchronisiere One-Piece Inventar/Favoriten mit dem offiziellen Katalog...")
    def find_match(row):
        cursor.execute("""
            SELECT *
            FROM cards
            WHERE game = 'onepiece'
              AND (
                api_card_id = ?
                OR (
                  card_number = ?
                  AND language = ?
                  AND set_code = ?
                  AND api_card_id NOT LIKE '%\\_p%' ESCAPE '\\'
                )
              )
            ORDER BY
              CASE WHEN api_card_id = ? THEN 0 ELSE 1 END,
              CASE WHEN api_card_id LIKE '%\\_p%' ESCAPE '\\' THEN 1 ELSE 0 END,
              api_card_id
            LIMIT 1
        """, (
            row["api_card_id"],
            row["card_number"],
            row["language"],
            row["set_code"],
            row["api_card_id"]
        ))
        return cursor.fetchone()

    cursor.execute("SELECT * FROM reseller_inventory WHERE game = 'onepiece'")
    inventory_rows = cursor.fetchall()
    healed_inventory = 0
    for row in inventory_rows:
        match = find_match(row)
        if not match:
            continue
        cursor.execute("""
            UPDATE reseller_inventory
            SET api_card_id = ?,
                pokemon_name = ?,
                local_name = ?,
                japanese_name = ?,
                set_name = ?,
                set_code = ?,
                rarity = ?,
                image_small = ?
            WHERE id = ?
        """, (
            match["api_card_id"],
            match["pokemon_name"],
            match["local_name"],
            match["japanese_name"],
            match["set_name"],
            match["set_code"],
            match["rarity"],
            match["image_small"],
            row["id"]
        ))
        healed_inventory += 1

    cursor.execute("SELECT * FROM reseller_favorites WHERE game = 'onepiece'")
    favorite_rows = cursor.fetchall()
    healed_favorites = 0
    for row in favorite_rows:
        match = find_match(row)
        if not match:
            continue
        try:
            cursor.execute("""
                UPDATE reseller_favorites
                SET api_card_id = ?,
                    english_name = ?,
                    local_name = ?,
                    japanese_name = ?,
                    set_name = ?,
                    set_code = ?,
                    rarity = ?,
                    image_small = ?,
                    image_large = ?
                WHERE id = ?
            """, (
                match["api_card_id"],
                match["english_name"],
                match["local_name"],
                match["japanese_name"],
                match["set_name"],
                match["set_code"],
                match["rarity"],
                match["image_small"],
                match["image_large"],
                row["id"]
            ))
            healed_favorites += 1
        except sqlite3.IntegrityError:
            log(f"Favorit {row['id']} übersprungen: Zielkarte {match['api_card_id']} existiert bereits in Favoriten.", "WARNING")

    log(f"Inventar/Favoriten aktualisiert: {healed_inventory}/{len(inventory_rows)} Inventar, {healed_favorites}/{len(favorite_rows)} Favoriten.")

def sync_one_piece(limit_sets=0):
    log("=== One Piece TCG Live Synchronisations-Engine ===")
    
    # 1. Discover all active English sets directly from Bandai's English Portal
    en_portal_url = "https://asia-en.onepiece-cardgame.com/cardlist/"
    log(f"Durchsuche offizielle English-API: {en_portal_url}...")
    en_html = load_html(en_portal_url)
    if not en_html:
        log("Verbindung zum English One Piece Portal fehlgeschlagen. Abbruch.", "ERROR")
        return
        
    en_options = re.findall(r'<option\s+value="(\d+)"[^>]*>(.*?)</option>', en_html, re.DOTALL)
    en_sets = {}
    for val, label in en_options:
        val = val.strip()
        label = label.strip()
        if not val or val == "ALL":
            continue
        code = normalize_set_code(label, val)
        name = clean_set_name(label)
        
        series_cat = "BOOSTER PACK"
        if "STARTER DECK" in label.upper() or "ULTIMATE DECK" in label.upper() or "FAMILY DECK" in label.upper():
            series_cat = "STARTER DECK"
        elif "PROMOTION" in label.upper() or val == "556901" or val == "556801":
            series_cat = "PROMOTION"
        elif "EXTRA BOOSTER" in label.upper():
            series_cat = "EXTRA BOOSTER"
            
        en_sets[code] = {
            "value": val,
            "code": code,
            "name": name,
            "series": series_cat
        }
        
    log(f"Erfolgreich {len(en_sets)} englische Veröffentlichungen entdeckt!")
    
    # 2. Discover Japanese sets directly from Bandai's Japanese Portal
    ja_portal_url = "https://onepiece-cardgame.com/cardlist/"
    log(f"Durchsuche offizielle Japanisch-API: {ja_portal_url}...")
    ja_html = load_html(ja_portal_url)
    ja_sets = {}
    if ja_html:
        ja_options = re.findall(r'<option\s+value="(\d+)"[^>]*>(.*?)</option>', ja_html, re.DOTALL)
        for val, label in ja_options:
            val = val.strip()
            label = label.strip()
            if not val or val == "ALL":
                continue
            code = normalize_set_code(label, val)
            name = clean_set_name(label)
            
            series_cat = "BOOSTER PACK"
            if "スタートデッキ" in label or "アルティメットデッキ" in label or "ST-" in label:
                series_cat = "STARTER DECK"
            elif "プロモーション" in label or "PROMO" in label or val == "550901" or val == "550801":
                series_cat = "PROMOTION"
            elif "エクストラ" in label or "EB-" in label:
                series_cat = "EXTRA BOOSTER"
                
            ja_sets[code] = {
                "value": val,
                "code": code,
                "name": name,
                "series": series_cat
            }
        log(f"Erfolgreich {len(ja_sets)} japanische Veröffentlichungen entdeckt!")
    else:
        log("Verbindung zum japanischen Portal fehlgeschlagen. Fahre rein englisch fort.", "WARNING")
        
    # Combine sets list
    all_codes = sorted(list(set(list(en_sets.keys()) + list(ja_sets.keys()))))
    log(f"Gesamte eindeutige Sets in beiden Sprachen gefunden: {len(all_codes)}")
    
    # Filter sets if limit is set (e.g. 1 means Standard/Moderne sets only)
    if limit_sets > 0:
        # Standard filter: OP01-OP10, EB01-EB04 and PR promos
        standard_codes = ["OP01", "OP02", "OP03", "OP04", "OP05", "OP06", "OP07", "OP08", "OP09", "OP10", "EB01", "PR"]
        all_codes = [c for c in all_codes if c in standard_codes or c.startswith("ST")]
        # Truncate lists to limits
        if len(all_codes) > limit_sets + 5:
            all_codes = all_codes[:limit_sets + 5]
        log(f"Umfang auf {len(all_codes)} wichtigste Sets gefiltert.")
        
    # SQLite Setup and writing
    conn = get_connection(DATABASE_NAME)
    cursor = conn.cursor()
    
    clear_one_piece_catalog(cursor)
    conn.commit()
    
    # Loop over sets and scrape
    for idx, code in enumerate(all_codes):
        en_meta = en_sets.get(code)
        ja_meta = ja_sets.get(code)
        
        set_name = (en_meta and en_meta["name"]) or (ja_meta and ja_meta["name"]) or code
        series_cat = (en_meta and en_meta["series"]) or (ja_meta and ja_meta["series"]) or "BOOSTER PACK"
        
        log(f"[{idx+1}/{len(all_codes)}] Verarbeite Set {set_name} [{code}] ...")
        
        # Scrape English cards
        en_cards = []
        if en_meta:
            en_cards_url = f"https://asia-en.onepiece-cardgame.com/cardlist/?series={en_meta['value']}"
            log(f"  -> Scraping English: {en_cards_url}...")
            en_cards_html = load_html(en_cards_url)
            if en_cards_html:
                en_cards = parse_cards_from_html(en_cards_html, code, set_name, "EN")
                log(f"     Gefunden: {len(en_cards)} englische Originalkarten.")
                
        # Scrape Japanese cards
        ja_cards = []
        if ja_meta:
            ja_cards_url = f"https://onepiece-cardgame.com/cardlist/?series={ja_meta['value']}"
            log(f"  -> Scraping Japanese: {ja_cards_url}...")
            ja_cards_html = load_html(ja_cards_url)
            if ja_cards_html:
                ja_cards = parse_cards_from_html(ja_cards_html, code, set_name, "JA")
                log(f"     Gefunden: {len(ja_cards)} japanische Originalkarten.")
                
        if not en_cards and not ja_cards:
            log(f"     Keine Karten für Set [{code}] gefunden. Überspringe.", "WARNING")
            continue
            
        # Reconcile local names and translations by official modal/card id.
        # One Piece parallel artworks share printed card numbers, so card_number
        # alone can pair a parallel name with the normal artwork.
        en_names_by_id, en_base_by_number, en_first_by_number = build_name_indexes(en_cards, "english_name")
        ja_names_by_id, ja_base_by_number, ja_first_by_number = build_name_indexes(ja_cards, "japanese_name")
        
        # 1. Write Sets to sqlite
        # For English
        if en_cards:
            cursor.execute("""
                INSERT INTO sets (set_name, set_code, series, language, release_date, total_cards, game)
                VALUES (?, ?, ?, 'EN', ?, ?, 'onepiece')
                ON CONFLICT(set_code, language) DO UPDATE SET
                    set_name=excluded.set_name,
                    series=excluded.series,
                    total_cards=excluded.total_cards,
                    updated_at=CURRENT_TIMESTAMP
            """, (set_name, code, series_cat, "2024-01-01", len(en_cards)))
            
        # For Japanese
        if ja_cards:
            cursor.execute("""
                INSERT INTO sets (set_name, set_code, series, language, release_date, total_cards, game)
                VALUES (?, ?, ?, 'JA', ?, ?, 'onepiece')
                ON CONFLICT(set_code, language) DO UPDATE SET
                    set_name=excluded.set_name,
                    series=excluded.series,
                    total_cards=excluded.total_cards,
                    updated_at=CURRENT_TIMESTAMP
            """, (set_name, code, series_cat, "2024-01-01", len(ja_cards)))
            
        # Write Cards to sqlite
        # EN cards
        for card in en_cards:
            jp_name = paired_name(card, ja_names_by_id, ja_base_by_number, ja_first_by_number, "")
            uni_name = f"{card['english_name']} {card['card_number']}"
            api_id = f"{card['card_id'].lower()}-en"
            
            cursor.execute("""
                INSERT INTO cards (
                    api_card_id, english_name, local_name, pokemon_name, japanese_name,
                    language, set_name, set_code, card_number, rarity, supertype,
                    subtype, types, hp, image_small, image_large, game
                ) VALUES (?, ?, ?, ?, ?, 'EN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'onepiece')
                ON CONFLICT(api_card_id, language) DO UPDATE SET
                    english_name=excluded.english_name,
                    local_name=excluded.local_name,
                    pokemon_name=excluded.pokemon_name,
                    japanese_name=excluded.japanese_name,
                    rarity=excluded.rarity,
                    supertype=excluded.supertype,
                    subtype=excluded.subtype,
                    types=excluded.types,
                    image_small=excluded.image_small,
                    image_large=excluded.image_large,
                    updated_at=CURRENT_TIMESTAMP
            """, (
                api_id, card["english_name"], card["local_name"], uni_name, jp_name,
                card["set_name"], card["set_code"], card["card_number"], card["rarity"],
                card["supertype"], card["subtype"], card["color"], card["power"],
                card["image_small"], card["image_large"]
            ))
            
        # JA cards
        for card in ja_cards:
            en_name = paired_name(card, en_names_by_id, en_base_by_number, en_first_by_number, card["card_id"]) or card["card_id"]
            uni_name = f"{en_name} {card['card_number']}"
            api_id = f"{card['card_id'].lower()}-ja"
            
            cursor.execute("""
                INSERT INTO cards (
                    api_card_id, english_name, local_name, pokemon_name, japanese_name,
                    language, set_name, set_code, card_number, rarity, supertype,
                    subtype, types, hp, image_small, image_large, game
                ) VALUES (?, ?, ?, ?, ?, 'JA', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'onepiece')
                ON CONFLICT(api_card_id, language) DO UPDATE SET
                    english_name=excluded.english_name,
                    local_name=excluded.local_name,
                    pokemon_name=excluded.pokemon_name,
                    japanese_name=excluded.japanese_name,
                    rarity=excluded.rarity,
                    supertype=excluded.supertype,
                    subtype=excluded.subtype,
                    types=excluded.types,
                    image_small=excluded.image_small,
                    image_large=excluded.image_large,
                    updated_at=CURRENT_TIMESTAMP
            """, (
                api_id, en_name, card["local_name"], uni_name, card["japanese_name"],
                card["set_name"], card["set_code"], card["card_number"], card["rarity"],
                card["supertype"], card["subtype"], card["color"], card["power"],
                card["image_small"], card["image_large"]
            ))
            
        conn.commit()
        log(f"[SUCCESS] {set_name} [{code}] synchronisiert!")
        
        # Respect spacing spacing delay
        time.sleep(0.3)
    
    heal_saved_one_piece_rows(cursor)
    conn.commit()
    conn.close()
    log("[SYSTEM] Synchronisation vollständig beendet und Commits verarbeitet!")

if __name__ == "__main__":
    limit = 0
    if len(sys.argv) > 1 and sys.argv[1] == "import":
        # Check if there is limit argument
        for idx, arg in enumerate(sys.argv):
            if arg == "--sets-count" and idx + 1 < len(sys.argv):
                try:
                    count_val = int(sys.argv[idx + 1])
                    if count_val > 0:
                        limit = count_val
                except ValueError:
                    pass
    sync_one_piece(limit_sets=limit)
