/* ============================================================
   Pocket · 拖拽移动
   拖拽换父级、拖入收纳夹、外部文件拖入上传
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 拖拽移动（文件夹换父级 / 内容移动收纳夹；阅读器目录除外） ================= */
let dragPayload=null, dropHiEl=null, dropZone=null;
function clearDropHi(){ if(dropHiEl){ dropHiEl.classList.remove('drop-hi','fb-before','fb-after'); dropHiEl=null; } }
function markDrop(el){ if(dropHiEl!==el){ clearDropHi(); dropHiEl=el; el.classList.add('drop-hi'); } }
document.addEventListener('dragstart',e=>{
  if(batchMode){ dragPayload=null; return; }
  /* 卡片 / 主页文字条目 / 表格行 / 继续阅读，四类内容都可以直接拖 */
  const card=e.target.closest('.card[data-id],.home-note-row[data-id],tr.tb-row[data-topen],.recent-card[data-read]');
  if(card){
    dragPayload='item:'+(card.dataset.id||card.dataset.topen||card.dataset.read);
    if(state.sortMode==='custom'&&currentFolderId!==HOME_ID&&!searchQuery) toast('自定义排序中：拖到另一张卡片左 / 右半边即可插入');
  }
  else{
    const sh=e.target.closest('.home-sec-head[data-goto]');
    if(sh){ dragPayload='sec:'+sh.dataset.goto; }
    else{
      const fi=e.target.closest('.folder-item[data-fid]');
      if(fi&&fi.dataset.fid!=='__root__'){ dragPayload='folder:'+fi.dataset.fid; }
      else{ dragPayload=null; return; }
    }
  }
  e.dataTransfer.effectAllowed='move';
  try{ e.dataTransfer.setData('text/plain',dragPayload); }catch(err){}
  document.body.classList.add('dragging');
});
document.addEventListener('dragend',()=>{ dragPayload=null; document.body.classList.remove('dragging'); clearDropHi(); document.querySelectorAll('.drop-before,.drop-after').forEach(el=>el.classList.remove('drop-before','drop-after')); });

