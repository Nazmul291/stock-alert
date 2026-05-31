import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Related: https://github.com/remix-run/remix/issues/2835#issuecomment-1144102176
// Replace the HOST env var with SHOPIFY_APP_URL so that it doesn't break the Vite server.
// The CLI will eventually stop passing in HOST,
// so we can remove this workaround after the next major release.
if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL ||
    process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const host = new URL(process.env.SHOPIFY_APP_URL || "http://localhost")
  .hostname;

let hmrConfig;
if (host === "localhost") {
  hmrConfig = {
    protocol: "ws",
    host: "localhost",
    port: 64999,
    clientPort: 64999,
  };
} else {
  hmrConfig = {
    protocol: "wss",
    host: host,
    port: parseInt(process.env.FRONTEND_PORT!) || 8002,
    clientPort: 443,
  };
}

export default defineConfig({
  server: {
    allowedHosts: [host, "dev.nazmulcodes.org"],
    cors: {
      preflightContinue: true,
    },
    port: Number(process.env.PORT || 3000),
    hmr: hmrConfig,
    fs: {
      // See https://vitejs.dev/config/server-options.html#server-fs-allow for more information
      allow: ["app", "node_modules"],
    },
  },
  plugins: [
    {
      name: "server-modules-browser-stub",
      enforce: "pre",
      resolveId(id, _, options) {
        if (!options.ssr && ["nodemailer", "bcryptjs"].includes(id)) {
          return "\0server-stub:" + id;
        }
      },
      load(id) {
        if (id.startsWith("\0server-stub:")) return "export default null";
      },
    },
    reactRouter(),
    tsconfigPaths(),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "react-router"],
  },
  build: {
    assetsInlineLimit: 0,
  },
  optimizeDeps: {
    include: ["@shopify/app-bridge-react"],
    exclude: [
      "@prisma/client",
      "@nazmulcodes/shopify-admin-and-support-chat",
      "@nazmulcodes/shopify-admin-and-support-chat/server",
      "@nazmulcodes/shopify-admin-and-support-chat/routes/admin/layout",
      "@nazmulcodes/shopify-admin-and-support-chat/routes/admin/support",
    ],
  },
  ssr: {
    // pg-boss is CJS; bundling it lets Vite handle the CJS→ESM interop
    // so `import PgBoss from 'pg-boss'` resolves the default export correctly.
    noExternal: ["pg-boss"],
  },
}) satisfies UserConfig;
