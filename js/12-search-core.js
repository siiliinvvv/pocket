/* ============================================================
   Pocket · 搜索核心
   搜索语法（#标签 / 类型: / 夹:）、正文匹配、命中片段与评分排序
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 搜索：语法 + 正文匹配 + 命中片段 ================= */
let searchHits={};      /* id -> 命中片段 HTML */
let plainBackfillDone=false;

function parseQuery(q){
  const r={terms:[],tags:[],types:[],folders:[]};
  String(q||'').split(/\s+/).filter(Boolean).forEach(tok=>{
    if(tok.length>1&&tok.charAt(0)==='#'){ r.tags.push(tok.slice(1).toLowerCase()); return; }
    const m=/^(类型|type|夹|folder)[:：](.+)$/i.exec(tok);
    if(m){
      const key=m[1].toLowerCase();
      if(key==='夹'||key==='folder') r.folders.push(m[2].toLowerCase());
      else r.types.push(m[2].toLowerCase());
      return;
    }
    r.terms.push(tok.toLowerCase());
  });
  return r;
}
function typeMatch(it,type){
  if(!type) return true;
  if(type==='pdf') return it.type==='file'&&isPdfName(it.fileName);
  if(type==='html'||type==='网页') return it.type==='file'&&isHtmlName(it.fileName);
  if(['note','文字','笔记','想法'].indexOf(type)>=0) return it.type==='note';
  if(['photo','照片','图片','图'].indexOf(type)>=0) return it.type==='photo';
  if(['link','链接','网址'].indexOf(type)>=0) return it.type==='link';
  if(['file','文件','文档'].indexOf(type)>=0) return it.type==='file';
  return it.type===type;
}
function folderMatch(it,kw){
  const f=state.folders.find(x=>x.id===it.folderId);
  if(!f) return false;
  return folderPath(f).join(' / ').toLowerCase().includes(kw);
}
function makeSnippet(text,term){
  const flat=String(text||'').replace(/\s+/g,' ');
  const i=flat.toLowerCase().indexOf(term);
  if(i<0) return '';
  const a=Math.max(0,i-24), b=Math.min(flat.length,i+term.length+46);
  return (a>0?'…':'')+esc(flat.slice(a,i))+'<b>'+esc(flat.slice(i,i+term.length))+'</b>'+esc(flat.slice(i+term.length,b))+(b<flat.length?'…':'');
}
/* 每条内容的检索字段缓存：只在内容变化时重新拼小写串，避免每次按键全量重建 */
const hayCache=new Map();
function itemHay(it){
  const sig=[it.updatedAt||0,it.edited||0,(it.text||'').length,(it.plain||'').length,(it.fileName||'').length,(it.tags||[]).join(',').length].join('|');
  const c=hayCache.get(it.id);
  if(c&&c.sig===sig) return c;
  const meta=[it.text||'',it.fileName||'',it.title||'',it.url||'',(it.tags||[]).join(' ')].join(' ');
  const rec={sig:sig,meta:meta,metaLow:meta.toLowerCase(),plain:it.plain||'',plainLow:(it.plain||'').toLowerCase()};
  hayCache.set(it.id,rec);
  if(hayCache.size>4000) hayCache.delete(hayCache.keys().next().value);
  return rec;
}
function matchItem(it,p){
  for(const tg of p.tags){
    if(!(it.tags||[]).some(x=>String(x).toLowerCase().includes(tg))) return null;
  }
  for(const tp of p.types){ if(!typeMatch(it,tp)) return null; }
  for(const fw of p.folders){ if(!folderMatch(it,fw)) return null; }
  if(!p.terms.length) return {it:it,score:0,snippet:''};
  const h=itemHay(it);
  let score=0, snippet='';
  for(const term of p.terms){
    const inMeta=h.metaLow.indexOf(term)>=0;
    const inPlain=h.plainLow?h.plainLow.indexOf(term)>=0:false;
    if(!inMeta&&!inPlain) return null;
    if(inMeta) score+=2;
    if(inPlain){ score+=1; if(!snippet) snippet=makeSnippet(h.plain,term); }
    if(!snippet&&inMeta) snippet=makeSnippet(h.meta,term);
  }
  return {it:it,score:score,snippet:snippet};
}
/* HTML 正文提取（PDF 无法在纯前端抽取正文，只按文件名/备注匹配） */
function htmlToPlain(html){
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,noscript,template').forEach(el=>el.remove());
    const t=(doc.body&&doc.body.textContent)||'';
    return t.replace(/[ \t\u00a0]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }catch(e){ return ''; }
}
/* 老资料补建正文索引：每次最多处理 5 篇，避免卡顿 */
let backfillRunning=false;
async function backfillPlain(){
  if(SHARED||backfillRunning||plainBackfillDone) return;
  const todo=state.items.filter(it=>it.type==='file'&&it.fileKey&&isHtmlName(it.fileName)&&!it.plain);
  if(!todo.length){ plainBackfillDone=true; return; }
  backfillRunning=true;
  for(const it of todo.slice(0,5)){
    try{
      const u=await imgGet(it.fileKey);
      if(u){ it.plain=htmlToPlain(dataUrlToText(u)).slice(0,8000); }
    }catch(e){}
  }
  backfillRunning=false;
  save();
  if(todo.length>5) setTimeout(backfillPlain,1200); else plainBackfillDone=true;
}
function visibleItems(){
  let arr;
  searchHits={};
  if(searchQuery){
    let res=null;
    if(lastSearch&&lastSearch.ver===stateVer&&lastSearch.q===searchQuery){ res=lastSearch.res; searchHits=Object.assign({},lastSearch.hits); }
    if(!res){
      const p=parseQuery(searchQuery);
      res=[];
      for(const it of state.items){
        const m=matchItem(it,p);
        if(m){ res.push(m); if(m.snippet) searchHits[it.id]=m.snippet; }
      }
      const mode=state.searchSort||'score';
      if(mode==='time') res.sort((a,b)=>(b.it.pinned-a.it.pinned)||(b.it.created-a.it.created));
      else if(mode==='name') res.sort((a,b)=>String(a.it.fileName||a.it.title||a.it.text||'').localeCompare(String(b.it.fileName||b.it.title||b.it.text||''),'zh-Hans-CN'));
      else res.sort((a,b)=>(b.it.pinned-a.it.pinned)||(b.score-a.score)||(b.it.created-a.it.created));
      lastSearch={ver:stateVer,q:searchQuery,res:res,hits:Object.assign({},searchHits)};
    }
    arr=res.map(x=>x.it);
  }else if(currentFolderId===HOME_ID){
    arr=state.items.slice();
  }else{
    arr=state.items.filter(it=>it.folderId===currentFolderId);
  }
  if(activeTag) arr=arr.filter(it=>(it.tags||[]).includes(activeTag));
  if(!searchQuery) arr=sortItems(arr);
  return arr;
}
/* 排序方式：最近创建 / 最早创建 / 最近打开 / 名称 / 自定义（保持手动拖拽后的顺序） */
function sortItems(arr){
  const m=state.sortMode||'time';
  if(m==='custom') return arr;
  if(m==='timeAsc') return arr.slice().sort((a,b)=>a.created-b.created);
  if(m==='opened') return arr.slice().sort((a,b)=>((b.openedAt||b.created)-(a.openedAt||a.created)));
  if(m==='name') return arr.slice().sort((a,b)=>String(a.fileName||a.title||a.text||'').localeCompare(String(b.fileName||b.title||b.text||''),'zh-Hans-CN'));
  if(m==='nameDesc') return arr.slice().sort((a,b)=>String(b.fileName||b.title||b.text||'').localeCompare(String(a.fileName||a.title||a.text||''),'zh-Hans-CN'));
  return arr.slice().sort((a,b)=>(b.pinned-a.pinned)||(b.created-a.created));
}

