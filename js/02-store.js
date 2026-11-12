/* ============================================================
   Pocket · 数据层与持久化
   localStorage 键名、默认收纳夹、状态读写与防抖保存、变更签名
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 数据层 ================= */
/* nodata 模式用独立键：即使和本人站点同域打开，也不会读到已有数据 */
const LS_KEY=NO_DATA?'treasureBoxData_blank_v1':'treasureBoxData_v1';
const ICONS=['🗂','💭','🧠','📷','📁','🔗','🌊','🌱','⭐','🎯','📚','💡','🎧','🍰','🧸','🐧','☁️','🍂'];
const BANNERS=[['#fdecc8','#d3e5ef'],['#e8deee','#d3e5ef'],['#ffe2dd','#fdecc8'],['#d3e5ef','#e2f0d5'],['#f1e8e6','#d3e5ef'],['#e8e8e8','#d3e5ef']];

function defaultState(){
  const mk=(name,icon)=>({id:uid(),name,icon,cover:Math.floor(Math.random()*BANNERS.length)});
  const f1=mk('收集箱','🗂'),f2=mk('碎碎念','💭'),f3=mk('思考笔记','🧠'),f4=mk('随手拍','📷'),f5=mk('文件收纳','📁');
  return {
    version:1, spaceName:'OVOvv', homeCols:4,
    folders:[f1,f2,f3,f4,f5],
    items:[],
    dark:false,
    profile:{avatar:null, avatarEmoji:'🧸', bgImage:null, pageBg:false},
    gh:{owner:'', repo:'', branch:'main', dir:'treasure-box', token:'', autoSync:true}
  };
}
let state, SEEDED=false;
if(SHARED&&window.__BOX_DATA__){
  state=window.__BOX_DATA__;   /* 分享版：使用打包时内嵌的数据 */
}else{
  try{ state=JSON.parse(localStorage.getItem(LS_KEY))||null; }catch(e){ state=null; }
  /* 首次访问（本机还没有任何数据）：用随站点分发的初始数据，用户上传的文件由
     10-idb-images.js 从 SEED_ASSETS 预热并落库。已有数据一律不覆盖。 */
  if(!state&&SEED_STATE){
    state=JSON.parse(JSON.stringify(SEED_STATE));
    SEEDED=true; window.__SEEDED__=true;
  }
  if(!state) state=defaultState();
}
if(!state.folders||!state.folders.length) state=defaultState();
/* 迁移：补齐新增字段（不改 LS_KEY，老数据无缝升级） */
if(!state.profile) state.profile={avatar:null, avatarEmoji:'🧸', bgImage:null, pageBg:false};
if(state.profile.avatarEmoji==null) state.profile.avatarEmoji='🧸';
if(!state.gh) state.gh={owner:'', repo:'', branch:'main', dir:'treasure-box', token:'', autoSync:true};
if(!state.homeCols) state.homeCols=4;
/* 多级文件夹迁移 */
state.folders.forEach(f=>{
  if(f.parentId===undefined) f.parentId=null;
  /* 分类此前没有时间戳 → 多端合并时永远判给本地，云端的「新建/改名/移动」全被丢掉。
     这里补齐 created / updatedAt（旧数据只能给 0，表示「不知道何时改的」，绝不会凭空赢过云端较新的版本） */
  if(typeof f.created!=='number') f.created=f.updatedAt||state.savedAt||0;
  if(typeof f.updatedAt!=='number') f.updatedAt=f.created||0;
});
/* 孤儿分类修复：父夹已被删（墓碑生效后不再下发）时，把子夹挂回顶级，避免它在侧栏里凭空消失 */
state.folders.forEach(f=>{
  if(f.parentId&&!state.folders.some(x=>x.id===f.parentId)) f.parentId=null;
});
/* 回收站 / 最近阅读 / 排序方式 / 横幅 迁移 */
if(!Array.isArray(state.trash)) state.trash=[];
if(!Array.isArray(state.recent)) state.recent=[];
if(!state.sortMode) state.sortMode='time';
if(!state.bannerKeys||typeof state.bannerKeys!=='object') state.bannerKeys={};
/* 同步 / 合并相关迁移 */
if(!state.deviceId) state.deviceId=uid();
if(typeof state.rev!=='number') state.rev=1;
if(typeof state.savedAt!=='number') state.savedAt=Date.now();
if(!state.tomb||typeof state.tomb!=='object') state.tomb={};      /* 删除墓碑：id → 删除时间，防止合并时复活 */
if(!state.maxFileMB) state.maxFileMB=50;                          /* 单文件上限（MB），可在设置里调整 */
if(!state.roamFolder) state.roamFolder='all';
/* 阅读器划线标注（第二十九批）：条目上可选的 marks 数组
     {id, style:'hl'|'ul'|'wavy', q:原文, before/after:定位上下文, note:批注, created}
   只补字段、不改已有数据：没有 marks 的条目保持原样，不写入空数组，避免备份体积膨胀。 */
