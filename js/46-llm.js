/* ============================================================
   OVOvv · 接入大模型（OpenAI 兼容）
   ------------------------------------------------------------
   ① 设置 → 「🤖 接入大模型」：服务商预设 / 接口地址 / API Key / 模型名，
      配置只写本机 localStorage 的独立键，不进 state，
      因此不会被分享版 HTML、种子数据、GitHub 同步带出去。
   ② 主页「🤖 AI 助手」板块：直接对话、流式显示、清空对话、
      可选把「分类 + 条目标题」作为上下文交给模型。
   ③ 请求优先走本站 /api/llm 转发（避免浏览器跨域），
      静态托管没有该接口时尝试浏览器直连，两种都失败会给出明确提示。
   ============================================================ */
'use strict';

const LLM_CFG_KEY = 'ovovv_llm_cfg_v1';
const LLM_CHAT_KEY = 'ovovv_llm_chat_v1';
/* 服务商预设：标注 free 的是 2026-11 实测仍有免费档的渠道（政策可能调整，以官网为准）。
   永久免费：智谱 GLM-4-Flash、百度 ERNIE-Speed-8K、腾讯混元-Lite、硅基流动 9B 以下小模型；
   限量免费：火山引擎豆包（每日重置额度）、Gemini / OpenRouter（免费限速，需国际网络）。 */
const LLM_PRESETS = {
  deepseek:    { base:'https://api.deepseek.com/v1',                       model:'deepseek-chat' },
  zhipu:       { base:'https://open.bigmodel.cn/api/paas/v4',              model:'glm-4-flash' },
  siliconflow: { base:'https://api.siliconflow.cn/v1',                     model:'Qwen/Qwen2.5-7B-Instruct' },
  qianfan:     { base:'https://qianfan.baidubce.com/v2',                   model:'ernie-speed-8k' },
  hunyuan:     { base:'https://api.hunyuan.cloud.tencent.com/v1',          model:'hunyuan-lite' },
  volc:        { base:'https://ark.cn-beijing.volces.com/api/v3',          model:'doubao-lite-32k' },
  qwen:        { base:'https://dashscope.aliyuncs.com/compatible-mode/v1', model:'qwen-plus' },
  moonshot:    { base:'https://api.moonshot.cn/v1',                        model:'moonshot-v1-8k' },
  openai:      { base:'https://api.openai.com/v1',                         model:'gpt-4o-mini' },
  gemini:      { base:'https://generativelanguage.googleapis.com/v1beta/openai', model:'gemini-2.5-flash' },
  openrouter:  { base:'https://openrouter.ai/api/v1',                      model:'deepseek/deepseek-chat-v3-0324:free' }
};

function llmCfg(){
  let c = {};
  try { c = JSON.parse(localStorage.getItem(LLM_CFG_KEY) || '{}') || {}; } catch (e) { c = {}; }
  return {
    preset: c.preset || 'custom',
    base: String(c.base || '').trim(),
    key: String(c.key || '').trim(),
    model: String(c.model || '').trim(),
    ctx: !!c.ctx
  };
}
function llmSaveCfg(c){
  try { localStorage.setItem(LLM_CFG_KEY, JSON.stringify(c)); } catch (e) {}
}
function llmReady(c){ return !!(c && c.base && c.key && c.model); }

let llmChat = [];
try { llmChat = JSON.parse(localStorage.getItem(LLM_CHAT_KEY) || '[]') || []; } catch (e) { llmChat = []; }
if (!Array.isArray(llmChat)) llmChat = [];
llmChat = llmChat.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').slice(-30);
function llmSaveChat(){
  try { localStorage.setItem(LLM_CHAT_KEY, JSON.stringify(llmChat.slice(-30))); } catch (e) {}
}
let llmBusy = false, llmDraft = '';

