/* ============================================================
   Pocket · 分享版导出
   导出独立只读 HTML（可选隐藏正文），并把 CSS/JS 内联回单文件
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 分享版导出 ================= */
/* 第二十五批：分享链接「是否包含分享数据」偏好。
   只存本机 localStorage，绝不写进 state / 种子 / 分享版 / 云端同步。 */
const SHARE_INC_KEY='tb_shareinc_v1', SHARE_SCOPE_KEY='tb_sharescope_v1';
let shareIncludeData=true, shareScope='all';
try{
  const v=localStorage.getItem(SHARE_INC_KEY); if(v!==null) shareIncludeData=(v==='1');
  const s=localStorage.getItem(SHARE_SCOPE_KEY); if(s==='all'||s==='structure') shareScope=s;
}catch(e){}
function setShareInclude(v){
  shareIncludeData=!!v;
  try{ localStorage.setItem(SHARE_INC_KEY,shareIncludeData?'1':'0'); }catch(e){}
}
function setShareScope(v){
  shareScope=(v==='structure')?'structure':'all';
  try{ localStorage.setItem(SHARE_SCOPE_KEY,shareScope); }catch(e){}
}
/* 分享链接：无论从线上还是本地打开，复制出来的都是「线上地址 + sharecode」。
   本地地址（file:// / localhost / 局域网 IP）别人是打不开的，绝不能复制出去。
   SHARE_ORIGIN：部署后的站点地址，留空则取当前页面域名；
   SHARE_DEFAULT_CODE：默认分享码，留空表示不写死、由 URL 上的 ?sharecode= 决定。 */
