/* ============================================================
   Pocket · GitHub 云端
   仓库配置、连接测试、单次上传 / 下载
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= GitHub 云端自动存储 ================= */
const SYNC_KEY='tb_gh_synced_v1';
let syncedKeys=new Set();
try{ syncedKeys=new Set(JSON.parse(localStorage.getItem(SYNC_KEY)||'[]')); }catch(e){ syncedKeys=new Set(); }
function saveSynced(){ localStorage.setItem(SYNC_KEY,JSON.stringify([...syncedKeys])); }

function ghReady(){ const g=state.gh; return !!(g.owner&&g.repo&&g.token); }
function ghBranch(){ return state.gh.branch||'main'; }
function ghPath(p){ const d=(state.gh.dir||'treasure-box').replace(/^\/+|\/+$/g,''); return d?d+'/'+p:p; }
function ghBase(){ return 'https://api.github.com/repos/'+encodeURIComponent(state.gh.owner)+'/'+encodeURIComponent(state.gh.repo); }
function encodePath(p){ return p.split('/').map(encodeURIComponent).join('/'); }
function utf8ToB64(str){ const bytes=new TextEncoder().encode(str); let bin=''; for(let i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]); return btoa(bin); }
function b64ToUtf8(b64){ const bin=atob(b64.replace(/\s/g,'')); const bytes=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i); return new TextDecoder().decode(bytes); }

const NET_RETRY_MS=[700,1800,4000];
async function ghJSON(method,endpoint,body,rawUrl){
  let lastErr=null;
  for(let attempt=0;attempt<=NET_RETRY_MS.length;attempt++){
    try{
      const opt={method:method, headers:{'Accept':'application/vnd.github+json','Authorization':'Bearer '+state.gh.token}};
      if(body!=null){ opt.headers['Content-Type']='application/json'; opt.body=JSON.stringify(body); }
      const r=await fetch(rawUrl||ghBase()+endpoint,opt);
      let j=null; try{ j=await r.json(); }catch(e){}
      if(r.ok) return j;
      let msg=(j&&j.message)||('HTTP '+r.status);
      if(r.status===401) msg='Token 无效或已过期（401）';
      else if(r.status===403) msg='没有权限：请检查 Token 是否有 Contents 读写权限（403）'+(j&&j.block&&j.block.reason?'（'+j.block.reason+'）':'');
      else if(r.status===404) msg='找不到仓库 / 分支 / 文件（404），请检查 Owner、Repo、Branch';
      else if(r.status===409) msg='另一台设备刚写入（409），将自动合并重试';
      else if(r.status===429) msg='请求过于频繁（429），稍后重试';
      /* 409 是内容冲突：重试同一份 body 毫无意义（sha 还是旧的），立即抛出让上层走「合并后重推」；
         401/403/404 属配置问题，同样不该空转 4 轮（此前 retryable 标志被自身 catch 吞掉、从未生效） */
      const retryable=(r.status>=500||r.status===429||(r.status===409&&method!=='PUT'&&method!=='PATCH'));
      const e=new Error(msg);
      if(!retryable) e.noRetry=true;
      lastErr=e;
      if(!retryable||attempt===NET_RETRY_MS.length) throw e;
    }catch(err){
      lastErr=err;
      if(err&&err.noRetry) throw err;   /* 不可重试错误立即上抛，不再空转 */
      const netErr=/Failed to fetch|NetworkError|load failed|timeout/i.test(err.message||'');
      if(attempt===NET_RETRY_MS.length) throw new Error(netErr?'网络连接失败，请检查网络后重试':err.message);
    }
    await new Promise(r=>setTimeout(r,NET_RETRY_MS[attempt]||3000));
  }
  throw lastErr||new Error('请求失败');
}

/* 小文件走 Contents API；大文件（base64 > 900KB）走 Git Data API（blob → tree → commit）；返回内容 sha（若可得）
   onConflict：409 时的合并回调（state.json 专用）——先拉云端合并进本地，再用合并后的新内容重推，绝不直接覆盖别人的写入 */
async function ghSaveFile(path,b64,message,onConflict){
  path=ghPath(path);
  if(b64.length<900*1024){
    for(let tryN=0;tryN<3;tryN++){
      let sha=null;
      try{ const ex=await ghJSON('GET','/contents/'+encodePath(path)+'?ref='+encodeURIComponent(ghBranch())); sha=ex.sha; }catch(e){}
      const body={message:message,content:b64,branch:ghBranch()};
      if(sha) body.sha=sha;
      try{
        const res=await ghJSON('PUT','/contents/'+encodePath(path),body);
        return (res&&res.content&&res.content.sha)||null;
      }catch(e){
        if(tryN<2&&/409/.test(e.message||'')){
          if(onConflict){
            try{ const nb=await onConflict(); if(nb) b64=nb; }catch(e2){}
          }
          continue;   /* 重新取 sha 再试一次 */
        }
        throw e;
      }
    }
    return null;
  }
  const blob=await ghJSON('POST','/git/blobs',{content:b64,encoding:'base64'});
  const ref=await ghJSON('GET','/git/ref/heads/'+encodeURIComponent(ghBranch()));
  const base=await ghJSON('GET','/git/commits/'+ref.object.sha);
  const tree=await ghJSON('POST','/git/trees',{base_tree:base.tree.sha,tree:[{path:path,mode:'100644',type:'blob',sha:blob.sha}]});
  const commit=await ghJSON('POST','/git/commits',{message:message,tree:tree.sha,parents:[ref.object.sha]});
  await ghJSON('PATCH','/git/ref/heads/'+encodeURIComponent(ghBranch()),{sha:commit.sha,force:false});
  return null;
}

/* 收集需要上传的附件：照片 key → images/，文件 key → files/，头像 / 背景 → profile/ */
function buildAssetPaths(st){
  st=st||state;
  const map=new Map();
  const addItemAssets=it=>{
    if(!it) return;
    (it.images||[]).forEach(k=>{ if(k) map.set(k,'images/'+k+'.jpg'); });
    if(it.fileKey) map.set(it.fileKey,'files/'+it.id+'.'+extOf(it.fileName));
  };
  (st.items||[]).forEach(addItemAssets);
  (st.trash||[]).forEach(t=>{ if(t&&t.item) addItemAssets(t.item); });   /* 回收站里的内容也要上传，否则换设备恢复后无法还原 */
  const addAtt=it=>{ if(!it) return; (it.attachments||[]).forEach(a=>{ if(a&&a.key) map.set(a.key,'files/'+a.key+'.'+extOf(a.name)); }); };
  (st.items||[]).forEach(addAtt);
  (st.trash||[]).forEach(t=>{ if(t&&t.item) addAtt(t.item); });
  const p=st.profile||{};
  if(p.avatar) map.set(p.avatar,'profile/avatar.jpg');
  if(p.bgImage) map.set(p.bgImage,'profile/bg.jpg');
  if(p.topBg) map.set(p.topBg,'profile/topbg.jpg');  Object.keys(st.bannerKeys||{}).forEach(fid=>{ const k=st.bannerKeys[fid]; if(k) map.set(k,'banners/'+encodeURIComponent(fid)+'.jpg'); });
  return map;
}
function findMime(st,key){
  for(const it of (st.items||[])){
    if(it.fileKey===key) return it.fileMime||'application/octet-stream';
    const a=(it.attachments||[]).find(x=>x.key===key);
    if(a) return a.mime||'application/octet-stream';
  }
  for(const t of (st.trash||[])){ const it=t&&t.item; if(it&&it.fileKey===key) return it.fileMime||'application/octet-stream'; }
  return 'application/octet-stream';
}

