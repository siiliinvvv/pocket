/* ============================================================
   Pocket · 通用面板
   回收站 / 历史版本 / 存储用量三个列表面板
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 面板：回收站 / 历史版本 / 存储用量 ================= */
function openPanel(title,hint){
  $('panelTitle').textContent=title;
  $('panelHint').innerHTML=hint||'';
  $('panelBody').style.maxHeight='';        /* 统计看板会临时放宽高度，这里先复位 */
  $('panelMask').classList.add('show');
}
function closePanel(){ $('panelMask').classList.remove('show'); }
$('panelMask').addEventListener('click',e=>{ if(e.target===e.currentTarget) closePanel(); });

function renderTrashPanel(){
  const list=state.trash||[];
  openPanel('🗑 回收站','删除的内容会先放在这里，<b>30 天</b>后自动清理；还原后会回到原来的收纳夹。');
  const body=$('panelBody');
  if(!list.length){
    body.innerHTML='<div class="rd-empty">回收站是空的。<br>删掉的内容会出现在这里，可以随时还原。</div>';
  }else{
    body.innerHTML=list.map((t,i)=>{
      const it=(t&&t.item)||{};
      const f=state.folders.find(x=>x.id===it.folderId);
      return '<div class="tr-row"><div class="tr-ico">'+itemIcon(it)+'</div>'+
        '<div class="tr-main"><div class="tr-t">'+esc(itemLabel(it))+'</div>'+
        '<div class="tr-s">'+esc(TYPE_BADGE[it.type]||'内容')+' · '+(f?esc(f.icon+' '+f.name):'未分类')+' · 删除于 '+relTime(t.at)+'</div></div>'+
        '<div class="tr-act"><button data-tr="'+i+'">还原</button><button class="dg" data-tp="'+i+'">彻底删除</button></div></div>';
    }).join('');
    body.querySelectorAll('[data-tr]').forEach(b=>{ b.onclick=()=>trashRestore(parseInt(b.dataset.tr,10)); });
    body.querySelectorAll('[data-tp]').forEach(b=>{
      b.onclick=async()=>{ if(await uiConfirm({title:'彻底删除',msg:'删除后就无法恢复了，确定吗？',danger:true,okText:'彻底删除'})) trashPurge(parseInt(b.dataset.tp,10)); };
    });
  }
  $('panelFoot').innerHTML=(list.length?'<button class="btn danger" id="trashEmptyBtn">清空回收站</button>':'')+
    '<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
  const eb=$('trashEmptyBtn');
  if(eb) eb.onclick=async()=>{
    if(!await uiConfirm({title:'清空回收站',msg:'其中内容及其照片 / 文件会被永久删除，无法恢复。',count:list.length+' 条内容',danger:true,okText:'全部清空'})) return;
    pushUndo('清空回收站');
    list.forEach(t=>{
      const it=(t&&t.item)||{};
      (it.images||[]).forEach(k=>imgDel(k).catch(()=>{}));
      if(it.fileKey) imgDel(it.fileKey).catch(()=>{});
    });
    state.trash=[];
    save(); renderTrashCount(); renderTrashPanel(); toast('回收站已清空');
  };
}

function renderSnapPanel(){
  const arr=readSnaps();
  openPanel('🕘 历史版本','系统约每 3 分钟自动留一份快照（最多 8 份）。回滚是<b>整箱替换</b>，当前内容会先自动备份一份。');
  const body=$('panelBody');
  if(!arr.length){
    body.innerHTML='<div class="rd-empty">还没有快照。<br>随便改点内容，3 分钟后就会出现第一份。</div>';
  }else{
    body.innerHTML=arr.map((s,i)=>{
      const d=new Date(s.at);
      const mins=Math.max(0,Math.round((Date.now()-s.at)/60000));
      const ago=mins<1?'刚刚':(mins<60?mins+' 分钟前':Math.round(mins/60)+' 小时前');
      return '<div class="tr-row"><div class="tr-ico">🕘</div><div class="tr-main">'+
        '<div class="tr-t">'+d.toLocaleString()+'</div>'+
        '<div class="tr-s">'+(s.count||0)+' 条内容 · '+ago+' · 约 '+Math.max(1,Math.round((s.size||0)/1024))+' KB</div></div>'+
        '<div class="tr-act"><button data-snap="'+i+'">回滚到此版本</button></div></div>';
    }).join('');
    body.querySelectorAll('[data-snap]').forEach(b=>{ b.onclick=()=>restoreSnapshot(parseInt(b.dataset.snap,10)); });
  }
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
}

