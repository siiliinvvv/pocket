/* ============================================================
   OVOvv · 大模型代理（OpenAI 兼容 /chat/completions）
   ------------------------------------------------------------
   浏览器直连大模型接口常被 CORS 拦住；这里由服务端转发一次，
   密钥只出现在这一个请求里，不写日志、不落盘、不进入 state，
   因此也不会被分享版 HTML / 种子数据 / GitHub 同步带出去。

   导出：
     build(payload)  → 校验并规范化（返回 {endpoint,key,model,messages,stream,temperature}）
     pipe(p, res)    → Node 原生 HTTP 服务的流式转发（SSE，边生成边显示）
     handler(event)  → Netlify Functions 的非流式入口（平台不支持流式时兜底）
   ============================================================ */
'use strict';

const http = require('http');
const https = require('https');

/* 仅供本地端到端自测：设了 OVOVV_LLM_TEST=1 才允许 http / 内网 mock 服务。
   线上不设置该变量，https + 公网地址是硬性要求。 */
const TEST_MODE = process.env.OVOVV_LLM_TEST === '1';
const MAX_MESSAGES = 40;
const MAX_TOTAL_TEXT = 60000;

function bad(msg, status) {
  const e = new Error(msg);
  e.status = status || 400;
  return e;
}

function build(payload) {
  if (!payload || typeof payload !== 'object') throw bad('请求内容不是 JSON 对象');
  const base = String(payload.baseUrl || '').trim();
  if (!base) throw bad('请先填写接口地址');
  if (!/^https?:\/\//i.test(base)) throw bad('接口地址必须以 https:// 开头');
  let u;
  try { u = new URL(base); } catch (e) { throw bad('接口地址格式不正确'); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw bad('不支持的协议');
  if (!TEST_MODE) {
    if (u.protocol !== 'https:') throw bad('只允许 https 接口地址');
    const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const privateHost = !h.includes('.') || h === 'localhost' ||
      /\.(local|internal|localhost)$/i.test(h) ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^::1$|^f[cd][0-9a-f:]*$/i.test(h);
    if (privateHost) throw bad('不允许访问内网地址');
    if (u.username || u.password) throw bad('接口地址不能包含账号密码');
  }
  const key = String(payload.apiKey || '').trim();
  if (!key) throw bad('请先填写 API Key');
  if (key.length > 512) throw bad('API Key 过长');
  const model = String(payload.model || '').trim();
  if (!model || model.length > 120) throw bad('请填写正确的模型名称');

  const raw = payload.messages;
  if (!Array.isArray(raw) || !raw.length || raw.length > MAX_MESSAGES) throw bad('对话内容为空或过长');
  let total = 0;
  const messages = raw.map(function (m) {
    const r = m && (m.role === 'system' || m.role === 'assistant') ? m.role : 'user';
    const content = String((m && m.content) || '').slice(0, 20000);
    total += content.length;
    return { role: r, content: content };
  });
  if (total > MAX_TOTAL_TEXT) throw bad('对话内容太长，请清空对话后重试');

  let b = base.replace(/\/+$/, '');
  if (!/\/chat\/completions$/i.test(b)) b += '/chat/completions';
  let endpoint;
  try { endpoint = new URL(b).toString(); } catch (e) { throw bad('接口地址格式不正确'); }
  if (new URL(endpoint).pathname.length > 512) throw bad('接口地址过长');

  const t = payload.temperature;
  return {
    endpoint: endpoint,
    key: key,
    model: model,
    messages: messages,
    stream: payload.stream !== false,
    temperature: (typeof t === 'number' && t >= 0 && t <= 2) ? t : 0.7
  };
}

function reqBody(p) {
  return JSON.stringify({ model: p.model, messages: p.messages, stream: !!p.stream, temperature: p.temperature });
}

function upstream(p, onRes, onErr) {
  let u;
  try { u = new URL(p.endpoint); } catch (e) { onErr(bad('接口地址格式不正确')); return null; }
  const lib = u.protocol === 'https:' ? https : http;
  const body = Buffer.from(reqBody(p), 'utf8');
  const req = lib.request(u, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + p.key,
      'Accept': p.stream ? 'text/event-stream' : 'application/json',
      'Content-Length': body.length,
      'User-Agent': 'OVOvv-LLM-Proxy/1.0'
    },
    timeout: 120000
  }, function (r) { onRes(r); });
  req.on('timeout', function () { req.destroy(new Error('上游接口超时（120 秒）')); });
  req.on('error', function (e) { onErr(e); });
  req.write(body);
  req.end();
  return req;
}

/* 流式转发：上游每来一段 SSE，立刻写给浏览器，前端逐字显示 */
function pipe(p, res) {
  let settled = false;
  const fail = function (err) {
    if (settled) { try { res.end(); } catch (e) {} return; }
    settled = true;
    const msg = String((err && err.message) || err || '上游请求失败');
    res.writeHead(err && err.status ? err.status : 502, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: false, error: msg }));
  };
  const req = upstream(p, function (r) {
    const code = r.statusCode || 0;
    if (code >= 400) {
      let buf = '';
      r.on('data', function (c) { if (buf.length < 8192) buf += c; });
      r.on('end', function () {
        let detail = '';
        try { const j = JSON.parse(buf); detail = (j.error && (j.error.message || j.error.code)) || j.message || ''; }
        catch (e) { detail = buf.slice(0, 180); }
        fail(bad('上游返回 ' + code + (detail ? '：' + detail : ''), (code === 401 || code === 403) ? 401 : 502));
      });
      return;
    }
    if (!settled) {
      settled = true;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
    }
    r.pipe(res);
  }, fail);
  if (req) res.on('close', function () {
    if (!res.writableEnded) { try { req.destroy(); } catch (e) {} }
  });
}

function out(code, obj) {
  return {
    statusCode: code,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(obj)
  };
}

/* Netlify Functions：不支持流式响应，缓冲完整回复后一次性返回 JSON */
function handler(event) {
  let payload;
  try { payload = JSON.parse((event && event.body) || '{}'); }
  catch (e) { return Promise.resolve(out(400, { ok: false, error: '请求内容不是合法 JSON' })); }
  let p;
  try { p = build(Object.assign({}, payload, { stream: false })); }
  catch (e) { return Promise.resolve(out(e.status || 400, { ok: false, error: e.message })); }
  return new Promise(function (resolve) {
    upstream(p, function (r) {
      let buf = '';
      r.on('data', function (c) { if (buf.length < 2 * 1024 * 1024) buf += c; });
      r.on('end', function () {
        let j;
        try { j = JSON.parse(buf); }
        catch (e) { resolve(out(502, { ok: false, error: '上游返回内容无法解析' })); return; }
        if ((r.statusCode || 0) >= 400) {
          resolve(out(502, { ok: false, error: (j.error && j.error.message) || ('上游返回 ' + r.statusCode) }));
          return;
        }
        const c = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        resolve(out(200, { ok: true, content: c, model: p.model }));
      });
    }, function (e) {
      resolve(out(502, { ok: false, error: String((e && e.message) || e) }));
    });
  });
}

module.exports = { build: build, pipe: pipe, handler: handler };
