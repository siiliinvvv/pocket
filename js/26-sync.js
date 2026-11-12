/* ============================================================
   Pocket · 多端同步
   可靠上传、远程变更检测、逐条合并、轮询与自检
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 同步：可靠上传 + 远程变更检测 + 多端合并 ================= */
const GH_META_KEY='tb_gh_meta_v1';
function ghMeta(){ try{ return JSON.parse(localStorage.getItem(GH_META_KEY)||'{}')||{}; }catch(e){ return {}; } }
function setGhMeta(patch){ try{ localStorage.setItem(GH_META_KEY,JSON.stringify(Object.assign(ghMeta(),patch))); }catch(e){} }

let ghTimer=null, ghBusy=false, ghDirty=false, ghPollTimer=null, ghLastErr='';
function scheduleGhSync(delay){
  if(!ghReady()||!state.gh.autoSync) return;
  if(ghBusy){ ghDirty=true; return; }
  updateSyncLine('busy','有改动，稍后自动同步…');
  clearTimeout(ghTimer);
  ghTimer=setTimeout(()=>ghSyncAll('自动同步'),delay||1500);
}
/* 读云端 state.json（兼容 >1MB 用 git blob 取内容） */
async function ghRemoteRead(){
  const j=await ghJSON('GET','/contents/'+encodePath(ghPath('state.json'))+'?ref='+encodeURIComponent(ghBranch()));
  let b64=(j.content||'').replace(/\s/g,'');
  if(!b64&&j.git_url){
    const bl=await ghJSON('GET','',null,j.git_url);
    b64=(bl.content||'').replace(/\s/g,'');
  }
  if(!b64) return null;
  const payload=JSON.parse(b64ToUtf8(b64));
  if(!payload||!payload.folders) return null;
  return {sha:j.sha||null,payload:payload};
}
/* 合并：逐条取「更新时间较新」的版本；墓碑（删除记录）优先于旧数据，避免已删条目被别的设备复活 */
function mergeState(local,remote){
  const out=JSON.parse(JSON.stringify(local));
  const tomb=Object.assign({},local.tomb||{});
  Object.keys(remote.tomb||{}).forEach(k=>{ tomb[k]=Math.max(tomb[k]||0,remote.tomb[k]||0); });
  /* 清理 90 天前的墓碑，避免无限增长 */
  const cut=Date.now()-90*86400000;
  Object.keys(tomb).forEach(k=>{ if((tomb[k]||0)<cut) delete tomb[k]; });
  out.tomb=tomb;
  const pickNewer=(l,r,tkey)=>{
    if(!l) return r; if(!r) return l;
    return ((r[tkey]||r.created||0)>(l[tkey]||l.created||0))?r:l;
  };
  /* 历史数据里分类没有时间戳（都迁移成 0）→ 谁都不知道谁新。这时改用「整体保存时间」判方向：
     云端整箱保存得比本地晚，就认为云端那套分类（改名/移动）是后来的。只要有一端带了时间戳，仍按时间戳走。 */
  const remoteFresher=(remote.savedAt||0)>(local.savedAt||0);
  const mergeList=(ll,rr,kind)=>{
    const lm=new Map((ll||[]).map(x=>[x.id,x])), rm=new Map((rr||[]).map(x=>[x.id,x]));
    const list=[];
    new Set([...lm.keys(),...rm.keys()]).forEach(id=>{
      const l=lm.get(id), r=rm.get(id);
      let win=pickNewer(l,r,'updatedAt');
      if(kind==='f'&&l&&r&&win===l&&remoteFresher&&folderSig(l)!==folderSig(r)
         &&(r.updatedAt||0)>=(l.updatedAt||0)) win=r;
      if(!win) return;
      const tk=(kind==='f')?('f:'+id):id;
      /* 注意：只有真的存在墓碑时才判删除。之前写成 (tomb[tk]||0)>=… ，当条目没有时间戳（旧数据 updatedAt=0）时
         就成了 0>=0 → 把所有旧分类当成「已删除」全丢掉，表现为「云端目录怎么都拉不下来 / 分类突然少了」 */
      const deadAt=tomb[tk]||0;
      if(deadAt&&deadAt>=(win.updatedAt||win.created||0)) return;   /* 已被删除 */
      list.push(win);
    });
    return list;
  };
  out.items=mergeList(local.items,remote.items,'i');
  out.folders=mergeList(local.folders,remote.folders,'f');
  if(!out.folders.length&&!Object.keys(tomb).some(k=>k.indexOf('f:')===0)){
    out.folders=local.folders.length?local.folders:remote.folders;   /* 兜底：不能一个分类都没有（但有删除记录时不复活） */
  }
  /* 回收站按条目 id 去重，保留最新 300 */
  const tm=new Map();
  [...(remote.trash||[]),...(local.trash||[])].forEach(t=>{ if(t&&t.item) tm.set(t.item.id,t); });
  out.trash=[...tm.values()].sort((a,b)=>(b.at||0)-(a.at||0)).slice(0,300);
  out.recent=[...new Set([...(local.recent||[]),...(remote.recent||[])])].filter(Boolean).slice(0,12);
  out.bannerKeys=Object.assign({},remote.bannerKeys||{},local.bannerKeys||{});
  out.gh=Object.assign({},remote.gh||{},local.gh||{});      /* 本地配置（含 Token）为准 */
  out.deviceId=local.deviceId;
  out.maxFileMB=local.maxFileMB||remote.maxFileMB||50;
  out.spaceName=local.spaceName||remote.spaceName;
  out.homeCols=local.homeCols||remote.homeCols;
  out.savedAt=Date.now();
  out.rev=Math.max(local.rev||1,remote.rev||1)+1;
  return out;
}
function applyMergedState(merged){
  const keepHO=state.homeOrder;
  const prevItems=new Map((state.items||[]).map(x=>[x.id,x]));
  const prevFolders=new Map((state.folders||[]).map(x=>[x.id,x]));
  state=merged;
  if(keepHO&&!state.homeOrder) state.homeOrder=keepHO;
  /* 孤儿分类修复（父夹在别处被删掉时，子夹挂回顶级，不能在侧栏里消失） */
  state.folders.forEach(f=>{ if(f.parentId&&!state.folders.some(x=>x.id===f.parentId)) f.parentId=null; });
  /* 当前停留的分类被别的设备删掉了 → 回主页，避免主区域空白让人以为「同步出问题」 */
  if(currentFolderId!==HOME_ID&&!state.folders.some(f=>f.id===currentFolderId)){
    currentFolderId=HOME_ID; searchQuery=''; activeTag=null;
    if($('searchInput')) $('searchInput').value='';
  }
  /* 多端防护：云端条目比本地缓存的文件正文新 → 标记 cacheStale（打开时优先从云端拉最新，拉不到就先用手上的，
     绝不删本地内容；上传时也不会把旧的盖回云端） */
  let staleN=0;
  state.items.forEach(it=>{
    const prev=prevItems.get(it.id);
    if(!prev||!it.fileKey) return;
    if((it.updatedAt||0)>(prev.blobRev||prev.updatedAt||prev.created||0)){
      it.cacheStale=true; staleN++;
    }
  });
  /* 分类变化统计：新增 / 删除，都要在侧栏上看得见 */
  const newFids=[];
  state.folders.forEach(f=>{ if(!prevFolders.has(f.id)) newFids.push(f.id); });
  const addedF=newFids.length;
  const lostF=[...prevFolders.keys()].filter(id=>!state.folders.some(f=>f.id===id)).length;
  sigMap.clear(); state.items.forEach(it=>sigMap.set(it.id,itemSig(it)));
  sigFMap.clear(); state.folders.forEach(f=>sigFMap.set(f.id,folderSig(f)));
  /* 新下拉到的子分类默认藏在收起的父夹里=「看不到变化」：把它自己和所有祖先都展开 */
  if(newFids.length){
    let opened=false;
    newFids.forEach(id=>{
      let p=id;
      while(p){
        if(!foldOpen.has(p)){ foldOpen.add(p); opened=true; }
        const f=state.folders.find(x=>x.id===p);
        p=f?f.parentId:null;
      }
    });
    if(opened) saveFold();
  }
  try{ localStorage.setItem(LS_KEY,JSON.stringify(state)); }catch(e){}
  applyDark(); renderAll(); renderSyncLine();
  if(staleN) toast('已更新 '+staleN+' 个文件的云端新版本（打开时自动载入）');
  return {added:addedF,removed:lostF,newFids:newFids};
}
/* 检测云端是否被别的设备改过（force=true 供上传前的合并检查使用：此时 ghBusy 已置位，需跳过该守卫） */
async function ghCheckRemote(force){
  if(!ghReady()) return {changed:false};
  if(ghBusy&&!force) return {changed:false};
  const meta=ghMeta();
  let r=null;
  try{ r=await ghRemoteRead(); }catch(e){ return {changed:false,err:e.message}; }
  if(!r) return {changed:false};
  const changed=meta.sha? (r.sha&&r.sha!==meta.sha) : ((r.payload.savedAt||0)>(meta.pushedAt||0)+800);
  return {changed:!!changed, remote:r};
}
/* 自动/手动合并云端到本地（不丢任何一边的数据） */
async function ghMergeFromCloud(manual){
  if(!ghReady()){ toast('请先配置 GitHub'); return null; }
  if(ghBusy){ ghDirty=true; return null; }
  ghBusy=true; updateSyncLine('busy','正在检查云端…');
  try{
    const r=await ghRemoteRead();
    if(!r){ updateSyncLine('','云端还没有数据'); return null; }
    const beforeItems=state.items.length, beforeFolders=state.folders.length;
    stampChanged();
    const merged=mergeState(state,r.payload);
    applyMergedState(merged);
    const addItems=Math.max(0,merged.items.length-beforeItems);
    const addFolders=Math.max(0,merged.folders.length-beforeFolders);
    updateSyncLine('ok','已与云端合并 · '+new Date().toLocaleTimeString());
    if(manual||addItems||addFolders){
      toast('已合并云端改动：+'+addItems+' 条内容'+(addFolders?('、+'+addFolders+' 个分类'):'')+(merged.items.length<beforeItems?('，同步了 '+(beforeItems-merged.items.length)+' 条删除'):''));
    }
    /* 合并结果回推，让其他设备也拿到同一份 */
    ghDirty=false;
    ghBusy=false;
    scheduleGhSync(800);
    return merged;
  }catch(err){
    updateSyncLine('err','拉取失败：'+err.message);
    if(manual) toast('拉取失败：'+err.message);
    return null;
  }finally{
    if(ghBusy){ ghBusy=false; }
  }
}
/* 冲突兜底：拉取云端 state.json，逐条合并进本地（墓碑优先），返回合并后最新内容的 base64
   只在内容真的发生变化时才提示，避免重复弹窗打扰 */
