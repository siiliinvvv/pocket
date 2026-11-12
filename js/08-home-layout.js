/* ============================================================
   Pocket · 主页布局
   卡片「更多」菜单、分类分区拖拽/上下移动排序、移动端长按移动
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 卡片"更多"菜单（常用操作直出，其余收进 ⋯） ================= */
function showMoreMenu(anchor,it){
  const m=$('moreMenu'); if(!m||!it) return;
  const rows=[];
  if(it.type==='note') rows.push(['转为文档',()=>noteToDoc(it)]);
  rows.push(['移动到…',()=>moveItem(it)]);
  if(it.type==='file'&&it.fileKey) rows.push([it.cloudOnly?'拉取缓存':'清理缓存',()=>{ if(it.cloudOnly) ensureItemLocal(it); else clearItemCache(it); }]);
  if(!rows.length) return;
  m.innerHTML=rows.map((r,i)=>'<button role="menuitem" data-mi="'+i+'">'+r[0]+'</button>').join('');
  m.classList.add('show');
  const r=anchor.getBoundingClientRect();
  m.style.left=Math.min(window.innerWidth-m.offsetWidth-8,Math.max(8,r.left))+'px';
  m.style.top=(r.bottom+6)+'px';
  m.querySelectorAll('button').forEach(b=>{ b.onclick=()=>{ m.classList.remove('show'); rows[+b.dataset.mi][1](); }; });
}
document.addEventListener('click',e=>{
  const m=$('moreMenu');
  if(m&&m.classList.contains('show')&&!m.contains(e.target)&&!(e.target.closest&&e.target.closest('.more-btn'))) m.classList.remove('show');
},true);

/* ================= 主页分区排序（拖拽 + 上下按钮，持久化到 state.homeOrder） ================= */
function homeFolders(){
  const ids=state.homeOrder||[];
  return sortedFolders().slice().sort((a,b)=>{
    const ia=ids.indexOf(a.id), ib=ids.indexOf(b.id);
    return (ia<0?1e6:ia)-(ib<0?1e6:ib);
  });
}
function moveSec(fid,dir){
  const ids=homeFolders().map(f=>f.id);
  const i=ids.indexOf(fid); if(i<0) return;
  const j=i+dir; if(j<0||j>=ids.length) return;
  ids.splice(j,0,ids.splice(i,1)[0]);
  pushUndo('移动分区');
  state.homeOrder=ids; save(); renderAll();
}
function secReorder(dragId,targetId,before){
  if(dragId===targetId) return;
  const ids=homeFolders().map(f=>f.id);
  const from=ids.indexOf(dragId); if(from<0) return;
  ids.splice(from,1);
  let idx=ids.indexOf(targetId); if(idx<0) idx=0;
  if(!before) idx++;
  ids.splice(idx,0,dragId);
  pushUndo('调整分区顺序');
  state.homeOrder=ids; save(); renderAll();
}

/* ================= 移动端长按：条目 → 移动到…（拖拽在触屏不可用时的替代） ================= */
let lpTimer=null, lpPos=null;
document.addEventListener('touchstart',e=>{
  if(BOX_HIDE||batchMode) return;
  if(e.touches.length!==1) return;
  const t=e.target.closest('.card[data-id],.home-note-row[data-id]');
  if(!t||!t.dataset.id) return;
  if(e.target.closest('.card-acts,.ic-row,.batch-chk')) return;
  const it=state.items.find(x=>x.id===t.dataset.id);
  if(!it) return;
  const p=e.touches[0]; lpPos={x:p.clientX,y:p.clientY};
  lpTimer=setTimeout(()=>{
    lpTimer=null;
    t.classList.add('lp-hold');
    try{ if(navigator.vibrate) navigator.vibrate(20); }catch(err){}
    moveItem(it);
    setTimeout(()=>t.classList.remove('lp-hold'),500);
  },550);
},{passive:true});
document.addEventListener('touchmove',e=>{
  if(lpTimer&&lpPos&&e.touches[0]){
    const p=e.touches[0];
    if(Math.abs(p.clientX-lpPos.x)>12||Math.abs(p.clientY-lpPos.y)>12){ clearTimeout(lpTimer); lpTimer=null; }
  }
},{passive:true});
document.addEventListener('touchend',()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } },{passive:true});
document.addEventListener('touchcancel',()=>{ if(lpTimer){ clearTimeout(lpTimer); lpTimer=null; } },{passive:true});

