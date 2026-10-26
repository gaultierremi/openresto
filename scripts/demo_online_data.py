#!/usr/bin/env python3
"""Profil de démonstration isolé, assemblé par le générateur commun demo_data."""

from datetime import datetime, timezone
import json

import demo_data as seed

NAME = "L'Atelier des Nuages — démonstration"
ORIGIN = "https://openresto.134-209-92-233.sslip.io"
DISHES = [
    ("Croquettes de légumes", "Légumes de saison, sauce aux herbes", 1450, ["Gluten", "Eggs"], ["Vegetarian"],
     "Groentekroketten", "Seizoensgroenten, kruidensaus", "Vegetable croquettes", "Seasonal vegetables, herb sauce"),
    ("Carbonnade de champignons", "Champignons mijotés, pommes de terre", 2200, ["Gluten"], ["Vegan"],
     "Paddenstoelenstoofpot", "Gestoofde paddenstoelen, aardappelen", "Mushroom stew", "Slow-cooked mushrooms, potatoes"),
    ("Tarte aux pommes", "Pommes rôties et crème vanillée", 850, ["Gluten", "Milk", "Eggs"], ["Vegetarian"],
     "Appeltaart", "Geroosterde appels en vanilleroom", "Apple tart", "Roasted apples and vanilla cream"),
]


def dataset():
    seed.LOCATIONS = [{
        "name": NAME, "address": "1, place des Nuages — adresse fictive, Bruxelles",
        "timezone": "Europe/Brussels", "open_days": "1,2,3,4,5,6,7",
        "open_time": "11:00", "close_time": "23:00", "duration": 90,
        "slot_interval": 30, "ref_format": 0, "retention_months": 1,
        "description": "Restaurant inventé. Réservations fictives, aucun e-mail envoyé, aucun paiement.",
        "email": "bonjour@atelier-nuages.example",
        "sections": [{"name": "Salle / Zaal / Dining room", "tables": [("A", 2), ("B", 4), ("C", 6)]}],
    }]
    seed.MENUS = {NAME: [{
        "name": "Carte / Kaart / Menu", "description": "EUR · Démonstration / Demo",
        "currency": "EUR", "published": True,
        "categories": [{"name": "Nos plats / Gerechten / Dishes", "items": [
            (fr, description, price, 0, allergens, tags)
            for fr, description, price, allergens, tags, *_ in DISHES
        ]}],
    }]}
    seed.SITES = {}
    seed.DEMO_INVITATION_LOCATION = NAME
    seed.BRAND = {
        **seed.BRAND, "AppName": NAME, "WebsiteUrl": ORIGIN,
        "PhoneNumber": None, "EmailAddress": "bonjour@atelier-nuages.example",
        "Subtitle": "Démonstration fictive · aucun e-mail ni paiement réel",
        "CopyrightText": "Restaurant fictif — OpenResto en démonstration",
        "PrivacyPolicyUrl": None,
    }
    seed.HIGHLIGHTS = [("Démonstration / Demo", "Restaurant fictif, aucun paiement ni e-mail réel.", "restaurant-outline", None)]
    seed.SOCIAL_LINKS = []
    data = seed.build_dataset(datetime.now(timezone.utc))
    data["invitations"] = []
    for item, dish in zip(data["menu_items"], DISHES, strict=True):
        _, _, _, _, _, nl_name, nl_description, en_name, en_description = dish
        item["PrimaryLanguage"] = "fr"
        item["TranslationsJson"] = json.dumps({
            "nl": {"Name": nl_name, "Description": nl_description},
            "en": {"Name": en_name, "Description": en_description},
        }, ensure_ascii=False)
    return data


def sql():
    return "\n".join([
        ".bail on", ".timeout 5000", "PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;",
        "CREATE TEMP TABLE demo_vide (valide INTEGER CHECK(valide=1));",
        "INSERT INTO demo_vide SELECT (SELECT COUNT(*) FROM Bookings)=0"
        " AND (SELECT COUNT(*) FROM BrandSettings)=0"
        " AND (SELECT COUNT(*) FROM EmailSettings)=0"
        " AND (SELECT COUNT(*) FROM Menus)=0"
        " AND (SELECT COUNT(*) FROM RestaurantSites)=0"
        " AND (SELECT COUNT(*) FROM RestaurantMembers)=0"
        " AND (SELECT COUNT(*) FROM RestaurantInvitations)=0"
        " AND (SELECT COUNT(*) FROM AdminAuditEntries)=0"
        " AND ((SELECT COUNT(*) FROM Restaurants)=0 OR ("
        " (SELECT COUNT(*) FROM Restaurants)=2 AND"
        " (SELECT COUNT(*) FROM Restaurants WHERE (Name='Pasta Place' AND Address='123 Main St')"
        " OR (Name='Sushi Spot' AND Address='456 Elm St'))=2));",
        *seed.emit_config(dataset()), "DROP TABLE demo_vide;", "COMMIT;",
    ])


if __name__ == "__main__":
    print(sql())
