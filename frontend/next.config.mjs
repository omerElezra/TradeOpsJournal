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
      // Node.js build: require undici at runtime, don't bundle it.
      const ext = { undici: "commonjs undici" };
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, ext]
        : [config.externals, ext].filter(Boolean);
    }
    if (nextRuntime === "edge") {
      // Edge build: alias undici to an empty module. The import("undici") in
      // instrumentation.ts is dead code here (NEXT_RUNTIME === "nodejs" guard),
      // but webpack still walks the module graph and chokes on undici's Node.js
      // built-ins (node:crypto, node:dns, etc.). Aliasing to false gives webpack
      // an empty stub to bundle instead.
      config.resolve.alias = { ...config.resolve.alias, undici: false };
    }
    return config;
  },
};

export default nextConfig;
