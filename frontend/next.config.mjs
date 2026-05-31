/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a minimal standalone server bundle for small Docker images.
  output: "standalone",
};

export default nextConfig;
