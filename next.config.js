/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Next 16 appends a rules block to AGENTS.md and CLAUDE.md on every `next dev`.
  // The project brain is hand-written and lives in AGENTS.md, so keep it out.
  agentRules: false,

  // Static export for GitHub Pages. Everything here is a client component talking
  // straight to Starknet, so there is no server to lose.
  output: 'export',
  images: { unoptimized: true },
  // Project pages are served from /<repo>, so assets need the prefix. Unset for
  // local dev so `yarn dev` still works from the root.
  basePath: process.env.GITHUB_PAGES ? '/doom' : '',
  assetPrefix: process.env.GITHUB_PAGES ? '/doom/' : '',
  trailingSlash: true,
}

module.exports = nextConfig
