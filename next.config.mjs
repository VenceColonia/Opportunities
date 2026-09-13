/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Zero-cost hosting target: a fully static export deployable to GitHub
  // Pages (or Cloudflare Pages). No server, no API routes, no per-request
  // cost. See ARCHITECTURE.md §2 and §9.
  output: "export",
  images: { unoptimized: true },
  // Only needed if deploying to https://<user>.github.io/<repo>/ instead of
  // a custom domain or a user/org root page — set via env at build time in
  // .github/workflows/deploy.yml.
  basePath: process.env.NEXT_BASE_PATH || "",
  env: {
    // Exposed to client components so fetch('/data/...') calls can be
    // prefixed correctly when deployed under a GitHub Pages project path.
    NEXT_PUBLIC_BASE_PATH: process.env.NEXT_BASE_PATH || "",
  },
};

export default nextConfig;
