/* ============================================================
   OVOvv · 主页「AI 资讯」板块（第二十三批）
   ------------------------------------------------------------
   自动拉取真实存在的 AI 新闻，双通道保证可用：
     ① 同源 /api/ai-news（服务端带 UA 直抓 RSS 原文，不受 CORS 影响）
     ② 回退 api.rss2json.com（本地 file:// 打开、或静态托管没有 Function 时）
   两条通道都只返回真实文章的标题 / 链接 / 发布时间 / 来源；
   拉不到就明确提示失败，绝不生成或编造任何一条新闻。

   第二十三批改动：
   · 刷新不再被 30 分钟浏览器缓存挡住（no-store + 时间戳）；
   · 刷新改为「按标题去重合并」而不是整份覆盖，新增条目标记并计数；
   · 每天上限 12 → 40 条，板块默认显示 12 条、可展开全部；
   · 默认按重要性排序（来源权重 + 重大事件词 + 时效），可切换按时间；
   · 明确显示「最近更新时间 / 源站最新一篇发布时间 / 本次新增几条」，
     源站确实没发新稿时直接写明，不用猜是不是刷新坏了。
   存档：state.newsArchive['YYYY-MM-DD']={items,got,via,added,forced}，
   可按天查看 / 删除整天 / 删除单条 / 导出 txt / 清空，自动只留最近 60 天。
   ============================================================ */
'use strict';

/* ---------- 资讯源（回退通道用；服务端通道在 netlify/functions/ai-news.js） ---------- */
const NEWS_SOURCES=[
  {name:'量子位',   url:'https://www.qbitai.com/feed',        ai:true},
  {name:'InfoQ',    url:'https://www.infoq.cn/feed',          ai:false},
  {name:'雷峰网',   url:'https://www.leiphone.com/feed',      ai:false},
  {name:'少数派',   url:'https://sspai.com/feed',             ai:false},
  {name:'Solidot',  url:'https://www.solidot.org/index.rss',  ai:false}
];
const NEWS_KW=/AI|人工智能|大模型|LLM|GPT|ChatGPT|OpenAI|DeepSeek|Claude|Gemini|通义|文心|豆包|Kimi|月之暗面|智谱|Anthropic|智能体|Agent|算力|芯片|英伟达|机器人|具身智能|多模态|Transformer|扩散模型|文生图|文生视频|机器学习|神经网络|自动驾驶/i;
const NEWS_LIMIT=40;      /* 每天存档最多保留多少条（此前是 12 条） */
const NEWS_SHOW=12;       /* 板块默认展示条数，其余「展开全部」查看 */
const NEWS_HOT=16;        /* 重要性得分达到这个值就标 🔥 */
let __newsBusy=false;
let __newsExpanded=false; /* 展开状态只存在内存里，不写进存档 */

function newsTodayKey(){
  const n=new Date();
  return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0');
}
function newsTimeout(ms){
  try{ return (window.AbortSignal&&AbortSignal.timeout)?{signal:AbortSignal.timeout(ms||15000)}:{}; }catch(e){ return {}; }
}
/* 发布时间 → 毫秒。RFC822 / ISO / 「YYYY-MM-DD HH:mm」都能认，认不出返回 0 */
function newsParseTime(p){
  const s=String(p||''); if(!s) return 0;
  const d=new Date(s);
  if(!isNaN(d.getTime())) return d.getTime();
  const m=s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if(m) return new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5]).getTime();
  return 0;
}
/* 发布时间统一成「11-09 08:57」这种短格式，方便核对新闻是真实、当天的 */
function newsShortDate(p){
  const s=String(p||'');
  if(!s) return '';
  let m=s.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if(m) return m[2]+'-'+m[3]+' '+m[4]+':'+m[5];
  m=s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if(m) return m[2]+'-'+m[3];
  /* RSS 常用 RFC 822：Tue, 10 Nov 2026 08:33:25 +0000 */
  const d=new Date(s);
  if(!isNaN(d.getTime())){
    const p2=n=>String(n).padStart(2,'0');
    return p2(d.getMonth()+1)+'-'+p2(d.getDate())+' '+p2(d.getHours())+':'+p2(d.getMinutes());
  }
  return '';
}
function newsClock(ts){
  if(!ts) return '';
  const d=new Date(ts), p2=n=>String(n).padStart(2,'0');
  return p2(d.getHours())+':'+p2(d.getMinutes());
}
function newsKeyOf(n){ return String((n&&n.t)||'').replace(/\s+/g,''); }

