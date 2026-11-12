/* ============================================================
   Pocket · 缓存管理面板
   仅云端文件列表、大文件缓存清理
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 缓存管理面板 ================= */
async function renderCloudOnlyPanel(){
  const list=state.items.filter(it=>it.fileKey&&it.cloudOnly);
  openPanel('☁️ 仅存云端的文件（'+list.length+'）','这些文件的本机副本已清理，卡片仍在原位；点「拉取」下载回本地，或直接打开阅读/编辑时自动拉取。');
  const body=$('panelBody');
  if(!list.length){ body.innerHTML='<div class="empty" style="padding:30px 0">没有仅存云端的文件</div>'; }
  else{
    body.innerHTML=list.map(it=>'<div class="tr-row"><div class="tr-ico">☁️</div>'+
      '<div class="tr-main"><div class="tr-t">'+esc(it.fileName||'文件')+'</div>'+
      '<div class="tr-s">'+fmtSize(it.fileSize||0)+' · 在「'+(state.folders.find(f=>f.id===it.folderId)||{name:'未分类'}).name+'」</div></div>'+
      '<div class="tr-act"><button data-pullid="'+esc(it.id)+'">拉取</button></div></div>').join('');
    body.querySelectorAll('[data-pullid]').forEach(b=>{
      b.onclick=async()=>{
        const it=state.items.find(x=>x.id===b.dataset.pullid); if(!it) return;
        b.textContent='拉取中…'; b.disabled=true;
        const u=await ensureItemLocal(it);
        b.textContent=u?'已拉取':'失败'; setTimeout(renderCloudOnlyPanel,600);
      };
    });
  }
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
}
async function renderBigCachePanel(){
  const files=state.items.filter(it=>it.fileKey&&!it.cloudOnly&&it.fileSize>5*1024*1024)
    .sort((a,b)=>(b.fileSize||0)-(a.fileSize||0));
  const total=files.reduce((n,it)=>n+(it.fileSize||0),0);
  openPanel('🧹 清理大文件缓存','本机超过 5MB 的文件共 '+files.length+' 个、约 '+fmtSize(total)+'。清理后本机副本删除，文件仍在 GitHub 云端，卡片保留，需要时自动拉回。'+
    (files.length?'<br>未上传到云端的文件不会列在这里。':''));
  const body=$('panelBody');
  if(!files.length){ body.innerHTML='<div class="empty" style="padding:30px 0">没有可清理的大文件</div>'; }
  else{
    body.innerHTML='<label class="inline" style="margin-bottom:8px"><input type="checkbox" id="bigAll"> 全选（共 '+fmtSize(total)+'）</label>'+
      files.map(it=>'<label class="tr-row" style="cursor:pointer"><input type="checkbox" data-big="'+esc(it.id)+'" style="margin-right:8px">'+
      '<div class="tr-ico">'+fileEmoji(it.fileName)+'</div>'+
      '<div class="tr-main"><div class="tr-t">'+esc(it.fileName||'文件')+'</div>'+
      '<div class="tr-s">'+fmtSize(it.fileSize||0)+(syncedKeys.has(it.fileKey)?' · 已上传云端':' · ⚠️ 未上传，不可清理')+'</div></div></label>').join('');
    body.querySelectorAll('[data-big]').forEach(cb=>{
      const it=state.items.find(x=>x.id===cb.dataset.big);
      if(it&&!syncedKeys.has(it.fileKey)){ cb.disabled=true; cb.checked=false; }
    });
  }
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>'+
    '<button class="btn primary" id="bigCleanBtn">清理所选</button>';
  $('panelCloseBtn').onclick=closePanel;
  $('bigCleanBtn').onclick=async()=>{
    const ids=[...body.querySelectorAll('[data-big]:checked')].map(cb=>cb.dataset.big);
    if(!ids.length){ toast('先勾选要清理的文件'); return; }
    let n=0, freed=0;
    for(const id of ids){
      const it=state.items.find(x=>x.id===id);
      if(!it||!syncedKeys.has(it.fileKey)) continue;
      try{ await imgDel(it.fileKey); }catch(e){}
      it.cloudOnly=true; it.cachedAt=Date.now(); freed+=it.fileSize||0; n++;
    }
    save(); renderAll();
    toast('已清理 '+n+' 个文件的本机缓存，释放约 '+fmtSize(freed));
    closePanel();
  };
}
$('cloudOnlyBtn').onclick=renderCloudOnlyPanel;
$('clearAllCacheBtn').onclick=renderBigCachePanel;

/* 头像 */
$('avatarBox').onclick=openSettings;
function applyAvatar(){
  const p=state.profile;
  [$('avatarBox'),$('avatarBox2')].forEach(box=>{
    if(p.avatar){
      imgGet(p.avatar).then(u=>{ box.innerHTML=u?'<img src="'+u+'" alt="头像">':esc(p.avatarEmoji); }).catch(()=>{ box.textContent=p.avatarEmoji; });
    }else{
      box.textContent=p.avatarEmoji;
    }
  });
}
$('avatarUploadBtn').onclick=()=>$('avatarInput').click();
$('avatarInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const k='avatar_'+uid();
    await imgSet(k,await compressImage(f,256,0.9));
    if(state.profile.avatar) imgDel(state.profile.avatar).catch(()=>{});
    state.profile.avatar=k;
    save(); applyProfile(); toast('头像已更新');
  }catch(err){ toast('图片处理失败'); }
});
$('avatarEmojiBtn').onclick=()=>{
  const p=state.profile;
  p.avatarEmoji=ICONS[(ICONS.indexOf(p.avatarEmoji)+1+ICONS.length)%ICONS.length]||'🧸';
  if(p.avatar){ imgDel(p.avatar).catch(()=>{}); p.avatar=null; }
  save(); applyProfile();
};
$('avatarClearBtn').onclick=()=>{
  if(state.profile.avatar){ imgDel(state.profile.avatar).catch(()=>{}); state.profile.avatar=null; save(); applyProfile(); toast('已恢复 emoji 头像'); }
};

