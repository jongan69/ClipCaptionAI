#!/usr/bin/env node
/**
 * Post-build: Prepare HTML for Electron file:// loading.
 *
 * - Strips crossorigin attributes (breaks file:// CORS)
 * - Strips type="module" from script tags (we build IIFE)
 * - Strips CSP meta (Electron controls security)
 */
import fs from "node:fs";
import path from "node:path";

const htmlPath = path.resolve(import.meta.dirname, "..", "dist-renderer", "index.html");

if (!fs.existsSync(htmlPath)) {
  console.log("No built HTML found, skipping.");
  process.exit(0);
}

let html = fs.readFileSync(htmlPath, "utf8");

// Remove crossorigin from all script/link tags
html = html.replace(/ crossorigin(?:="[^"]*")?/g, "");
// Remove type="module" — we build IIFE for file:// compat
html = html.replace(/ type="module"/g, "");
// Remove CSP meta
html = html.replace(/<meta[^>]*Content-Security-Policy[^>]*\/?>/g, "");

// Add a fallback script to hide loading state
html = html.replace(
  "</body>",
  `<script>
try {
  var el = document.getElementById("app-loading");
  if (el) el.style.display = "none";
} catch(e) {}
</script>
</body>`
);

fs.writeFileSync(htmlPath, html, "utf8");
console.log("✅ Fixed HTML for Electron file:// loading");
