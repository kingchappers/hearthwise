import type { Config } from "@react-router/dev/config";

export default {
  // Config options...
  // Server-side render by default, to enable SPA mode set this to `false`
  ssr: false,
  // BUILD_DIR overrides the output folder; the default is build/.
  buildDirectory: process.env.BUILD_DIR ?? "build",
} satisfies Config;
