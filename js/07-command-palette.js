/* ============================================================
   Pocket · 命令面板
   Ctrl/Cmd+K 搜索条目、收纳夹与快捷操作
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 命令面板（Ctrl/Cmd+K） ================= */
let cmdkRows=[], cmdkIdx=0;
function cmdkBuild(q){
  q=(q||'').trim().toLowerCase();
  const cmds=[
    {ico:'📝',t:'新建文字条目',run:()=>openEditor(null,'note')},
    {ico:'📁',t:'新建收纳夹',run:()=>$('addFolderBtn').click()},
    {ico:'📖',t:'打开 HTML / PDF 文库',run:()=>openReader(null)},
    {ico:'🗑',t:'打开回收站',run:()=>renderTrashPanel()},
    {ico:'📈',t:'打开统计看板',run:()=>renderStatsPanel()},
    {ico:'🧭',t:'知识漫游',run:()=>openRoam()},
    {ico:'🌙',t:'切换深色 / 浅色模式',run:()=>toggleDark()},
    {ico:'⚙️',t:'打开设置',run:()=>openSettings()},
    {ico:'⬇️',t:'导出备份',run:()=>exportBackup()},
    {ico:'↩️',t:'撤销上一步',run:()=>undoLast()},
  ].filter(c=>!q||c.t.toLowerCase().indexOf(q)>=0).map(c=>Object.assign({sub:'命令'},c));
  const fs=sortedFolders().filter(f=>!q||folderPath(f).join(' / ').toLowerCase().indexOf(q)>=0).slice(0,6)
    .map(f=>({ico:f.icon,t:f.name,sub:'跳转 · '+folderPath(f).join(' / '),run:()=>{ currentFolderId=f.id; searchQuery=''; $('searchInput').value=''; renderAll(); }}));
  let its=[];
  if(q){
    its=state.items.filter(it=>{
      const s=String(it.type==='note'?(it.text||''):(it.fileName||it.title||it.text||'')).toLowerCase();
      return s.indexOf(q)>=0;
    }).slice(0,7).map(it=>({ico:TYPE_ICON[it.type]||'📄',t:itemLabel(it),sub:TYPE_BADGE[it.type]||'内容',run:()=>{
      if(it.type==='file') openReader(it.id); else openEditor(it);
    }}));
  }
  const rows=[];
  if(cmds.length) rows.push({sec:'命令'},...cmds);
  if(fs.length) rows.push({sec:'跳转到收纳夹'},...fs);
  if(its.length) rows.push({sec:'内容'},...its);
  return rows;
}
function openCmdk(){
  const mk=$('cmdkMask'); if(!mk) return;
  mk.classList.add('show');
  const inp=$('cmdkInput'); inp.value=''; cmdkIdx=0; renderCmdk('');
  setTimeout(()=>inp.focus(),20);
}
function closeCmdk(){ const mk=$('cmdkMask'); if(mk) mk.classList.remove('show'); }
function renderCmdk(q){
  cmdkRows=cmdkBuild(q);
  const flat=cmdkRows.map((r,i)=>i).filter(i=>!cmdkRows[i].sec);
  if(cmdkIdx>=flat.length) cmdkIdx=flat.length?flat[0]:0;
  const list=$('cmdkList');
  list.innerHTML=cmdkRows.map((r,i)=>r.sec
    ?'<div class="cmdk-sec">'+r.sec+'</div>'
    :'<div class="cmdk-item'+(i===cmdkIdx?' on':'')+'" data-ci="'+i+'" role="option"><span class="ck-ico">'+r.ico+'</span><span>'+esc(r.t)+'</span><span class="ck-sub">'+esc(r.sub||'')+'</span></div>').join('');
  list.querySelectorAll('.cmdk-item').forEach(el=>{
    el.onclick=()=>{ const r=cmdkRows[+el.dataset.ci]; closeCmdk(); if(r&&r.run) r.run(); };
    el.onmousemove=()=>{ const i=+el.dataset.ci; if(cmdkIdx!==i){ cmdkIdx=i; list.querySelectorAll('.cmdk-item').forEach(x=>x.classList.toggle('on',+x.dataset.ci===cmdkIdx)); } };
  });
  const on=list.querySelector('.cmdk-item.on'); if(on) on.scrollIntoView({block:'nearest'});
}
document.getElementById('cmdkInput').addEventListener('input',function(){ cmdkIdx=0; renderCmdk(this.value); });
document.getElementById('cmdkInput').addEventListener('keydown',function(e){
  e.stopPropagation();
  const flat=cmdkRows.map((r,i)=>i).filter(i=>!cmdkRows[i].sec);
  if(e.key==='ArrowDown'){ e.preventDefault(); if(flat.length){ const pos=Math.max(0,flat.indexOf(cmdkIdx)); cmdkIdx=flat[(pos+1)%flat.length]; renderCmdk(this.value); } }
  else if(e.key==='ArrowUp'){ e.preventDefault(); if(flat.length){ const pos=flat.indexOf(cmdkIdx); cmdkIdx=flat[(pos-1+flat.length)%flat.length]; renderCmdk(this.value); } }
  else if(e.key==='Enter'){ e.preventDefault(); const r=cmdkRows[cmdkIdx]; if(r&&!r.sec){ closeCmdk(); r.run(); } }
  else if(e.key==='Escape'){ e.preventDefault(); closeCmdk(); }
});
document.getElementById('cmdkMask').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeCmdk(); });

