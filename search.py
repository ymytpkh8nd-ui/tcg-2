import sqlite3
import urllib.parse
from database import get_connection, DATABASE_NAME

def generate_ebay_link(english_name: str, set_name: str, card_number: str) -> str:
    """ Generates an eBay search link for the card on eBay.de. """
    query = f"{english_name} {set_name} {card_number} pokemon tcg"
    encoded_query = urllib.parse.quote_plus(query)
    return f"https://www.ebay.de/sch/i.html?_nkw={encoded_query}"

def generate_cardmarket_link(english_name: str, card_number: str) -> str:
    """ Generates a Cardmarket search link on Cardmarket.com with [English Name] [Card Number] """
    import re
    clean_name = re.sub(r'[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]', '', english_name or "").strip()
    clean_num = re.sub(r'[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf\u3400-\u4dbf]', '', card_number or "").strip()
    
    query = f"{clean_name} {clean_num}"
    query = " ".join(query.split())
    encoded_query = urllib.parse.quote_plus(query)
    return f"https://www.cardmarket.com/de/Pokemon/Products/Search?searchString={encoded_query}"

class PokémonTCGSearch:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path

    def _enrich_card_with_links(self, card_dict: dict) -> dict:
        """ Enrich the card dictionary with automatically generated Cardmarket and eBay search links. """
        eng_name = card_dict.get("english_name", "")
        set_name = card_dict.get("set_name", "")
        card_num = card_dict.get("card_number", "")
        
        card_dict["cardmarket_link"] = generate_cardmarket_link(eng_name, card_num)
        card_dict["ebay_link"] = generate_ebay_link(eng_name, set_name, card_num)
        return card_dict

    def query_cards(self, 
                    english_name=None, 
                    local_name=None, 
                    set_name=None, 
                    card_number=None, 
                    language=None, 
                    rarity=None,
                    limit=50,
                    offset=0):
        """
        Performs a search on the 'cards' table using specified filters.
        Utilizes index structures for quick retrieval.
        """
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT * FROM cards WHERE 1=1"
        params = []
        
        if english_name:
            query += " AND english_name LIKE ?"
            params.append(f"%{english_name}%")
        if local_name:
            query += " AND local_name LIKE ?"
            params.append(f"%{local_name}%")
        if set_name:
            query += " AND set_name LIKE ?"
            params.append(f"%{set_name}%")
        if card_number:
            query += " AND card_number = ?"
            params.append(str(card_number))
        if language:
            query += " AND language = ?"
            params.append(language.upper())
        if rarity:
            query += " AND rarity = ?"
            params.append(rarity)
            
        query += " ORDER BY release_date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        
        results = []
        for r in rows:
            card_dict = dict(r)
            results.append(self._enrich_card_with_links(card_dict))
            
        return results

    def get_card_by_id(self, api_card_id: str):
        """ Fetches a single card by its unique API card ID. """
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM cards WHERE api_card_id = ?", (api_card_id,))
        row = cursor.fetchone()
        conn.close()
        
        if row:
            return self._enrich_card_with_links(dict(row))
        return None

    def get_all_sets(self, language=None):
        """ Returns all sets in the system. """
        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        query = "SELECT s.* FROM sets s WHERE EXISTS (SELECT 1 FROM cards c WHERE c.set_code = s.set_code AND c.language = s.language)"
        params = []
        if language:
            query += " AND s.language = ?"
            params.append(language.upper())
            
        query += " ORDER BY s.release_date DESC"
        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()
        return [dict(r) for r in rows]

if __name__ == "__main__":
    search = PokémonTCGSearch()
    # Test query
    test_results = search.query_cards(english_name="Pikachu", limit=5)
    print(f"Gefundene Test-Karten: {len(test_results)}")
    for card in test_results:
        print(f"- {card['english_name']} ({card['set_name']})")
        print(f"  Cardmarket: {card['cardmarket_link']}")
        print(f"  eBay: {card['ebay_link']}")
