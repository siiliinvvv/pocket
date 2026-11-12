/* ============================================================
   OVOvv · 分享数据自动跟进（访客侧）
   ------------------------------------------------------------
   仅当本机数据「来自站长推送的分享快照、且访客内容层面没改过」时，
   静默检查服务端是否有更新的快照，有则落库并刷新页面。
   是否改过用内容摘要（shareDigest）判断：rev / savedAt 等自动字段
   的变化不算编辑；访客一旦真的增删改内容，永远以访客本地为准。
   本人浏览器没有 tb_share_ts 标记，此脚本直接跳过。
   ============================================================ */
'use strict';
(function(){
  if(SHARED || NO_DATA) return;
  let code=null;
  try{ code=new URLSearchParams(location.search).get('sharecode'); }catch(e){ return; }
  if(!code) return;
  let ts=0, dig=null;
  try{
    ts=Number(localStorage.getItem('tb_share_ts'))||0;
    dig=localStorage.getItem('tb_share_dig');
  }catch(e){}
  if(!ts || dig===null) return;               /* 不是从分享快照初始化的 */
  if(shareDigest(state)!==dig) return;        /* 访客改过内容：本地优先 */
  /* 平台访问闸门只认 ?sharecode=，两个参数一起带：code 给接口，sharecode 过闸 */
  fetch('/api/share?code='+encodeURIComponent(code)+'&sharecode='+encodeURIComponent(code),{cache:'no-store'})
    .then(function(r){ return r.ok?r.json():null; })
    .then(function(j){
      if(!j||!j.state||!(Number(j.ts)>ts)) return;
      if(shareDigest(state)!==dig) return;    /* 检查期间用户编辑了：放弃 */
      (async function(){
        try{
          localStorage.setItem(LS_KEY,JSON.stringify(j.state));
          localStorage.setItem('tb_share_ts',String(j.ts));
          localStorage.setItem('tb_share_dig',shareDigest(j.state));
          const assets=j.assets||{};
          for(const k of Object.keys(assets)){
            try{ await imgSet(k,assets[k]); }catch(e){}
          }
          toast('分享数据已更新到最新版本，正在刷新…');
          setTimeout(function(){ location.reload(); },900);
        }catch(e){}
      })();
    })
    .catch(function(){});
})();
