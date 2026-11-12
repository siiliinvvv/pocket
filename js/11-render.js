/* ============================================================
   Pocket · 渲染与文件夹
   主页/卡片/列表/画廊渲染、面包屑、多级文件夹辅助函数
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 状态与渲染 ================= */
const HOME_ID='__home__';
let currentFolderId=HOME_ID;
let viewMode=localStorage.getItem('tb_view')||'gallery';
if(viewMode==='list') viewMode='gallery';   /* 列表视图已移除，旧记录迁移为画廊 */
let searchQuery='', activeTag=null;
let stateVer=1;                 /* 数据版本号：任何写入都会 +1，用于搜索缓存失效 */
let lastSearch=null;            /* {ver,q,res,hits} 单槽缓存，避免同一查询重复全量扫描 */
let lightboxList=[], lightboxIdx=0;
let editingItemId=null;
/* 批量管理 */
let batchMode=false;
const batchSel=new Set();

const $=id=>document.getElementById(id);
function curFolder(){ return state.folders.find(f=>f.id===currentFolderId); }

/* ===== 多级文件夹辅助 ===== */
function folderDepth(f){ let d=0,p=f.parentId; while(p){ const pf=state.folders.find(x=>x.id===p); if(!pf) break; d++; p=pf.parentId; } return d; }
function folderPath(f){ const parts=[f.name]; let p=f.parentId; while(p){ const pf=state.folders.find(x=>x.id===p); if(!pf) break; parts.unshift(pf.name); p=pf.parentId; } return parts; }
function childFolders(pid){ return state.folders.filter(f=>(f.parentId||null)===(pid||null)); }
/* 深度优先排序：父夹在前、子夹紧随，保证侧边栏/主页顺序正确 */
function sortedFolders(){
  const out=[];
  (function walk(pid){ childFolders(pid).forEach(f=>{ out.push(f); walk(f.id); }); })(null);
  state.folders.forEach(f=>{ if(!out.includes(f)) out.push(f); });
  return out;
}
/* 折叠状态（持久化，记录「已展开」的收纳夹；空集合 = 全部收起，即初始默认不展开） */
const FOLD_KEY='tb_folded_v1';
let foldOpen=new Set();
try{ foldOpen=new Set(JSON.parse(localStorage.getItem(FOLD_KEY)||'[]')); }catch(e){ foldOpen=new Set(); }
function saveFold(){ try{ localStorage.setItem(FOLD_KEY,JSON.stringify([...foldOpen])); }catch(e){} }
function hasKids(fid){ return state.folders.some(f=>f.parentId===fid); }

