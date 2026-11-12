/* ============================================================
   Pocket · 侧边栏动作
   新建收纳夹、重命名空间、移动端抽屉开合
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 侧边栏动作 ================= */
$('spaceName').addEventListener('click',async()=>{
  const v=await uiPrompt({title:'重命名空间',label:'空间名称',value:state.spaceName,max:30,required:true});
  if(v&&v.trim()){ state.spaceName=v.trim(); save(); renderAll(); }
});
$('addFolderBtn').onclick=async()=>{
  const name=await uiPrompt({title:'新建收纳夹',label:'名字',max:24,required:true});
  if(!name) return;
  const now=Date.now();
  const f={id:uid(),name:name.trim(),icon:ICONS[Math.floor(Math.random()*ICONS.length)],cover:Math.floor(Math.random()*BANNERS.length),parentId:null,created:now,updatedAt:now};
  state.folders.push(f); sigFMap.set(f.id,folderSig(f)); currentFolderId=f.id; searchQuery=''; $('searchInput').value='';
  save(); renderAll();
};
function cycleIcon(){
  const f=curFolder(); if(!f||searchQuery) return;
  f.icon=ICONS[(ICONS.indexOf(f.icon)+1)%ICONS.length];
  f.updatedAt=Date.now();
  save(); renderAll();
}
$('crumbIcon').onclick=cycleIcon;
$('heroIcon').onclick=cycleIcon;
$('crumbName').addEventListener('click',async()=>{
  /* 主页顶栏显示的是空间名称（第三十一批）：点它直接改空间名 */
  if(currentFolderId===HOME_ID&&!searchQuery){
    const v=await uiPrompt({title:'重命名空间',label:'空间名称',value:state.spaceName,max:30,required:true});
    if(v&&v.trim()){ state.spaceName=v.trim(); save(); renderAll(); }
    return;
  }
  const f=curFolder(); if(!f||searchQuery) return;
  const v=await uiPrompt({title:'重命名收纳夹',label:'名字',value:f.name,max:24,required:true});
  if(v&&v.trim()){ pushUndo('重命名收纳夹'); f.name=v.trim(); f.updatedAt=Date.now(); save(); renderAll(); }
});

