import type { NextConfig } from "next";

// Exportação estática (sem servidor): serve em Vercel, GitHub Pages ou como casca desktop (RZ-501/502).
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  reactStrictMode: true,
};

export default config;
