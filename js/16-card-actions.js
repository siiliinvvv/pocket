/* ============================================================
   Pocket · 卡片操作
   打开、置顶、重命名、移动、删除等单条操作
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 交互：卡片操作 ================= */
$('items').addEventListener('click',e=>{
  /* 下级分类多 Tab 板块：切 Tab（记忆每个一级分类的上次选择） */
  const st=e.target.closest('[data-subtab]');
  if(st){
    e.preventDefault();
    const m=(()=>{ try{ return JSON.parse(localStorage.getItem('tb_subtab')||'{}'); }catch(_){ return {}; } })();
    m[currentFolderId]=st.dataset.subtab;
    try{ localStorage.setItem('tb_subtab',JSON.stringify(m)); }catch(_){}
    renderItems();
    return;
  }
  const secUp=e.target.closest('[data-secup]');
  if(secUp){ e.preventDefault(); e.stopPropagation(); moveSec(secUp.dataset.secup,-1); return; }
  const secDn=e.target.closest('[data-secdown]');
  if(secDn){ e.preventDefault(); e.stopPropagation(); moveSec(secDn.dataset.secdown,1); return; }
  const go=e.target.closest('[data-goto]');
  if(go){ currentFolderId=go.dataset.goto; searchQuery=''; $('searchInput').value=''; activeTag=null; renderAll(); $('scrollArea').scrollTop=0; return; }
  const rd=e.target.closest('[data-read]');
  if(rd){
    e.preventDefault();
    const rit=state.items.find(x=>x.id===rd.dataset.read);
    if(rit&&isImgFileName(rit.fileName)) openFileImage(rit);
    else openReader(rd.dataset.read);
    return;
  }
  const cv=e.target.closest('[data-conv]');
  if(cv){ e.preventDefault(); const cit=state.items.find(x=>x.id===cv.dataset.conv); if(cit){ cit.editable=true; save(); renderAll(); openDocEditor(cit.id); } return; }
  const edBtn=e.target.closest('[data-edit]');
  if(edBtn){ e.preventDefault(); openDocEditor(edBtn.dataset.edit); return; }
  /* 多维表格 / 画布：点卡片主体直接打开对应编辑器 */
  const og=e.target.closest('[data-opengrid]');
  if(og){ e.preventDefault(); openGridView(og.dataset.opengrid); return; }
  const oc=e.target.closest('[data-opencanvas]');
  if(oc){ e.preventDefault(); openCanvasView(oc.dataset.opencanvas); return; }
  const pull=e.target.closest('[data-pull]');
  if(pull){ e.preventDefault(); const pit=state.items.find(x=>x.id===pull.dataset.pull); if(pit) ensureItemLocal(pit); return; }
  const dl=e.target.closest('[data-dl]');
  if(dl){
    e.preventDefault();
    const k=dl.dataset.dl;
    const dit=state.items.find(x=>x.fileKey===k);
    (async()=>{
      let u=await imgGet(k).catch(()=>null);
      if(!u&&dit) u=await ensureItemLocal(dit);
      if(!u){ toast('文件数据丢失，试试从云端恢复'); return; }
      const a=document.createElement('a'); a.href=u; a.download=dl.dataset.name||'file'; a.click();
      toast('已开始下载');
    })();
    return;
  }
  const ph=e.target.closest('img[data-img],.more-cover');
  if(ph){ openLightbox(ph.dataset.item,ph.dataset.img); return; }
  /* 点 📌 图标 = 取消置顶（主页卡片 / 文字条目行都支持；已取消的再点一次重新置顶） */
  const pd=e.target.closest('.pin-dot');
  if(pd){
    const owner=pd.closest('[data-id]');
    const pit=owner&&state.items.find(x=>x.id===owner.dataset.id);
    if(pit){
      e.preventDefault(); e.stopPropagation();
      pushUndo(pit.pinned?('取消置顶「'+itemLabel(pit)+'」'):('置顶「'+itemLabel(pit)+'」'));
      pit.pinned=!pit.pinned; pit.updatedAt=Date.now();
      save(); renderAll();
      toast(pit.pinned?'已置顶':'已取消置顶');
    }
    return;
  }
  const btn=e.target.closest('.card-acts button');
  if(!btn) return;
  const card=btn.closest('.card'), id=card.dataset.id;
  const it=state.items.find(x=>x.id===id);
  if(!it) return;
  const act=btn.dataset.act;
  if(act==='pin'){ it.pinned=!it.pinned; save(); renderAll(); }
  else if(act==='del'){
    trashItem(it); save(); renderAll(); toast('已移入回收站，可在左下角还原');
  }
  else if(act==='edit'){
    if(it.type==='grid') openGridView(it.id);
    else if(it.type==='canvas') openCanvasView(it.id);
    else openEditor(it);
  }
  else if(act==='todoc') noteToDoc(it);
  else if(act==='more') showMoreMenu(btn,it);
  else if(act==='move') moveItem(it);
  else if(act==='cache'){
    if(it.cloudOnly||!it.fileKey) ensureItemLocal(it);
    else clearItemCache(it);
  }
});

async function moveItem(it){
  if(!it) return;
  const fid=await uiPickFolder('移动「'+itemLabel(it)+'」到…');
  if(!fid) return;
  const f=state.folders.find(x=>x.id===fid);
  if(!f) return;
  pushUndo('移动「'+itemLabel(it)+'」');
  it.folderId=fid; save(); renderAll(); toast('已移动到「'+f.name+'」');
}

