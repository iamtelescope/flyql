---
title: Journal des modifications
---

## 2026.08.23
Version : **1.2.0**

Les composants d'édition acceptent désormais un libellé textuel à côté de l'icône existante, dans l'emplacement à gauche du champ. Voir [Composant éditeur](/fr/editor/#libelle-et-icone).

Nouvelles fonctionnalités :

- **Prop `label` sur `FlyqlEditor` et `FlyqlColumns`**, dans les paquets Vue et React. Le libellé est rendu dans le champ, avant le texte de la requête ; un libellé trop long est tronqué par des points de suspension à la moitié de la largeur du champ plutôt que de comprimer la saisie. Un clic dessus donne le focus à la saisie, et un libellé textuel devient le nom accessible du champ. Vue expose en plus un slot `label` pour du contenu plus riche.
- **`icon` est maintenant une prop en Vue**, alors qu'elle n'existait que comme slot. Elle accepte une chaîne (rendue comme texte), un composant, ou `false` pour supprimer l'icône intégrée ; le slot `icon` reste prioritaire sur la prop. En React, la prop de rendu `icon` accepte également `false`.

Changements de comportement :

- **L'icône et le libellé partagent un nouvel élément flex de préfixe.** `.flyql-<root>__icon` n'est plus positionné en absolu : il se trouve dans `.flyql-<root>__prefix`, et le padding gauche de la saisie ne lui réserve plus de place. Les feuilles de style qui positionnaient l'icône elles-mêmes doivent être mises à jour ; celles qui se contentent de redéfinir des variables `--flyql-*` ne sont pas concernées.
- **`--flyql-code-font-family` utilise désormais une vraie pile de polices** — `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` — au lieu du simple `monospace`, qui se résolvait en une police différente dans chaque navigateur (Menlo dans Chrome sur macOS, Courier dans Safari) et modifiait les métriques sur lesquelles s'alignent l'icône et le libellé. Définissez la variable explicitement pour conserver l'ancien comportement.
- **La loupe intégrée a été décalée d'une unité de viewBox vers le bas** afin que son anneau, et non l'anneau plus le manche, soit centré sur le texte.

Nouvelles variables de thème — `--flyql-label-color`, `--flyql-line-height`, `--flyql-prefix-gap`, `--flyql-icon-offset` et `--flyql-label-offset` — pilotent la couleur du libellé, la boîte de ligne de la saisie, l'espace entre icône, libellé et texte, et les deux corrections optiques. Voir [Thèmes](/fr/editor/theming/).

## 2026.08.14
Version : **1.1.1**

Corrections de bugs :

- **Comparaisons booléennes sur les chemins JSON dans le générateur PostgreSQL.** Un littéral booléen nu sur un chemin JSON (`jsonb_column.enabled = true`) retombait sur la comparaison texte par défaut, générant du SQL invalide (`text = boolean`), tandis qu'un booléen entre guillemets (`= 'true'`) était protégé par une garde `jsonb_typeof = 'string'` et ne correspondait silencieusement à rien face aux booléens JSON. Les booléens nus génèrent désormais une garde `jsonb_typeof(...) = 'boolean'` avec un cast `::boolean`, à l'image du traitement des nombres, en Go, Python et JavaScript.

## 2026.08.12
Version : **1.1.0**

