/* ============================================================
   Pocket · 单文件缓存
   本地缓存 ⇄ 仅云端：按需拉取与释放空间
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 单文件缓存（本地 ⇄ 云端） ================= */
function assetPathOf(key){ const map=buildAssetPaths(state); return map.get(key)||null; }
/* 仓库文件树（缓存 3 分钟）：文件改名/改扩展名后，按条目 id 找回真实路径 */
let ghTreeCache=null, ghTreeAt=0, ghTreeBranch='';
async function ghTreeList(force){
  if(!force&&ghTreeCache&&ghTreeBranch===ghBranch()&&Date.now()-ghTreeAt<180000) return ghTreeCache;
  const t=await ghJSON('GET','/git/trees/'+encodeURIComponent(ghBranch())+'?recursive=1');
  ghTreeCache=(t&&t.tree)||[]; ghTreeAt=Date.now(); ghTreeBranch=ghBranch();
  return ghTreeCache;
}
async function ghFindAssetPath(key){
  const it=(state.items||[]).find(x=>x.fileKey===key);
  if(!it) return null;
  let tree=[];
  try{ tree=await ghTreeList(); }catch(e){ return null; }
  const byId='/'+'files/'+it.id+'.';
  const byKey='/'+'files/'+key+'.';
  const hit=tree.find(x=>x.type==='blob'&&(' '+String(x.path)).indexOf(byId)>=0)||
            tree.find(x=>x.type==='blob'&&(' '+String(x.path)).indexOf(byKey)>=0);
  return hit?hit.path:null;
}
async function pullAsset(key,quiet){
  if(!ghReady()){ if(!quiet) toast('需要先在设置里配置 GitHub 云端'); return null; }
  let path=assetPathOf(key);
  if(!path){ if(!quiet) toast('云端没有这个文件的记录'); return null; }
  const tryGet=async p=>{
    const f=await ghJSON('GET','/contents/'+encodePath(ghPath(p))+'?ref='+encodeURIComponent(ghBranch()));
    let b64=(f.content||'').replace(/\s/g,'');
    if(!b64&&f.git_url){ const bl=await ghJSON('GET','',null,f.git_url); b64=(bl.content||'').replace(/\s/g,''); }
    return b64;
  };
  try{
    let b64=null, firstErr=null;
    try{ b64=await tryGet(path); }catch(e){ firstErr=e; }
    if(!b64){
      /* 文件名或扩展名改过 → 去仓库树里按条目 id 找真实路径再试一次 */
      const alt=await ghFindAssetPath(key);
      if(alt){
        /* 树里返回的是仓库内完整路径（含存储目录前缀），要先剥掉，避免 ghPath 二次拼接 */
        const dir=(state.gh.dir||'treasure-box').replace(/^\/+|\/+$/g,'');
        const rel=(dir&&alt.indexOf(dir+'/')===0)?alt.slice(dir.length+1):alt;
        if(rel!==path){
          try{ b64=await tryGet(rel); if(b64) path=rel; }catch(e2){ firstErr=firstErr||e2; }
        }
      }
    }
    if(!b64){
      if(!quiet) toast('云端没有找到该文件'+((firstErr&&firstErr.message)?('：'+firstErr.message):''));
      return null;
    }
    const isImg=/(^|\/)(images|profile|banners)\//.test(path);
    const mime=isImg?'image/jpeg':findMime(state,key);
    const dataUrl='data:'+mime+';base64,'+b64;
    await imgSet(key,dataUrl);
    syncedKeys.add(key); saveSynced();
    return dataUrl;
  }catch(e){ if(!quiet) toast('拉取失败：'+e.message); return null; }
}
/* 阅读 / 编辑 / 下载前确保本地有数据：没有就从云端拉 */
async function ensureItemLocal(it,quiet){
  if(!it||!it.fileKey) return null;
  let u=await imgGet(it.fileKey).catch(()=>null);
  /* 本地有缓存且不是「云端已更新」的旧版 → 直接用 */
  if(u&&!it.cacheStale){ if(it.cloudOnly){ it.cloudOnly=false; save(); } return u; }
  const remote=syncedKeys.has(it.fileKey)||it.cloudOnly;
  if(!remote) return u||null;   /* 从没上传过：只能用手上的（没有就是真丢了） */
  if(!quiet) toast(it.cacheStale?'云端有更新的版本，正在拉取最新…':'正在从云端拉取「'+(it.fileName||'文件')+'」…');
  const p=await pullAsset(it.fileKey,quiet);
  if(p){
    it.cacheStale=false; it.cloudOnly=false; it.cachedAt=Date.now();
    save(); renderAll();
    if(!quiet) toast('已从云端拉取到本地');
    return p;
  }
  /* 拉取失败绝不丢内容：本地有旧版就先用旧版，标记保留以便下次再试 */
  if(u){ if(!quiet) toast('云端暂时拉不到，先显示本机缓存的版本'); return u; }
  if(!quiet) toast('云端拉取失败，请检查网络或同步配置');
  return null;
}
async function clearItemCache(it){
  if(!it||!it.fileKey) return;
  if(!syncedKeys.has(it.fileKey)){ toast('这个文件还没上传到云端，清理会丢失，已阻止'); return; }
  const sz=it.fileSize?('（释放约 '+fmtSize(it.fileSize)+'）'):'';
  if(!await uiConfirm({title:'清理本机缓存',msg:'清理「'+(it.fileName||'文件')+'」的本机缓存？\n文件已存在 GitHub 云端，卡片仍保留在原位；下次阅读 / 编辑 / 下载时会自动从云端拉回。',count:sz?sz.replace(/[（）]/g,'').trim():'',okText:'清理'})) return;
  try{ await imgDel(it.fileKey); }catch(e){}
  it.cloudOnly=true; it.cachedAt=Date.now();
  save(); renderAll();
  toast('已清理本地缓存，文件仅保存在云端');
}

