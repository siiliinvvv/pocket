/* ============================================================
   Pocket · 历史快照
   整箱快照：每 3 分钟自动留档，最多 8 份可回滚
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 历史快照：最近 8 份可回滚 ================= */
const SNAP_KEY='tb_snapshots_v1';
let lastSnapAt=0;
function readSnaps(){ try{ const a=JSON.parse(localStorage.getItem(SNAP_KEY)||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; } }
function snapshotsSize(){ return readSnaps().reduce((s,x)=>s+String((x&&x.data)||'').length,0); }
function maybeSnapshot(){
  if(SHARED) return;
  const now=Date.now();
  if(now-lastSnapAt<3*6e4) return;          /* 至少间隔 3 分钟，避免频繁写入 */
  lastSnapAt=now;
  const data=JSON.stringify(state);
  if(data.length>800000) return;            /* 单份过大就不再叠加，防止撑爆浏览器存储 */
  let arr=readSnaps();
  arr.unshift({at:now,count:(state.items||[]).length,size:data.length,data:data});
  let total=0; const keep=[];
  for(const s of arr){
    const len=String((s&&s.data)||'').length;
    total+=len;
    if(keep.length<8&&total<1.8e6) keep.push(s);
  }
  try{ localStorage.setItem(SNAP_KEY,JSON.stringify(keep)); }
  catch(e){ try{ localStorage.setItem(SNAP_KEY,JSON.stringify(keep.slice(0,3))); }catch(_){} }
}
async function restoreSnapshot(i){
  const arr=readSnaps(), s=arr[i];
  if(!s||!s.data) return;
  if(!await uiConfirm({title:'回滚历史版本',msg:'将全部内容回滚到 '+new Date(s.at).toLocaleString()+' 的版本？\n当前版本会先自动备份一份。',count:(state.items||[]).length+' 条内容',okText:'回滚'})) return;
  maybeSnapshotForce();
  try{
    const next=JSON.parse(s.data);
    state=next;
    if(!Array.isArray(state.trash)) state.trash=[];
    if(!Array.isArray(state.recent)) state.recent=[];
    currentFolderId=HOME_ID; searchQuery=''; activeTag=null; if($('searchInput')) $('searchInput').value='';
    localStorage.setItem(LS_KEY,JSON.stringify(state));
    applyDark(); renderAll(); renderSyncLine();
    $('panelMask').classList.remove('show');
    toast('已回滚到 '+new Date(s.at).toLocaleTimeString());
  }catch(e){ toast('回滚失败：'+e.message); }
}
function maybeSnapshotForce(){
  const data=JSON.stringify(state);
  if(data.length>800000) return;
  const arr=readSnaps();
  arr.unshift({at:Date.now(),count:(state.items||[]).length,size:data.length,data:data});
  let total=0; const keep=[];
  for(const s of arr){ const len=String((s&&s.data)||'').length; total+=len; if(keep.length<8&&total<1.8e6) keep.push(s); }
  try{ localStorage.setItem(SNAP_KEY,JSON.stringify(keep)); }catch(e){}
}

