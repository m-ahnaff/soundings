import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async redirects() {
    // /new?title=… deep link opens the Create dialog over the board (query is preserved).
    return [{ source: "/new", destination: "/?create=1", permanent: false }];
  },
};

export default nextConfig;