La liste de valeurs autorisées `values` sur les colonnes est désormais appliquée de manière cohérente — et uniquement là où cela a du sens — dans les générateurs SQL, le matcher en mémoire et le validateur. Voir [Liste de valeurs autorisées](/fr/syntax/values/#liste-de-valeurs-autorisées) pour la sémantique complète.

Changements de comportement :

- **Les listes `in` / `not in` sont validées contre la liste de valeurs autorisées.** Chaque élément de liste sur une colonne dotée d'une liste de valeurs autorisées est vérifié lors de la génération SQL ; un élément hors liste échoue désormais avec `unknown value` au lieu de correspondre silencieusement à zéro ligne. Les éléments null et les références de colonne sont exemptés. Les requêtes qui généraient auparavant du SQL avec des éléments de liste mal orthographiés seront désormais rejetées.
- **Le matcher en mémoire applique la liste de valeurs autorisées.** Lors de l'évaluation avec un schéma dont les colonnes déclarent `values`, une valeur `=` / `!=` ou un élément de liste `in` hors liste lève `unknown value` (auparavant l'évaluation se faisait silencieusement, en rupture de parité avec les générateurs). L'évaluation sans schéma est inchangée.
- **Nouveau diagnostic du validateur `value_not_allowed`.** `diagnose()` émet désormais une erreur positionnée lorsqu'une valeur d'égalité ou un élément de liste `in` se trouve en dehors de la liste de valeurs autorisées de la colonne. Les ponts de schéma dialecte-vers-core (`ToFlyQLSchema` / `toFlyQLSchema`) transportent désormais `values`, de sorte que les schémas pontés participent au diagnostic.

Pour désactiver cette application sur une colonne, retirez sa liste `values` du schéma.

Corrections de bugs :

- **`= null` fonctionne sur les colonnes dotées d'une liste de valeurs autorisées.** Null est un prédicat de présence, pas une valeur de domaine : `col = null` / `col != null` sur une colonne dotée d'une liste de valeurs autorisées `values` génèrent désormais `IS NULL` / `IS NOT NULL` au lieu d'échouer avec `unknown value`.
- **Les motifs ne sont plus vérifiés contre la liste de valeurs autorisées.** Les motifs `like` / `ilike` / `~` / `!~` sur les colonnes dotées d'une liste de valeurs autorisées génèrent normalement ; auparavant, tout motif non littéralement présent dans la liste était rejeté, rendant impossible la correspondance de motifs sur ces colonnes.
- **Le générateur PostgreSQL de Go résout les références de colonne à droite avant la vérification de la liste de valeurs autorisées.** `col = other_column` sur une colonne dotée d'une liste de valeurs autorisées génère désormais une comparaison colonne à colonne sur tous les générateurs ; auparavant, le générateur PostgreSQL de Go la rejetait avec `unknown value` alors que ClickHouse et StarRocks l'acceptaient.

Documentation :

- Nouvelle section [Liste de valeurs autorisées](/fr/syntax/values/#liste-de-valeurs-autorisées) et une note [NOT IN et NULL SQL](/fr/syntax/lists/#not-in-et-null-sql) sur la logique à trois valeurs, dans les 11 locales.

## 2026.07.21
Version : **1.0.2**

Corrections de bugs :

- **Offsets de caractères cohérents pour les entrées non ASCII.** Le parseur parcourt désormais l'entrée par point de code Unicode dans les trois langages (Go parcourt en `[]rune`, JavaScript en `Array.from(text)`), de sorte que les offsets `Range` avancent d'un pas par caractère, quelle que soit la largeur en octets ou en UTF-16. Auparavant, le cyrillique et d'autres caractères multi-octets ou astraux désynchronisaient les offsets entre les ports Go, JavaScript et Python.
- **Offsets de tokens en points de code dans `tokenize()`.** `tokenize()` rapporte désormais `start`/`end` comme des offsets en points de code Unicode dans chaque langage, identiques entre Python, Go et JavaScript pour toute entrée. Auparavant, Go émettait des étendues de tokens en largeur d'octets et JavaScript des étendues en unités de code UTF-16 pour les caractères non ASCII (et astraux), brisant l'invariant d'offsets sans trous.
- **Échappement de chaînes PostgreSQL valide.** Le générateur PostgreSQL émet désormais des littéraux de chaîne avec échappement (`E'...'`) pour les valeurs contenant des échappements par barre oblique inverse tels que des guillemets ou des sauts de ligne. Un littéral simple `'...'` traite les barres obliques inverses littéralement sous `standard_conforming_strings` (le défaut), ce qui pouvait produire du SQL invalide ; les valeurs ne nécessitant aucun échappement sont toujours rendues comme un simple `'...'`.

## 2026.05.08
Version : **1.0.0**

Première publication publique.
