/* ============================================================
   Pocket · 回收站
   删除可还原、30 天自动清理、回收站计数
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 回收站：删除可还原 ================= */
function itemLabel(it){
  if(!it) return '内容';
  if(it.type==='note') return (it.text||'').slice(0,20)||'文字条目';
  if(it.type==='photo') return (it.text||'').slice(0,20)||('照片 ×'+((it.images||[]).length||1));
  if(it.type==='link') return it.title||it.url||'链接';
  if(it.type==='grid'||it.type==='canvas') return it.title||(it.type==='grid'?'多维表格':'画布');
  return it.fileName||'文件';
}
function itemIcon(it){
  if(!it) return '📄';
  if(it.type==='note') return '📝';
  if(it.type==='photo') return '📷';
  if(it.type==='link') return '🔗';
  return fileEmoji(it.fileName);
}
function trashItem(it,skipUndo){
  if(!it) return;
  if(!skipUndo) pushUndo('删除「'+itemLabel(it)+'」');
  if(!Array.isArray(state.trash)) state.trash=[];
  state.trash=state.trash.filter(t=>t&&t.item&&t.item.id!==it.id);
  state.trash.unshift({item:JSON.parse(JSON.stringify(it)),at:Date.now()});
  if(state.trash.length>300) state.trash.length=300;
  state.items=state.items.filter(x=>x.id!==it.id);
  state.tomb[it.id]=Date.now();          /* 墓碑：多端合并时不会被别的设备“复活” */
  sigMap.delete(it.id);
  batchSel.delete(it.id);
  renderTrashCount();
}
async function trashPurge(idx){
  const t=state.trash[idx]; if(!t) return;
  pushUndo('彻底删除「'+itemLabel(t.item||{})+'」（附件不恢复）');
  const it=t.item||{};
  (it.images||[]).forEach(k=>imgDel(k).catch(()=>{}));
  if(it.fileKey) imgDel(it.fileKey).catch(()=>{});
  state.trash.splice(idx,1);
  save(); renderTrashCount();
  if($('panelMask').classList.contains('show')) renderTrashPanel();
}
function trashRestore(idx){
  const t=state.trash[idx]; if(!t||!t.item) return;
  pushUndo('还原「'+itemLabel(t.item)+'」');
  const it=t.item;
  if(!state.folders.some(f=>f.id===it.folderId)) it.folderId=state.folders[0]?state.folders[0].id:null;
  if(state.items.some(x=>x.id===it.id)) it.id=uid();
  state.items.push(it);
  delete state.tomb[it.id];              /* 还原 = 撤销墓碑，否则合并时又被判为已删除 */
  state.trash.splice(idx,1);
  save(); renderAll(); renderTrashCount();
  if($('panelMask').classList.contains('show')) renderTrashPanel();
  toast('已还原「'+itemLabel(it)+'」');
}
/* 30 天自动清理（含图片/文件数据） */
function autoPurgeTrash(){
  if(!Array.isArray(state.trash)||!state.trash.length) return;
  const cut=Date.now()-30*864e5;
  const dead=state.trash.filter(t=>t&&t.at<cut);
  if(!dead.length) return;
  state.trash=state.trash.filter(t=>t&&t.at>=cut);
  dead.forEach(t=>{
    const it=t.item||{};
    (it.images||[]).forEach(k=>imgDel(k).catch(()=>{}));
    if(it.fileKey) imgDel(it.fileKey).catch(()=>{});
  });
  save();
}
function renderTrashCount(){
  const el=$('trashCount'); if(!el) return;
  const n=(state.trash||[]).length;
  el.textContent=n?String(n):'';
  el.classList.toggle('show',!!n);
}

