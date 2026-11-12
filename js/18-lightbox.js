/* ============================================================
   Pocket · 灯箱看图
   大图预览、左右切换、下载原图
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 灯箱 ================= */
async function openLightbox(itemId,imgKey){
  const it=state.items.find(x=>x.id===itemId);
  if(!it||!it.images||!it.images.length) return;
  lightboxList=it.images; lightboxIdx=Math.max(0,lightboxList.indexOf(imgKey));
  await showLightbox();
}
/* 图片类型「文件」的预览（复用灯箱） */
async function openFileImage(it){
  if(!it||!it.fileKey) return;
  const u=await ensureItemLocal(it).catch(()=>null);
  if(!u){ toast('文件数据丢失，试试从云端恢复'); return; }
  lightboxList=[it.fileKey]; lightboxIdx=0;
  await showLightbox();
}
async function showLightbox(){
  const key=lightboxList[lightboxIdx];
  const url=await imgGet(key);
  if(!url){ toast('图片丢失'); return; }
  $('lbImg').src=url;
  $('lbDownload').href=url;
  $('lbDownload').download='baobaobox-'+key+'.jpg';
  $('lbIdx').textContent=(lightboxIdx+1)+' / '+lightboxList.length;
  $('lightbox').classList.add('show');
}
$('lbPrev').onclick=()=>{ lightboxIdx=(lightboxIdx-1+lightboxList.length)%lightboxList.length; showLightbox(); };
$('lbNext').onclick=()=>{ lightboxIdx=(lightboxIdx+1)%lightboxList.length; showLightbox(); };
$('lbClose').onclick=()=>$('lightbox').classList.remove('show');
$('lightbox').addEventListener('click',e=>{ if(e.target===e.currentTarget) $('lightbox').classList.remove('show'); });
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const dm=$('dlgMask');
    if(dm&&dm.classList.contains('show')){ if(typeof dm._onesc==='function') dm._onesc(); return; }
    if($('cmdkMask').classList.contains('show')){ closeCmdk(); return; }
    if($('docEditor').classList.contains('show')){
      if($('edFind').classList.contains('show')){ edFindClose(); return; }
      closeDocEditor(); return;
    }
    if(batchMode){ setBatch(false); return; }
    hideWikiPick();
    $('lightbox').classList.remove('show'); $('modalMask').classList.remove('show'); $('settingsMask').classList.remove('show'); $('reader').classList.remove('show');
  }
  if($('lightbox').classList.contains('show')){
    if(e.key==='ArrowLeft') $('lbPrev').click();
    if(e.key==='ArrowRight') $('lbNext').click();
  }
});

