import argparse
import sys
import os
import json
from database import init_db, DATABASE_NAME
from importer import PokémonTCGImporter
from updater import PokémonTCGUpdater
from search import PokémonTCGSearch

def print_banner():
    print("=" * 70)
    print("  POKÉMON TCG DATABASE MANAGER & PYTHON AUTOMATION SUITE")
    print("=" * 70)

def main():
    parser = argparse.ArgumentParser(
        description="Verwaltet eine lokale SQLite-Datenbank (pokemon_cards.db) mit allen Pokémon-Karten."
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Verfügbare Befehle")

    # Command: init
    subparsers.add_parser("init", help="Initialisiert die SQLite-Datenbank und Tabellenstrukturen.")

    # Command: import
    import_parser = subparsers.add_parser("import", help="Importiert Sets und Karten.")
    import_parser.add_argument("--lang", default="de", choices=["de", "en", "ja"], help="Bestimmt die lokale Sprache (Standard: de)")
    import_parser.add_argument("--sets-count", type=int, default=3, help="Wie viele Sets sollen initial importiert werden (Standard: 3 für Schnelligkeit, 0 für ALLE Sets)")
    import_parser.add_argument("--full", action="store_true", help="Führt einen erweiterten Import aller bekannten Sets aus.")
    import_parser.add_argument("--all-cards", action="store_true", help="Importiert alle Karten der Sets ohne Beschränkung auf 10 Karten.")

    # Command: update
    update_parser = subparsers.add_parser("update", help="Führt ein inkrementelles Update durch.")
    update_parser.add_argument("--lang", default="de", choices=["de", "en", "ja"], help="Lokale Sprache des Updates")
    update_parser.add_argument("--limit", type=int, default=5, help="Anzahl der Sets, die abgeglichen werden sollen")

    # Command: search
    search_parser = subparsers.add_parser("search", help="Durchsucht die Datenbank nach Pokémon-Karten.")
    search_parser.add_argument("--eng", help="Suche nach englischem Namen")
    search_parser.add_argument("--local", help="Suche nach lokalem / deutschen Namen")
    search_parser.add_argument("--set", help="Suche nach Set-Name")
    search_parser.add_argument("--number", help="Suche nach exakter Kartennummer")
    search_parser.add_argument("--lang-filter", help="Suche nach Sprache (DE / EN / etc.)")
    search_parser.add_argument("--rarity", help="Suche nach Seltenheit (z.B. Rare Holo, Common)")
    search_parser.add_argument("--limit", type=int, default=10, help="Maximale Anzahl an Suchergebnissen")

    args = parser.parse_args()

    print_banner()

    if args.command == "init":
        init_db()
    
    elif args.command == "import":
        init_db() # Ensure DB exists
        importer = PokémonTCGImporter()
        if args.full:
            print(f"Starte erweiterten Import aller Sets für Sprache '{args.lang}'...")
            importer.import_sets(args.lang)
            print("Set-Listen wurden geladen. Um Karten zu importieren, bitte 'update' ausführen oder ein bestimmtes Set laden.")
        else:
            limit_val = None if args.all_cards else 10
            limit_desc = "alle Karten" if args.all_cards else "maximal 10 Karten pro Set"
            sets_desc = "alle Sets" if args.sets_count <= 0 else f"die letzten {args.sets_count} Sets"
            print(f"Führe Initialimport durch ({sets_desc} in '{args.lang}' mit {limit_desc})...")
            importer.run_initial_quick_import(args.lang, first_n_sets=args.sets_count, max_cards=limit_val)

    elif args.command == "update":
        updater = PokémonTCGUpdater()
        print(f"Überprüfe Bestandsdaten und importiere neue Karten (Sprache: {args.lang})...")
        updater.update_sets_and_new_cards(args.lang, sets_limit=args.limit)

    elif args.command == "search":
        search = PokémonTCGSearch()
        print("Suche läuft mit folgenden Filtern:")
        if args.eng: print(f" - Englischer Name: {args.eng}")
        if args.local: print(f" - Lokaler Name: {args.local}")
        if args.set: print(f" - Set-Name: {args.set}")
        if args.number: print(f" - Kartennummer: {args.number}")
        if args.lang_filter: print(f" - Sprache: {args.lang_filter}")
        if args.rarity: print(f" - Seltenheit: {args.rarity}")
        print("-" * 70)

        results = search.query_cards(
            english_name=args.eng,
            local_name=args.local,
            set_name=args.set,
            card_number=args.number,
            language=args.lang_filter,
            rarity=args.rarity,
            limit=args.limit
        )

        if not results:
            print("Keine Karten gefunden, die den Suchkriterien entsprechen.")
            print("Tipp: Führe einen Import mit 'python3 main.py import' aus, um Testkarten zu laden.")
        else:
            for i, card in enumerate(results, 1):
                print(f"{i:2d}. {card['local_name']} (Englisch: {card['english_name']})")
                print(f"    Set: {card['set_name']} ({card['set_code']}) | Nr: {card['card_number']} | Seltenheit: {card['rarity'] or 'Unspezifiziert'}")
                print(f"    Typen: {card['types'] or 'Keine'} | HP: {card['hp'] or 'N/A'}")
                print(f"    Cardmarket-Link: {card['cardmarket_link']}")
                print(f"    eBay-Link: {card['ebay_link']}")
                print("-" * 70)
            print(f"Insgesamt {len(results)} Karten ausgegeben.")

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
