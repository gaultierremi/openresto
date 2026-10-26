#!/usr/bin/env python3
"""Teste le profil sur une copie de la base migrée par l'API, jamais sur l'original."""

import json
from pathlib import Path
import sqlite3
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import demo_online_data as demo


class DemoDataTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        with sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True) as source:
            source.backup(self.db)
        self.sql = "\n".join(line for line in demo.sql().splitlines() if not line.startswith("."))

    def tearDown(self):
        self.db.close()

    def test_profile_contains_one_fictional_restaurant_and_three_translated_dishes(self):
        self.db.executescript(self.sql)
        self.assertEqual([(demo.NAME,)], self.db.execute("SELECT Name FROM Restaurants").fetchall())
        self.assertEqual((3,), self.db.execute("SELECT COUNT(*) FROM Tables").fetchone())
        items = self.db.execute("SELECT Name, PrimaryLanguage, TranslationsJson FROM MenuItems").fetchall()
        self.assertEqual(3, len(items))
        for name, language, raw in items:
            self.assertEqual("fr", language)
            self.assertTrue(name)
            translations = json.loads(raw)
            self.assertEqual({"nl", "en"}, set(translations))
            for copy in translations.values():
                self.assertTrue(copy["Name"])
                self.assertTrue(copy["Description"])
        self.assertEqual((demo.ORIGIN,), self.db.execute("SELECT WebsiteUrl FROM BrandSettings").fetchone())
        self.assertEqual((0,), self.db.execute("SELECT COUNT(*) FROM EmailSettings").fetchone())
        self.assertEqual((0,), self.db.execute("SELECT COUNT(*) FROM Bookings").fetchone())
        self.assertEqual([], self.db.execute("PRAGMA foreign_key_check").fetchall())

    def test_existing_restaurant_refuses_without_any_write(self):
        if self.db.execute("SELECT COUNT(*) FROM Restaurants").fetchone()[0] == 0:
            row = {**demo.dataset()["restaurants"][0]["row"], "Name": "Autre restaurant inventé"}
            self.db.execute(demo.seed.insert("Restaurants", row))
        self.db.execute("UPDATE Restaurants SET Name='Autre restaurant inventé' WHERE Id=1")
        self.db.commit()
        before = list(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.executescript(self.sql)
        self.db.rollback()
        self.assertEqual(before, list(self.db.iterdump()))

    def test_existing_settings_refuse_without_any_write(self):
        self.db.execute("INSERT INTO BrandSettings (Id, AppName, PrimaryColor) VALUES (1, 'Configuration inventée', '#000000')")
        self.db.commit()
        before = list(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.executescript(self.sql)
        self.db.rollback()
        self.assertEqual(before, list(self.db.iterdump()))

    def test_second_seed_refuses_and_preserves_data(self):
        self.db.executescript(self.sql)
        before = list(self.db.iterdump())
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.executescript(self.sql)
        self.db.rollback()
        self.assertEqual(before, list(self.db.iterdump()))


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