/* ---------- 重要性评分：确定性、可解释，不调用任何外部服务 ---------- */
const NEWS_SRC_W={'量子位':6,'机器之心':6,'InfoQ':5,'雷峰网':4,'36氪':3,'Solidot':3,
  'TechCrunch':3,'The Verge':3,'Ars Technica':3,'少数派':2};
const NEWS_HI=/开源|发布|推出|首发|融资|收购|上市|突破|重磅|万亿|千亿|亿美金|禁令|监管|起诉|裁员|GPT-?[5-9]|Claude|Gemini|DeepSeek|OpenAI|英伟达|Nvidia|Sora|AGI|量子计算|世界模型|基准第一|刷榜/i;
const NEWS_MID=/大模型|智能体|Agent|机器人|算力|芯片|多模态|评测|实测|框架|模型|训练|推理|数据集|开源模型|代码/i;
function newsScore(n){
  const t=String((n&&n.t)||'');
  let s=NEWS_SRC_W[(n&&n.s)||'']!=null?NEWS_SRC_W[n.s]:3;
  const hi=(t.match(new RegExp(NEWS_HI.source,'gi'))||[]).length;
  const mid=(t.match(new RegExp(NEWS_MID.source,'gi'))||[]).length;
  s+=Math.min(hi,3)*5+Math.min(mid,3)*2;
  if(/[\u4e00-\u9fa5]/.test(t)) s+=4;   /* 中文资讯对中文用户更相关 */
  if(/人设崩塌|塌房|吃瓜|翻车|网传|传闻|疑似|花边/i.test(t)) s-=6;   /* 八卦标题降权 */
  if(/\d+(\.\d+)?\s*(亿|万|倍|%|B|参数|K|轮|美元)/.test(t)) s+=3;   /* 带量化信息 */
  const ms=newsParseTime(n&&n.p);
  if(ms){
    const h=(Date.now()-ms)/3600000;
    if(h<6) s+=8; else if(h<12) s+=6; else if(h<24) s+=4; else if(h<48) s+=2;
    else if(h>24*7) s-=4;
  }
  if(t.length<14) s-=2;    /* 过短标题多为快讯 */
  return s;
}
/* 返回新数组，不改动存档原数组；同分时新的排前面 */
function newsRank(items,mode){
  const arr=(items||[]).slice();
  if(mode==='time'){
    return arr.sort((a,b)=>newsParseTime(b.p)-newsParseTime(a.p));
  }
  return arr.sort(function(a,b){
    const d=newsScore(b)-newsScore(a);
    return d!==0?d:(newsParseTime(b.p)-newsParseTime(a.p));
  });
}