state.items.forEach(it=>{
  if(it.marks===undefined) return;
  if(!Array.isArray(it.marks)){ it.marks=[]; return; }
  it.marks=it.marks.filter(m=>m&&typeof m.q==='string'&&m.q.trim())
    .map(m=>({
      id:m.id||uid(),
      style:(m.style==='ul'||m.style==='wavy')?m.style:'hl',
      q:m.q,
      before:typeof m.before==='string'?m.before:'',
      after:typeof m.after==='string'?m.after:'',
      note:typeof m.note==='string'?m.note:'',
      created:typeof m.created==='number'?m.created:0
    }));
});
/* 标签迁移：早期数据与随站点分发的种子数据里，tags 可能存成 JSON 字符串（如 "[]"），
   而搜索语法、标签栏、统计看板都按数组用（forEach / join / includes）。
   这里统一成字符串数组，幂等；顺手去掉空标签与首尾空格。 */
state.items.forEach(it=>{
  const t=it.tags;
  if(typeof t==='string'){
    let arr=null;
    try{ const p=JSON.parse(t); if(Array.isArray(p)) arr=p; }catch(e){}
    if(!arr) arr=t.split(/[,，;；\s]+/);
    it.tags=arr.map(x=>String(x).trim()).filter(Boolean);
    return;
  }
  if(Array.isArray(t)){ it.tags=t.map(x=>String(x).trim()).filter(Boolean); return; }
  it.tags=[];
});
/* 种子数据立刻写入本地：刷新后不再需要重新下载 data/seed.js，
   也不会因为「本地仍为空」被反复注入。之后的编辑照常走 save()。 */
if(SEEDED){
  try{
    localStorage.setItem(LS_KEY,JSON.stringify(state));
    localStorage.setItem('tb_seed_pending','1');   /* 附件还没落库前，下次仍需加载种子 */
    /* 来自线上分享快照：记下快照时间与「内容摘要」，js/47-share-fresh.js 据此自动跟进站长更新。
       不能用 rev 判断访客是否编辑过——页面加载时应用会自发 save() 把 rev +1；内容摘要只随
       真实的增删改变化（spaceName / 分类 / 条目核心字段），加载期的自动保存不影响它。 */
    if(window.__BOX_SHARE_SNAP__){
      localStorage.setItem('tb_share_ts',String(window.__BOX_SHARE_SNAP__.ts||0));
      localStorage.setItem('tb_share_dig',shareDigest(state));
    }
  }catch(e){}
}
/* 内容摘要：只覆盖用户真正会编辑的核心字段，rev / savedAt / updatedAt / 主页板块等
   自动字段一概不计入。两个 state 摘要相同 ⇔ 用户内容层面没动过。 */
function shareDigest(s){
  try{
    return JSON.stringify([
      s.spaceName||'',
      (s.folders||[]).map(f=>[f.id,f.name,f.parentId||null]),
      (s.items||[]).map(i=>[i.id,i.folderId,i.type,String(i.text||'').slice(0,3000),i.fileName||'',i.title||'',i.url||'',
        (i.attachments||[]).map(a=>a&&a.key).join(','),JSON.stringify(i.images||[]),
        (i.marks||[]).map(m=>m.id+m.style+(m.note||'')).join('|')])
    ]);
  }catch(e){ return String(Date.now()); }
}

/* 变更打时间戳：用于多端合并时判断「谁更新」（每项独立 updatedAt） */
function itemSig(it){
  return JSON.stringify([it.folderId,it.type,it.text,it.fileName,it.title,it.url,it.pinned,
    it.editable,it.cloudOnly,it.tags,it.attachments&&it.attachments.map(a=>a.key+a.name+a.size),
    (it.plain||'').length,it.order,
    /* 划线标注也算正文变更：否则多端合并时「只加了标注」会被当成没改过而丢掉 */
    (it.marks||[]).map(m=>m.id+m.style+m.q+(m.note||'')).join('|')]);
}
const sigMap=new Map();
state.items.forEach(it=>sigMap.set(it.id,itemSig(it)));
/* 分类签名：名字/图标/封面/父级任一变化都算「改过」→ 盖 updatedAt，合并时才能判断谁更新 */
function folderSig(f){
  return JSON.stringify([f.name,f.icon,f.cover,f.parentId||null]);
}
const sigFMap=new Map();
state.folders.forEach(f=>sigFMap.set(f.id,folderSig(f)));
function stampChanged(){
  const now=Date.now(); let n=0;
  state.items.forEach(it=>{
    const s=itemSig(it), prev=sigMap.get(it.id);
    if(prev!==s){ it.updatedAt=now; it.blobRev=now; sigMap.set(it.id,s); n++; }   /* blobRev：本地缓存的文件正文对应到的版本 */
  });
  state.folders.forEach(f=>{
    const s=folderSig(f), prev=sigFMap.get(f.id);
    if(prev!==s||prev===undefined){ f.updatedAt=now; sigFMap.set(f.id,s); n++; }
  });
  return n;
}
let saveTimer=null;
function save(){
  if(SHARED) return;   /* 分享版只读，不写不同步 */
  stateVer++;          /* 任何写入都让搜索缓存失效 */
  clearTimeout(saveTimer); saveTimer=setTimeout(()=>{
    stampChanged();
    state.savedAt=Date.now(); state.rev=(state.rev||1)+1;
    try{ localStorage.setItem(LS_KEY,JSON.stringify(state)); }catch(e){ toast('本地空间不足，请清理回收站或导出备份'); }
    try{ maybeSnapshot(); }catch(e){}
    scheduleGhSync();
  },250);
}

