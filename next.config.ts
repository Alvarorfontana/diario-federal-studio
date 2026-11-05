import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El chequeo de estilo de código no frena la publicación (los tipos sí se revisan).
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