const SHARE_ORIGIN='';
const SHARE_DEFAULT_CODE='';
function shareLink(){
  try{
    let u;
    const local=/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
    const online=!local&&/^https?:$/.test(location.protocol);
    if(online){
      u=new URL(location.href); u.hash='';
      if(!u.searchParams.get('sharecode')&&SHARE_DEFAULT_CODE) u.searchParams.set('sharecode',SHARE_DEFAULT_CODE);
    }else{
      u=new URL((SHARE_ORIGIN||location.origin)+'/');
      const code=new URLSearchParams(location.search).get('sharecode')||SHARE_DEFAULT_CODE;
      if(code) u.searchParams.set('sharecode',code);
    }
    if(shareIncludeData) u.searchParams.delete('nodata');
    else u.searchParams.set('nodata','1');
    return u.toString();
  }catch(e){ return location.href; }
}
async function shareCopyLink(){
  /* 关掉「包含分享数据」时链接会带 nodata=1，别人打开只看得到一个空盒子。
     复制前先问一句并默认改成带数据，避免把空链接当成「我的内容」发出去。 */
  if(!shareIncludeData){
    let go=true;
    try{ go=window.confirm('「包含分享数据」现在是关闭的，这条链接别人打开只会看到一个空盒子。\n\n改成带上我的内容再复制吗？（推荐）'); }catch(e){}
    if(go){ setShareInclude(true); syncShareRows(); }
  }
  const url=shareLink();
  let ok=false;
  try{ await navigator.clipboard.writeText(url); ok=true; }catch(e){}
  if(!ok){
    try{
      const ta=document.createElement('textarea');
      ta.value=url; ta.style.position='fixed'; ta.style.opacity='0';
      document.body.appendChild(ta); ta.select(); ok=document.execCommand('copy'); ta.remove();
    }catch(e){}
  }
  if(ok) toast(shareIncludeData?'✅ 已复制线上访问链接（含我的数据）':'⚠️ 已复制线上访问链接（不含数据，别人打开是空盒子）',6000);
  else{
    openPanel('🔗 复制访问链接','浏览器不允许自动复制，请手动复制下面这条链接：');
    $('panelBody').innerHTML='<div class="share-card"><div class="set-item"><span class="set-item-t" style="font-weight:400;word-break:break-all;white-space:normal">'+esc(url)+'</span></div></div>';
    $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
    $('panelCloseBtn').onclick=closePanel;
  }
}
/* 分享：先选「是否带数据」，再选别人能看到什么 */
function openSharePanel(){
  openPanel('📤 生成分享版 HTML','导出一个独立 HTML（可自己部署成链接）。先决定要不要带上我的数据：');
  renderShareOptions();
}
function renderShareOptions(){
  const body=$('panelBody'); if(!body) return;
  const opts=shareIncludeData?[
    {k:'all',icon:'📖',t:'公开全部内容',d:'笔记、照片、文件都能看，适合发给朋友'},
    {k:'structure',icon:'🔒',t:'只展示结构（隐藏内容）',d:'能看到分类和文件名，正文、照片、文件内容不显示'}
  ]:[
    {k:'blank',icon:'🗂',t:'空白空间（不含数据）',d:'不带任何个人数据，打开后可自己添加内容、独立使用'}
  ];
  body.innerHTML=
    '<div class="share-card"><div class="set-list">'+
      '<label class="set-item"><span class="set-item-t">包含分享数据<small>开启后分享版带上我的笔记、分类与附件</small></span>'+
      '<span class="set-item-r"><input type="checkbox" id="sharePanelInc" class="set-sw"'+(shareIncludeData?' checked':'')+'></span></label>'+
      '<div class="set-item'+(shareIncludeData?'':' is-off')+'" id="sharePanelScopeRow"><span class="set-item-t">数据范围<small>仅在包含数据时生效</small></span>'+
      '<span class="set-item-r"><select id="sharePanelScope" class="set-sel"'+(shareIncludeData?'':' disabled')+'>'+
        '<option value="all"'+(shareScope==='all'?' selected':'')+'>公开全部内容</option>'+
        '<option value="structure"'+(shareScope==='structure'?' selected':'')+'>只展示结构</option>'+
      '</select></span></div>'+
    '</div><div class="share-cap">GitHub 账号、Token、API 密钥始终不会被打包。</div></div>'+
    '<div class="share-card">'+opts.map(r=>
      '<div class="set-item" data-share="'+r.k+'"><span class="set-item-t">'+r.icon+' '+r.t+'<small>'+r.d+'</small></span>'+
      '<span class="set-item-r"><button class="share-gen" type="button">生成</button></span></div>').join('')+'</div>'+
    (location.protocol==='file:'?
      '<div class="share-card"><div class="set-item"><span class="set-item-t">⚠️ 当前是本地文件方式打开<small>浏览器不允许读取本地脚本，导出的分享版会不完整。请先通过 Netlify 链接或本地服务（npm start）打开本页再导出。</small></span></div></div>':'')+
    '<div class="share-cap">提示：设置里也可以随时切换「包含分享数据」，并复制带 / 不带数据的访问链接。</div>';

  const inc=$('sharePanelInc'), scope=$('sharePanelScope');
  if(inc) inc.onchange=e=>{ setShareInclude(e.target.checked); syncShareRows(); renderShareOptions(); };
  if(scope) scope.onchange=e=>{ setShareScope(e.target.value); syncShareRows(); };
  body.querySelectorAll('[data-share]').forEach(el=>{
    const go=()=>{ closePanel(); exportShareHtml(el.dataset.share); };
    el.onclick=go;
    const b=el.querySelector('.share-gen'); if(b) b.onclick=e=>{ e.stopPropagation(); go(); };
  });
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">取消</button>';
  $('panelCloseBtn').onclick=closePanel;
}
/* 设置弹窗里的开关与面板保持同步 */
function syncShareRows(){
  const inc=$('shareIncludeData'); if(inc) inc.checked=shareIncludeData;
  const scope=$('shareScopeSel'); if(scope){ scope.value=shareScope; scope.disabled=!shareIncludeData; }
  const row=$('shareScopeRow'); if(row) row.classList.toggle('is-off',!shareIncludeData);
}
/* 第二十七批：把我的最新数据同步到线上分享链接。
   推送后服务端保存快照（data/share-<code>.json），新访客打开链接时
   seedLoader 优先读快照，比站点内置种子（data/seed.js）新。
   收集与脱敏规则与「公开全部内容」分享版完全一致。 */
