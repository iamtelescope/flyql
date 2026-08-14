---
title: Änderungsprotokoll
---

## 2026.08.14
Version: **1.1.1**

Fehlerbehebungen:

- **Boolesche Vergleiche auf JSON-Pfaden im PostgreSQL-Generator.** Ein nacktes boolesches Literal auf einem JSON-Pfad (`jsonb_column.enabled = true`) fiel auf den Standard-Textvergleich zurück und erzeugte ungültiges SQL (`text = boolean`), während ein in Anführungszeichen gesetztes Boolean (`= 'true'`) durch `jsonb_typeof = 'string'` abgesichert war und bei JSON-Booleans stillschweigend keine Treffer lieferte. Nackte Booleans erzeugen jetzt eine `jsonb_typeof(...) = 'boolean'`-Absicherung mit einem `::boolean`-Cast, analog zur Behandlung von Zahlen, in Go, Python und JavaScript.

## 2026.08.12
Version: **1.1.0**

Die `values`-Allowlist auf Spalten wird jetzt konsistent durchgesetzt — und nur dort, wo es sinnvoll ist — über die SQL-Generatoren, den In-Memory-Matcher und den Validator hinweg. Siehe [Werte-Allowlist](/de/syntax/values/#werte-allowlist) für die vollständige Semantik.

Verhaltensänderungen:

- **`in`- / `not in`-Listen werden gegen die Allowlist validiert.** Jedes Listenelement auf einer Spalte mit Allowlist wird während der SQL-Generierung geprüft; ein Element außerhalb der Allowlist schlägt jetzt mit `unknown value` fehl, statt stillschweigend null Zeilen zu matchen. Null-Elemente und Spaltenreferenzen sind ausgenommen. Abfragen, die zuvor SQL mit vertippten Listenelementen erzeugten, werden jetzt abgelehnt.
- **Der In-Memory-Matcher setzt die Allowlist durch.** Bei der Auswertung mit einem Schema, dessen Spalten `values` deklarieren, löst ein `=`- / `!=`-Wert oder ein `in`-Listenelement außerhalb der Allowlist `unknown value` aus (zuvor wurde stillschweigend ausgewertet — im paritätsbrechenden Gegensatz zu den Generatoren). Die schemalose Auswertung ist unverändert.
- **Neue Validator-Diagnose `value_not_allowed`.** `diagnose()` gibt jetzt einen positionierten Fehler aus, wenn ein Gleichheitswert oder ein In-Listen-Element außerhalb der Allowlist der Spalte liegt. Die Dialekt-zu-Core-Schema-Brücken (`ToFlyQLSchema` / `toFlyQLSchema`) übertragen jetzt `values`, sodass überbrückte Schemas an der Diagnose teilnehmen.

Um die Durchsetzung für eine Spalte zu deaktivieren, entferne ihre `values`-Liste aus dem Schema.

Fehlerbehebungen:

- **`= null` funktioniert auf Spalten mit Allowlist.** Null ist ein Präsenz-Prädikat, kein Domänenwert: `col = null` / `col != null` auf einer Spalte mit `values`-Allowlist erzeugen jetzt `IS NULL` / `IS NOT NULL`, statt mit `unknown value` fehlzuschlagen.
- **Muster werden nicht mehr gegen die Allowlist geprüft.** `like`- / `ilike`- / `~`- / `!~`-Muster auf Spalten mit Allowlist werden normal generiert; zuvor wurde jedes Muster abgelehnt, das nicht wörtlich in der Allowlist enthalten war, wodurch Mustervergleiche auf solchen Spalten unmöglich waren.
- **Der Go-PostgreSQL-Generator löst Spaltenreferenzen auf der rechten Seite vor der Allowlist-Prüfung auf.** `col = other_column` auf einer Spalte mit Allowlist erzeugt jetzt auf allen Generatoren einen Spalte-zu-Spalte-Vergleich; zuvor lehnte der Go-PostgreSQL-Generator dies mit `unknown value` ab, während ClickHouse und StarRocks es akzeptierten.

Dokumentation:

- Neuer Abschnitt [Werte-Allowlist](/de/syntax/values/#werte-allowlist) und eine Anmerkung [NOT IN und SQL NULL](/de/syntax/lists/#not-in-und-sql-null) zur dreiwertigen Logik, in allen 11 Sprachversionen.

## 2026.07.21
Version: **1.0.2**

Fehlerbehebungen:

- **Konsistente Zeichen-Offsets für Nicht-ASCII-Eingaben.** Der Parser durchläuft die Eingabe jetzt in allen drei Sprachen per Unicode-Codepoint (Go scannt als `[]rune`, JavaScript als `Array.from(text)`), sodass `Range`-Offsets unabhängig von Byte- oder UTF-16-Breite um einen Schritt pro Zeichen voranschreiten. Zuvor brachten kyrillische und andere Multibyte-/Astral-Zeichen die Offsets zwischen den Go-, JavaScript- und Python-Ports auseinander.
- **Codepoint-Token-Offsets in `tokenize()`.** `tokenize()` meldet `start`/`end` jetzt in jeder Sprache als Unicode-Codepoint-Offsets, identisch über Python, Go und JavaScript für alle Eingaben. Zuvor gab Go Token-Spannen in Byte-Breite aus und JavaScript UTF-16-Code-Unit-Spannen für Nicht-ASCII-Zeichen (und Astral-Zeichen), was die lückenlose Offset-Invariante brach.
- **Gültiges PostgreSQL-String-Escaping.** Der PostgreSQL-Generator gibt jetzt Escape-String-Literale (`E'...'`) für Werte aus, die Backslash-Escapes wie Anführungszeichen oder Zeilenumbrüche enthalten. Ein einfaches `'...'`-Literal behandelt Backslashes unter `standard_conforming_strings` (dem Standard) wörtlich, was ungültiges SQL erzeugen konnte; Werte, die kein Escaping benötigen, werden weiterhin als einfaches `'...'` gerendert.

## 2026.05.08
Version: **1.0.0**

Erste öffentliche Veröffentlichung.
