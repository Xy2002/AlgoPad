import { cpSync, mkdirSync } from "node:fs";

// Copy SWC WASM binary to public directory for local serving
mkdirSync("public/swc", { recursive: true });
cpSync("node_modules/@swc/wasm-web/wasm-web_bg.wasm", "public/swc/wasm-web_bg.wasm", { force: true });