async function ghMergeRemoteThenPayload(){
  try{
    const r=await ghRemoteRead();
    if(r&&r.payload){
      const sig=st=>((st.items||[]).map(x=>x.id+'@'+(x.updatedAt||x.created||0)).join(',')+'|'+(st.folders||[]).map(x=>x.id+'@'+(x.updatedAt||x.created||0)).join(','));
      const before=sig(state);
      const merged=mergeState(state,r.payload);
      const changed=sig(merged)!==before;
      applyMergedState(merged);
      if(changed) toast('已自动合并另一台设备的改动');
    }
  }catch(e){}
  return utf8ToB64(JSON.stringify(state));
}
async function ghSyncAll(reason,skipMerge){
  if(ghBusy){ ghDirty=true; return; }
  if(!ghReady()){ updateSyncLine('','云端未配置，点击设置'); toast('请先在设置中配置 GitHub'); return; }
  ghBusy=true; updateSyncLine('busy','同步中…');
  try{
    /* 0) 先做好本地时间戳，再检查云端是否有别处的新改动 → 先合并再上传，避免互相覆盖 */
    stampChanged();
    if(!skipMerge){
      const chk=await ghCheckRemote(true);   /* force：ghBusy 已置位，跳过守卫，否则上传前合并永远不执行 */
      if(chk.changed&&chk.remote){
        const before=state.items.length;
        const merged=mergeState(state,chk.remote.payload);
        const st=applyMergedState(merged);
        const addI=Math.max(0,merged.items.length-before);
        const parts=[];
        if(addI) parts.push('+'+addI+' 条内容');
        if(st.added) parts.push('+'+st.added+' 个分类');
        if(st.removed) parts.push('−'+st.removed+' 个分类');
        if(parts.length) toast('已合并其他设备的改动：'+parts.join('、'));
      }
    }
    /* 1) 上传还没同步过的图片 / 文件 / 附件 / 头像横幅（本地已清理缓存的跳过） */
    const map=buildAssetPaths();
    const todo=[];
    for(const [k,path] of map){ if(!syncedKeys.has(k)) todo.push([k,path]); }
    let done=0;
    for(const [k,path] of todo){
      done++;
      updateSyncLine('busy','同步中… 文件 '+done+'/'+todo.length);
      const url=await imgGet(k);
      if(!url){ continue; }                       /* 仅云端（本地已清缓存）或已被删除 */
      const b64=url.split(',')[1];
      if(!b64) continue;
      await ghSaveFile(path,b64,(reason||'同步')+'：'+path);
      syncedKeys.add(k); saveSynced();
    }
    /* 2) 上传数据本体（409 时自动「拉云端→合并→用合并结果重推」，不会盖掉另一台设备的写入） */
    const stateB64=utf8ToB64(JSON.stringify(state));
    const sha=await ghSaveFile('state.json',stateB64,'Pocket 数据更新 · '+new Date().toLocaleString(),ghMergeRemoteThenPayload);
    setGhMeta({pushedAt:state.savedAt,sha:sha||null,at:Date.now(),fails:0});
    ghLastErr='';
    updateSyncLine('ok','已同步至 GitHub · '+new Date().toLocaleTimeString());
  }catch(err){
    ghLastErr=err.message;
    const msg=err.message||'';
    const fatal=/401|403|404|Token|权限|找不到|没有权限/.test(msg);
    const conflict=/409|冲突/.test(msg);
    if(conflict){
      updateSyncLine('warn','另一台设备刚写入，正在自动合并重试…');
    }else if(fatal){
      updateSyncLine('err','同步失败：'+msg+'（点击设置检查配置）');
    }else{
      updateSyncLine('warn','网络不稳，稍后自动重试（'+msg+'）');
    }
    /* 冲突 1.5 秒后快速重试；网络抖动 5 秒，连续失败退到 20 秒；认证 / 配置类错误不重试 */
    const fails=(ghMeta().fails||0)+1;
    setGhMeta({fails:fails});
    if(!fatal) setTimeout(()=>{ if(!ghBusy) ghSyncAll(conflict?'冲突重试':'重试'); },conflict?1500:(fails>2?20000:5000));
  }finally{
    ghBusy=false;
    if(ghDirty){ ghDirty=false; scheduleGhSync(); }
  }
}
/* 定时 + 回到页面时检查云端（多端同步的关键：别人的改动自动落下来） */
function startGhPoll(){
  if(ghPollTimer) clearInterval(ghPollTimer);
  ghPollTimer=setInterval(async()=>{
    if(!ghReady()||!state.gh.autoSync||ghBusy) return;
    if(document.hidden) return;
    const chk=await ghCheckRemote();
    if(chk.changed&&chk.remote&&!ghBusy){
      const before=state.items.length;
      const merged=mergeState(state,chk.remote.payload);
      const st=applyMergedState(merged);
      const bits=[];
      if(merged.items.length>before) bits.push('+'+(merged.items.length-before)+' 条');
      if(st.added) bits.push('+'+st.added+' 个分类');
      if(st.removed) bits.push('−'+st.removed+' 个分类');
      toast('检测到其他设备的改动，已自动合并'+(bits.length?('（'+bits.join('、')+'）'):''));
      ghSyncAll('合并后回传',true);
    }
  },40000);
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&ghReady()&&state.gh.autoSync) setTimeout(()=>ghMergeIfChanged('聚焦'),500);
});
window.addEventListener('focus',()=>{ if(ghReady()&&state.gh.autoSync) setTimeout(()=>ghMergeIfChanged('聚焦'),800); });
async function ghMergeIfChanged(){
  if(!ghReady()||ghBusy||!state.gh.autoSync) return;
  const chk=await ghCheckRemote();
  if(!chk.changed||!chk.remote) return;
  const before=state.items.length;
  const merged=mergeState(state,chk.remote.payload);
  const st=applyMergedState(merged);
  const bits=[];
  if(merged.items.length>before) bits.push('+'+(merged.items.length-before)+' 条');
  if(st.added) bits.push('+'+st.added+' 个分类');
  if(st.removed) bits.push('−'+st.removed+' 个分类');
  toast('已自动合并其他设备的改动'+(bits.length?('（'+bits.join('、')+'）'):''));
  ghSyncAll('合并后回传',true);
}
async function ghPull(){
  if(!ghReady()){ toast('请先配置 GitHub'); return; }
  if(!await uiConfirm({title:'覆盖式恢复',msg:'会用仓库里的数据覆盖当前本机全部内容。',count:(state.items||[]).length+' 条内容将被替换',danger:true,okText:'覆盖恢复'})) return;
  pushUndo('云端覆盖恢复');
  updateSyncLine('busy','正在从云端恢复…');
  try{
    /* 用 ghRemoteRead：state.json 大于 1MB 时 Contents API 的 content 为空，必须走 git blob 回退，
       否则会 JSON.parse('') 直接失败（这正是「从 GitHub 拉取不了数据」的主因之一） */
    const r=await ghRemoteRead();
    if(!r||!r.payload) throw new Error('云端还没有数据，或 state.json 读取失败');
    const payload=r.payload;
    if(!payload.folders) throw new Error('云端数据格式不对');
    /* 拉取全部附件 */
    const map=buildAssetPaths(payload);
    let got=0, miss=0; const gotKeys=new Set();
    for(const [k,path] of map){
      try{
        const f=await ghJSON('GET','/contents/'+encodePath(ghPath(path))+'?ref='+encodeURIComponent(payload.gh&&payload.gh.branch?payload.gh.branch:ghBranch()));
        let b64=(f.content||'').replace(/\s/g,'');
        if(!b64&&f.git_url){
          const bl=await ghJSON('GET','',null,f.git_url);
          b64=(bl.content||'').replace(/\s/g,'');
        }
        if(!b64){ miss++; continue; }
        const mime=(path.indexOf('images/')===0||path.indexOf('profile/')===0)?'image/jpeg':findMime(payload,k);
        await imgSet(k,'data:'+mime+';base64,'+b64);
        gotKeys.add(k); got++;
      }catch(e){ miss++; }
    }
    /* 只把真正拉到本机的标记为「已同步」：云端缺失的文件要保留本机缓存，且下次同步会重新上传 */
    syncedKeys=new Set([...syncedKeys,...gotKeys]); saveSynced();
    state=payload;
    if(!state.profile) state.profile={avatar:null,avatarEmoji:'🧸',bgImage:null,pageBg:false};
    if(!state.gh) state.gh={owner:'',repo:'',branch:'main',dir:'treasure-box',token:'',autoSync:true};
    if(!state.folders||!state.folders.length) state=defaultState();
    if(!state.deviceId) state.deviceId=uid();
    if(!state.tomb) state.tomb={};
    if(!state.maxFileMB) state.maxFileMB=50;
    /* 云端可能是升级前的旧数据：补齐分类时间戳，并把父夹已不存在的子夹挂回顶级 */
    state.folders.forEach(f=>{
      if(typeof f.created!=='number') f.created=f.updatedAt||state.savedAt||Date.now();
      if(typeof f.updatedAt!=='number') f.updatedAt=f.created||0;
    });
    state.folders.forEach(f=>{ if(f.parentId&&!state.folders.some(x=>x.id===f.parentId)) f.parentId=null; });
    sigMap.clear(); state.items.forEach(it=>sigMap.set(it.id,itemSig(it)));
    sigFMap.clear(); state.folders.forEach(f=>sigFMap.set(f.id,folderSig(f)));
    currentFolderId=state.folders[0].id; searchQuery=''; activeTag=null; $('searchInput').value='';
    /* 拉下来的分类要「看得见」：把有子分类的父夹展开一层，否则新子夹默认藏在收起的父夹里，看着像没变化 */
    state.folders.forEach(f=>{ if(state.folders.some(x=>x.parentId===f.id)) foldOpen.add(f.id); });
    saveFold();
    localStorage.setItem(LS_KEY,JSON.stringify(state));
    setGhMeta({pushedAt:state.savedAt,sha:null,at:Date.now()});
    applyDark(); renderAll();
    updateSyncLine('ok','已从云端恢复 · '+new Date().toLocaleTimeString());
    toast('恢复完成：'+state.items.length+' 条内容、'+state.folders.length+' 个分类，附件 '+got+' 个'+(miss?('（缺 '+miss+' 个）'):''));
  }catch(err){
    updateSyncLine('err','恢复失败：'+err.message);
    toast('恢复失败：'+err.message);
  }
}
async function ghTest(){
  if(!ghReady()){ toast('请先填写 Owner / Repo / Token'); return; }
  try{
    const repo=await ghJSON('GET','');
    await ghJSON('GET','/git/ref/heads/'+encodeURIComponent(ghBranch()));
    toast('连接成功：'+(repo.full_name||state.gh.owner+'/'+state.gh.repo)+'（分支 '+ghBranch()+'）');
  }catch(err){ toast('连接失败：'+err.message); }
}
/* 同步自检：逐项检查并把真实错误摊开，方便定位「拉不下来」到底卡在哪一步 */
async function ghDiag(){
  if(!ghReady()){ toast('请先填写 Owner / Repo / Token'); return; }
  openPanel('🩺 同步自检','逐项检查 GitHub 连接、state.json 与文件库；哪一步红了按提示处理即可。');
  const body=$('panelBody');
  const rows=[];
  const add=(name,ok,detail)=>rows.push({name:name,ok:ok,detail:detail||''});
  const draw=()=>{
    body.innerHTML=rows.map(r=>'<div class="tr-row"><div class="tr-ico">'+(r.ok===true?'✅':r.ok===false?'❌':'⏳')+'</div>'+
      '<div class="tr-main"><div class="tr-t">'+esc(r.name)+'</div><div class="tr-s" style="white-space:pre-wrap;word-break:break-all">'+esc(r.detail)+'</div></div></div>').join('')+
      (rows.some(r=>r.ok===false)?'<div class="set-hint" style="margin-top:10px">常见原因：Token 过期或无 Contents 读写权限；Owner/Repo/Branch 拼错；仓库为空；网络被拦截。改好后点「同步自检」再跑一次。</div>':'');
  };
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
  draw();
  /* 1. Token / 仓库 */
  let repoOk=false;
  try{
    const repo=await ghJSON('GET','');
    repoOk=true;
    add('仓库访问',true,(repo.full_name||'')+'　默认分支 '+(repo.default_branch||'?')+'　'+(repo.private?'私有':'公开'));
  }catch(e){ add('仓库访问',false,e.message); }
  /* 2. 分支 */
  if(repoOk){
    try{ await ghJSON('GET','/git/ref/heads/'+encodeURIComponent(ghBranch())); add('分支 '+ghBranch(),true,'已存在'); }
    catch(e){ add('分支 '+ghBranch(),false,e.message+'（分支名要和仓库里的实际分支一致，比如 main / master）'); }
  }
  /* 3. state.json */
  let payload=null;
  try{
    const j=await ghJSON('GET','/contents/'+encodePath(ghPath('state.json'))+'?ref='+encodeURIComponent(ghBranch()));
    const size=j.size||0;
    let b64=(j.content||'').replace(/\s/g,'');
    let how='Contents API';
    if(!b64&&j.git_url){ const bl=await ghJSON('GET','',null,j.git_url); b64=(bl.content||'').replace(/\s/g,''); how='Git Blob（大文件回退）'; }
    if(!b64){ add('state.json',false,'文件存在（'+fmtSize(size)+'）但读不到内容，sha='+(j.sha||'?').slice(0,8)); }
    else{
      try{
        payload=JSON.parse(b64ToUtf8(b64));
        add('state.json',true,'读取正常（'+fmtSize(size)+'，经 '+how+'）· '+(payload.items||[]).length+' 条内容 / '+(payload.folders||[]).length+' 个分类');
      }catch(e2){ add('state.json',false,'内容不是合法 JSON：'+e2.message); }
    }
  }catch(e){ add('state.json',false,/404/.test(e.message)?'云端还没有 state.json（这台设备从没同步成功过？）':e.message); }
  draw();
  /* 4. 分类（侧栏目录）对比：云端 vs 本机，一眼看出「拉没拉到」 */
  if(payload&&payload.folders){
    const cf=(payload.folders||[]), lf=(state.folders||[]);
    const cMap=new Map(cf.map(f=>[f.id,f])), lMap=new Map(lf.map(f=>[f.id,f]));
    const onlyCloud=cf.filter(f=>!lMap.has(f.id));
    const onlyLocal=lf.filter(f=>!cMap.has(f.id));
    const diffName=cf.filter(f=>{ const l=lMap.get(f.id); return l&&l.name!==f.name; });
    const parts=[];
    parts.push('云端 '+cf.length+' 个 / 本机 '+lf.length+' 个');
    if(onlyCloud.length) parts.push('只在云端：'+onlyCloud.slice(0,5).map(f=>f.name).join('、')+(onlyCloud.length>5?'…':''));
    if(onlyLocal.length) parts.push('只在本机：'+onlyLocal.slice(0,5).map(f=>f.name).join('、')+(onlyLocal.length>5?'…':''));
    if(diffName.length) parts.push('名字不同：'+diffName.slice(0,5).map(f=>f.name+'（本机 '+(lMap.get(f.id).name)+'）').join('、'));
    add('分类目录',(onlyCloud.length+onlyLocal.length+diffName.length)===0,parts.join('\n'));
  }
  /* 5. 仓库文件树 / files 目录 */
  try{
    const tree=await ghTreeList(true);
    const files=tree.filter(x=>x.type==='blob'&&/(^|\/)files\//.test(x.path));
    add('文件库',true,'仓库共 '+tree.filter(x=>x.type==='blob').length+' 个文件，其中 files/ 下 '+files.length+' 个');
    /* 5. 抽查：state 里引用的文件是否都在仓库里 */
    if(payload&&payload.items){
      const paths=new Set(tree.map(x=>x.path));
      const lack=[];
      (payload.items||[]).forEach(it=>{
        if(!it.fileKey) return;
        const p=ghPath('files/'+it.id+'.'+extOf(it.fileName));
        if(!paths.has(p)) lack.push(it.fileName||it.id);
      });
      add('文件完整性',lack.length===0,lack.length?('云端缺少 '+lack.length+' 个文件的正文：'+lack.slice(0,6).join('、')+(lack.length>6?'…':'')):'全部对得上');
    }
  }catch(e){ add('文件库',false,e.message); }
  /* 6. 本机缓存情况 */
  try{
    const withKey=(state.items||[]).filter(it=>it.fileKey);
    let cached=0;
    for(const it of withKey){ if(await imgGet(it.fileKey)) cached++; }
    const stale=(state.items||[]).filter(it=>it.cacheStale).length;
    add('本机缓存',true,withKey.length+' 个文件条目，本机有缓存 '+cached+' 个'+(stale?('，其中 '+stale+' 个标记为「云端有更新」'):''));
  }catch(e){ add('本机缓存',false,e.message); }
  draw();
}
function updateSyncLine(cls,msg){
  const el=$('syncLine'); if(!el) return;
  el.className='sync-line'+(cls?' '+cls:'');
  $('syncMsg').textContent=msg;
}
function renderSyncLine(){
  if(ghReady()) updateSyncLine(state.gh.autoSync?'ok':'','已配置 GitHub'+(state.gh.autoSync?' · 自动同步开启':' · 手动同步'));
  else updateSyncLine('','云端未配置，点击设置');
}

