/** Escapes text for an HTML attribute value. */
function attr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Serves an app page (the SPA's index.html) with link-preview tags that need absolute URLs: `og:image` and `og:url`.
 * The origin comes from the request, so they're right on workers.dev, a custom domain and locally.
 */
export async function servePage(request: Request, env: Env): Promise<Response> {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok || !res.headers.get("content-type")?.includes("text/html")) return res;
  const url = new URL(request.url);
  const tags = [
    `<meta property="og:url" content="${attr(url.origin + url.pathname)}" />`,
    `<meta property="og:image" content="${attr(`${url.origin}/og-image.png`)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="flipword — vocabulary that stays learned" />`,
  ].join("");
  return new HTMLRewriter()
    .on("head", { element: (el) => void el.append(tags, { html: true }) })
    .on('meta[name="twitter:card"]', { element: (el) => void el.setAttribute("content", "summary_large_image") })
    .transform(res);
}
