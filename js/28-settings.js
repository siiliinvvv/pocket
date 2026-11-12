/* ============================================================
   Pocket · 设置弹窗
   GitHub 配置、头像、背景、主题、分享、存储入口
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 设置弹窗（GitHub / 头像 / 背景） ================= */
/* Owner / Repo 脱敏开关：默认自动脱敏（打开设置弹窗即遮住，点进输入框才显示）；
   用户手动关过脱敏则尊重其选择（选择后记忆在 localStorage） */
const GH_MASK_KEY='tb_ghmask_v1';
let ghMask=null;
try{
  const saved=JSON.parse(localStorage.getItem(GH_MASK_KEY)||'null');
  if(saved&&typeof saved==='object') ghMask=Object.assign({owner:true,repo:true},saved);
}catch(e){}
if(!ghMask) ghMask={owner:true,repo:true};   /* 没有历史选择 → 默认自动脱敏 */
function applyGhMask(){
  $('maskOwner').checked=!!ghMask.owner;
  $('maskRepo').checked=!!ghMask.repo;
  $('ghOwner').type=ghMask.owner?'password':'text';
  $('ghRepo').type=ghMask.repo?'password':'text';
}
function bindGhMask(key,id){
  $(id).addEventListener('change',e=>{
    ghMask[key]=e.target.checked;
    try{ localStorage.setItem(GH_MASK_KEY,JSON.stringify(ghMask)); }catch(err){}
    applyGhMask();
  });
}
bindGhMask('owner','maskOwner');
bindGhMask('repo','maskRepo');
/* 自动脱敏：聚焦输入框时临时显示明文，失焦立即遮回 */
[['owner','ghOwner'],['repo','ghRepo']].forEach(([key,id])=>{
  const el=$(id);
  el.addEventListener('focus',()=>{ el.type='text'; });
  el.addEventListener('blur',()=>{ if(ghMask[key]) el.type='password'; });
});

/* 设置分区手风琴：把每个分区的正文包进 .sec-body，点标题展开/收起。
   第二十五批：分块卡片默认全部展开（跟参考图一致），用户手动收起过才记住收起。 */
const SETFOLD_KEY='tb_setsec_v1';
let setFold={};
try{ setFold=JSON.parse(localStorage.getItem(SETFOLD_KEY)||'{}'); }catch(e){ setFold={}; }
function initSetAcc(){
  document.querySelectorAll('#settingsMask .set-sec').forEach(sec=>{
    if(sec.dataset.acc==='1') return;
    sec.dataset.acc='1';
    const head=sec.querySelector(':scope > b');
    if(!head) return;
    const body=document.createElement('div'); body.className='sec-body';
    [...sec.children].forEach(k=>{ if(k!==head) body.appendChild(k); });
    sec.appendChild(body);
    head.classList.add('sec-head');
    head.setAttribute('role','button'); head.tabIndex=0; head.setAttribute('aria-expanded','false');
    const key=(head.textContent||'').trim();
    const setOpen=o=>{ sec.classList.toggle('open',!!o); head.setAttribute('aria-expanded',o?'true':'false'); };
    const toggle=()=>{
      const o=!sec.classList.contains('open');
      setOpen(o); setFold[key]=o;
      try{ localStorage.setItem(SETFOLD_KEY,JSON.stringify(setFold)); }catch(e){}
    };
    head.onclick=toggle;
    head.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } };
    setOpen(setFold[key]!==false);
  });
}

/* 分享版：设置弹窗一律脱敏——账号 / 仓库 / 分支 / 目录 / Token 全部遮住，且不可编辑
   （分享文件里本就不含这些数据，这里只做展示层的兜底，避免误以为能看到别人的配置） */
function maskSharedGh(){
  [['ghOwner','••••••'],['ghRepo','••••••'],['ghBranch','••••••'],['ghDir','••••••'],['ghToken','••••••']].forEach(([id,v])=>{
    const el=$(id); if(!el) return;
    el.value=v; el.type='password'; el.readOnly=true; el.disabled=true;
    el.title='分享版不包含云端配置';
  });
  ['ghTestBtn','ghDiagBtn','ghSyncBtn','ghMergeBtn','ghPullBtn','ghSaveBtn'].forEach(id=>{
    const b=$(id); if(b){ b.style.display='none'; b.disabled=true; }
  });
  const auto=$('ghAuto'); if(auto){ auto.checked=false; auto.disabled=true; }
  const hint=$('ghPathHint'); if(hint) hint.textContent='分享版不含云端路径';
  $('maskOwner').checked=true; $('maskRepo').checked=true;
}

