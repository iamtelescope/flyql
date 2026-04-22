// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import { resolve } from "node:path";

const enableGA = process.env.ENABLE_GA === "true";
const gaMeasurementId = process.env.GA_MEASUREMENT_ID;

const gaHead =
  enableGA && gaMeasurementId
    ? [
        {
          tag: "script",
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`,
          },
        },
        {
          tag: "script",
          content: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${gaMeasurementId}');
        `,
        },
      ]
    : [];

export default defineConfig({
  vite: {
    resolve: {
      alias: {
        "@snippets/python": resolve("../python/snippets"),
        "@snippets/javascript": resolve("../javascript/packages/flyql/snippets"),
        "@snippets/go": resolve("../golang/snippets"),
        "@data": resolve("./src/data"),
      },
    },
  },
  integrations: [
    starlight({
      head: gaHead,
      title: "FlyQL",
      favicon: "/icons/flyql.svg",
      logo: {
        src: "./public/icons/flyql.svg",
        replacesTitle: false,
      },
      customCss: [
        "./src/styles/tables.css",
      ],
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
        hi: {
          label: "हिन्दी",
          lang: "hi",
        },
        es: {
          label: "Español",
          lang: "es",
        },
        fr: {
          label: "Français",
          lang: "fr",
        },
        pt: {
          label: "Português",
          lang: "pt",
        },
        "pt-br": {
          label: "Português (Brasil)",
          lang: "pt-BR",
        },
        ru: {
          label: "Русский",
          lang: "ru",
        },
        de: {
          label: "Deutsch",
          lang: "de",
        },
        ja: {
          label: "日本語",
          lang: "ja",
        },
        ko: {
          label: "한국어",
          lang: "ko",
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
        {
          label: "Introduction",
          slug: "index",
          translations: {
            "zh-CN": "介绍",
            hi: "परिचय",
            ja: "はじめに",
            ko: "소개",
            es: "Introducción",
            pt: "Introdução",
            fr: "Introduction",
            de: "Einführung",
            ru: "Введение",
            "pt-BR": "Introdução",
          },
        },
        {
          label: "Syntax Reference",
          translations: {
            "zh-CN": "语法参考",
            hi: "सिंटैक्स संदर्भ",
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
            "syntax/dates",
            "syntax/nested-keys",
            "syntax/transformers",
            "syntax/renderers",
            "syntax/parameters",
            "syntax/recipes",
          ],
        },
        {
          label: "Editor",
          translations: {
            "zh-CN": "编辑器",
            hi: "संपादक",
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
            hi: "शुरू करें",
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
            hi: "उन्नत",
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
            "advanced/custom-renderers",
            "advanced/errors",
            "advanced/tokenize",
            "advanced/api-matrix",
          ],
        },
        {
          label: "SQL Dialects",
          translations: {
            "zh-CN": "SQL 方言",
            hi: "SQL बोलियाँ",
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
            "sql/formatting",
          ],
        },
        {
          label: "Changelog",
          slug: "changelog",
          translations: {
            "zh-CN": "更新日志",
            hi: "परिवर्तन लॉग",
            ja: "変更履歴",
            ko: "변경 이력",
            es: "Registro de cambios",
            pt: "Registo de alterações",
            fr: "Journal des modifications",
            de: "Änderungsprotokoll",
            ru: "Журнал изменений",
            "pt-BR": "Registro de alterações",
          },
        },
      ],
    }),
    sitemap(),
  ],
});