/* ---------- 通道 ①：同源服务端抓取（真实源，优先） ---------- */
async function newsFetchServer(){
  try{
    /* no-store + 时间戳：以前接口带 max-age=1800，点刷新拿到的还是半小时前的缓存 */
    const opt=Object.assign({cache:'no-store'},newsTimeout(15000));
    const r=await fetch('/api/ai-news?t='+Date.now(),opt);
    if(!r.ok) return null;
    const j=await r.json();
    if(j&&j.ok&&Array.isArray(j.items)&&j.items.length){
      return j.items.map(x=>({t:String(x.t||'').trim(),l:x.l||'',p:x.p||'',s:x.s||'资讯'}))
        .filter(x=>x.t&&/^https?:\/\//i.test(x.l));
    }
  }catch(e){}
  return null;
}
/* ---------- 通道 ②：rss2json 公共代理兜底 ---------- */
async function newsFetchFeed(src){
  try{
    const r=await fetch('https://api.rss2json.com/v1/api.json?count=20&rss_url='+encodeURIComponent(src.url),newsTimeout(12000));
    if(r.ok){
      const j=await r.json();
      if(j&&j.status==='ok'&&Array.isArray(j.items)&&j.items.length){
        return j.items.map(x=>({t:String(x.title||'').trim(),l:x.link||'',p:x.pubDate||''})).filter(x=>x.t);
      }
    }
  }catch(e){}
  return [];
}
async function newsFetchProxy(){
  const picked=[], seen=new Set();
  for(const src of NEWS_SOURCES){
    let its=[];
    try{ its=await newsFetchFeed(src); }catch(e){ its=[]; }
    if(!src.ai) its=its.filter(x=>NEWS_KW.test(x.t));
    its.slice(0,12).forEach(function(x){
      const k=x.t.replace(/\s+/g,'');
      if(x.t&&/^https?:\/\//i.test(x.l)&&!seen.has(k)){ seen.add(k); picked.push({t:x.t,l:x.l,p:x.p,s:src.name}); }
    });
  }
  return picked.slice(0,NEWS_LIMIT);
}
/* 拉取今天的资讯并写入按天存档；force=true 时忽略已有记录强制刷新并合并新增 */
async function newsAutoFetch(force){
  if(typeof BOX_HIDE!=='undefined'&&BOX_HIDE) return;
  if(__newsBusy) return;
  if(!state.newsArchive) state.newsArchive={};
  const key=newsTodayKey();
  const prev=((state.newsArchive[key]&&state.newsArchive[key].items)||[]).slice();
  if(!force&&prev.length) return;
  if(!force&&state.newsFail&&state.newsFail.day===key&&state.newsFail.n>=2&&Date.now()-(state.newsFail.at||0)<10*60*1000) return;
  __newsBusy=true;
  newsRenderIfHome();
  let items=await newsFetchServer(), via='server';
  if(!items||!items.length){ items=await newsFetchProxy(); via='proxy'; }
  __newsBusy=false;
  items=items||[];
  if(items.length){
    /* 合并而不是覆盖：刷新时旧条目不丢，本次抓到的新文章标 fresh 并计数 */
    const byTitle=new Map();
    prev.forEach(function(x){
      const k=newsKeyOf(x);
      if(k&&!byTitle.has(k)) byTitle.set(k,{t:x.t,l:x.l,p:x.p,s:x.s});
    });
    let added=0;
    items.forEach(function(x){
      const k=newsKeyOf(x);
      if(!k||byTitle.has(k)) return;
      byTitle.set(k,{t:x.t,l:x.l,p:x.p,s:x.s,fresh:!!force});
      if(force) added++;
    });
    let merged=Array.from(byTitle.values());
    if(merged.length>NEWS_LIMIT){
      /* 超上限时保留最重要的，而不是简单按时间砍掉旧文章 */
      merged=newsRank(merged,'importance').slice(0,NEWS_LIMIT);
    }
    state.newsArchive[key]={items:merged,got:Date.now(),via:via,added:added,forced:!!force};
    state.newsFail=null; state.newsRetry=null;
    const keys=Object.keys(state.newsArchive).sort();
    while(keys.length>60) delete state.newsArchive[keys.shift()];
    save();
  }else{
    state.newsFail={day:key,n:((state.newsFail&&state.newsFail.day===key)?state.newsFail.n:0)+1,at:Date.now()};
    /* 公共接口偶发限流（429）时 30 秒后自动补拉一次，只补一次 */
    if(!state.newsRetry||state.newsRetry.day!==key){
      state.newsRetry={day:key};
      setTimeout(function(){ try{ newsAutoFetch(true); }catch(e){} },30000);
    }
  }
  newsRenderIfHome();
}
function newsRenderIfHome(){
  if(hbEdit) return;
  if(typeof currentFolderId==='undefined'||currentFolderId!==(typeof HOME_ID!=='undefined'?HOME_ID:'__home__')) return;
  if(typeof renderItems==='function'){ try{ renderItems(); }catch(e){} }
}
/* ---------- 板块 HTML（数据始终来自存档，分享版也能静态展示） ---------- */
function newsItemLink(n,hot){
  return (hot?'<span class="hb-news-hot" title="重要性较高">🔥</span>':'')+
    '<span class="hb-news-src">'+esc(n.s||'资讯')+'</span>'+
    '<span class="hb-news-tt">'+esc(n.t)+'</span>'+
    (n.p?'<span class="hb-news-time">'+esc(newsShortDate(n.p))+'</span>':'');
}
function newsNote(rec,all){
  if(!rec) return '';
  let latestP='',latestT=0;
  all.forEach(function(x){ const t=newsParseTime(x.p); if(t>latestT){ latestT=t; latestP=x.p; } });
  let s='最近更新 '+newsClock(rec.got);
  if(latestT) s+=' · 源站最新 '+newsShortDate(latestP);
  if(rec.forced) s+=rec.added>0?(' · 本次新增 '+rec.added+' 条'):' · 本次源站暂无新文章';
  if(state.newsFail&&state.newsFail.day===newsTodayKey()) s+=' · 上次重试未成功，30 秒后会自动再试';
  return s;
}
function hbNewsHTML(){
  const key=newsTodayKey();
  const rec=(state.newsArchive||{})[key];
  const all=(rec&&rec.items)||[];
  const mode=(state.newsSort==='time')?'time':'importance';
  const ranked=newsRank(all,mode);
  const shown=__newsExpanded?ranked:ranked.slice(0,NEWS_SHOW);
  let body;
  if(all.length){
    body='<div class="hb-news-list">'+shown.map(function(n){
      return '<a class="hb-news-item'+(n.fresh?' is-fresh':'')+'" href="'+esc(n.l||'#')+'" target="_blank" rel="noopener noreferrer" title="打开原文">'+
        newsItemLink(n,newsScore(n)>=NEWS_HOT)+'</a>';
    }).join('')+'</div>';
    if(ranked.length>NEWS_SHOW){
      body+='<button class="hb-news-more" data-newsact="more">'+
        (__newsExpanded?'▲ 收起':'▼ 展开全部 '+ranked.length+' 条')+'</button>';
    }
  }else if(__newsBusy){
    body='<div class="hb-day-hint">正在拉取今天的真实 AI 资讯…</div>';
  }else if(rec&&rec.items&&!rec.items.length){
    body='<div class="hb-day-hint">今天的资讯源暂时没有内容</div>';
  }else if(state.newsFail&&state.newsFail.day===key){
    body='<div class="hb-day-hint">这次没拉到（网络受限或公共接口限流），30 秒后会自动重试；也可点「🔄 刷新」。不会用假新闻填充</div>';
  }else{
    body='<div class="hb-day-hint">即将拉取今天的 AI 资讯…</div>';
  }
  const note=newsNote(rec,all);
  return '<div class="hb-news">'+
    '<div class="hb-news-head"><span class="hb-news-title">📰 今日 AI 资讯 <i>'+
      (all.length?('· '+all.length+' 条 · 按'+(mode==='time'?'时间':'重要性')+'排序'):'')+'</i></span>'+
    '<button class="hb-news-btn" data-newsact="sort" title="切换排序方式">'+(mode==='time'?'🔥 按重要性':'🕒 按时间')+'</button>'+
    '<button class="hb-news-btn" data-newsact="refresh" title="重新拉取今天的资讯">🔄 刷新</button>'+
    '<button class="hb-news-btn" data-newsact="archive" title="查看 / 删除 / 导出往期存档">🗂 存档</button></div>'+
    (note?'<div class="hb-news-note">'+esc(note)+'</div>':'')+
    body+'</div>';
}
/* ---------- 存档管理：按天查看 / 删除 / 单条删除 / 导出 / 清空 ---------- */
function newsExport(){
  const arch=state.newsArchive||{};
  const keys=Object.keys(arch).sort().reverse();
  if(!keys.length){ toast('还没有存档可导出'); return; }
  let txt='OVOvv · AI 资讯存档\n导出时间：'+new Date().toLocaleString('zh-CN')+'\n\n';
  keys.forEach(function(k){
    txt+='【'+k+'】\n';
    newsRank(((arch[k]&&arch[k].items)||[]),'time').forEach(function(n,i){
      txt+='  '+(i+1)+'. ['+(n.s||'资讯')+'] '+n.t+'\n';
      if(n.p) txt+='     发布：'+n.p+'\n';
      if(n.l) txt+='     原文：'+n.l+'\n';
    });
    txt+='\n';
  });
  try{
    const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download='AI资讯存档-'+newsTodayKey()+'.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ try{ URL.revokeObjectURL(a.href); }catch(e){} },2000);
    toast('已导出 '+keys.length+' 天存档');
  }catch(e){ toast('导出失败，浏览器不支持下载'); }
}
function newsOpenArchive(){
  const arch=state.newsArchive||{};
  const keys=Object.keys(arch).sort().reverse();
  let body='<div class="hb-arch-tools">'+
    '<button class="hb-news-btn" data-archact="export">⬇ 导出全部</button>'+
    '<button class="hb-news-btn" data-archact="clear">🗑 清空存档</button></div>';
  if(!keys.length){
    body+='<div class="hb-day-hint">还没有存档——资讯拉取成功后会按天记录在这里</div>';
  }else{
    body+='<div class="hb-arch-list">'+keys.map(function(k){
      const n=((arch[k]&&arch[k].items)||[]).length;
      return '<div class="hb-arch-row"><span class="hb-arch-day">'+esc(k)+' <i>'+n+' 条</i></span>'+
        '<span class="hb-arch-acts"><button class="hb-news-btn" data-archview="'+k+'">查看</button>'+
        '<button class="hb-news-btn" data-archdel="'+k+'">删除</button></span></div>';
    }).join('')+'</div>';
  }
  const mask=document.createElement('div'); mask.className='hb-mask';
  mask.innerHTML='<div class="hb-modal"><div class="hb-modal-head"><span>🗂 资讯存档（最近 60 天）</span>'+
    '<button class="hb-modal-x" title="关闭">✕</button></div>'+
    '<div class="hb-modal-body">'+body+'</div></div>';
  document.body.appendChild(mask);
  const close=()=>mask.remove();
  mask.addEventListener('click',e=>{
    if(e.target===mask||e.target.closest('.hb-modal-x')){ close(); return; }
    const act=e.target.closest('[data-archact]');
    if(act){
      if(act.dataset.archact==='export'){ newsExport(); return; }
      if(act.dataset.archact==='clear'){
        if(!window.confirm('确定清空全部资讯存档吗？此操作不可撤销。')) return;
        state.newsArchive={}; save(); close(); newsOpenArchive(); toast('已清空全部存档'); return;
      }
    }
    const v=e.target.closest('[data-archview]');
    if(v){ close(); newsOpenDay(v.dataset.archview); return; }
    const d=e.target.closest('[data-archdel]');
    if(d){
      delete state.newsArchive[d.dataset.archdel];
      save(); close(); newsOpenArchive(); toast('已删除 '+d.dataset.archdel+' 的存档');
    }
  });
}
function newsOpenDay(key){
  const rec=(state.newsArchive||{})[key];
  const items=newsRank((rec&&rec.items)||[],(state.newsSort==='time')?'time':'importance');
  const body=items.length?
    '<div class="hb-news-list">'+items.map(function(n,i){
      const inner=newsItemLink(n,newsScore(n)>=NEWS_HOT);
      const url=n.l?esc(n.l):'';
      /* 整条标题就是原文链接：点标题、来源徽标、时间都能打开；另外留一个明确的「↗ 原文」入口 */
      const main=n.l
        ? '<a class="hb-news-day-link" href="'+url+'" target="_blank" rel="noopener noreferrer" title="点击查看原文：'+url+'">'+inner+'</a>'
        : '<span class="hb-news-day-link" title="这条记录没有原文链接">'+inner+'</span>';
      const open=n.l
        ? '<a class="hb-news-day-open" href="'+url+'" target="_blank" rel="noopener noreferrer" title="点击查看原文">↗ 原文</a>'
        : '';
      return '<div class="hb-news-item in-arch">'+main+open+
        '<button class="hb-day-del" data-itemdel="'+i+'" title="删除这条记录">✕</button></div>';
    }).join('')+'</div>':
    '<div class="hb-day-hint">这天的存档是空的</div>';
  const mask=document.createElement('div'); mask.className='hb-mask';
  mask.innerHTML='<div class="hb-modal"><div class="hb-modal-head"><span>📰 '+esc(key)+' 的资讯</span>'+
    '<button class="hb-modal-x" title="关闭">✕</button></div>'+
    '<div class="hb-modal-body">'+body+'</div></div>';
  document.body.appendChild(mask);
  const close=()=>mask.remove();
  mask.addEventListener('click',e=>{
    if(e.target===mask||e.target.closest('.hb-modal-x')){ close(); return; }
    const dm=e.target.closest('[data-itemdel]');
    if(dm){
      const n=items[+dm.dataset.itemdel];
      /* 按标题从存档里删，排序只是视图，不影响原始顺序 */
      const raw=((state.newsArchive[key]&&state.newsArchive[key].items)||[]);
      const idx=raw.findIndex(x=>newsKeyOf(x)===newsKeyOf(n));
      if(idx>=0) raw.splice(idx,1);
      save(); close(); newsOpenDay(key); toast('已删除该条记录');
    }
  });
}
/* ---------- 事件委托：刷新 / 排序 / 展开 / 存档（板块重渲染也不丢事件） ---------- */
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-newsact]');
  if(!b) return;
  e.preventDefault(); e.stopPropagation();
  const a=b.dataset.newsact;
  if(a==='refresh'){
    toast('正在重新拉取今天的 AI 资讯…');
    newsAutoFetch(true);
  }else if(a==='archive'){
    newsOpenArchive();
  }else if(a==='sort'){
    state.newsSort=(state.newsSort==='time')?'importance':'time';
    save(); newsRenderIfHome();
    toast(state.newsSort==='time'?'已按发布时间排序':'已按重要性排序');
  }else if(a==='more'){
    __newsExpanded=!__newsExpanded;
    newsRenderIfHome();
  }
});

