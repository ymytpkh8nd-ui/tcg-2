from dataclasses import dataclass, asdict, field
from typing import List, Optional
from datetime import datetime

@dataclass
class SetModel:
    set_name: str
    set_code: str
    series: Optional[str] = None
    language: str = "English"
    release_date: Optional[str] = None
    total_cards: int = 0
    id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_sqlite_dict(self):
        """Converts dataclass to a dictionary ready for SQLite helper insertion."""
        d = asdict(self)
        if d['id'] is None:
            del d['id']
        if d['created_at'] is None:
            del d['created_at']
        if d['updated_at'] is None:
            del d['updated_at']
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
    types: Optional[str] = None  # Comma-separated or JSON array of types
    evolves_from: Optional[str] = None
    regulation_mark: Optional[str] = None
    illustrator: Optional[str] = None
    release_date: Optional[str] = None
    image_small: Optional[str] = None
    image_large: Optional[str] = None
    cardmarket_id: Optional[str] = None
    japanese_name: Optional[str] = None
    id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    def to_sqlite_dict(self):
        """Converts dataclass to a dictionary ready for SQLite helper insertion."""
        d = asdict(self)
        if d['id'] is None:
            del d['id']
        if d['created_at'] is None:
            del d['created_at']
        if d['updated_at'] is None:
            del d['updated_at']
        return d
