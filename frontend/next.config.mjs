/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 14 requires opting in to instrumentation.ts (proxy setup for server fetch)
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Docker on macOS (Colima) doesn't forward inotify events — use polling instead
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    if (isServer) {
      // Don't bundle undici (used by instrumentation.ts for the proxy dispatcher);
      // require it at runtime from node_modules instead. The "commonjs" type makes
      // webpack emit require("undici") rather than a bare global reference.
      const ext = { undici: "commonjs undici" };
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, ext]
        : [config.externals, ext].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
