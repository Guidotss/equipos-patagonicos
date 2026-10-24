import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // react-pdf usa módulos de Node (fontkit, yoga): se carga sin empaquetar.
  serverExternalPackages: ['@react-pdf/renderer'],
  // Fuentes y logo del PDF dentro del build standalone (deploy, plan 6).
  outputFileTracingIncludes: { '/cotizaciones/**': ['./assets/**/*'] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
