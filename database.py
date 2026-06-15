import sqlite3
import os
from datetime import datetime

DATABASE_NAME = "pokemon_cards.db"

def get_connection(db_path=DATABASE_NAME):
    """
    Establishes a connection to the SQLite database.
    Enforces foreign keys, enables WAL mode, sets a busy timeout, and sets a row factory.
    Automatically handles database corruption by unlinking the file and recreating it.
    """
    import sqlite3
    import os
    try:
        conn = sqlite3.connect(db_path, timeout=10.0)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.row_factory = sqlite3.Row
        return conn
    except sqlite3.DatabaseError as e:
        if "malformed" in str(e).lower() or "corrupt" in str(e).lower():
            print(f"CRITICAL: SQLite database disk image at {db_path} is malformed/corrupted: {e}")
            try:
                if 'conn' in locals():
                    conn.close()
            except:
                pass
            
            print(f"Removing corrupted database file: {db_path}")
            if os.path.exists(db_path):
                try:
                    os.remove(db_path)
                except Exception as del_err:
                    print(f"Failed to delete corrupted SQLite file: {del_err}")
            
            # Retry connection with a fresh database
            conn = sqlite3.connect(db_path, timeout=10.0)
            conn.execute("PRAGMA foreign_keys = ON;")
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.row_factory = sqlite3.Row
            return conn
        else:
            raise e

def init_db(db_path=DATABASE_NAME):
    """
    Initializes the SQLite database, creating the sets and cards tables.
    Also creates required search optimization indices.
    """
    conn = get_connection(db_path)
    cursor = conn.cursor()

    # Migration: Check if sets table exists and has old UNIQUE constraint
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='sets';")
    sets_sql_row = cursor.fetchone()
    if sets_sql_row:
        sets_sql = sets_sql_row[0]
        if "UNIQUE" in sets_sql and "UNIQUE(set_code, language)" not in sets_sql:
            print("Migrating sets table to composite unique...")
            try:
                cursor.execute("ALTER TABLE sets RENAME TO sets_old;")
                cursor.execute("""
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
                """)
                cursor.execute("""
                INSERT OR IGNORE INTO sets (id, set_name, set_code, series, language, release_date, total_cards, created_at, updated_at)
                SELECT id, set_name, set_code, series, language, release_date, total_cards, created_at, updated_at FROM sets_old;
                """)
                cursor.execute("DROP TABLE sets_old;")
            except Exception as e:
                print(f"Error migrating sets table: {e}")

    # Create sets table with composite unique if not exists
    cursor.execute("""
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
        game TEXT DEFAULT 'pokemon',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(set_code, language)
    );
    """)

    # Migration: Ensure logo and symbol columns exist in sets table
    try:
        cursor.execute("ALTER TABLE sets ADD COLUMN logo TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE sets ADD COLUMN symbol TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE sets ADD COLUMN game TEXT DEFAULT 'pokemon';")
    except Exception:
        pass

    # Migration: Check if cards table exists and has old UNIQUE constraint or bad FOREIGN KEY reference
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='cards';")
    cards_sql_row = cursor.fetchone()
    if cards_sql_row:
        cards_sql = cards_sql_row[0]
        if "FOREIGN KEY" in cards_sql or ("UNIQUE" in cards_sql and "UNIQUE(api_card_id, language)" not in cards_sql):
            print("Migrating cards table to fix constraints and composite unique...")
            try:
                cursor.execute("ALTER TABLE cards RENAME TO cards_old;")
                cursor.execute("""
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
                """)
                cursor.execute("""
                INSERT OR IGNORE INTO cards (id, api_card_id, english_name, local_name, pokemon_name, japanese_name, language, set_name, set_code,
                    card_number, rarity, supertype, subtype, hp, types, evolves_from, regulation_mark, illustrator, release_date,
                    image_small, image_large, cardmarket_id, created_at, updated_at)
                SELECT id, api_card_id, english_name, local_name, pokemon_name, japanese_name, language, set_name, set_code,
                    card_number, rarity, supertype, subtype, hp, types, evolves_from, regulation_mark, illustrator, release_date,
                    image_small, image_large, cardmarket_id, created_at, updated_at FROM cards_old;
                """)
                cursor.execute("DROP TABLE cards_old;")
            except Exception as e:
                print(f"Error migrating cards table: {e}")

    # Create cards table with composite unique if not exists
    cursor.execute("""
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
        types TEXT, -- Saved as comma-separated or JSON
        evolves_from TEXT,
        regulation_mark TEXT,
        illustrator TEXT,
        release_date TEXT,
        image_small TEXT,
        image_large TEXT,
        cardmarket_id TEXT,
        game TEXT DEFAULT 'pokemon',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(api_card_id, language)
    );
    """)

    # Migration: Ensure japanese_name column exists for older database installations
    try:
        cursor.execute("ALTER TABLE cards ADD COLUMN japanese_name TEXT;")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE cards ADD COLUMN game TEXT DEFAULT 'pokemon';")
    except Exception:
        pass

    # Create indices for optimized searching as requested
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_english_name ON cards(english_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_local_name ON cards(local_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_set_name ON cards(set_name);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_card_number ON cards(card_number);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_language ON cards(language);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_cards_rarity ON cards(rarity);")
    
    conn.commit()
    conn.close()
    print(f"Database successfully initialized at {os.path.abspath(db_path)}")

if __name__ == "__main__":
    init_db()