/* ---------- 样式 ---------- */
(function(){
  const st=document.createElement('style');
  st.textContent=
  '.hb-news-head{display:flex;align-items:center;gap:6px;margin:2px 0 6px;flex-wrap:wrap}'+
  '.hb-news-title{font-weight:700;font-size:14px;color:var(--text);flex:1;min-width:0}'+
  '.hb-news-title i{font-style:normal;font-weight:500;font-size:11.5px;color:var(--text3)}'+
  '.hb-news-note{font-size:11px;color:var(--text3);line-height:1.5;margin:0 0 8px}'+
  '.hb-news-btn{border:none;background:var(--el-bg);box-shadow:var(--raised);border-radius:8px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:var(--text2);font-family:inherit;white-space:nowrap;transition:background .12s,color .12s}'+
  '.hb-news-btn:hover{color:var(--ink);background:var(--hover)}'+
  '.hb-news-list{display:flex;flex-direction:column;gap:5px}'+
  /* 右侧留出悬浮 + 按钮的位置，避免发布时间被圆形悬浮钮压住 */
  '.hb-news-item{display:flex;align-items:center;gap:8px;padding:7px 56px 7px 10px;border-radius:9px;text-decoration:none;transition:background .12s}'+
  '.hb-news-item.is-fresh{background:var(--accent-soft)}'+
  'a.hb-news-item:hover,.hb-news-item:hover{background:var(--hover)}'+
  '.hb-news-hot{flex:none;font-size:11px;line-height:1}'+
  '.hb-news-src{flex:none;font-size:10.5px;font-weight:700;color:var(--ink);background:var(--accent-soft);border-radius:99px;padding:1px 8px;line-height:1.6;white-space:nowrap}'+
  '.hb-news-tt{font-size:12.8px;color:var(--text);line-height:1.55;min-width:0;flex:1;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-decoration:none}'+
  'a.hb-news-tt:hover,.hb-news-item:hover .hb-news-tt{color:var(--ink);text-decoration:underline}'+
  '.hb-news-time{flex:none;font-size:10.5px;color:var(--text3);white-space:nowrap}'+
  '.hb-news-more{display:block;margin:7px auto 0;border:none;background:transparent;color:var(--ink);font-size:11.5px;font-family:inherit;cursor:pointer;padding:4px 10px;border-radius:8px}'+
  '.hb-news-more:hover{background:var(--hover)}'+
  /* 存档弹窗层级高于全局悬浮球，不需要给右侧留 56px 空白 */
  '.hb-news-item.in-arch{padding-right:10px}'+
  '.hb-news-day-link{display:flex;align-items:center;gap:8px;min-width:0;flex:1;color:inherit;text-decoration:none;cursor:pointer}'+
  'span.hb-news-day-link{cursor:default}'+
  'a.hb-news-day-link:hover .hb-news-tt{color:var(--ink);text-decoration:underline}'+
  '.hb-news-day-open{flex:none;font-size:11px;color:var(--ink);text-decoration:none;padding:3px 7px;border-radius:7px;background:var(--hover);white-space:nowrap}'+
  '.hb-news-day-open:hover{background:var(--accent-soft);text-decoration:underline}'+
  '.hb-news-item .hb-day-del{margin-left:0}'+
  '.hb-arch-tools{display:flex;gap:7px;margin:2px 0 10px}'+
  '.hb-arch-list{display:flex;flex-direction:column;gap:6px}'+
  '.hb-arch-row{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;background:var(--hover)}'+
  '.hb-arch-day{font-size:13px;font-weight:600;color:var(--text);flex:1;min-width:0}'+
  '.hb-arch-day i{font-style:normal;font-weight:500;font-size:11px;color:var(--text3)}'+
  '.hb-arch-acts{display:flex;gap:6px}';
  document.head.appendChild(st);
})();

/* 关键（第二十一批）：本模块在 36-boot.js 之后加载，首屏渲染时 hbNewsHTML 还不存在，
   资讯板块会先显示占位。模块加载完成后无条件补一次重绘。 */
setTimeout(function(){ try{ newsRenderIfHome(); }catch(e){} },0);
/* 首屏拉一次（今天还没有记录时才会真正请求） */
setTimeout(function(){ try{ newsAutoFetch(false); }catch(e){} },800);
/* 跨天自动更新：每 5 分钟检查一次日期变化 */
setInterval(function(){ try{ newsAutoFetch(false); }catch(e){} },5*60*1000);