/* ---------- 设置分区 ---------- */
function llmStatus(){
  const box = $('llmStatus'); if (!box) return;
  if (SHARED) { box.textContent = '只读分享版不包含密钥，也不能调用大模型；请在原站点配置。'; return; }
  const c = llmCfg();
  box.innerHTML = llmReady(c)
    ? '已配置：<b>' + esc(c.model) + '</b> · ' + esc(c.base) + ' · 密钥仅保存在本机浏览器'
    : '未配置：填好接口地址、API Key 和模型名称，就能在主页的「🤖 AI 助手」里对话';
}
function llmFillSettings(){
  const c = llmCfg();
  const map = { llmPreset:c.preset, llmBase:c.base, llmKey:c.key, llmModel:c.model };
  Object.keys(map).forEach(function(id){ const el=$(id); if(el && !SHARED) el.value = map[id]; });
  if (SHARED){
    ['llmPreset','llmBase','llmKey','llmModel'].forEach(function(id){
      const el=$(id); if(el){ el.disabled=true; if(id==='llmKey') el.value='••••••'; }
    });
    ['llmSaveBtn','llmTestBtn','llmClearBtn'].forEach(function(id){
      const el=$(id); if(el) el.disabled=true;
    });
  }
  llmStatus();
}
const _llmPreset = $('llmPreset');
if (_llmPreset) _llmPreset.onchange = function(){
  const p = LLM_PRESETS[this.value];
  if (p){ $('llmBase').value = p.base; $('llmModel').value = p.model; }
};
const _llmSave = $('llmSaveBtn');
if (_llmSave) _llmSave.onclick = function(){
  const c = {
    preset: $('llmPreset').value,
    base: $('llmBase').value.trim(),
    key: $('llmKey').value.trim(),
    model: $('llmModel').value.trim(),
    ctx: llmCfg().ctx
  };
  if (!c.base || !c.key || !c.model){ toast('接口地址、API Key、模型名称都要填'); return; }
  llmSaveCfg(c); llmStatus(); toast('大模型配置已保存（仅本机）');
  if (typeof renderItems === 'function') { try { renderItems(); } catch (e) {} }
};
const _llmClear = $('llmClearBtn');
if (_llmClear) _llmClear.onclick = function(){
  const c = llmCfg(); c.key = ''; llmSaveCfg(c);
  $('llmKey').value = ''; llmStatus(); toast('已清除本机保存的 API Key');
  if (typeof renderItems === 'function') { try { renderItems(); } catch (e) {} }
};
const _llmTest = $('llmTestBtn');
if (_llmTest) _llmTest.onclick = async function(){
  const c = llmCfg();
  if (!llmReady(c)){ toast('先填好配置并点「保存配置」'); return; }
  const btn = this; btn.disabled = true; btn.textContent = '测试中…';
  $('llmStatus').textContent = '正在向大模型发送一条测试消息…';
  try {
    const text = await llmRequest(c, [{role:'user',content:'你好，请只回复四个字：连接成功'}], function(){});
    $('llmStatus').textContent = '✅ 连接成功，模型回复：' + String(text || '').slice(0, 80);
    toast('大模型连接成功');
  } catch (e) {
    $('llmStatus').textContent = '❌ 连接失败：' + String((e && e.message) || e);
  } finally { btn.disabled = false; btn.textContent = '测试连接'; }
};
llmFillSettings();

