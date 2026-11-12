/* ============================================================
   Pocket · 备份导出导入
   JSON 备份的导出与恢复
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 备份：导出 / 导入 ================= */
async function exportBackup(){
  toast('正在打包照片…');
  try{
    const urls=await imgAll();
    const keys=[];
    state.items.forEach(it=>(it.images||[]).forEach(k=>keys.push(k)));
    const db=await idbOpen();
    const kv=await new Promise((res,rej)=>{
      const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();
      rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error);
    });
    const pairs=[];
    for(const k of kv){ const u=await imgGet(k); if(u) pairs.push({id:k,url:u}); }
    const payload={app:'treasureBox',version:1,exportedAt:new Date().toISOString(),state,images:pairs};
    const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='Pocket备份-'+new Date().toISOString().slice(0,10)+'.json';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),4000);
    toast('备份已导出（含 '+pairs.length+' 张照片）');
  }catch(err){ toast('导出失败：'+err.message); }
}
$('fabExport').onclick=()=>{ closeFab(); exportBackup(); };
$('fabImport').onclick=()=>{ closeFab(); $('importFile').click(); };
$('importFile').addEventListener('change',async e=>{
  const file=e.target.files[0]; e.target.value='';
  if(!file) return;
  try{
    const text=await file.text();
    const payload=JSON.parse(text);
    if(!payload||payload.app!=='treasureBox'||!payload.state) throw new Error('不是有效的 Pocket 备份');
    if(!await uiConfirm({title:'导入备份',msg:'导入将覆盖当前全部内容。',count:state.items.length+' 条内容',danger:true,okText:'覆盖导入'})) return;
    pushUndo('导入备份');
    /* 清掉旧图片 */
    state.items.forEach(it=>(it.images||[]).forEach(k=>imgDel(k).catch(()=>{})));
    (payload.images||[]).forEach(p=>{ if(p&&p.id&&p.url) imgSet(p.id,p.url).catch(()=>{}); });
    state=payload.state;
    if(!state.folders||!state.folders.length) state=defaultState();
    currentFolderId=state.folders[0].id; searchQuery=''; activeTag=null; $('searchInput').value='';
    localStorage.setItem(LS_KEY,JSON.stringify(state));
    applyDark(); renderAll();
    toast('导入完成：'+state.items.length+' 条');
  }catch(err){ toast('导入失败：'+err.message); }
});

