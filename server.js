/* ============================================================
   OVOvv · 单端口 HTTP 服务（用于部署成可直接访问的网址）
   ------------------------------------------------------------
   1) 静态托管本目录（index.html / css / js …），带正确 MIME；
   2) /api/ai-news 复用 netlify/functions/ai-news.js 的真实 RSS 抓取，
      这样部署后前端优先通道①就能用，不必依赖第三方公共代理；
   3) /api/llm 复用 netlify/functions/llm.js 转发 OpenAI 兼容大模型接口
      （流式 SSE、密钥不落盘），让「AI 助手」板块在本站直接可用；
   4) 只监听环境变量 PORT 并绑定 0.0.0.0，符合单端口托管要求；
   5) 纯 Node 原生模块，零依赖，无需构建。
   ============================================================ */
'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const zlib  = require('zlib');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.md':'text/markdown; charset=utf-8',
  '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
  '.gif':'image/gif', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ttf':'font/ttf',
  '.zip':'application/zip', '.pdf':'application/pdf', '.map':'application/json; charset=utf-8'
};

/* Node 18 以下没有全局 fetch：给资讯抓取函数补一个最小实现（支持超时中断与重定向） */
if (typeof globalThis.fetch !== 'function') {
  globalThis.fetch = function (url, opts) {
    opts = opts || {};
    return new Promise(function (resolve, reject) {
      function request(target, hops) {
        if (hops > 4) { reject(new Error('too many redirects')); return; }
        let u;
        try { u = new URL(target); } catch (e) { reject(e); return; }
        const lib = u.protocol === 'https:' ? https : http;
        const req = lib.request(u, {
          method: opts.method || 'GET',
          headers: Object.assign({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          }, opts.headers || {})
        }, function (res) {
          const code = res.statusCode || 0;
          if (code >= 300 && code < 400 && res.headers.location) {
            res.resume();
            request(new URL(res.headers.location, u).toString(), hops + 1);
            return;
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', function () {
            const body = Buffer.concat(chunks).toString('utf8');
            resolve({
              ok: code >= 200 && code < 300,
              status: code,
              text: () => Promise.resolve(body),
              json: () => Promise.resolve(JSON.parse(body))
            });
          });
        });
        req.on('error', reject);
        req.setTimeout(9000, function () { req.destroy(new Error('timeout')); });
        if (opts.signal) {
          if (opts.signal.aborted) { req.destroy(new Error('aborted')); return; }
          opts.signal.addEventListener('abort', function () { req.destroy(new Error('aborted')); }, { once: true });
        }
        req.end();
      }
      request(String(url), 0);
    });
  };
}

let newsFn = null, llmFn = null;
try { newsFn = require('./netlify/functions/ai-news.js'); } catch (e) { newsFn = null; }
try { llmFn = require('./netlify/functions/llm.js'); } catch (e) { llmFn = null; }

function send(res, code, body, headers) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, headers || {}));
  res.end(body);
}