function renderTagBar(items){
  const bar=$('tagBar');
  const tags=[...new Set(items.flatMap(it=>it.tags||[]))];
  bar.classList.toggle('show',tags.length>0);
  bar.innerHTML='';
  tags.forEach(t=>{
    const c=document.createElement('span');
    c.className='tag-chip'+(t===activeTag?' on':'');
    c.textContent=t;
    c.onclick=()=>{ activeTag=activeTag===t?null:t; renderItems(); renderTagBar(visibleItems()); };
    bar.appendChild(c);
  });
  if(activeTag){
    const x=document.createElement('span');
    x.className='tag-clear'; x.textContent='清除筛选 ✕';
    x.onclick=()=>{ activeTag=null; renderItems(); renderTagBar(visibleItems()); };
    bar.appendChild(x);
  }
}

function noteCard(it){
  if(BOX_HIDE) return '<div class="locked-line">🔒 作者未公开这条内容</div>';
  const long=(it.text||'').length>160;
  return '<div class="note-text'+(long?' clamped':'')+'">'+esc(it.text)+'</div>'+
         (long?'<button class="expand-btn" onclick="toggleExpand(this)">展开全文</button>':'');
}
function toggleExpand(btn){
  const t=btn.previousElementSibling;
  const cl=t.classList.toggle('clamped');
  btn.textContent=cl?'展开全文':'收起';
}
function photoCard(it){
  if(BOX_HIDE) return '<div class="locked-line">🔒 作者未公开这张照片</div>';
  const imgs=it.images||[];
  if(!imgs.length) return '<div class="locked-line">（照片数据丢失）</div>';
  let inner='';
  if(imgs.length===1){
    inner='<img class="ph" data-img="'+esc(imgs[0])+'" data-item="'+it.id+'" alt="">';
  }else if(imgs.length===2){
    inner=imgs.map(k=>'<img class="ph" data-img="'+esc(k)+'" data-item="'+it.id+'" alt="">').join('');
  }else{
    inner=imgs.slice(0,3).map((k,i)=>{
      if(i<2) return '<img class="ph" data-img="'+esc(k)+'" data-item="'+it.id+'" alt="">';
      return '<div class="more-cover"><img class="ph" data-img="'+esc(k)+'" data-item="'+it.id+'" alt="" style="cursor:pointer"><span>+'+(imgs.length-3)+'</span></div>';
    }).join('');
  }
  return '<div class="photo-grid '+(imgs.length===1?'p1':imgs.length===2?'p2':'pn')+'">'+inner+'</div>'+
         (it.text?'<div class="photo-note note-text">'+esc(it.text)+'</div>':'');
}
const SVG_ICONS={
 read:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>',
 edit:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>',
 magic:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2.5 6.5L22 12l-6.5 2.5L13 21l-2.5-6.5L4 12l6.5-2.5z"/></svg>',
 dl:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 19h16"/></svg>',
 eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 pull:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.5"/><path d="M12 11v10m0 0 3-3m-3 3-3-3"/></svg>'
};
function fileCard(it){
  const readable=it.fileKey&&isDocLike(it.fileName);
  const imgView=it.fileKey&&!readable&&isImgFileName(it.fileName);
  if(BOX_HIDE) return '<div class="res-row">'+
    '<div class="res-icon file">'+(it.rich?'📝':fileEmoji(it.fileName))+'</div>'+
    '<div class="res-body"><div class="res-name">'+esc(it.fileName||'未命名文件')+'</div>'+
    '<div class="res-note">🔒 内容未公开</div></div></div>';
  const acts=[];
  if(readable) acts.push('<a class="ic-btn" href="#" data-read="'+esc(it.id)+'" title="打开阅读" aria-label="打开阅读">'+SVG_ICONS.read+'</a>');
  else if(imgView) acts.push('<a class="ic-btn" href="#" data-read="'+esc(it.id)+'" title="预览图片" aria-label="预览图片">'+SVG_ICONS.eye+'</a>');
  if(it.fileKey&&(isHtmlName(it.fileName)||isTextName(it.fileName)||isDocxName(it.fileName))) acts.push(it.editable
    ?'<a class="ic-btn" href="#" data-edit="'+esc(it.id)+'" title="编辑" aria-label="编辑">'+SVG_ICONS.edit+'</a>'
    :'<a class="ic-btn" href="#" data-conv="'+esc(it.id)+'" title="转为可编辑" aria-label="转为可编辑">'+SVG_ICONS.magic+'</a>');
  const dlName=(it.editable&&it.convertedFrom&&!isHtmlName(it.fileName))?(stripAnyExt(it.fileName)+'.html'):it.fileName;
  if(it.fileKey) acts.push('<a class="ic-btn" href="#" data-dl="'+esc(it.fileKey)+'" data-name="'+esc(dlName)+'" title="下载" aria-label="下载">'+SVG_ICONS.dl+'</a>');
  if(it.cloudOnly) acts.push('<a class="ic-btn cloud" href="#" data-pull="'+esc(it.id)+'" title="仅存于云端：点击拉取到本地" aria-label="从云端拉取">'+SVG_ICONS.pull+'</a>');
  const cacheNote=it.cloudOnly?'<div class="res-note cloud-note">☁️ 仅存云端 · 打开时自动拉取'+(it.fileSize?(' · '+fmtSize(it.fileSize)):'')+'</div>':'';
  return '<div class="res-row">'+
    '<div class="res-icon file">'+(it.rich?'📝':fileEmoji(it.fileName))+'</div>'+
    '<div class="res-body"><div class="res-name">'+esc(it.fileName||'未命名文件')+'</div>'+
    (it.text?'<div class="res-note">'+esc(it.text)+'</div>':'')+
    cacheNote+
    (it.tooBig?'<div class="res-note">⚠️ 文件较大，仅登记信息未存内容</div>':'')+
    '</div>'+
    (acts.length?'<div class="ic-row">'+acts.join('')+'</div>':'')+
    '</div>'+(it.tags&&it.tags.length?footTags(it):'');
}
function isHtmlName(n){ return /\.html?$/i.test(n||''); }
function isPdfName(n){ return /\.pdf$/i.test(n||''); }
function fileExt(n){ const m=/\.([a-z0-9]+)$/i.exec(n||''); return m?m[1].toLowerCase():''; }
function stripAnyExt(n){ return String(n||'').replace(/\.[a-z0-9]+$/i,''); }
/* 文本类文件：可直接预览 / 转为可编辑文档 */
function isTextName(n){ return /\.(txt|md|markdown|csv|log|json|xml|yaml|yml|ini|conf|srt|vtt|bat|sh|ps1|js|ts|py|java|c|h|cpp|cs|go|rb|rs|php|sql|css)$/i.test(n||''); }
function isImgFileName(n){ return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n||''); }
function isDocxName(n){ return /\.docx$/i.test(n||''); }
/* 可进「文库」阅读 / 可转编辑的文件 */
function isDocLike(n){ return isHtmlName(n)||isPdfName(n)||isTextName(n)||isDocxName(n); }
/* 判断「存储的正文是不是已经是 HTML」——txt/md/docx 只要在编辑器里保存过一次，正文就变成 HTML 了，
   此后必须按 HTML 读；否则再拿扩展名去转换（mammoth 解析 HTML 会失败、textToDocHTML 会把标签当文字）＝内容丢失 */
