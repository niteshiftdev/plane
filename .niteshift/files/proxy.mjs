// Single-origin dev proxy, mirroring apps/proxy/Caddyfile.ce so that every app
// is reachable from one port. Two reasons it exists in development:
//   - the frontends run with empty base URLs, so every browser call is relative
//     and must land on the right upstream by path;
//   - it rewrites Host to localhost so Vite's allowed-hosts check passes for
//     requests arriving through the Niteshift preview domain.
import http from "node:http";
import net from "node:net";

const port = (name, fallback) => Number(process.env[name] ?? fallback);

const LISTEN = Number(process.env.PORT ?? 3000);
const WEB = port("WEB_PORT", 13000);
const ADMIN = port("ADMIN_PORT", 13001);
const SPACE = port("SPACE_PORT", 13002);
const API = port("API_PORT", 8000);
const LIVE = port("LIVE_PORT", 3100);
const MINIO = port("MINIO_PORT", 9000);
const BUCKET = process.env.AWS_S3_BUCKET_NAME ?? "uploads";

const route = (url) => {
  const path = url.split("?")[0];
  if (path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/static/")) return API;
  if (path.startsWith("/live/")) return LIVE;
  if (path.startsWith("/god-mode/")) return ADMIN;
  if (path.startsWith("/spaces/")) return SPACE;
  if (path === `/${BUCKET}` || path.startsWith(`/${BUCKET}/`)) return MINIO;
  return WEB;
};

// The preview panel embeds the app in an iframe on niteshift.dev.
const framable = (headers) => {
  const { "x-frame-options": _dropped, ...rest } = headers;
  return {
    ...rest,
    "content-security-policy":
      rest["content-security-policy"] ?? "frame-ancestors 'self' https://niteshift.dev https://*.niteshift.dev",
  };
};

const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/god-mode" || path === "/spaces") {
    res.writeHead(301, { location: `${path}/` });
    res.end();
    return;
  }
  const target = route(req.url);
  const proxied = http.request(
    {
      hostname: "127.0.0.1",
      port: target,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: `localhost:${target}` },
    },
    (upstream) => {
      res.writeHead(upstream.statusCode, framable(upstream.headers));
      upstream.pipe(res);
    }
  );
  proxied.on("error", (error) => {
    res.writeHead(502, { "content-type": "text/plain" });
    res.end(`proxy: upstream ${target} unavailable (${error.message})`);
  });
  req.pipe(proxied);
});

server.on("upgrade", (req, socket, head) => {
  const target = route(req.url);
  const upstream = net.connect(target, "127.0.0.1", () => {
    const headers = { ...req.headers, host: `localhost:${target}` };
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (const [key, value] of Object.entries(headers)) raw += `${key}: ${value}\r\n`;
    upstream.write(`${raw}\r\n`);
    upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(LISTEN, "0.0.0.0", () => console.log(`proxy listening on 0.0.0.0:${LISTEN}`));
