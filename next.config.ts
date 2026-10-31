import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  distDir: process.env.EP_TESTS_RUNNER === '1' ? '.next-e2e' : '.next',
  /* config options here */
  // react-pdf usa módulos de Node (fontkit, yoga): se carga sin empaquetar.
  serverExternalPackages: ['@react-pdf/renderer'],
  // Fuentes y logo del PDF dentro del build standalone (deploy, plan 6).
  outputFileTracingIncludes: { '/cotizaciones/**': ['./assets/**/*'] },
  turbopack: {
    ...(process.env.EP_TESTS_RUNNER === '1' ? { root: process.env.EP_TESTS_REPO_ROOT } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
