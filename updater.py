import sqlite3
import logging
from database import get_connection, DATABASE_NAME
from importer import PokémonTCGImporter

logger = logging.getLogger("TCGUpdater")

class PokémonTCGUpdater:
    def __init__(self, db_path=DATABASE_NAME):
        self.db_path = db_path
        self.importer = PokémonTCGImporter(db_path=db_path)

    def update_sets_and_new_cards(self, language_code="de", sets_limit=5):
        """
        Performs an incremental update:
        1. Refreshes the sets list.
        2. Identifies any set that has fewer cards in our db than 'total_cards' listed by the API.
        3. Imports missing card records for those active sets.
        """
        logger.info("Überprüfe auf neue Sets...")
        # Refresh sets in SQLite
        self.importer.import_sets(language_code)

        conn = get_connection(self.db_path)
        cursor = conn.cursor()
        
        # Select sets where card count in database is lower than set's total_cards for this language
        cursor.execute("""
            SELECT s.set_code, s.set_name, s.total_cards, COALESCE(c.card_count, 0) as db_card_count
            FROM sets s
            LEFT JOIN (
                SELECT set_code, COUNT(*) as card_count
                FROM cards
                WHERE language = ?
                GROUP BY set_code
            ) c ON s.set_code = c.set_code
            WHERE s.language = ?
            ORDER BY s.id DESC
            LIMIT ?
        """, (language_code.upper(), language_code.upper(), sets_limit))
        
        sets_to_update = cursor.fetchall()
        conn.close()

        logger.info(f"Überprüfe {len(sets_to_update)} Sets auf fehlende Karten...")
        
        updated_sets_count = 0
        for s in sets_to_update:
            set_code = s['set_code']
            set_name = s['set_name']
            total = s['total_cards']
            current = s['db_card_count']
            
            if current < total:
                logger.info(f"Set '{set_name}' ({set_code}) hat {current}/{total} Karten. Starte Download...")
                self.importer.import_cards_for_set(set_code, language_code)
                updated_sets_count += 1
            else:
                logger.info(f"Set '{set_name}' ({set_code}) ist mit {current}/{total} Karten bereits auf dem neuesten Stand.")

        logger.info(f"Update abgeschlossen. {updated_sets_count} Sets wurden aktualisiert.")
        return updated_sets_count

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    updater = PokémonTCGUpdater()
    updater.update_sets_and_new_cards("de", sets_limit=3)