/* ---------- 主页板块 HTML ---------- */
function llmFmt(s){
  return esc(s || '').replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
}
function llmMsgHTML(m){
  return '<div class="hb-llm-msg ' + (m.role === 'user' ? 'me' : 'ai') + '">' +
    '<div class="hb-llm-bubble">' + llmFmt(m.content) + '</div></div>';
}
function hbLLMHTML(){
  if (SHARED){
    return '<div class="hb-llm"><div class="hb-llm-head"><span class="hb-llm-title">🤖 AI 助手</span></div>' +
      '<div class="hb-llm-note">这是只读分享版，不含接口密钥，也不调用大模型。请在原站点「设置 → 🤖 接入大模型」里配置后使用。</div></div>';
  }
  const c = llmCfg(), ready = llmReady(c);
  const log = llmChat.length
    ? llmChat.map(llmMsgHTML).join('')
    : '<div class="hb-llm-empty">还没开始对话。' + (ready ? '在下面输入问题，Enter 发送' : '先点右上角「⚙ 配置」接入大模型') + '</div>';
  return '<div class="hb-llm">' +
    '<div class="hb-llm-head"><span class="hb-llm-title">🤖 AI 助手 <i>· ' +
      esc(ready ? c.model : '未配置') + '</i></span>' +
      '<button class="hb-news-btn" data-llmact="settings" title="设置接口地址 / 密钥 / 模型">⚙ 配置</button>' +
      '<button class="hb-news-btn" data-llmact="clear" title="清空当前对话记录">🧹 清空对话</button></div>' +
    (ready ? '' : '<div class="hb-llm-note">还没接入大模型。点「⚙ 配置」填入接口地址、API Key 和模型名称，保存后即可在这里对话。密钥只保存在本机浏览器。</div>') +
    '<div class="hb-llm-log" id="hbLlmLog">' + log + '</div>' +
    '<div class="hb-llm-form"><textarea id="hbLlmInput" rows="2" maxlength="4000" placeholder="' +
      (ready ? '问点什么…（Enter 发送，Shift+Enter 换行）' : '请先点「⚙ 配置」接入大模型') + '">' + esc(llmDraft) + '</textarea>' +
      '<button class="hb-llm-send" data-llmact="send"' + (ready ? '' : ' disabled') + '>发送</button></div>' +
    '<label class="hb-llm-ctx"><input type="checkbox" id="hbLlmCtx"' + (c.ctx ? ' checked' : '') +
      '> 让 AI 参考我的资料（分类与条目标题，最多 30 条）</label>' +
    '</div>';
}
function llmScroll(){
  const log = $('hbLlmLog'); if (log) log.scrollTop = log.scrollHeight;
}
function llmLogAppend(m){
  llmChat.push(m);
  const log = $('hbLlmLog'); if (!log) return;
  const empty = log.querySelector('.hb-llm-empty'); if (empty) empty.remove();
  log.insertAdjacentHTML('beforeend', llmMsgHTML(m));
  llmScroll();
}
function llmSetLast(text){
  if (!llmChat.length) return;
  llmChat[llmChat.length - 1].content = text;
  const log = $('hbLlmLog'); if (!log) return;
  const rows = log.querySelectorAll('.hb-llm-msg.ai .hb-llm-bubble');
  if (rows.length) rows[rows.length - 1].innerHTML = llmFmt(text);
  llmScroll();
}
function llmSetBusy(b){
  llmBusy = b;
  const btn = document.querySelector('.hb-llm-send');
  if (btn){ btn.disabled = b || !llmReady(llmCfg()); btn.textContent = b ? '生成中…' : '发送'; }
}

/* ---------- 组装消息 ---------- */
function llmBuildMessages(c, q){
  const msgs = [];
  if (c.ctx){
    let folders = [], titles = [];
    try {
      folders = (state.folders || []).slice(0, 20).map(f => String(f.name || '')).filter(Boolean);
      titles = (state.items || []).slice(0, 30).map(function(it){
        const raw = it.fileName || it.text || '';
        try { return String(docTitle(raw) || '').slice(0, 80); } catch (e) { return String(raw).slice(0, 80); }
      }).filter(Boolean);
    } catch (e) {}
    msgs.push({ role:'system', content:
      '你在协助用户整理个人知识库「' + (state.spaceName || 'OVOvv') + '」。请用简体中文、简洁准确地回答；' +
      '下面是用户资料的标题（不是全文），资料里没有的信息不要编造。\n分类：' + folders.join('、') +
      '\n条目：\n- ' + titles.join('\n- ') });
  }
  msgs.push({ role:'system', content:'你是 OVOvv 个人主页里的 AI 助手。回答用简体中文，条理清楚，不要输出多余的客套话。' });
  const hist = llmChat.slice(0, -2)
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-12)
    .map(m => ({ role:m.role, content:String(m.content).slice(0, 8000) }));
  hist.forEach(m => msgs.push(m));
  msgs.push({ role:'user', content:q });
  return msgs;
}