function openSettings(){
  const ca=$('customAccent'); if(ca) ca.value=UIP.customAccent||'#5B99E2';
  const ct=$('customText'); if(ct) ct.value=UIP.customText||'#2D3A4A';
  const us=$('uiScaleSel'); if(us) us.value=String(UIP.scale||1);
  $('ghOwner').value=state.gh.owner||'';
  $('ghRepo').value=state.gh.repo||'';
  $('ghBranch').value=state.gh.branch||'main';
  $('ghDir').value=state.gh.dir||'treasure-box';
  $('ghToken').value=state.gh.token||'';
  $('ghAuto').checked=!!state.gh.autoSync;
  applyGhMask();
  if(SHARED) maskSharedGh();
  if(!SHARED){ const ph=$('ghPathHint'); if(ph) ph.textContent=(state.gh.dir||'treasure-box')+'/state.json'; }
  $('maxFileMB').value=state.maxFileMB||50;
  $('pageBgChk').checked=!!state.profile.pageBg;
  /* 分享链接偏好（27-share-export.js 里读写） */
  if(typeof syncShareRows==='function') syncShareRows();
  /* GitHub 配置行显示当前仓库；没配置过就自动展开表单 */
  const cfgVal=$('ghCfgVal');
  if(cfgVal) cfgVal.textContent=state.gh.owner?(state.gh.owner+'/'+state.gh.repo):'未配置';
  const ghForm=$('ghForm');
  if(ghForm) ghForm.classList.toggle('show',!state.gh.owner);
  applyProfile();
  initSetAcc();
  /* GitHub 还没配置时自动展开云端分区，方便第一次配置；其余分区保持上次的选择 */
  if(!state.gh.owner){
    const ghSec=document.querySelector('#settingsMask .set-sec');
    if(ghSec){ ghSec.classList.add('open'); ghSec.querySelector('.sec-head').setAttribute('aria-expanded','true'); }
  }
  $('settingsMask').classList.add('show');
  renderUsage();
}
$('customAccent').addEventListener('input',e=>{ UIP.customAccent=e.target.value; saveUIP(); applySkin(); });
$('customText').addEventListener('input',e=>{ UIP.customText=e.target.value; saveUIP(); applySkin(); });
const ctc=$('customTextClear'); if(ctc) ctc.onclick=()=>{ UIP.customText=null; saveUIP(); applySkin(); const ct=$('customText'); if(ct) ct.value='#2D3A4A'; toast('已恢复默认文字颜色'); };
$('uiScaleSel').addEventListener('change',e=>{ UIP.scale=parseFloat(e.target.value)||1; saveUIP(); applySkin(); });
const _sbBtn=document.getElementById('settingsBtn');
/* 设置入口：左侧栏「同步状态」行（始终存在）、命令面板「打开设置」；
   主页工具行的设置按钮已按用户要求移除，不再破坏主页观感。 */
if(_sbBtn) _sbBtn.onclick=openSettings;
$('syncLine').onclick=openSettings;
$('settingsClose').onclick=()=>$('settingsMask').classList.remove('show');
$('shareExportBtn').onclick=openSharePanel;
$('settingsMask').addEventListener('click',e=>{ if(e.target===e.currentTarget) $('settingsMask').classList.remove('show'); });

$('ghSaveBtn').onclick=()=>{
  state.gh.owner=$('ghOwner').value.trim();
  state.gh.repo=$('ghRepo').value.trim();
  state.gh.branch=$('ghBranch').value.trim()||'main';
  state.gh.dir=$('ghDir').value.trim()||'treasure-box';
  state.gh.token=$('ghToken').value.trim();
  state.gh.autoSync=$('ghAuto').checked;
  const mb=parseInt($('maxFileMB').value,10);
  if(mb) state.maxFileMB=Math.min(90,Math.max(5,mb));
  save(); renderSyncLine();
  const ph2=$('ghPathHint'); if(ph2) ph2.textContent=state.gh.dir+'/state.json';
  startGhPoll();
  toast('已保存配置'+(state.gh.autoSync?'，自动同步已开启':''));
};
$('ghTestBtn').onclick=ghTest;
$('ghDiagBtn').onclick=ghDiag;
$('ghSyncBtn').onclick=()=>ghSyncAll('手动同步');
$('ghMergeBtn').onclick=()=>ghMergeFromCloud(true);
$('ghPullBtn').onclick=ghPull;

/* ================= 第二十五批 · 分块卡片行交互 ================= */
/* GitHub 配置行：点一下展开 / 收起表单 */
const _ghCfgToggle=$('ghCfgToggle');
if(_ghCfgToggle){
  const toggleGhForm=()=>{ const f=$('ghForm'); if(f) f.classList.toggle('show'); };
  _ghCfgToggle.onclick=toggleGhForm;
  _ghCfgToggle.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggleGhForm(); } };
}
/* 开关即时生效，不必再点「保存配置」 */
$('ghAuto').addEventListener('change',e=>{
  if(SHARED) return;
  state.gh.autoSync=e.target.checked; save(); renderSyncLine(); startGhPoll();
  toast(e.target.checked?'自动同步已开启':'自动同步已关闭');
});
$('maxFileMB').addEventListener('change',e=>{
  if(SHARED) return;
  const mb=parseInt(e.target.value,10);
  if(mb){ state.maxFileMB=Math.min(90,Math.max(5,mb)); e.target.value=state.maxFileMB; save(); }
});
/* 分享链接：是否包含分享数据 + 数据范围 + 复制访问链接
   （第二十九批：删掉「链接预览」行——它和「复制当前访问链接」重复，复制时已包含完整线上地址） */
const _shareInc=$('shareIncludeData');
if(_shareInc) _shareInc.addEventListener('change',e=>{
  setShareInclude(e.target.checked); syncShareRows();
  toast(shareIncludeData?'分享链接将包含我的数据':'分享链接将不包含我的数据（空白空间）');
});
const _shareScope=$('shareScopeSel');
if(_shareScope) _shareScope.addEventListener('change',e=>{ setShareScope(e.target.value); syncShareRows(); });
const _shareCopy=$('shareCopyLinkBtn'); if(_shareCopy) _shareCopy.onclick=shareCopyLink;
const _shareSync=$('shareSyncBtn'); if(_shareSync) _shareSync.onclick=sharePushData;
/* role=button 的行支持键盘触发 */
document.querySelectorAll('#settingsMask [role="button"].set-tap').forEach(el=>{
  el.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); el.click(); } };
});