/* 自定义排序：把卡片拖到另一张卡片左/右半边插入（仅收纳夹页面 + 自定义排序时生效） */
function reorderItems(oid,targetId,before){
  if(oid===targetId) return;
  pushUndo('调整顺序');
  const from=state.items.findIndex(x=>x.id===oid);
  let idx=state.items.findIndex(x=>x.id===targetId);
  if(from<0||idx<0) return;
  const it=state.items[from];
  state.items.splice(from,1);
  idx=state.items.findIndex(x=>x.id===targetId);
  if(!before) idx++;
  state.items.splice(idx,0,it);
  save(); renderAll();
}
function canReorderNow(){
  return dragPayload&&dragPayload.indexOf('item:')===0&&!batchMode&&
    state.sortMode==='custom'&&currentFolderId!==HOME_ID&&!searchQuery;
}
$('items').addEventListener('dragover',e=>{
  if(!canReorderNow()) return;
  const card=e.target.closest('.card[data-id]');
  if(!card||card.dataset.id===dragPayload.slice(5)) return;
  e.preventDefault(); e.stopPropagation();
  e.dataTransfer.dropEffect='move';
  const r=card.getBoundingClientRect();
  const before=(e.clientX-r.left)<r.width/2;
  card.classList.toggle('drop-before',before);
  card.classList.toggle('drop-after',!before);
});
$('items').addEventListener('dragleave',e=>{
  const card=e.target.closest('.card[data-id]');
  if(card&&!(e.relatedTarget&&card.contains(e.relatedTarget))) card.classList.remove('drop-before','drop-after');
});
$('items').addEventListener('drop',e=>{
  if(!canReorderNow()) return;
  const card=e.target.closest('.card[data-id]');
  if(!card||card.dataset.id===dragPayload.slice(5)) return;
  e.preventDefault(); e.stopPropagation();
  const r=card.getBoundingClientRect();
  const before=(e.clientX-r.left)<r.width/2;
  card.classList.remove('drop-before','drop-after');
  reorderItems(dragPayload.slice(5),card.dataset.id,before);
  toast('顺序已保存');
});
function moveItemTo(iid,fid){
  const it=state.items.find(x=>x.id===iid);
  const f=state.folders.find(x=>x.id===fid);
  if(!it||!f) return;
  if(it.folderId===fid){ toast('已在这个收纳夹里'); return; }
  pushUndo('移动「'+itemLabel(it)+'」');
  it.folderId=fid; save(); renderAll();
  toast('已移动到「'+f.name+'」');
}
function handleDropOnFolder(fid){
  const parts=dragPayload.split(':');
  const kind=parts[0], oid=parts.slice(1).join(':');
  if(kind==='item'){
    if(fid==='__root__'){ const first=childFolders(null)[0]; if(first) moveItemTo(oid,first.id); return; }
    moveItemTo(oid,fid);
    return;
  }
  if(kind==='folder'){
    if(fid==='__root__'){
      const f=state.folders.find(x=>x.id===oid);
      if(f&&f.parentId){ f.parentId=null; f.updatedAt=Date.now(); save(); renderAll(); toast('「'+f.name+'」已移到顶级分类'); }
      return;
    }
    if(oid===fid) return;
    let p=fid;   /* 目标不能是自己或自己的后代 */
    while(p){ if(p===oid){ toast('不能把分类移到它自己或它的子分类里'); return; } const pf=state.folders.find(x=>x.id===p); p=pf?pf.parentId:null; }
    const f=state.folders.find(x=>x.id===oid);
    const tf=state.folders.find(x=>x.id===fid);
    if(f&&tf&&(f.parentId||null)!==fid){ f.parentId=fid; f.updatedAt=Date.now(); save(); renderAll(); toast('「'+f.name+'」已移到「'+tf.name+'」下'); }
  }
}
/* 同父级内的分类排序：把 oid 移到 tid 前 / 后（不同父级时退回「变成子分类」） */
function reorderFolder(oid,tid,before){
  if(oid===tid) return;
  const o=state.folders.find(x=>x.id===oid), t=state.folders.find(x=>x.id===tid);
  if(!o||!t) return;
  if((o.parentId||null)!==(t.parentId||null)){ handleDropOnFolder(tid); return; }
  if(o.parentId&&!foldOpen.has(o.parentId)) foldOpen.add(o.parentId);
  pushUndo('调整分类顺序');
  const arr=state.folders;
  arr.splice(arr.indexOf(o),1);
  let idx=arr.indexOf(t);
  if(!before) idx++;
  arr.splice(idx,0,o);
  save(); renderAll();
  toast('顺序已保存');
}
/* 侧边栏：文件夹/内容的通用落点（分类拖到上 / 下边缘 = 同级排序，中间 = 变成子分类） */
$('folderList').addEventListener('dragover',e=>{
  if(!dragPayload) return;
  const fi=e.target.closest('.folder-item[data-fid]');
  if(!fi) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  if(dragPayload.startsWith('folder:')&&fi.dataset.fid!=='__root__'){
    const r=fi.getBoundingClientRect();
    const y=(e.clientY-r.top)/Math.max(1,r.height);
    dropZone=y<0.32?'before':(y>0.68?'after':'child');
    fi.classList.toggle('fb-before',dropZone==='before');
    fi.classList.toggle('fb-after',dropZone==='after');
    fi.classList.toggle('drop-hi',dropZone==='child');
    dropHiEl=fi;
  }else{
    dropZone=null;
    markDrop(fi);
  }
});
$('folderList').addEventListener('dragleave',e=>{
  const fi=e.target.closest('.folder-item[data-fid]');
  if(fi&&dropHiEl===fi&&!(e.relatedTarget&&fi.contains(e.relatedTarget))) clearDropHi();
});
$('folderList').addEventListener('drop',e=>{
  const fi=e.target.closest('.folder-item[data-fid]');
  const zone=dropZone;
  clearDropHi();
  if(!fi||!dragPayload) return;
  e.preventDefault();
  if(dragPayload.startsWith('folder:')&&fi.dataset.fid!=='__root__'&&zone&&zone!=='child'){
    reorderFolder(dragPayload.slice(7),fi.dataset.fid,zone==='before');
  }else{
    handleDropOnFolder(fi.dataset.fid);
  }
  dropZone=null;
  dragPayload=null;
  document.body.classList.remove('dragging');
});
/* 主页：分区作为内容 / 分类的落点 */
$('items').addEventListener('dragover',e=>{
  if(!dragPayload||(!dragPayload.startsWith('item:')&&!dragPayload.startsWith('sec:')&&!dragPayload.startsWith('folder:'))) return;
  const sec=e.target.closest('.home-sec[data-fold]');
  if(!sec) return;
  e.preventDefault(); e.dataTransfer.dropEffect='move';
  if(dragPayload.startsWith('sec:')){ sec.classList.add('drop-hi-sec'); }
  else markDrop(sec);
});
$('items').addEventListener('drop',e=>{
  const sec=e.target.closest('.home-sec[data-fold]');
  clearDropHi();
  document.querySelectorAll('.home-sec.drop-hi-sec').forEach(el=>el.classList.remove('drop-hi-sec'));
  if(!sec||!dragPayload) return;
  e.preventDefault();
  if(dragPayload.startsWith('sec:')){
    const r=sec.getBoundingClientRect();
    secReorder(dragPayload.slice(4),sec.dataset.fold,(e.clientY-r.top)<r.height/2);
  }else if(dragPayload.startsWith('item:')){
    moveItemTo(dragPayload.slice(5),sec.dataset.fold);
  }else if(dragPayload.startsWith('folder:')){
    /* 分类拖到主页某个分区 = 变成它的子分类 */
    handleDropOnFolder(sec.dataset.fold);
  }
  dragPayload=null;
  document.body.classList.remove('dragging');
});

/* 深色模式 */
function applyDark(){ document.body.classList.toggle('dark',!!state.dark); applySkin(); }
function toggleDark(){ state.dark=!state.dark; applyDark(); save(); }
$('fabTheme').onclick=()=>{ closeFab(); toggleDark(); };

/* 移动端侧栏 */
$('hamburger').onclick=()=>{ $('sidebar').classList.add('open'); $('sbMask').classList.add('show'); };
$('sbMask').onclick=closeSidebarMobile;
function closeSidebarMobile(){ $('sidebar').classList.remove('open'); $('sbMask').classList.remove('show'); }

/* 桌面端侧栏收起 / 展开（顶栏 ◧ 按钮，状态记忆在本机） */
const SB_COL_KEY='sb_collapsed_v1';
try{ if(localStorage.getItem(SB_COL_KEY)==='1') document.body.classList.add('sb-collapsed'); }catch(e){}
const sbToggleBtn=$('sbToggle');
if(sbToggleBtn) sbToggleBtn.onclick=()=>{
  const c=document.body.classList.toggle('sb-collapsed');
  try{ localStorage.setItem(SB_COL_KEY,c?'1':'0'); }catch(e){}
};