const server = http.createServer(async function (req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch (e) { send(res, 400, 'Bad Request'); return; }

  if (pathname === '/api/ai-news') {
    try {
      if (!newsFn) throw new Error('news function unavailable');
      const r = await newsFn.handler();
      send(res, r.statusCode || 200, r.body || '{"ok":false,"items":[]}', r.headers);
    } catch (err) {
      send(res, 502, JSON.stringify({ ok: false, items: [], error: String(err && err.message || err) }),
        { 'Content-Type': 'application/json; charset=utf-8' });
    }
    return;
  }
  /* 大模型代理：密钥只在这次请求里出现，服务端不保存；支持流式 SSE */
  if (pathname === '/api/llm') {
    const jsonHead = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    if (req.method !== 'POST') {
      send(res, 405, JSON.stringify({ ok: false, error: '只支持 POST' }), jsonHead);
      return;
    }
    let raw = '', size = 0, over = false;
    req.on('data', function (c) {
      size += c.length;
      if (size > 262144) { over = true; return; }
      raw += c;
    });
    req.on('end', function () {
      if (over) { send(res, 413, JSON.stringify({ ok: false, error: '请求内容过大' }), jsonHead); return; }
      if (!llmFn) { send(res, 502, JSON.stringify({ ok: false, error: '大模型代理模块不可用' }), jsonHead); return; }
      let payload;
      try { payload = JSON.parse(raw || '{}'); }
      catch (e) { send(res, 400, JSON.stringify({ ok: false, error: '请求内容不是合法 JSON' }), jsonHead); return; }
      let p;
      try { p = llmFn.build(payload); }
      catch (e) { send(res, e.status || 400, JSON.stringify({ ok: false, error: e.message }), jsonHead); return; }
      llmFn.pipe(p, res);
    });
    return;
  }
  /* ============ 分享数据快照：站长推送（POST），访客优先读取（GET） ============
     存 data/share-<code>.json。code 只允许字母数字（防路径穿越），限 14MB，
     同一 code 3 秒内只许写一次。跨域开放（本地/线上打开都能推送），无密钥，
                 门槛即 sharecode 本身——这是个人主页分享链接，风险可接受。 */
  const CORS_HEAD = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  };
  const shareFile = function (code) {
    return path.join(ROOT, 'data', 'share-' + code + '.json');
  };
  const shareRate = Object.create(null);
  if (pathname === '/api/share') {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS_HEAD); res.end(); return; }
    if (req.method === 'GET') {
      const code = String(new URL(req.url, 'http://localhost').searchParams.get('code') || '');
      if (!/^[A-Za-z0-9]{4,24}$/.test(code)) {
        send(res, 400, JSON.stringify({ ok: false, error: 'code 不合法' }),
          Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEAD));
        return;
      }
      fs.readFile(shareFile(code), function (err, buf) {
        if (err) {
          send(res, 404, JSON.stringify({ ok: false }),
            Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEAD));
          return;
        }
        const head = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEAD);
        if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || '')) && buf.length > 2048) {
          head['Content-Encoding'] = 'gzip';
          res.writeHead(200, head); res.end(zlib.gzipSync(buf));
        } else { res.writeHead(200, head); res.end(buf); }
      });
      return;
    }
    if (req.method === 'POST') {
      const jsonHead = Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, CORS_HEAD);
      let chunks = [], size = 0, over = false;
      req.on('data', function (c) {
        size += c.length;
        if (size > 14 * 1024 * 1024) { over = true; req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', function () {
        if (over) { send(res, 413, JSON.stringify({ ok: false, error: '数据太大（上限 14MB）' }), jsonHead); return; }
        let payload;
        try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
        catch (e) { send(res, 400, JSON.stringify({ ok: false, error: '请求内容不是合法 JSON' }), jsonHead); return; }
        const code = String(payload.code || '');
        if (!/^[A-Za-z0-9]{4,24}$/.test(code)) { send(res, 400, JSON.stringify({ ok: false, error: 'code 不合法' }), jsonHead); return; }
        if (!payload.state || typeof payload.state !== 'object') { send(res, 400, JSON.stringify({ ok: false, error: '缺少 state' }), jsonHead); return; }
        const now = Date.now();
        if (shareRate[code] && now - shareRate[code] < 3000) {
          send(res, 429, JSON.stringify({ ok: false, error: '操作太频繁，请稍后再试' }), jsonHead); return;
        }
        shareRate[code] = now;
        const snap = { ts: now, state: payload.state, assets: payload.assets || {} };
        fs.writeFile(shareFile(code), JSON.stringify(snap), function (err) {
          if (err) { send(res, 500, JSON.stringify({ ok: false, error: '服务端写入失败：' + err.code }), jsonHead); return; }
          send(res, 200, JSON.stringify({ ok: true, ts: snap.ts }), jsonHead);
        });
      });
      return;
    }
    send(res, 405, 'Method Not Allowed', CORS_HEAD);
    return;
  }
  if (pathname === '/health') { send(res, 200, 'ok'); return; }
  /* 浏览器会自动请求站点图标；直接回 204，避免线上出现无意义的 404 */
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }

  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, '.' + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { send(res, 403, 'Forbidden'); return; }
  fs.stat(file, function (err, st) {
    if (err || !st.isFile()) { send(res, 404, 'Not Found'); return; }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    /* 种子数据含用户上传的文件（约 5MB），对文本类资源开启 gzip，
       压缩后通常只有原来的 1/4，首次打开也能很快。 */
    const isText = /^(text\/|application\/(json|javascript)|image\/svg)/.test(type);
    const canGzip = isText && st.size > 2048 &&
      /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    const headers = {
      'Content-Type': type,
      'Cache-Control': pathname.indexOf('/data/') === 0 ? 'public, max-age=3600' : 'no-cache',
      'Vary': 'Accept-Encoding'
    };
    if (canGzip) headers['Content-Encoding'] = 'gzip';
    if (req.method === 'HEAD') { res.writeHead(200, headers); res.end(); return; }
    res.writeHead(200, headers);
    const rs = fs.createReadStream(file);
    if (canGzip) rs.pipe(zlib.createGzip({ level: 6 })).pipe(res);
    else rs.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', function () {
  console.log('OVOvv listening on 0.0.0.0:' + PORT);
});