/* 背景 */
async function applyProfile(){
  const p=state.profile;
  applyAvatar();
  /* 横幅背景：本页自定义图 > 全局背景图 > 渐变色 */
  const b=$('banner');
  const ck=(state.bannerKeys||{})[curBannerId()];
  if(ck){
    const cu=await imgGet(ck).catch(()=>null);
    if(cu){ b.classList.add('has-img'); b.style.backgroundImage='url('+cu+')'; }
    else{ b.classList.remove('has-img'); b.style.backgroundImage=''; }
  }else if(p.bgImage){
    const u=await imgGet(p.bgImage).catch(()=>null);
    if(u){ b.classList.add('has-img'); b.style.backgroundImage='url('+u+')'; }
    else{ b.classList.remove('has-img'); b.style.backgroundImage=''; }
  }else{
    b.classList.remove('has-img'); b.style.backgroundImage='';
  }
  const clr=$('bannerClr'); if(clr) clr.style.display=ck?'':'none';
  /* 整页背景 */
  if(p.pageBg&&p.bgImage){
    const u=await imgGet(p.bgImage).catch(()=>null);
    if(u){ document.body.style.backgroundImage='url('+u+')'; document.body.classList.add('page-bg'); }
  }else{
    document.body.style.backgroundImage=''; document.body.classList.remove('page-bg');
  }
  /* 顶部栏背景：本页自定义图（主页用横幅键存储）> 全局顶部栏背景 > 无 */
  const tb=document.querySelector('.topbar');
  if(tb){
    const pk=(state.bannerKeys||{})[curBannerId()];
    const gk=pk?null:p.topBg;
    const key=pk||gk;
    const tu=key?await imgGet(key).catch(()=>null):null;
    if(tu){ tb.classList.add('has-bg'); tb.style.backgroundImage='url('+tu+')'; }
    else{ tb.classList.remove('has-bg'); tb.style.backgroundImage=''; }
    const tclr=$('topbarClr'); if(tclr) tclr.style.display=pk?'':'none';
  }
}
/* 每个页面（主页/各收纳夹）的横幅自定义背景 */
function curBannerId(){ return currentFolderId===HOME_ID?HOME_ID:currentFolderId; }
$('bannerCam').onclick=()=>$('bannerInput').click();
$('bannerClr').onclick=()=>{
  const bid=curBannerId();
  const k=(state.bannerKeys||{})[bid];
  if(k) imgDel(k).catch(()=>{});
  delete state.bannerKeys[bid];
  save(); renderAll(); toast('已恢复默认横幅');
};
$('bannerInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const k='bnr_'+uid();
    await imgSet(k,await compressImage(f,1600,0.82));
    const bid=curBannerId();
    const old=state.bannerKeys[bid];
    state.bannerKeys[bid]=k;
    if(old) imgDel(old).catch(()=>{});
    save(); renderAll();
    toast('横幅背景已更新');
  }catch(err){ toast('图片处理失败：'+err.message); }
});
$('bgUploadBtn').onclick=()=>$('bgInput').click();
$('bgInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const k='bg_'+uid();
    await imgSet(k,await compressImage(f,1600,0.82));
    if(state.profile.bgImage) imgDel(state.profile.bgImage).catch(()=>{});
    state.profile.bgImage=k;
    save(); applyProfile(); toast('背景已更新');
  }catch(err){ toast('图片处理失败'); }
});
$('bgClearBtn').onclick=()=>{
  if(state.profile.bgImage){ imgDel(state.profile.bgImage).catch(()=>{}); state.profile.bgImage=null; save(); applyProfile(); toast('已恢复预设渐变'); }
};
$('pageBgChk').addEventListener('change',function(){
  state.profile.pageBg=this.checked;
  save(); applyProfile();
});
/* 顶部栏背景 */
$('topBgUploadBtn').onclick=()=>$('topBgInput').click();
$('topBgInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  try{
    const k='tbg_'+uid();
    await imgSet(k,await compressImage(f,1600,0.82));
    if(state.profile.topBg) imgDel(state.profile.topBg).catch(()=>{});
    state.profile.topBg=k;
    save(); applyProfile(); toast('顶部栏背景已更新');
  }catch(err){ toast('图片处理失败'); }
});
$('topBgClearBtn').onclick=()=>{
  if(state.profile.topBg){ imgDel(state.profile.topBg).catch(()=>{}); state.profile.topBg=null; save(); applyProfile(); toast('已清除顶部栏背景'); }
  else toast('当前没有设置顶部栏背景');
};
/* 主页顶部栏 📷：复用横幅上传通道（按当前页 id 存到 bannerKeys，主页=HOME_ID） */
$('topbarCam').onclick=()=>$('bannerInput').click();
$('topbarClr').onclick=()=>$('bannerClr').onclick();

