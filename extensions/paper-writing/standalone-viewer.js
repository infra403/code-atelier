'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

// Loopback only; diagram snapshots stay in bounded memory, never on disk.
// Short browser URLs also avoid Windows' external-URL length limit.
async function startViewer() {
  const token = randomBytes(24).toString('hex');
  const diagrams = new Map();
  const assets = new Map([
    ['', ['index.html', 'text/html; charset=utf-8']],
    ['viewer.js', ['viewer.js', 'text/javascript; charset=utf-8']],
    ['viewer.css', ['viewer.css', 'text/css; charset=utf-8']]
  ].map(([route, [file, type]]) => [route, { body: fs.readFileSync(path.join(__dirname, 'viewer', file)), type }]));
  let base;
  const server = http.createServer((req, res) => {
    const prefix = `/${token}/`;
    const route = req.url?.startsWith(prefix) && req.url.slice(prefix.length);
    const snapshot = route && diagrams.get(route);
    const asset = assets.get(route) || (snapshot && { body: snapshot, type: 'text/plain; charset=utf-8' });
    if (req.method !== 'GET' || req.headers.host !== new URL(base).host || !asset) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, {
      'Content-Type': asset.type, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; connect-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src blob: data:; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Permissions-Policy': 'fullscreen=(self)'
    });
    res.end(asset.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  base = `http://127.0.0.1:${server.address().port}/${token}/`;
  server.unref();
  return {
    url: base,
    store(encoded) {
      if (!encoded || encoded.length > 2000000 || !/^[A-Za-z0-9_=-]+$/.test(encoded)) throw new Error('Invalid diagram payload');
      const id = randomBytes(16).toString('hex');
      diagrams.set(`diagram/${id}`, encoded);
      while (diagrams.size > 16) diagrams.delete(diagrams.keys().next().value);
      return `${base}#id=${id}`;
    },
    dispose: () => { diagrams.clear(); server.closeAllConnections(); server.close(); }
  };
}

function registerStandaloneViewer(context) {
  const vscode = require('vscode');
  let viewer, disposed = false;
  context.subscriptions.push({ dispose() { disposed = true; viewer?.dispose(); } });
  context.subscriptions.push(vscode.window.registerUriHandler({ async handleUri(uri) {
    if (!viewer || uri.path !== `/diagram${new URL(viewer.url).pathname}` || !uri.fragment || uri.fragment.length > 2000000 || !/^[A-Za-z0-9_=-]+$/.test(uri.fragment)) return;
    // Use the OS browser even when VS Code's localhost-link opener is enabled.
    await vscode.env.openExternal(vscode.Uri.parse(viewer.store(uri.fragment)), { allowContributedOpeners: false });
  } }));
  startViewer().then(value => {
    if (disposed) return value.dispose();
    viewer = value;
    void vscode.commands.executeCommand('markdown.preview.refresh');
  }).catch(error => vscode.window.showErrorMessage(`独立看图：${error.message}`));
  return {
    extendMarkdownIt(md) {
      const render = md.renderer.render.bind(md.renderer);
      md.renderer.render = (...args) => render(...args) + (viewer
        ? `<span hidden class="paper-viewer-endpoint" data-url="${vscode.env.uriScheme}://local.paper-writing/diagram${new URL(viewer.url).pathname}"></span>` : '');
      return md;
    }
  };
}
module.exports = { startViewer, registerStandaloneViewer };
