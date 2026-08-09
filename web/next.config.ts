import type { NextConfig } from 'next'

/* `root` is pinned to this directory. The site lives in `web/` inside a larger
   repository that has its own package-lock.json one level up, and Turbopack's
   automatic root detection walks up to that lockfile — then warns that it is
   ignoring it because it sits outside this package's git root. Stating the root
   removes the ambiguity: module resolution, cache validation and file watching
   all stay inside `web/`. */
const nextConfig: NextConfig = {
  turbopack: { root: __dirname },
}

export default nextConfig
