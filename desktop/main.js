// Electron 桌面壳：内嵌极简静态服务加载 ../app，业务前端代码零改动
const { app, BrowserWindow, Menu, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT_BASE = 8788;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

// 开发态指向 ../app；打包后指向 resources/app（由 extraResources 拷贝）
function resolveAppDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app');
  return path.join(__dirname, '..', 'app');
}

function safeJoin(root, urlPath) {
  let p = decodeURIComponent((urlPath || '/').split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const full = path.normalize(path.join(root, p));
  const rootNorm = path.normalize(root);
  if (full !== rootNorm && !full.startsWith(rootNorm + path.sep)) return null; // 防目录穿越
  return full;
}

function startServer() {
  return new Promise((resolve) => {
    const root = resolveAppDir();
    const server = http.createServer((req, res) => {
      let file = safeJoin(root, req.url);
      if (file && fs.existsSync(file) && fs.statSync(file).isDirectory()) {
        file = path.join(file, 'index.html');
      }
      if (!file || !fs.existsSync(file)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    const tryListen = (p) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && p < 8888) { tryListen(p + 1); }
        else { app.quit(); }
      });
      server.listen(p, '127.0.0.1', () => resolve({ server, port: p }));
    };
    tryListen(PORT_BASE);
  });
}

let mainWindow = null;
const probeFile = path.join(os.tmpdir(), 'worklife-probe.json');

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  const { server, port } = await startServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    title: '工作生活助手',
    backgroundColor: '#f2f5f2',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // 外部链接一律交给系统浏览器，不在应用窗内导航
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url && /^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // 渲染层自检：先挂事件再加载，确认 IndexedDB 可用、DOM 挂载
  mainWindow.webContents.on('did-fail-load', (e, code, desc, url) => {
    fs.writeFileSync(probeFile, JSON.stringify({ ok: false, failLoad: String(code + ' ' + desc + ' ' + url) }));
  });
  mainWindow.webContents.once('did-finish-load', async () => {
    try {
      const probe = await mainWindow.webContents.executeJavaScript(
        'JSON.stringify({title:document.title, idb: typeof indexedDB !== "undefined", app: !!document.getElementById("app"), nav: document.querySelectorAll(".nav-item").length})'
      );
      fs.writeFileSync(probeFile, JSON.stringify({ ok: true, raw: probe }));
    } catch (err) {
      fs.writeFileSync(probeFile, JSON.stringify({ ok: false, probeError: err.message }));
    }
  });

  await mainWindow.loadURL('http://127.0.0.1:' + port + '/');

  mainWindow.on('closed', () => {
    mainWindow = null;
    try { server.close(); } catch (_) {}
    app.quit();
  });
});

app.on('window-all-closed', () => app.quit());