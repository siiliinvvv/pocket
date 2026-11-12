/* ============================================================
   Pocket · 批量管理
   多选、全选、批量移动 / 打标签 / 置顶 / 删除
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 批量管理（批量删除 / 全选） ================= */
function currentVisibleIds(){
  return (currentFolderId===HOME_ID&&!searchQuery)?state.items.map(i=>i.id):visibleItems().map(i=>i.id);
}
function setBatch(on){
  batchMode=on; batchSel.clear();
  document.body.classList.toggle('batching',on);
  $('batchBtn').classList.toggle('on',on);
  $('batchBar').classList.toggle('show',on);
  $('batchAll').checked=false;
  renderItems(); updateBatchBar();
}
function toggleBatchSel(id,on,cb){
  if(on) batchSel.add(id); else batchSel.delete(id);
  if(cb) cb.checked=on;
  updateBatchBar();
}
function updateBatchBar(){
  $('batchCount').textContent='已选 '+batchSel.size+' 条';
  const on=batchSel.size?1:.5;
  ['batchDelBtn','batchMoveBtn','batchTagBtn','batchPinBtn','batchUnpinBtn','batchMergeBtn'].forEach(id=>{ const b=$(id); if(b) b.style.opacity=on; });
}
$('batchBtn').onclick=()=>setBatch(!batchMode);
$('batchExitBtn').onclick=()=>setBatch(false);
$('batchAll').onchange=e=>{
  const ids=currentVisibleIds();
  if(e.target.checked) ids.forEach(id=>batchSel.add(id)); else batchSel.clear();
  renderItems(); updateBatchBar();
};
$('batchDelBtn').onclick=()=>{
  if(!batchSel.size){ toast('先勾选要删除的内容'); return; }
  const n=batchSel.size;
  pushUndo('批量删除 '+n+' 条');
  batchSel.forEach(id=>{
    const it=state.items.find(x=>x.id===id);
    if(it) trashItem(it,true);
  });
  save(); batchSel.clear();
  setBatch(false);
  renderTrashCount();
  toast('已把 '+n+' 条移入回收站，可随时还原');
};
/* 批量移动 / 批量打标签 / 批量置顶 */
function batchTargets(){ return [...batchSel].map(id=>state.items.find(x=>x.id===id)).filter(Boolean); }
$('batchMoveBtn').onclick=async()=>{
  if(!batchSel.size){ toast('先勾选要移动的内容'); return; }
  const n=batchSel.size;
  const fid=await uiPickFolder('把选中的 '+n+' 条移动到…',{root:true});
  if(!fid) return;
  const target=fid==='__root__'?null:fid;
  pushUndo('批量移动 '+n+' 条');
  batchTargets().forEach(it=>{ it.folderId=target; it.updatedAt=Date.now(); });
  save(); batchSel.clear(); setBatch(false);
  const f=state.folders.find(x=>x.id===target);
  toast('已移动 '+n+' 条'+(f?'到「'+f.name+'」':'到未分类'));
};
$('batchTagBtn').onclick=async()=>{
  if(!batchSel.size){ toast('先勾选要打标签的内容'); return; }
  const n=batchSel.size;
  const s=await uiPrompt({title:'批量打标签',label:'标签用空格或逗号分隔，会追加到已有标签上',value:'',max:80,required:true});
  const tags=String(s||'').split(/[\s,，、]+/).filter(Boolean);
  if(!tags.length) return;
  pushUndo('批量打标签 '+n+' 条');
  batchTargets().forEach(it=>{ it.tags=[...new Set([...(it.tags||[]),...tags])]; it.updatedAt=Date.now(); });
  save();
  toast('已给 '+n+' 条加上 '+tags.map(t=>'#'+t).join(' '));
  renderItems();
};
$('batchPinBtn').onclick=()=>{
  if(!batchSel.size){ toast('先勾选要置顶的内容'); return; }
  const n=batchSel.size;
  pushUndo('批量置顶 '+n+' 条');
  batchTargets().forEach(it=>{ it.pinned=true; it.updatedAt=Date.now(); });
  save(); renderItems(); updateBatchBar();
  toast('已置顶 '+n+' 条');
};
$('batchUnpinBtn').onclick=()=>{
  const targets=batchTargets().filter(it=>it.pinned);
  if(!targets.length){ toast('勾选的内容里没有置顶的'); return; }
  pushUndo('批量取消置顶 '+targets.length+' 条');
  targets.forEach(it=>{ it.pinned=false; it.updatedAt=Date.now(); });
  save(); renderItems(); updateBatchBar();
  toast('已取消置顶 '+targets.length+' 条');
};
/* 批量模式下：点卡片任意位置即切换选中 */
$('items').addEventListener('click',e=>{
  if(!batchMode) return;
  const cb=e.target.closest('input[data-bid]');
  if(cb){ toggleBatchSel(cb.dataset.bid,cb.checked); return; }
  if(e.target.closest('a,button,[data-goto]')) return;
  const card=e.target.closest('.card,.home-note-row');
  if(card&&card.dataset.id){
    const on=!batchSel.has(card.dataset.id);
    const cb2=card.querySelector('input[data-bid]');
    toggleBatchSel(card.dataset.id,on,cb2);
  }
});
/* 批量上传：统一入口，图片→照片、其他→文件 */
$('uploadBtn').onclick=()=>$('anyInput').click();
$('anyInput').addEventListener('change',async e=>{
  const files=[...e.target.files]; e.target.value='';
  if(files.length) await ingestImages(files);
});