async function sharePushData(){
  if(SHARED){ toast('只读分享版不能同步数据'); return; }
  let code='';
  try{ code=new URLSearchParams(location.search).get('sharecode')||''; }catch(e){}
  if(!code) code=SHARE_DEFAULT_CODE;
  if(!code){ toast('这个页面没有分享码，先在带 ?sharecode= 的链接里打开再同步'); return; }
  /* 空数据防误推：页面偶发加载失败时会变成默认空箱（0 条 / 默认分类），
     此时推送会把线上好数据覆盖成空的。必须用户明确确认才允许。 */
  if(!(state.items||[]).length){
    let go=false;
    try{ go=window.confirm('当前页面没有加载到任何条目（可能是网络异常导致打开不完整）。确定要把「空数据」推送到分享链接吗？'); }catch(e){}
    if(!go){ toast('已取消同步'); return; }
  }
  toast('正在打包并上传你的数据…',6000);
  try{
    const keys=new Set();
    state.items.forEach(it=>{
      (it.images||[]).forEach(k=>k&&keys.add(k));
      if(it.fileKey) keys.add(it.fileKey);
      (it.attachments||[]).forEach(a=>{ if(a&&a.key) keys.add(a.key); });
    });
    if(state.profile){
      if(state.profile.avatar) keys.add(state.profile.avatar);
      if(state.profile.bgImage) keys.add(state.profile.bgImage);
    }
    Object.values(state.bannerKeys||{}).forEach(k=>{ if(k) keys.add(k); });
    const assets={};
    for(const k of keys){
      try{ const v=await imgGet(k); if(v) assets[k]=v; }catch(e){}
    }
    const data=JSON.parse(JSON.stringify(state));
    if(data.gh){
      data.gh.token=''; data.gh.owner=''; data.gh.repo='';
      data.gh.branch=''; data.gh.dir=''; data.gh.autoSync=false;
    }
    /* 线上打开走同源；本地 / file 打开推到线上正式地址（CORS 已开放）。
       window.__SHARE_API_BASE__ 是端到端测试钩子，正常使用不会设置。 */
    function shareApiBase(){
      if(typeof window.__SHARE_API_BASE__==='string') return window.__SHARE_API_BASE__;
      const local=/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
      /* 本地打开 → 推到 SHARE_ORIGIN；留空则退回当前域名（本地跑 server.js 时正好可用） */
      return local?(SHARE_ORIGIN||''):'';
    }
    /* 有的托管平台会在站点前面加一层访问闸门，只认 ?sharecode= 查询串或同名
       cookie，看不到请求体里的 code，会把纯 POST 拦成 403。分享码同时放进查询串：
       访客带 cookie 能过，站长本地或没 cookie 也能过，服务端仍以请求体为准。 */
    const apiUrl=shareApiBase()+'/api/share'+(code?('?sharecode='+encodeURIComponent(code)):'');
    const r=await fetch(apiUrl,{
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({code:code,state:data,assets:assets})
    });
    let j=null; try{ j=await r.json(); }catch(e){}
    if(!r.ok||!j||!j.ok){
      /* 没有 JSON 体：请求没走到站点自己的接口（403/404/405 多是访问闸门或纯静态托管） */
      if(!j&&(r.status===403||r.status===404||r.status===405)){
        throw new Error('这个打开方式连不到同步接口（HTTP '+r.status+'）。本地请用 node server.js 打开，或部署到带 Functions 的静态主机后再同步');
      }
      throw new Error((j&&j.error)||('HTTP '+r.status));
    }
    /* 推送数据 = 希望链接带数据：自动开启「包含分享数据」，避免链接仍带 nodata=1 */
    if(!shareIncludeData){
      setShareInclude(true); syncShareRows();
    }
    toast('✅ 已同步 '+((data.items||[]).length)+' 条内容、'+((data.folders||[]).length)+' 个分类，新访客打开链接即可看到',7000);
  }catch(e){ toast('同步失败：'+((e&&e.message)||e),7000); }
}
/* ---------- 模块化版适配：把外链的 CSS / JS 内联回单文件 ---------- */
/* 拆成多文件后，页面快照里只剩 <link href> 和 <script src>；导出分享版必须
   把真实内容写回去，否则别人拿到的文件没有样式和逻辑。
   优先 fetch（http/https 或本地服务）；file:// 直开时浏览器禁止读本地文件，
   此时退回读 document.styleSheets 的规则文本（Firefox 等浏览器支持）。 */
