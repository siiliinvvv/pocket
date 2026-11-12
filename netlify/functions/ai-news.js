/* ============================================================
   OVOvv · /api/ai-news 服务端资讯抓取（Netlify Function）
   ------------------------------------------------------------
   为什么需要它：浏览器直连各家 RSS 会被 CORS 拦住，公共代理又常失效
   （实测 allorigins 520 / corsproxy 需密钥）。这里由服务端带浏览器 UA
   直接抓取真实 RSS 原文，解析后返回 JSON，彻底绕开 CORS 与第三方代理。
   返回的全部是真实存在的文章：标题、原文链接、发布时间、来源，
   抓取失败时宁可返回空，也绝不编造一条新闻。
   ============================================================ */
'use strict';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/* 真实 RSS 源；ai:true 表示整源都是 AI 内容，其余按标题关键词筛选。
   第二十三批：实测补充 InfoQ（中文）与 3 个英文 AI 专属频道，
   原先 4 个源合计只有 15 条候选，刷新自然很难出现新内容。 */
const SOURCES = [
  { name: '量子位',       url: 'https://www.qbitai.com/feed',                              ai: true  },
  { name: 'InfoQ',        url: 'https://www.infoq.cn/feed',                              ai: false },
  { name: '雷峰网',       url: 'https://www.leiphone.com/feed',                           ai: false },
  { name: '少数派',       url: 'https://sspai.com/feed',                                 ai: false },
  { name: 'Solidot',      url: 'https://www.solidot.org/index.rss',                      ai: false },
  { name: 'TechCrunch',   url: 'https://techcrunch.com/category/artificial-intelligence/feed/', ai: true },
  { name: 'The Verge',    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', ai: true },
  { name: 'Ars Technica', url: 'https://arstechnica.com/ai/feed/',                        ai: true }
];
const KW = /AI|人工智能|大模型|LLM|GPT|ChatGPT|OpenAI|DeepSeek|Claude|Gemini|通义|文心|豆包|Kimi|月之暗面|智谱|Anthropic|智能体|Agent|算力|芯片|英伟达|机器人|具身智能|多模态|Transformer|扩散模型|文生图|文生视频|机器学习|神经网络|自动驾驶/i;
const ENT = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", nbsp:' ', hellip:'…', mdash:'—', ndash:'–', ldquo:'“', rdquo:'”', lsquo:'‘', rsquo:'’' };

function decode(s){
  return String(s||'').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function(all, ent){
    if(ent.charAt(0)==='#'){
      const hex = ent.charAt(1)==='x'||ent.charAt(1)==='X';
      const n = hex ? parseInt(ent.slice(2),16) : parseInt(ent.slice(1),10);
      if(!isNaN(n) && n>0 && n<=0x10ffff){ try{ return String.fromCodePoint(n); }catch(e){ return all; } }
      return all;
    }
    const v = ENT[ent.toLowerCase()];
    return v === undefined ? all : v;
  });
}
function clean(s){
  return decode(String(s||'').replace(/^<!\[CDATA\[|\]\]>$/g,'').replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();
}
/* 极简 RSS / Atom 解析：不引第三方依赖，避免构建步骤 */
function parseFeed(xml){
  const out = [];
  const re = /<(item|entry)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while((m = re.exec(xml)) && out.length < 40){
    const block = m[2];
    const get = function(tag){
      const mm = new RegExp('<'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/'+tag+'>','i').exec(block);
      return mm ? clean(mm[1]) : '';
    };
    const title = get('title');
    if(!title) continue;
    let link = get('link');
    if(!link){
      const lm = /<link\b[^>]*href=["']([^"']+)["']/i.exec(block);
      link = lm ? decode(lm[1]) : '';
    }
    out.push({
      t: title,
      l: link,
      p: get('pubDate') || get('published') || get('updated') || get('dc:date') || ''
    });
  }
  return out;
}
async function fetchSource(src){
  try{
    const ctrl = new AbortController();
    const timer = setTimeout(()=>ctrl.abort(), 9000);
    const r = await fetch(src.url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' }
    });
    clearTimeout(timer);
    if(!r.ok) return [];
    const xml = await r.text();
    if(!/^\s*<\?xml|<rss|<feed/i.test(xml)) return [];   /* 拿到的不是 XML，直接丢掉 */
    let items = parseFeed(xml);
    if(!src.ai) items = items.filter(x => KW.test(x.t));
    /* 第二十三批：以前每源只留 6 条，源站当天发了 10 篇也会漏掉后 4 篇 */
    return items.slice(0, 20).map(x => ({ t:x.t, l:x.l, p:x.p, s:src.name }));
  }catch(e){ return []; }
}

exports.handler = async function(){
  const lists = await Promise.all(SOURCES.map(fetchSource));
  const picked = [], seen = new Set();
  lists.forEach(function(items){
    items.forEach(function(x){
      const k = x.t.replace(/\s+/g,'');
      if(x.t && !seen.has(k)){ seen.add(k); picked.push(x); }
    });
  });
  /* 第二十三批：先按发布时间倒序再截断，保证最新文章不会因为「源顺序」被挤掉；
     上限从 12 条放宽到 40 条，前端默认展示 12 条并可展开全部。 */
  function ts(x){ const d=new Date(x.p||''); return isNaN(d.getTime())?0:d.getTime(); }
  picked.sort(function(a,b){ return ts(b)-ts(a); });
  const items = picked.slice(0, 60);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* 以前 max-age=1800：点「刷新」时浏览器直接返回半小时前的缓存，看起来永远没新内容 */
      'Cache-Control': 'no-store, max-age=0',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({ ok: items.length>0, items: items, got: Date.now() })
  };
};
