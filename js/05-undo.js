/* ============================================================
   Pocket · 全局撤销
   Ctrl/Cmd+Z 撤销最近 20 步操作
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 全局撤销（Ctrl/Cmd+Z，最近 20 步） ================= */
const undoStack=[];
function snapNow(){ return JSON.stringify({items:state.items,folders:state.folders,trash:state.trash||[],homeOrder:state.homeOrder||null}); }
function pushUndo(label){
  try{
    undoStack.push({label:label||'操作',snap:snapNow(),at:Date.now()});
    if(undoStack.length>20) undoStack.shift();
  }catch(e){}
}
function undoLast(){
  const u=undoStack.pop();
  if(!u){ toast('没有可撤销的操作'); return; }
  try{
    const d=JSON.parse(u.snap);
    state.items=d.items; state.folders=d.folders; state.trash=d.trash||[];
    if(d.homeOrder) state.homeOrder=d.homeOrder;
    save(); renderAll(); renderTrashCount(); updateReaderCount();
    toast('已撤销：'+u.label);
  }catch(e){ toast('撤销失败'); }
}
document.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&(e.key==='z'||e.key==='Z')&&!e.shiftKey){
    const tag=((e.target&&e.target.tagName)||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||(e.target&&e.target.isContentEditable)) return;
    if($('docEditor').classList.contains('show')||$('reader').classList.contains('show')) return;
    const dm=$('dlgMask'); if(dm&&dm.classList.contains('show')) return;
    e.preventDefault(); undoLast();
  }
  if((e.ctrlKey||e.metaKey)&&(e.key==='k'||e.key==='K')){
    const mk=$('cmdkMask');
    if(mk&&mk.classList.contains('show')){ e.preventDefault(); closeCmdk(); return; }
    if($('docEditor').classList.contains('show')) return;
    const dm=$('dlgMask'); if(dm&&dm.classList.contains('show')) return;
    e.preventDefault(); openCmdk();
  }
});

