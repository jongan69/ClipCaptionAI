const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export function prepareRendererHtml(input) {
  let html = input;

  // Remove crossorigin from all script/link tags
  html = html.replace(/ crossorigin(?:="[^"]*")?/g, '');
  // Remove type="module" — we build IIFE for file:// compat
  html = html.replace(/ type="module"/g, ' defer');
  // Replace any existing CSP meta with ours
  html = html.replace(/\s*<meta[^>]*Content-Security-Policy[^>]*\/?>/g, '');
  html = html.replace(
    '<head>',
    `<head>\n  <meta http-equiv="Content-Security-Policy" content="${CSP}" />`,
  );

  return html;
}
