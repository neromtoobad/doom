/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  // Next 16 appends a rules block to AGENTS.md and CLAUDE.md on every `next dev`.
  // The project brain is hand-written and lives in AGENTS.md, so keep it out.
  agentRules: false,
}

module.exports = nextConfig
