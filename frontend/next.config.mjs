/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 14 requires opting in to instrumentation.ts (proxy setup for server fetch)
  experimental: {
    instrumentationHook: true,
  },
  webpack: (config, { dev, isServer, nextRuntime }) => {
    if (dev) {
      // Docker on macOS (Colima) doesn't forward inotify events — use polling instead
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    if (isServer && nextRuntime !== "edge") {
      // Externalize undici for the Node.js server build only.
      // The Edge runtime (middleware) can't use native modules — and the
      // import("undici") in instrumentation.ts is dead code there anyway
      // because of the NEXT_RUNTIME === "nodejs" guard.
      const ext = { undici: "commonjs undici" };
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, ext]
        : [config.externals, ext].filter(Boolean);
    }
    return config;
  },
};

export default nextConfig;
