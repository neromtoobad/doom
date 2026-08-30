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

  // Video is not one of the media types Next imports out of the box, and the
  // walkthrough has to be imported rather than pathed: a literal "/walkthrough.mp4"
  // ignores basePath, and a relative "walkthrough.mp4" resolves against the page, so
  // it 404s from /watch/. Emitting it as an asset makes webpack write the URL with
  // the prefix already on it, the same way the token art works.
  webpack(config) {
    config.module.rules.push({
      test: /\.mp4$/i,
      type: 'asset/resource',
      generator: { filename: 'static/media/[name].[hash][ext]' },
    })
    return config
  },
}

module.exports = nextConfig
