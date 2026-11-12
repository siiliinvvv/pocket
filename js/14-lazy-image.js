/* ============================================================
   Pocket · 图片懒加载
   只加载进入视口的缩略图，重绘时复用缓存避免闪烁
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ===== 图片懒加载 + 缓存：只加载进入视口的缩略图，重绘时直接用缓存避免闪烁 ===== */
const IMG_CACHE=new Map();
const IMG_INFLIGHT=new Map();
let imgObserver=null;
function cachedImg(k){ return IMG_CACHE.get(k)||''; }
function fetchImg(k){
  if(IMG_CACHE.has(k)) return Promise.resolve(IMG_CACHE.get(k));
  if(IMG_INFLIGHT.has(k)) return IMG_INFLIGHT.get(k);   /* 并发去重：同一张图只取一次 */
  const p=(async()=>{
    let u='';
    try{ u=(await imgGet(k))||''; }catch(e){ u=''; }
    IMG_CACHE.set(k,u);
    IMG_INFLIGHT.delete(k);
    return u;
  })();
  IMG_INFLIGHT.set(k,p);
  return p;
}
async function loadImgEl(el){
  if(!el||!el.getAttribute('data-img')) return;
  const k=el.getAttribute('data-img');
  const u=await fetchImg(k);
  if(u){ el.src=u; el.removeAttribute('data-img'); }
}
function hydrateImages(root){
  if(!root) return;
  const imgs=root.querySelectorAll('img[data-img]');
  if(!imgs.length) return;
  /* 已缓存过的直接同步上屏（重绘无闪烁） */
  const pending=[];
  imgs.forEach(el=>{
    const k=el.getAttribute('data-img');
    const hit=cachedImg(k);
    if(hit){ el.src=hit; el.removeAttribute('data-img'); return; }
    pending.push(el);
  });
  if(!pending.length) return;
  if(!('IntersectionObserver' in window)){ pending.forEach(loadImgEl); return; }
  if(!imgObserver){
    imgObserver=new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){ imgObserver.unobserve(en.target); loadImgEl(en.target); }
      });
    },{root:$('scrollArea')||null,rootMargin:'320px 0px'});
  }
  pending.forEach(el=>imgObserver.observe(el));
}
function clearImgCache(){ IMG_CACHE.clear(); }
/* 大列表分批插入：首批 60 张，其余按帧追加，避免一次解析上千张卡片 */
function renderCardList(wrap,items){
  const CHUNK=60;
  /* 表格视图：由 js/36-table-view.js 提供渲染（加载期该函数可能尚不存在，运行期一定在） */
  if(viewMode==='table'&&typeof tableViewHTML==='function'){
    wrap.innerHTML=tableViewHTML(items);
    hydrateImages(wrap);
    return;
  }
  wrap.innerHTML='';
  if(items.length<=CHUNK){
    wrap.innerHTML=items.map(cardHTML).join('');
    hydrateImages(wrap);
    return;
  }
  wrap.innerHTML=items.slice(0,CHUNK).map(cardHTML).join('');
  hydrateImages(wrap);
  const hint=document.createElement('div');
  hint.className='load-more';
  hint.textContent='正在加载剩余 '+(items.length-CHUNK)+' 条…';
  wrap.appendChild(hint);
  let i=CHUNK;
  const step=()=>{
    if(i>=items.length){ hint.remove(); return; }
    const frag=document.createElement('div');
    frag.innerHTML=items.slice(i,i+CHUNK).map(cardHTML).join('');
    while(frag.firstChild) wrap.insertBefore(frag.firstChild,hint);
    hydrateImages(wrap);
    i+=CHUNK;
    if(i<items.length) hint.textContent='正在加载剩余 '+(items.length-i)+' 条…';
    else{ hint.remove(); return; }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* 主页分区里的条目展示：跟随顶栏视图切换（画廊卡片 / 列表 / 表格） */
function homeSecBody(its){
  const list=its.slice(0,6);
  if(viewMode==='table'&&typeof tableViewHTML==='function') return '<div class="home-sec-table">'+tableViewHTML(list)+'</div>';
  return '<div class="home-sec-grid">'+list.map(cardHTML).join('')+'</div>';
}

/* 一级分类的多 Tab 板块：每个 Tab = 一个下级分类的内容（收拢同类内容，不占版面） */
function subTabMap(){
  try{ return JSON.parse(localStorage.getItem('tb_subtab')||'{}'); }catch(e){ return {}; }
}
function subBoardHTML(f,kids){
  const m=subTabMap();
  const want=m[f.id];
  const active=(want&&kids.some(k=>k.id===want))?want:kids[0].id;
  const its=sortItems(state.items.filter(it=>it.folderId===active&&(!activeTag||(it.tags||[]).includes(activeTag))));
  const tabs=kids.map(k=>{
    const n=state.items.filter(it=>it.folderId===k.id).length;
    return '<button class="subtab'+(k.id===active?' on':'')+'" data-subtab="'+k.id+'" title="'+esc(folderPath(k).join(' / '))+'">'+
      '<span class="st-ico">'+esc(k.icon||'📁')+'</span><span class="st-name">'+esc(k.name)+'</span><span class="st-n">'+n+'</span></button>';
  }).join('');
  return '<div class="subboard">'+
    '<div class="subboard-head"><span class="subboard-title">🗂 下级分类</span><div class="subboard-tabs">'+tabs+'</div></div>'+
    '<div class="subboard-body">'+(its.length?its.map(cardHTML).join(''):'<div class="subboard-empty">这个分类还没有内容</div>')+'</div>'+
    '</div>';
}
function renderItemsInner(){
  const wrap=$('items'), items=visibleItems();
  $('crumbMode').textContent=searchQuery?' › 搜索「'+searchQuery+'」':'';
  /* 解除 760px 限宽，与横幅对齐（主页与各文件夹页面通用） */
  $('main').classList.toggle('home-view',!searchQuery);
  /* 主页：只渲染预设设计板块（js/40-home-blocks.js，首次自动生成，无需手动编辑） */
  if(currentFolderId===HOME_ID&&!searchQuery){
    wrap.className='home';
    $('countHint').textContent=state.items.length+' 条';
    let html='';
    /* 知识漫游入口条：选一个范围，把里面所有文件/笔记的知识点串成卡片翻看
       （老版本就有；主页板块化改版时渲染丢失，第二十七批恢复） */
    html+='<div class="roam-bar"><span class="rb-ico">🧭</span><span class="rb-label">知识漫游</span>'+
      '<select id="roamSel" title="选择漫游范围（含子分类）">'+roamFolderOptions()+'</select>'+
      '<button class="rb-go" id="roamGo">开始漫游</button>'+
      '<span class="rb-hint">把这个范围里的章节、笔记串成卡片，一张张翻着复习</span></div>';
    if(typeof homeBlocksHTML==='function') html+=homeBlocksHTML();
    wrap.innerHTML=html||'<div class="empty">主页板块未加载<br><b>请刷新页面重试</b></div>';
    /* 漫游入口：记住上次选的范围 */
    const rsel=$('roamSel');
    if(rsel){
      rsel.value=state.roamFolder||'all';
      if(!rsel.value) rsel.value='all';
      rsel.onchange=()=>{ state.roamFolder=rsel.value; save(); };
      $('roamGo').onclick=openRoam;
    }
    hydrateImages(wrap);
    if(typeof bindHomeBlocks==='function') bindHomeBlocks(wrap);
    renderTagBar(state.items);
    return;
  }
  wrap.className=viewMode;
  $('countHint').textContent=items.length+' 条'+(searchQuery?'（搜索全部）':'');
  /* 一级分类（含下级的分类页）：顶部渲染「多 Tab 板块」收拢下级分类内容，每个 Tab 一个子分类 */
  const f=curFolder();
  const kids=(!searchQuery&&f)?childFolders(f.id):[];
  if(kids.length){
    wrap.innerHTML=subBoardHTML(f,kids)+'<div class="own-items"></div>';
    hydrateImages(wrap);
    const own=wrap.querySelector('.own-items');
    if(items.length) renderCardList(own,items);
    else own.innerHTML='<div class="empty">本分类下还没有直接收纳的内容<br><b>下级分类的内容已收拢到上方板块，点 Tab 切换查看</b></div>';
    renderTagBar(searchQuery?state.items:items);
    syncSearchSortUI();
    return;
  }
  if(!items.length){
    wrap.innerHTML='<div class="empty">'+(searchQuery||activeTag?'没有匹配的条目':'这里还空空的～')+'<br><b>'+(searchQuery||activeTag?'换个关键词试试':'记点什么，或拖一张照片进来吧')+'</b></div>';
    renderTagBar(searchQuery?state.items:items);
    syncSearchSortUI();
    return;
  }
  renderCardList(wrap,items);
  renderTagBar(searchQuery?state.items:items);
  syncSearchSortUI();
}
/* 渲染入口：保留滚动位置（搜索词或分类变化时回到顶部） */
let lastListQuery=null, lastListFolder=null;
function renderItems(){
  const sc=$('scrollArea');
  const y=sc?sc.scrollTop:0;
  const q=searchQuery, f=currentFolderId;
  renderItemsInner();
  if(sc){
    const same=(q===lastListQuery&&f===lastListFolder);
    sc.scrollTop=same?y:0;
  }
  lastListQuery=q; lastListFolder=f;
}
function syncSearchSortUI(){
  const sel=$('searchSort'); if(!sel) return;
  sel.classList.toggle('show',!!searchQuery);
  const v=state.searchSort||'score';
  if(sel.value!==v) sel.value=v;
}

function renderHeader(){
  const searching=!!searchQuery;
  /* 主页 = 纯板块设计：隐藏横幅 / 统计行 / 记点什么输入条（分类页正常显示） */
  document.body.classList.toggle('pure-home',currentFolderId===HOME_ID&&!searching);
  /* 搜索态：结果页不再显示横幅与「记点什么」输入条，避免看着像一张空主页 */
  document.body.classList.toggle('search-view',searching);
  /* 主页头部 */
  if(currentFolderId===HOME_ID&&!searching){
    $('crumbIcon').textContent='🏠';
    /* 第三十一批：顶栏不再写「主页」，直接显示空间名称（点一下可改名） */
    $('crumbName').textContent=state.spaceName||'主页';
    $('crumbName').title='点击重命名空间';
    $('crumbIcon').style.visibility='visible';
    $('heroIcon').textContent='🏠';
    $('heroIcon').style.display='inline-block';
    const n=state.items.length;
    let latest='';
    if(n){ const t=Math.max.apply(null,state.items.map(i=>i.created)); latest=' · 最近更新 '+relTime(t); }
    $('heroSub').textContent='共 '+n+' 条收纳 · '+state.folders.length+' 个分类'+latest;
    $('colsPick').classList.add('show');
    $('homeColsSel').value=String(state.homeCols);
    if(!(state.profile&&state.profile.bgImage)) $('banner').style.background='linear-gradient(120deg,'+BANNERS[0][0]+','+BANNERS[0][1]+')';
    return;
  }
  const f=curFolder(), show=searching?{icon:'🔍',name:'搜索结果'}:f;
  if(!show) return;
  $('colsPick').classList.remove('show');
  $('crumbIcon').textContent=show.icon;
  $('crumbName').textContent=searching?show.name:folderPath(f).join(' / ');
  $('crumbName').title=searching?'':'点击重命名收纳夹';
  $('crumbIcon').style.visibility=searching?'hidden':'visible';
  $('heroIcon').textContent=searching?'':show.icon;
  $('heroIcon').style.display=searching?'none':'inline-block';
  const n=searching?state.items.length:(f?state.items.filter(it=>it.folderId===f.id).length:0);
  const kidN=f?state.folders.filter(x=>x.parentId===f.id).length:0;
  $('heroSub').textContent=searching?'在全部内容中搜索':('共 '+n+' 条收纳'+(kidN?' · '+kidN+' 个子分类':'')+' · 最近更新 '+relTime(f?latestTime(f.id):Date.now()));
  if(!(state.profile&&state.profile.bgImage)&&f) $('banner').style.background='linear-gradient(120deg,'+BANNERS[f.cover%BANNERS.length][0]+','+BANNERS[f.cover%BANNERS.length][1]+')';
}
function latestTime(folderId){
  const times=state.items.filter(it=>it.folderId===folderId).map(it=>it.created);
  return times.length?Math.max.apply(null,times):Date.now();
}

function renderAll(){ $('spaceName').textContent=state.spaceName; renderSidebar(); renderHeader(); renderItems(); applyProfile(); updateReaderCount(); }

