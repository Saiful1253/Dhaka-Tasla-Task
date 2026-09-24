import { createApp } from "../src/app";

/**
 * Vercel Node Function entry point.
 *
 * Local/Docker execution still uses src/server.ts and app.listen(...). Vercel
 * imports this default Express app instead, so the same routes and middleware
 * are served without pretending a long-running TCP server is serverless-safe.
 */
export default createApp();