function renderSidebar(){
  const list=$('folderList'); list.innerHTML='';
  /* 主页入口（置顶）：也作为拖拽落点——文件夹拖到这里=移到顶级 */
  const home=document.createElement('div');
  home.className='folder-item'+(currentFolderId===HOME_ID&&!searchQuery?' active':'');
  home.dataset.fid='__root__';
  home.title='文件夹拖到这里 = 移到顶级分类';
  home.innerHTML='<span class="f-icon">🏠</span><span class="f-name">主页</span>';
  home.onclick=()=>{ currentFolderId=HOME_ID; searchQuery=''; $('searchInput').value=''; activeTag=null; renderAll(); closeSidebarMobile(); };
  list.appendChild(home);
  const renderTree=(pid,depth)=>{
    childFolders(pid).forEach(f=>{
      if(f.parentId&&!foldOpen.has(f.parentId)) return; /* 父级收起时不渲染后代 */
      const n=state.items.filter(it=>it.folderId===f.id).length;
      const kids=hasKids(f.id);
      const div=document.createElement('div');
      div.className='folder-item'+(f.id===currentFolderId&&!searchQuery?' active':'');
      div.style.paddingLeft=(10+depth*16)+'px';
      div.dataset.fid=f.id;
      div.draggable=true;
      div.title='拖拽可移动此分类：拖到其他分类上边缘 / 下边缘 = 调整顺序，拖到中间 = 变成其子分类，拖到主页 = 移到顶级';
      div.innerHTML='<span class="f-fold'+(kids&&foldOpen.has(f.id)?' open':'')+(kids?'':' empty')+'" title="展开 / 折叠">▶</span>'+
        '<span class="f-icon">'+esc(f.icon)+'</span><span class="f-name">'+esc(f.name)+'</span>'+
        (n?'<span class="f-count">'+n+'</span>':'')+
        '<span class="f-move" title="移动此分类到…" role="button" aria-label="移动分类">⇄</span>'+
        '<span class="f-add" title="在此分类下新建子分类">＋</span>'+
        (state.folders.length>1?'<span class="f-del" title="删除收纳夹">✕</span>':'');
      div.onclick=(e)=>{
        if(e.target.classList.contains('f-del')){ deleteFolder(f.id); return; }
        if(e.target.classList.contains('f-move')){ moveFolderTo(f.id); return; }
        if(e.target.classList.contains('f-add')){ addSubFolder(f.id); return; }
        if(e.target.classList.contains('f-fold')&&kids){ foldOpen.has(f.id)?foldOpen.delete(f.id):foldOpen.add(f.id); saveFold(); renderSidebar(); return; }
        currentFolderId=f.id; searchQuery=''; $('searchInput').value=''; activeTag=null; renderAll(); closeSidebarMobile();
      };
      list.appendChild(div);
      if(kids&&foldOpen.has(f.id)) renderTree(f.id,depth+1);
    });
  };
  renderTree(null,0);
}
/* 分类移动：显式入口（触屏友好），并检查循环嵌套 */
function folderIsDescendant(candId,ancestorId){
  let p=candId; const seen=new Set();
  while(p){
    if(p===ancestorId) return true;
    if(seen.has(p)) break;
    seen.add(p);
    const f=state.folders.find(x=>x.id===p);
    p=f?f.parentId:null;
  }
  return false;
}
async function moveFolderTo(fid){
  const f=state.folders.find(x=>x.id===fid); if(!f) return;
  const target=await uiPickFolder('把「'+f.name+'」移动到…',{root:true});
  if(!target) return;
  const newParent=target==='__root__'?null:target;
  if(newParent===fid||(newParent&&folderIsDescendant(newParent,fid))){
    toast('不能移动到它自己或它的子分类里');
    return;
  }
  if((f.parentId||null)===newParent){ toast('它已经在这个位置了'); return; }
  pushUndo('移动分类「'+f.name+'」');
  f.parentId=newParent;
  f.updatedAt=Date.now();
  if(newParent) foldOpen.add(newParent);
  saveFold(); save(); renderAll();
  const p=state.folders.find(x=>x.id===newParent);
  toast('已把「'+f.name+'」移到'+(p?'「'+p.name+'」下':'顶级'));
}
async function addSubFolder(pid){
  const name=await uiPrompt({title:'新建子分类',label:'名字',max:24,required:true});
  if(!name) return;
  const now=Date.now();
  const f={id:uid(),name:name.trim(),icon:ICONS[Math.floor(Math.random()*ICONS.length)],cover:Math.floor(Math.random()*BANNERS.length),parentId:pid,created:now,updatedAt:now};
  state.folders.push(f); sigFMap.set(f.id,folderSig(f)); currentFolderId=f.id; searchQuery=''; $('searchInput').value='';
  save(); renderAll(); toast('已创建子分类');
}
async function deleteFolder(fid){
  const f=state.folders.find(x=>x.id===fid);
  if(!f) return;
  if(state.folders.length<=1){ toast('至少保留一个收纳夹'); return; }
  const kids=state.folders.filter(x=>x.parentId===fid);
  const n=state.items.filter(it=>it.folderId===fid).length;
  const target=state.folders.find(x=>x.id!==fid);
  let msg='确定删除收纳夹「'+f.name+'」吗？'+(n?('其中 '+n+' 条内容将移动到「'+target.name+'」，不会丢失。'):'');
  if(kids.length) msg+='\n注意：它的 '+kids.length+' 个子分类将上移一级（内容不变）。';
  if(!await uiConfirm({title:'删除收纳夹「'+f.name+'」',msg:msg,count:n?(n+' 条内容'+(kids.length?(' · '+kids.length+' 个子分类'):'')):'',danger:true,okText:'删除'})) return;
  pushUndo('删除收纳夹「'+f.name+'」');
  state.items.forEach(it=>{ if(it.folderId===fid) it.folderId=target.id; });
  kids.forEach(k=>{ k.parentId=f.parentId||null; k.updatedAt=Date.now(); });
  state.folders=state.folders.filter(x=>x.id!==fid);
  state.tomb['f:'+fid]=Date.now();
  if(currentFolderId===fid) currentFolderId=HOME_ID;
  save(); renderAll(); toast('已删除「'+f.name+'」');
}