function fmtSize(n){
  n=n||0;
  if(n<1024) return Math.round(n)+' B';
  if(n<1048576) return (n/1024).toFixed(1)+' KB';
  if(n<1073741824) return (n/1048576).toFixed(1)+' MB';
  return (n/1073741824).toFixed(2)+' GB';
}
function idbKeys(){
  return idbOpen().then(db=>new Promise((res,rej)=>{
    const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();
    rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error);
  }));
}
function idbUsage(){
  return idbOpen().then(db=>new Promise((res,rej)=>{
    let bytes=0,count=0;
    const rq=db.transaction(STORE,'readonly').objectStore(STORE).openCursor();
    rq.onsuccess=e=>{
      const c=e.target.result;
      if(!c){ res({bytes:bytes,count:count}); return; }
      const v=c.value;
      if(typeof v==='string') bytes+=v.length*0.75;
      else if(v&&v.byteLength) bytes+=v.byteLength;
      count++;
      c.continue();
    };
    rq.onerror=()=>rej(rq.error);
  }));
}
function withTimeout(p,ms,fallback){
  return Promise.race([p,new Promise(res=>setTimeout(()=>res(fallback),ms))]);
}
async function renderUsage(){
  const box=$('usageBox'); if(!box) return;
  const textBytes=new Blob([localStorage.getItem(LS_KEY)||'']).size;
  const snapBytes=snapshotsSize();
  box.innerHTML='<div class="usage-bar"><i id="usageBar" style="width:0%"></i></div>'+
    '<div id="usageTop"><b>正在统计浏览器占用…</b></div>'+
    '<div id="usageDetail">图片与文件：统计中…</div>'+
    '<div>文字数据：'+fmtSize(textBytes)+' · 历史快照：'+fmtSize(snapBytes)+'（'+readSnaps().length+' 份）</div>'+
    '<div>当前条目：'+(state.items||[]).length+' 条 · 回收站：'+(state.trash||[]).length+' 条</div>';
  let usage=0,quota=0;
  try{
    const e=await withTimeout(navigator.storage&&navigator.storage.estimate?navigator.storage.estimate():Promise.resolve({}),1500,{});
    usage=(e&&e.usage)||0; quota=(e&&e.quota)||0;
  }catch(err){}
  let iu={bytes:0,count:0};
  try{ iu=await withTimeout(idbUsage(),2500,{bytes:0,count:0}); }catch(e){}
  const pct=quota?Math.min(100,usage/quota*100):0;
  const top=$('usageTop'), det=$('usageDetail'), bar=$('usageBar');
  if(top) top.innerHTML='<b>浏览器已用 '+fmtSize(usage)+'</b>'+(quota?' / 可用约 '+fmtSize(quota):'');
  if(det) det.innerHTML='图片与文件：'+fmtSize(iu.bytes)+' · '+iu.count+' 个对象';
  if(bar) bar.style.width=((pct>0&&pct<1)?1:pct).toFixed(1)+'%';
  if(pct>80) box.insertAdjacentHTML('beforeend','<div style="color:var(--danger);margin-top:5px">⚠ 空间接近上限，建议先「导出备份」，再清理回收站 / 孤立数据。</div>');
}
async function cleanOrphans(){
  const used=new Set();
  const add=it=>{ if(!it) return; (it.images||[]).forEach(k=>{ if(k) used.add(k); }); if(it.fileKey) used.add(it.fileKey); (it.attachments||[]).forEach(a=>{ if(a&&a.key) used.add(a.key); }); };
  (state.items||[]).forEach(add);
  (state.trash||[]).forEach(t=>add(t&&t.item));
  const p=state.profile||{};
  if(p.avatar) used.add(p.avatar);
  if(p.bgImage) used.add(p.bgImage);
  Object.values(state.bannerKeys||{}).forEach(k=>{ if(k) used.add(k); });
  let keys=[];
  try{ keys=await idbKeys(); }catch(e){ toast('读取本地数据失败'); return; }
  const dead=keys.filter(k=>!used.has(k));
  if(!dead.length){ toast('没有发现孤立数据，已经很干净'); return; }
  if(!await uiConfirm({title:'清理孤立数据',msg:'发现已无引用的图片 / 文件（可能是历史上的残留），删除可释放空间，不会影响任何正在显示的内容。',count:dead.length+' 个孤立对象',danger:true,okText:'清理'})) return;
  for(const k of dead){ await imgDel(k).catch(()=>{}); }
  toast('已清理 '+dead.length+' 个孤立对象');
  renderUsage();
}
$('snapBtn').onclick=renderSnapPanel;
$('cleanOrphanBtn').onclick=cleanOrphans;

/* ================= 统计看板面板（第三十二批） =================
   与主页「📈 统计看板」板块共用同一套聚合（hbBoardHTML），
   这里用 full 模式：标签全展开、高频打开看满 Top10。 */
function renderStatsPanel(){
  if(typeof hbBoardHTML!=='function'){ toast('统计模块还没加载好，稍后再试'); return; }
  openPanel('📈 统计看板',
    '数字全部从当前空间现场聚合：<b>条目总数 / 本周新增 / 标签云 / 高频打开 Top10 / 存储分布</b>，不做复杂分析——改完内容重新打开就是最新的。');
  const body=$('panelBody');
  body.style.maxHeight='64vh';              /* 看板内容比列表长，多给一点高度 */
  body.innerHTML=hbBoardHTML({full:true});
  body.querySelectorAll('[data-tl]').forEach(el=>{
    el.onclick=()=>{
      const it=state.items.find(x=>x.id===el.dataset.tl);
      if(!it) return;
      closePanel();
      if(it.type==='note') openEditor(it); else openReader(it.id);
    };
  });
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
}