async function readModuleText(url){
  try{ const r=await fetch(url,{cache:'no-store'}); if(r&&r.ok) return await r.text(); }catch(e){}
  try{
    const abs=new URL(url,location.href).href;
    for(const s of Array.from(document.styleSheets||[])){
      if(s.href===abs&&s.cssRules) return Array.from(s.cssRules).map(r=>r.cssText).join('\n');
    }
  }catch(e){}
  return null;
}
async function inlineAssets(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  let missing=0;
  for(const link of Array.from(doc.querySelectorAll('link[rel="stylesheet"]'))){
    const href=link.getAttribute('href')||'';
    if(/^(https?:)?\/\//.test(href)) continue;             /* 外站样式保持原样 */
    const txt=await readModuleText(href);
    if(txt==null){ missing++; continue; }
    const st=doc.createElement('style');
    if(link.getAttribute('media')) st.setAttribute('media',link.getAttribute('media'));
    st.textContent='\n'+txt+'\n';
    link.replaceWith(st);
  }
  for(const sc of Array.from(doc.querySelectorAll('script[src]'))){
    const src=sc.getAttribute('src')||'';
    if(/^(https?:)?\/\//.test(src)) continue;              /* 外站脚本（如 pdf.js CDN）保持原样 */
    const txt=await readModuleText(src);
    if(txt==null){ missing++; continue; }
    const ns=doc.createElement('script');
    ns.textContent='\n'+txt+'\n';
    sc.replaceWith(ns);
  }
  return {html:'<!DOCTYPE html>\n'+doc.documentElement.outerHTML, missing};
}
/* 第二十三批：取「未经 JS 渲染」的完整原始 index.html。
   绝不能直接用 01-config.js 里的 SRC_HTML —— 它在 01-config.js 执行时就抓取，
   那时浏览器才解析到第 2 个脚本，后面 40 多个 <script src> 都不在快照里，
   导出的分享版会缺 02-store.js（state 未定义）、缺全部渲染逻辑，整页空白。
   http/https 下从服务端取源码最干净；file:// 下 fetch 被浏览器禁止时才回退。 */
async function shareSourceHtml(){
  const tries=[];
  try{ tries.push(new URL('index.html',location.href).href); }catch(e){}
  try{ tries.push(new URL(location.pathname,location.origin).href); }catch(e){}
  for(const u of tries){
    try{
      const r=await fetch(u,{cache:'no-store'});
      if(r&&r.ok){
        const t=await r.text();
        if(t.indexOf('js/02-store.js')>=0&&t.indexOf('js/45-ai-news.js')>=0) return t;
      }
    }catch(e){}
  }
  return SRC_HTML;
}
/* mode: 'all' 全部内容 | 'structure' 仅结构 | 'blank' 不含数据（空白空间）
   兼容旧调用：布尔 true = 仅结构 */
async function exportShareHtml(mode){
  if(SHARED) return;
  if(mode===true) mode='structure';
  if(mode===false||mode==null) mode='all';
  const blank=(mode==='blank');
  const hideContent=(mode==='structure');
  toast('正在打包分享文件，请稍候…');
  try{
    /* 收集所有用到的 IndexedDB 资源键（照片/文件/头像/背景）；
       隐藏内容或空白版时不打包任何个人附件 */
    const keys=new Set();
    if(!hideContent&&!blank){
      state.items.forEach(it=>{
        (it.images||[]).forEach(k=>k&&keys.add(k));
        if(it.fileKey) keys.add(it.fileKey);
        (it.attachments||[]).forEach(a=>{ if(a&&a.key) keys.add(a.key); });
      });
    }
    if(!blank&&state.profile){
      if(state.profile.avatar) keys.add(state.profile.avatar);
      if(state.profile.bgImage) keys.add(state.profile.bgImage);
    }
    if(!hideContent&&!blank) Object.values(state.bannerKeys||{}).forEach(k=>{ if(k) keys.add(k); });
    const assets={};
    for(const k of keys){
      try{ const v=await imgGet(k); if(v) assets[k]=v; }catch(e){}
    }
    /* 数据脱敏：去掉 GitHub 账号 / 仓库 / 分支 / 目录与 Token（分享版设置弹窗里不该出现这些）；
       隐藏内容时剥掉正文 / 照片 / 文件数据 */
    const data=JSON.parse(JSON.stringify(state));
    if(data.gh){
      data.gh.token=''; data.gh.owner=''; data.gh.repo='';
      data.gh.branch=''; data.gh.dir=''; data.gh.autoSync=false;
    }
    if(hideContent){
      (data.items||[]).forEach(it=>{
        it.text='';
        delete it.images; delete it.fileKey; delete it.plain; delete it.wikilinks; delete it.openedAt;
        delete it.marks;   /* 划线标注的引文就是正文，只展示结构时一并剥掉 */
      });
      data.recent=[];
      data.trash=[];
    }
    /* 注入数据脚本（</ 转义防提前闭合 script 标签）。
       空白版不注入任何数据，只标记 NODATA：数据层改用独立 localStorage 空间、
       不加载站点种子，打开就是一个可自行使用的空白空间。 */
    const safe=s=>JSON.stringify(s).replace(/<\//g,'<\\/');
    const inject='<scr'+'ipt>'+(blank
      ? 'window.__BOX_NODATA__=true;window.__BOX_ASSETS__={};'
      : 'window.__BOX_SHARED__=true;'+(hideContent?'window.__BOX_HIDE__=true;':'')+
        'window.__BOX_DATA__='+safe(data)+';window.__BOX_ASSETS__='+safe(assets)+';')+'</scr'+'ipt>';
    const packed=await inlineAssets(await shareSourceHtml());
    /* 内联失败（file:// 下 fetch 被禁）→ 生成的文件会缺模块，绝不交付坏文件 */
    if(packed.missing){
      toast('⚠️ 有 '+packed.missing+' 个样式/脚本没能内联（本地文件方式打开导致）。请通过线上网址或本地服务（npm start）打开本页后再生成分享版。',8000);
      return;
    }
    /* 注入脚本放在 <head> 最前面：必须早于任何模块，否则 SHARED / __BOX_DATA__
       要等到 01-config.js 执行时才生效就来不及了。
       同时去掉「种子加载器」：分享版已经内嵌 __BOX_DATA__ / __BOX_ASSETS__，
       不需要也不该再引用站点目录里的 data/seed.js。 */
    const shell=packed.html.replace(/<script id="seedLoader"[\s\S]*?<\/script>/i,'');
    const html=/<head[^>]*>/i.test(shell)
      ? shell.replace(/<head[^>]*>/i,m=>m+'\n'+inject)
      : shell.replace('</head>',inject+'\n</head>');
    const blob=new Blob([html],{type:'text/html;charset=utf-8'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=(state.spaceName||'OVOvv')+(blank?'-空白版(不含数据).html':hideContent?'-分享版(仅结构).html':'-分享版.html');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    toast(blank?'✅ 已生成空白空间（不含任何个人数据）'
      :hideContent?'✅ 已生成「仅结构」分享版，内容不可见'
      :'✅ 分享版已生成，发给朋友即可浏览你的空间');
  }catch(e){ toast('生成失败：'+(e&&e.message||e)); }
}

