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
        { label: "Introduction", link: "/" },
        {
          label: "Syntax Reference",
          items: [
            { label: "Overview", link: "/syntax/" },
            { label: "Operators", link: "/syntax/operators/" },
            { label: "Boolean Logic", link: "/syntax/boolean-logic/" },
            { label: "Pattern Matching", link: "/syntax/pattern-matching/" },
            { label: "Lists", link: "/syntax/lists/" },
            { label: "Values & Expressions", link: "/syntax/values/" },
            { label: "Nested Keys", link: "/syntax/nested-keys/" },
          ],
        },
      ],
    }),
    sitemap(),
  ],
});