/* ---------- 请求：优先本站 /api/llm，失败再尝试浏览器直连 ---------- */
function llmEndpoint(base){
  let b = String(base || '').trim().replace(/\/+$/, '');
  if (!/\/chat\/completions$/i.test(b)) b += '/chat/completions';
  return b;
}
function llmParseSSE(buf, onDelta){
  let text = '', err = '';
  String(buf).split(/\r?\n/).forEach(function(line){
    line = line.trim();
    if (!line || line.charAt(0) === ':' || line.indexOf('data:') !== 0) return;
    const d = line.slice(5).trim();
    if (d === '[DONE]') return;
    let j; try { j = JSON.parse(d); } catch (e) { return; }
    if (j && j.error) { err = String((j.error && j.error.message) || j.error); return; }
    const ch = j && j.choices && j.choices[0];
    const m = ch && (ch.delta || ch.message);
    if (m && typeof m.content === 'string') text += m.content;
  });
  if (text && onDelta) onDelta(text);
  return { text:text, error:err };
}
async function llmConsume(resp, onDelta){
  if (!resp.body || !resp.body.getReader){
    const s = await resp.text(), r = llmParseSSE(s, onDelta);
    if (r.error) throw new Error(r.error);
    if (r.text) return r.text;
    throw new Error('模型没有返回内容');
  }
  const reader = resp.body.getReader(), dec = new TextDecoder('utf-8');
  let buf = '', last = { text:'', error:'' };
  while (true){
    const r = await reader.read();
    if (r.done) break;
    buf += dec.decode(r.value, { stream:true });
    last = llmParseSSE(buf, onDelta);   /* 每次从头累计，天然得到完整文本 */
  }
  if (last.error) throw new Error(last.error);
  if (last.text) return last.text;
  let j = null;
  try { j = JSON.parse(buf); } catch (e) {}
  if (j){
    if (j.error) throw new Error(String((j.error && j.error.message) || j.error));
    const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (c){ onDelta(c); return c; }
  }
  throw new Error('模型没有返回内容（接口可能不支持流式，可换个服务商预设试试）');
}
async function llmDirect(c, messages){
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, 120000);
  try {
    const resp = await fetch(llmEndpoint(c.base), {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + c.key },
      body: JSON.stringify({ model:c.model, messages:messages, stream:false, temperature:0.7 }),
      signal: ctrl.signal
    });
    const txt = await resp.text();
    let j; try { j = JSON.parse(txt); } catch (e) { throw new Error('上游返回内容无法解析（' + resp.status + '）'); }
    if (!resp.ok) throw new Error((j.error && j.error.message) || ('上游返回 ' + resp.status));
    const c2 = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (!c2) throw new Error('模型没有返回内容');
    return c2;
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时（120 秒）');
    throw new Error('浏览器直连也失败了（常见原因是跨域或密钥无效）：' + String((e && e.message) || e) + '。建议通过本站网址打开，由服务端转发请求。');
  } finally { clearTimeout(timer); }
}
async function llmRequest(c, messages, onDelta){
  const payload = { baseUrl:c.base, apiKey:c.key, model:c.model, messages:messages, stream:true };
  const ctrl = new AbortController();
  const timer = setTimeout(function(){ ctrl.abort(); }, 120000);
  let resp = null, direct = false;
  try {
    /* 带上当前页面的查询串（分享链接的 sharecode），保证服务端会话放行 */
    resp = await fetch('api/llm' + (location.search || ''), {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify(payload), signal: ctrl.signal
    });
    const ct = String(resp.headers.get('content-type') || '');
    if (ct.indexOf('text/html') >= 0 || (!resp.ok && ct.indexOf('json') < 0)) direct = true;
  } catch (e) { direct = true; }
  try {
    if (direct) return await llmDirect(c, messages);
    const ct = String(resp.headers.get('content-type') || '');
    if (ct.indexOf('json') >= 0){
      const j = await resp.json();
      if (j && j.ok === false) throw new Error(j.error || '服务端返回错误');
      const txt = (j && j.ok === true) ? String(j.content || '') :
        ((j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '');
      if (txt){ onDelta(txt); return txt; }
      throw new Error('服务端没有返回内容');
    }
    return await llmConsume(resp, onDelta);
  } catch (e) {
    if (e && e.name === 'AbortError') throw new Error('请求超时（120 秒）');
    throw e;
  } finally { clearTimeout(timer); }
}

async function llmSend(){
  if (llmBusy) return;
  const c = llmCfg();
  if (!llmReady(c)){ toast('请先点「⚙ 配置」接入大模型'); return; }
  const inp = $('hbLlmInput');
  const q = inp ? inp.value.trim() : '';
  if (!q) return;
  if (inp){ inp.value = ''; llmDraft = ''; }
  llmLogAppend({ role:'user', content:q });
  llmLogAppend({ role:'assistant', content:'正在思考…' });
  llmSaveChat();          /* 先落盘，流式生成中途关页面也不会丢这一轮问答 */
  llmSetBusy(true);
  const messages = llmBuildMessages(c, q);
  try {
    const text = await llmRequest(c, messages, function(part){ llmSetLast(part); });
    llmSetLast(text || '（模型没有返回内容）');
  } catch (e) {
    llmSetLast('❌ ' + String((e && e.message) || e));
  } finally {
    llmSaveChat(); llmSetBusy(false);
  }
}

/* ---------- 事件（捕获阶段，避免被主页其它委托抢先） ---------- */
document.addEventListener('click', function(e){
  const b = e.target && e.target.closest && e.target.closest('[data-llmact]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  const a = b.dataset.llmact;
  if (a === 'send'){ llmSend(); return; }
  if (a === 'clear'){
    llmChat = []; llmSaveChat(); llmDraft = '';
    if (typeof renderItems === 'function') { try { renderItems(); } catch (err) {} }
    toast('已清空对话'); return;
  }
  if (a === 'settings'){
    if (typeof openSettings === 'function') openSettings();
    llmFillSettings();
    const sec = $('llmSec');
    if (sec){
      sec.classList.add('open');
      const head = sec.querySelector('.sec-head'); if (head) head.setAttribute('aria-expanded','true');
      try { sec.scrollIntoView({ block:'nearest', behavior:'smooth' }); } catch (err) {}
    }
  }
}, true);
document.addEventListener('keydown', function(e){
  if (e.target && e.target.id === 'hbLlmInput' && e.key === 'Enter' && !e.shiftKey){
    e.preventDefault(); e.stopPropagation(); llmSend();
  }
}, true);
document.addEventListener('input', function(e){
  if (e.target && e.target.id === 'hbLlmInput') llmDraft = e.target.value;
}, true);
document.addEventListener('change', function(e){
  if (e.target && e.target.id === 'hbLlmCtx'){
    const c = llmCfg(); c.ctx = !!e.target.checked; llmSaveCfg(c);
    toast(c.ctx ? '已开启：回答时会带上资料标题' : '已关闭资料参考');
  }
}, true);

/* ---------- 样式（全部走主题变量，字体色不跟主题色走） ---------- */
(function(){
  const st = document.createElement('style');
  st.textContent =
  '.hb-llm{border-radius:14px;padding:2px 0 6px}'+
  '.hb-llm-head{display:flex;align-items:center;gap:6px;margin:2px 0 8px;flex-wrap:wrap}'+
  '.hb-llm-title{font-weight:700;font-size:14px;color:var(--text);flex:1;min-width:0}'+
  '.hb-llm-title i{font-style:normal;font-weight:500;font-size:11.5px;color:var(--text3)}'+
  '.hb-llm-note{font-size:11.5px;color:var(--text2);background:var(--hover);border-radius:9px;padding:8px 10px;margin-bottom:9px;line-height:1.65}'+
  '.hb-llm-log{max-height:300px;min-height:64px;overflow:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:9px;padding-right:4px}'+
  '.hb-llm-empty{font-size:12px;color:var(--text3);text-align:center;padding:18px 8px;border:1.5px dashed var(--text3);border-radius:10px;line-height:1.6}'+
  '.hb-llm-msg{display:flex}'+
  '.hb-llm-msg.me{justify-content:flex-end}'+
  '.hb-llm-bubble{max-width:86%;font-size:12.8px;line-height:1.7;color:var(--text);background:var(--el-bg);box-shadow:var(--raised);border-radius:11px;padding:8px 11px;word-break:break-word}'+
  '.hb-llm-msg.me .hb-llm-bubble{background:var(--accent-soft)}'+
  '.hb-llm-bubble code{font-size:11.5px;background:var(--hover);border-radius:4px;padding:1px 4px}'+
  '.hb-llm-form{display:flex;align-items:flex-end;gap:8px}'+
  '.hb-llm-form textarea{flex:1;min-width:0;resize:vertical;border:none;outline:none;border-radius:10px;padding:9px 11px;font:inherit;font-size:12.8px;color:var(--text);background:var(--el-bg);box-shadow:var(--inset);line-height:1.6}'+
  '.hb-llm-send{flex:none;border:none;border-radius:10px;padding:9px 16px;font:inherit;font-size:12.8px;font-weight:700;color:var(--ink);background:var(--el-bg);box-shadow:var(--raised);cursor:pointer}'+
  '.hb-llm-send:disabled{opacity:.55;cursor:not-allowed}'+
  '.hb-llm-ctx{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text2);margin-top:8px;cursor:pointer}'+
  '.hb-llm-ctx input{accent-color:var(--accent);margin:0}';
  document.head.appendChild(st);
})();

/* 与资讯模块同理：本文件在首屏渲染之后才加载，模块就绪后补一次重绘 */
setTimeout(function(){
  try { if (typeof newsRenderIfHome === 'function') newsRenderIfHome(); }
  catch (e) { try { renderItems(); } catch (err) {} }
}, 0);
