/* ============================================================
   Pocket · 图片存储
   IndexedDB 图片/文件读写、内存缓存、上传前压缩
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= IndexedDB（照片存储） ================= */
const DB_NAME='treasureBoxDB', STORE='images';
const imgMem=new Map(); // 内存缓存，避免重复读取
/* 第二十三批：随站点分发的附件（用户上传的文件 / 照片）。
   「刚注入种子」或「上次附件还没落库」时先灌进内存，页面立刻能打开；
   再异步写进 IndexedDB，成功后清掉待办标记，之后刷新就不必再下载 data/seed.js。 */
let __seedPending=false;
try{ __seedPending=localStorage.getItem('tb_seed_pending')==='1'; }catch(e){}
if((window.__SEEDED__||__seedPending)&&Object.keys(SEED_ASSETS).length){
  Object.keys(SEED_ASSETS).forEach(k=>imgMem.set(k,SEED_ASSETS[k]));
  (async function(){
    try{
      const db=await idbOpen();
      await new Promise((res,rej)=>{
        const tx=db.transaction(STORE,'readwrite');
        const os=tx.objectStore(STORE);
        Object.keys(SEED_ASSETS).forEach(k=>os.put(SEED_ASSETS[k],k));
        tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
      });
      try{
        localStorage.removeItem('tb_seed_pending');
        localStorage.setItem('tb_seed_assets_ready','1');
      }catch(e){}
    }catch(e){ /* 内存缓存已可用；落库失败下次会自动重试，不影响浏览 */ }
  })();
}
function idbOpen(){
  return new Promise((res,rej)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=e=>{ e.target.result.createObjectStore(STORE); };
    r.onsuccess=e=>res(e.target.result);
    r.onerror=()=>rej(r.error);
  });
}
async function imgSet(key,dataURL){
  imgMem.set(key,dataURL);
  const db=await idbOpen();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).put(dataURL,key);
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
}
async function imgGet(key){
  if(SHARED) return SHARE_ASSETS[key]!=null?SHARE_ASSETS[key]:null;   /* 分享版：从内嵌资源取 */
  if(imgMem.has(key)) return imgMem.get(key);
  const db=await idbOpen();
  return new Promise((res,rej)=>{
    const rq=db.transaction(STORE,'readonly').objectStore(STORE).get(key);
    rq.onsuccess=()=>{ if(rq.result!=null) imgMem.set(key,rq.result); res(rq.result); };
    rq.onerror=()=>rej(rq.error);
  });
}
async function imgDel(key){
  imgMem.delete(key);
  const db=await idbOpen();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    tx.objectStore(STORE).delete(key);
    tx.oncomplete=res; tx.onerror=()=>rej(tx.error);
  });
}
async function imgAll(){
  const db=await idbOpen();
  return new Promise((res,rej)=>{
    const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAll();
    rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error);
  });
}

/* 图片压缩：最长边 1400px / JPEG 0.85 */
function compressImage(file,maxEdge=1400,quality=0.85){
  return new Promise((resolve,reject)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{
      try{
        const scale=Math.min(1,maxEdge/Math.max(img.width,img.height));
        const c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(img.width*scale));
        c.height=Math.max(1,Math.round(img.height*scale));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg',quality));
      }catch(err){ reject(err); }
    };
    img.onerror=()=>{ URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src=url;
  });
}

