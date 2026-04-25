module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "domain-pure",
      severity: "error",
      comment: "/lib/planner must remain pure: no React, no Supabase, no Next, no YNAB SDK",
      from: { path: "^src/lib/planner" },
      to: {
        path: [
          "^node_modules/(react|next|@supabase|ynab)",
          "^src/(app|components)",
          "^src/lib/(supabase|ynab)",
        ],
      },
    },
    {
      name: "no-ui-in-api",
      severity: "error",
      from: { path: "^src/app/api" },
      to: {
        path: ["^src/components", "^node_modules/react($|/)"],
      },
    },
    {
      name: "no-api-in-ui",
      severity: "error",
      from: { path: "^src/components" },
      to: { path: "^src/app/api" },
    },
    {
      name: "no-cross-page",
      severity: "error",
      comment: "Pages must not import from sibling page directories",
      from: { path: "^src/app/(?!api/)([^/]+)/" },
      to: { path: "^src/app/(?!api/)(?!$1)([^/]+)/" },
    },
    {
      name: "no-orphans",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|ts|cjs|mjs)$",
          "\\.d\\.ts$",
          "(^|/)src/app/.+\\.(tsx|ts)$",
          "\\.test\\.(ts|tsx)$",
          "(^|/)tests/",
          "(^|/)src/test-setup\\.ts$",
          "(^|/)src/types/",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
