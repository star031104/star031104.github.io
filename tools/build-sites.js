'use strict'

const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')
const distDir = path.join(rootDir, 'dist')
const clientDir = path.join(distDir, 'client')
const serverDir = path.join(distDir, 'server')

if (!fs.existsSync(path.join(publicDir, 'index.html'))) {
  console.error('Hexo output is missing. Run the site build before packaging for Sites.')
  process.exit(1)
}

fs.rmSync(distDir, { recursive: true, force: true })
fs.mkdirSync(serverDir, { recursive: true })
fs.cpSync(publicDir, clientDir, { recursive: true })

const worker = `const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com https://busuanzi.ibruce.info; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; font-src 'self' data: https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' https://blog-ai-assistant.star20031104.workers.dev https://static.cloudflareinsights.com https://cloudflareinsights.com; frame-src https://player.bilibili.com; upgrade-insecure-requests",
};

function withSiteHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);

  if (pathname.startsWith("/css/") || pathname.startsWith("/js/") || pathname.startsWith("/img/")) {
    headers.set("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
  } else if (pathname.startsWith("/data/")) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  } else if (pathname === "/site.webmanifest") {
    headers.set("Content-Type", "application/manifest+json; charset=utf-8");
    headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function fetchAsset(env, request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return env.ASSETS.fetch(new Request(url, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let response = await env.ASSETS.fetch(request);

    if (response.status === 404 && (request.method === "GET" || request.method === "HEAD")) {
      const pathname = url.pathname;
      const candidates = pathname === "/"
        ? ["/index.html"]
        : pathname.endsWith("/")
          ? [pathname + "index.html"]
          : !pathname.split("/").pop().includes(".")
            ? [pathname + ".html", pathname + "/index.html"]
            : [];

      for (const candidate of candidates) {
        response = await fetchAsset(env, request, candidate);
        if (response.status !== 404) break;
      }

      if (response.status === 404) {
        const notFound = await fetchAsset(env, request, "/404.html");
        if (notFound.status !== 404) {
          response = new Response(notFound.body, { status: 404, headers: notFound.headers });
        }
      }
    }

    return withSiteHeaders(response, url.pathname);
  },
};
`

fs.writeFileSync(path.join(serverDir, 'index.js'), worker)
fs.writeFileSync(path.join(serverDir, 'package.json'), '{"type":"module"}\n')

console.log(`Sites bundle ready: ${clientDir}`)
