---
title: Änderungsprotokoll
---

## 2026.08.25
Version: **1.4.0**

Kontrolle darüber, wo das Vorschlagsfeld auf der Seite landet — für Editoren, die in einem Overlay des Hosts stecken.

Neue Funktionen:

- **`--flyql-panel-z-index`** (Standard `100`). Die Stapelposition des Felds war ein fester Wert, sodass ein Host mit höher liegendem Overlay die Kollision nur über eine eigene Regel auf `.flyql-panel` beheben konnte. Drawer und Modals liegen üblicherweise deutlich über 100 und verdeckten das Feld vollständig, während der Editor weiterarbeitete.
- **`panelContainer`-Prop an `FlyqlEditor` und `FlyqlColumns`** (Standard `body`), in beiden Paketen. Nimmt einen Selektor oder ein Element; das Feld wird dorthin statt nach `document.body` portiert und erbt dessen Stapelkontext, ganz ohne z-index-Rechnerei. Ein nicht auflösbares Ziel fällt auf `body` zurück, und das Ziel wird bei jedem Öffnen neu aufgelöst — ein Overlay, das nach dem Editor gemountet wird, greift also trotzdem.
- **`data-flyql-panel`-Attribut** am portierten Knoten, damit Hosts, die ihr Overlay bei einem Klick außerhalb schließen, das Feld erkennen, ohne einen internen Klassennamen zu kennen. Mit gesetztem `panelContainer` ist das Feld ohnehin ein Nachfahre des Overlays und braucht die Prüfung gar nicht.

Für bestehende Nutzer ändert sich nichts: das Feld wird weiterhin nach `document.body` portiert und liegt weiterhin bei 100.

## 2026.08.25
Version: **1.3.0**

Schnittstellen, um die Editoren in ein fremdes Designsystem einzubetten: ein einzeiliger Modus, ein Löschen-Button und die bisher fest verdrahteten Box-Maße.

Neue Funktionen:

- **`multiline`-Prop an `FlyqlEditor` und `FlyqlColumns`** (Standard `true`), in beiden Paketen. Mit `false` bleibt das Feld einzeilig: Shift+Enter fügt keinen Umbruch mehr ein, Zeilenumbrüche aus Einfügen, Drop oder IME werden zu Leerzeichen, und lange Abfragen scrollen seitwärts statt umzubrechen.
- **`hasClear`- und `clearButtonLabel`-Props** (Standard `false` bzw. `'Clear'`). Ein Löschen-Button am rechten Rand, der nur erscheint, wenn das Feld einen Wert hat. Ein Klick leert das Feld über den normalen Wertpfad — Vorschlagsliste schließt, Diagnosen verschwinden wie beim manuellen Löschen — und gibt der Eingabe den Fokus zurück.
- **Neue Theme-Variablen** `--flyql-border-radius`, `--flyql-padding-block`, `--flyql-label-font-weight` und `--flyql-border-hover` für Eckenradius, vertikalen Innenabstand, Label-Schriftstärke und Hover-Rahmen. Alle entsprechen den bisherigen Werten, es ändert sich also nichts, bis ein Host sie setzt. Siehe [Themes](/de/editor/theming/).

Fehlerbehebungen:

- **Der linke Abstand scrollt nicht mehr weg.** Er lag im `padding-inline-start` der Eingabe, und Padding an einer horizontal scrollbaren Box existiert nur bei Scroll-Position 0 — eine gescrollte Abfrage lief unter das Label. Beide horizontalen Abstände sitzen jetzt auf `.flyql-<root>__container`, das nicht scrollt.
- **Die Highlight-Ebene hinkt dem Cursor bei vollem Scroll nicht mehr hinterher.** Ein `width: 100%` überschrieb ihren `right`-Offset — bei absolut positionierten Boxen gewinnt `width` gegen `right` —, wodurch die beiden Textebenen unterschiedliche Scrollweiten hatten.
- **`Home` und `End` bewegen auch die Ansicht.** Beide setzen die Auswahl nach `preventDefault()`, was das browsereigene Scrollen zum Cursor unterdrückt; bei einer scrollenden Abfrage verschwand der Cursor aus dem Bild und der Tastendruck wirkte folgenlos.

Dokumentation:

- Das `submit`-Event und die Tastaturtabelle nannten Shift+Enter; die Komponenten senden es seit jeher bei Ctrl/Cmd+Enter. In allen 11 Sprachen korrigiert, samt der tatsächlichen Shift+Enter-Funktion.

Hosts, die das Padding von `.flyql-<root>__input` direkt überschreiben, sollten es prüfen: das Ergebnis bleibt gleich, der horizontale Innenabstand liegt jetzt aber am Container.

## 2026.08.23
Version: **1.2.0**

Die Editor-Komponenten haben neben dem vorhandenen Icon ein Text-Label im Bereich links im Feld erhalten. Siehe [Editor-Komponente](/de/editor/#label-und-icon).

Neue Funktionen:

- **`label`-Prop an `FlyqlEditor` und `FlyqlColumns`**, sowohl im Vue- als auch im React-Paket. Das Label wird im Feld vor dem Abfragetext gerendert; ein zu langes Label wird bei der halben Feldbreite mit Auslassungspunkten gekürzt, statt die Eingabe zu verkleinern. Ein Klick darauf fokussiert die Eingabe, und ein Text-Label wird zum zugänglichen Namen der Eingabe. Vue bietet zusätzlich einen `label`-Slot für reichhaltigere Inhalte.
- **`icon` ist in Vue jetzt ein Prop** und nicht mehr nur ein Slot. Es akzeptiert einen String (als Text gerendert), eine Komponente oder `false`, um das eingebaute Glyph zu entfernen; der `icon`-Slot hat weiterhin Vorrang vor dem Prop. In React akzeptiert das vorhandene `icon`-Render-Prop nun ebenfalls `false`.

Verhaltensänderungen:

- **Icon und Label teilen sich ein neues Flex-Präfix-Element.** `.flyql-<root>__icon` ist nicht mehr absolut positioniert, sondern liegt in `.flyql-<root>__prefix`, und das linke Padding der Eingabe reserviert keinen Platz mehr dafür. Stylesheets, die das Icon selbst positioniert haben, müssen angepasst werden; Overrides, die nur `--flyql-*`-Variablen umbelegen, sind nicht betroffen.
- **`--flyql-code-font-family` verwendet jetzt einen echten Font-Stack** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — statt des bloßen `monospace`, das in jedem Browser zu einer anderen Schrift aufgelöst wurde (Menlo in Chrome unter macOS, Courier in Safari) und damit die Metriken änderte, an denen sich Icon und Label ausrichten. Setzen Sie die Variable explizit, um das alte Verhalten beizubehalten.
- **Das eingebaute Lupen-Glyph wurde um eine viewBox-Einheit nach unten verschoben**, sodass sein Ring — und nicht Ring plus Griff — auf dem Text zentriert ist.

Neue Theme-Variablen — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` und `--flyql-label-offset` — steuern Label-Farbe, Zeilenbox der Eingabe, den Abstand zwischen Icon, Label und Text sowie die beiden optischen Korrekturen. Siehe [Themes](/de/editor/theming/).

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