function docStoredAsHtml(it,dataUrl){
  if(!it) return false;
  if(isHtmlName(it.fileName)) return true;
  if(it.docFormat==='html'||it.edited) return true;
  try{
    const t=String(dataUrlToText(dataUrl)||'').replace(/^\uFEFF/,'').trim().slice(0,300).toLowerCase();
    return t.indexOf('<!doctype html')===0||t.indexOf('<html')===0;
  }catch(e){ return false; }
}

/* 轻量 Markdown → HTML（标题 / 列表 / 引用 / 代码块 / 表格 / 粗斜体 / 链接） */
function mdToHtml(src){
  const lines=String(src||'').replace(/\r/g,'').split('\n');
  const out=[]; let i=0, inCode=false, code=[];
  const inline=s=>esc(s)
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g,'$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2">$1</a>');
  while(i<lines.length){
    const l=lines[i];
    if(/^```/.test(l)){
      if(inCode){ out.push('<pre><code>'+esc(code.join('\n'))+'</code></pre>'); code=[]; inCode=false; }
      else inCode=true;
      i++; continue;
    }
    if(inCode){ code.push(l); i++; continue; }
    const h=/^(#{1,6})\s+(.*)$/.exec(l);
    if(h){ const lv=Math.min(3,h[1].length); out.push('<h'+lv+'>'+inline(h[2])+'</h'+lv+'>'); i++; continue; }
    if(/^\s*(---+|\*\*\*+)\s*$/.test(l)){ out.push('<hr>'); i++; continue; }
    if(/^\s*>\s?/.test(l)){
      const buf=[];
      while(i<lines.length&&/^\s*>\s?/.test(lines[i])){ buf.push(lines[i].replace(/^\s*>\s?/,'')); i++; }
      out.push('<blockquote>'+inline(buf.join(' '))+'</blockquote>'); continue;
    }
    if(/^\s*([-*+]|\d+\.)\s+/.test(l)){
      const ol=/^\s*\d+\./.test(l); const buf=[];
      while(i<lines.length&&/^\s*([-*+]|\d+\.)\s+/.test(lines[i])){ buf.push(lines[i].replace(/^\s*([-*+]|\d+\.)\s+/,'')); i++; }
      out.push((ol?'<ol>':'<ul>')+buf.map(x=>'<li>'+inline(x)+'</li>').join('')+(ol?'</ol>':'</ul>')); continue;
    }
    if(/^\s*\|.*\|\s*$/.test(l)&&i+1<lines.length&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
      const cells=row=>row.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
      const head=cells(l); i+=2; const rows=[];
      while(i<lines.length&&/^\s*\|.*\|\s*$/.test(lines[i])){ rows.push(cells(lines[i])); i++; }
      out.push('<table><thead><tr>'+head.map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+
        rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table>'); continue;
    }
    if(!l.trim()){ i++; continue; }
    const buf=[l];
    while(i+1<lines.length&&lines[i+1].trim()&&!/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>|\s*\|)/.test(lines[i+1])){ buf.push(lines[++i]); }
    out.push('<p>'+inline(buf.join(' '))+'</p>');
    i++;
  }
  return out.join('\n');
}
function wrapDocHTML(title,body,extraCss){
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+DOC_CSS+(extraCss||'')+'</style></head><body><h1>'+esc(title)+'</h1>'+body+'</body></html>';
}
/* 纯文本 / Markdown → 可阅读可编辑的文档 HTML */
function textToDocHTML(name,text){
  const ext=fileExt(name);
  const title=stripAnyExt(name);
  if(ext==='md'||ext==='markdown') return wrapDocHTML(title,mdToHtml(text));
  const pre='<pre class="tb-plain">'+(esc(String(text||''))||'（空文件）')+'</pre>';
  return wrapDocHTML(title,pre,'pre.tb-plain{white-space:pre-wrap;word-break:break-word;background:#f4f7fb;padding:14px 16px;border-radius:10px;font-family:Consolas,Menlo,monospace;font-size:13px;line-height:1.7;max-width:100%;overflow-x:auto}');
}
/* docx → HTML：按需从 CDN 加载 mammoth 解析器（首次需联网） */
let _mammothLoading=null;
function loadMammoth(){
  if(window.mammoth) return Promise.resolve();
  if(_mammothLoading) return _mammothLoading;
  _mammothLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js';
    s.onload=()=>res();
    s.onerror=()=>{ _mammothLoading=null; rej(new Error('联网加载 docx 解析器失败，请检查网络')); };
    document.head.appendChild(s);
  });
  return _mammothLoading;
}
async function docxToDocHTML(it,dataUrl){
  await loadMammoth();
  let buf;
  try{ buf=await (await fetch(dataUrl)).arrayBuffer(); }
  catch(e){ throw new Error('读取 docx 内容失败'); }
  const r=await window.mammoth.convertToHtml({arrayBuffer:buf});
  return wrapDocHTML(docTitle(it.fileName),(r&&r.value)||'<p>（空文档）</p>');
}
/* 思维导图：缩进文本 → 内联 SVG（横向往外生长的树状图） */
function buildMindmapSVG(text){
  const raw=String(text||'').replace(/\r/g,'').split('\n');
  const nodes=[];
  raw.forEach(l=>{
    if(!l.trim()) return;
    const indent=l.replace(/\t/g,'  ').match(/^ */)[0].length;
    nodes.push({d:Math.min(5,Math.floor(indent/2)), t:l.trim().slice(0,20)});
  });
  if(!nodes.length) return '';
  let prev=-1;
  nodes.forEach(n=>{ n.d=(prev<0)?0:Math.min(n.d,prev+1); prev=n.d; });
  const ROW=48, GAPX=225, BW=185, BH=36, PAD=12;
  const COLORS=['#4a7fd4','#5B99E2','#7db4ec','#a5cdf4','#c3e0f8','#dceefb'];
  const TXTC=['#ffffff','#ffffff','#173a5e','#173a5e','#173a5e','#173a5e'];
  let leafY=PAD, maxD=0;
  let idx=0;
  function place(d){
    const n=nodes[idx++];
    n.kids=[]; maxD=Math.max(maxD,n.d);
    while(idx<nodes.length&&nodes[idx].d===d+1) n.kids.push(place(d+1));
    if(n.kids.length) n.y=(n.kids[0].y+n.kids[n.kids.length-1].y)/2;
    else{ n.y=leafY+BH/2; leafY+=ROW; }
    return n;
  }
  const root=place(0);
  let sv='';
  function render(n){
    const x=PAD+n.d*GAPX, y=n.y-BH/2;
    const ci=Math.min(n.d,COLORS.length-1);
    if(n.kids.length){
      n.kids.forEach(k=>{
        const x1=x+BW, y1=n.y, x2=PAD+k.d*GAPX, y2=k.y;
        sv+='<path d="M'+x1+' '+y1+' C'+(x1+52)+' '+y1+','+(x2-52)+' '+y2+','+x2+' '+y2+'" fill="none" stroke="'+COLORS[ci]+'" stroke-width="2" stroke-opacity=".55"/>';
        render(k);
      });
    }
    sv+='<rect x="'+x+'" y="'+y+'" width="'+BW+'" height="'+BH+'" rx="10" fill="'+COLORS[ci]+'"/>'+
        '<text x="'+(x+14)+'" y="'+n.y+'" dominant-baseline="central" font-size="'+(n.d===0?'14.5':'13')+'" font-weight="'+(n.d===0?'700':'500')+'" fill="'+TXTC[ci]+'" xml:space="preserve">'+esc(n.t)+'</text>';
  }
  render(root);
  const W=PAD+maxD*GAPX+BW+PAD, H=Math.max(leafY+PAD,60);
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+W+' '+H+'" style="width:100%;max-width:920px;height:auto;border-radius:12px">'+
    '<rect x="0" y="0" width="'+W+'" height="'+H+'" rx="12" fill="#f7fafd"/>'+sv+'</svg>';
}
function docTitle(n){ return String(n||'').replace(/\.(html?|pdf)$/i,''); }
/* 目录条目：冒号后的说明性内容不进目录（如「二、re 方法全景：5 类动作…」→「二、re 方法全景」） */
function shortHeading(s){
  const t=String(s||'');
  const i=t.search(/[：:]/);
  return i>0?t.slice(0,i):t;
}
function touchRecent(id){
  if(!id) return;
  const it=state.items.find(x=>x.id===id);
  if(it){
    it.openedAt=Date.now();
    it.opens=(it.opens||0)+1;   /* 第三十二批：累计打开次数，供统计看板「高频打开 Top10」 */
  }
  state.recent=[id].concat((state.recent||[]).filter(x=>x!==id)).slice(0,12);
  save();
}
function linkCard(it){
  const host=it.url?safeHost(it.url):'';
  return '<div class="res-row">'+
    '<div class="res-icon link">🔗</div>'+
    '<div class="res-body"><a class="res-name" href="'+esc(it.url)+'" target="_blank" rel="noopener">'+esc(it.title||it.url)+'</a>'+
    (it.text?'<div class="res-note">'+esc(it.text)+'</div>':(host?'<div class="res-note">'+esc(host)+'</div>':''))+'</div>'+
    '</div>';
}
function safeHost(u){ try{ return new URL(u).hostname; }catch(e){ return ''; } }
function footTags(it){ return ''; }

const TYPE_BADGE={note:'文字',photo:'照片',file:'文件',link:'链接',grid:'表格',canvas:'画布'};
const TYPE_ICON={note:'✏️',photo:'📷',file:'📄',link:'🔗',grid:'📊',canvas:'🎨'};

function cardHTML(it){
  let body='';
  if(it.type==='note') body=noteCard(it);
  else if(it.type==='photo') body=photoCard(it);
  else if(it.type==='file') body=fileCard(it);
  else if(it.type==='link') body=linkCard(it);
  else if(it.type==='grid'&&typeof gridCardHTML==='function') body=gridCardHTML(it);
  else if(it.type==='canvas'&&typeof canvasCardHTML==='function') body=canvasCardHTML(it);
  const tags=(it.tags||[]).map(t=>'<span class="card-tag">'+esc(t)+'</span>').join('');
  const hit=(searchQuery&&searchHits[it.id])?'<div class="hit-line" data-hit="'+it.id+'" title="点击跳到原文位置" onclick="jumpToHit(event,\''+it.id+'\')">命中：'+searchHits[it.id]+'</div>':'';
  const chk=batchMode?'<label class="batch-chk" title="选中此条"><input type="checkbox" data-bid="'+it.id+'"'+(batchSel.has(it.id)?' checked':'')+'></label>':'';
  return '<div class="card" draggable="true" data-id="'+it.id+'">'+chk+
    (it.pinned?'<span class="pin-dot">📌</span>':'')+
    '<span class="type-badge">'+TYPE_BADGE[it.type]+'</span>'+
    body+hit+
    '<div class="card-foot"><span class="card-time">'+relTime(it.created)+'</span>'+tags+
      '<span class="card-acts">'+
        '<button data-act="pin" title="置顶">'+(it.pinned?'取消置顶':'置顶')+'</button>'+
        '<button data-act="edit" title="编辑">编辑</button>'+
        '<button data-act="del" title="删除">删除</button>'+
        '<button class="more-btn" data-act="more" title="更多操作" aria-label="更多操作">⋯</button>'+
      '</span>'+
    '</div></div>';
}

