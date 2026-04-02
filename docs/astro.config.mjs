// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  integrations: [
    starlight({
      title: "FlyQL",
      description:
        "A lightweight, injection-proof query language for multi-dialect SQL generation",
      locales: {
        root: {
          label: "English",
          lang: "en",
        },
        zh: {
          label: "中文",
          lang: "zh-CN",
        },
        ja: {
          label: "日本語",
          lang: "ja",
        },
        ko: {
          label: "한국어",
          lang: "ko",
        },
        es: {
          label: "Español",
          lang: "es",
        },
        pt: {
          label: "Português",
          lang: "pt",
        },
        fr: {
          label: "Français",
          lang: "fr",
        },
        de: {
          label: "Deutsch",
          lang: "de",
        },
        ru: {
          label: "Русский",
          lang: "ru",
        },
        "pt-br": {
          label: "Português (Brasil)",
          lang: "pt-BR",
        },
      },
      defaultLocale: "root",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/iamtelescope/flyql",
        },
      ],
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 4,
      },
      sidebar: [
        "index",
        {
          label: "Syntax Reference",
          translations: {
            "zh-CN": "语法参考",
            ja: "構文リファレンス",
            ko: "구문 참조",
            es: "Referencia de sintaxis",
            pt: "Referência de sintaxe",
            fr: "Référence de syntaxe",
            de: "Syntaxreferenz",
            ru: "Справочник по синтаксису",
            "pt-BR": "Referência de sintaxe",
          },
          items: [
            "syntax",
            "syntax/operators",
            "syntax/boolean-logic",
            "syntax/pattern-matching",
            "syntax/lists",
            "syntax/values",
            "syntax/nested-keys",
            "syntax/transformers",
          ],
        },
        {
          label: "Editor",
          translations: {
            "zh-CN": "编辑器",
            ja: "エディター",
            ko: "에디터",
            es: "Editor",
            pt: "Editor",
            fr: "Éditeur",
            de: "Editor",
            ru: "Редактор",
            "pt-BR": "Editor",
          },
          items: [
            "editor",
            "editor/columns-component",
            "editor/schema",
            "editor/theming",
          ],
        },
        {
          label: "Getting Started",
          translations: {
            "zh-CN": "快速开始",
            ja: "はじめに",
            ko: "빠른 시작",
            es: "Primeros pasos",
            pt: "Primeiros passos",
            fr: "Prise en main",
            de: "Erste Schritte",
            ru: "Быстрый старт",
            "pt-BR": "Primeiros passos",
          },
          items: [
            "getting-started",
            "getting-started/go",
            "getting-started/python",
            "getting-started/javascript",
          ],
        },
        {
          label: "Advanced",
          translations: {
            "zh-CN": "高级",
            ja: "応用",
            ko: "고급",
            es: "Avanzado",
            pt: "Avançado",
            fr: "Avancé",
            de: "Fortgeschritten",
            ru: "Продвинутое",
            "pt-BR": "Avançado",
          },
          items: [
            "advanced/ast",
            "advanced/custom-transformers",
          ],
        },
        {
          label: "SQL Dialects",
          translations: {
            "zh-CN": "SQL 方言",
            ja: "SQL 方言",
            ko: "SQL 방언",
            es: "Dialectos SQL",
            pt: "Dialetos SQL",
            fr: "Dialectes SQL",
            de: "SQL-Dialekte",
            ru: "Диалекты SQL",
            "pt-BR": "Dialetos SQL",
          },
          items: [
            "sql",
            "sql/clickhouse",
            "sql/postgresql",
            "sql/starrocks",
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
