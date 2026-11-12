/* ============================================================
   Pocket · 自定义弹窗
   替代原生 prompt/confirm 的确认框、输入框、收纳夹选择器
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 自定义弹窗（替代 prompt / confirm） ================= */
function dlgEnsure(){
  let m=$('dlgMask');
  if(!m){
    m=document.createElement('div'); m.id='dlgMask';
    document.body.appendChild(m);
  }
  if(!m.querySelector('.dlg-box')){
    m.innerHTML='<div class="dlg-box"><div class="dlg-title"></div><div class="dlg-msg"></div><div class="dlg-body"></div><div class="dlg-acts"></div></div>';
  }
  return m;
}
function dlgClose(){ const m=$('dlgMask'); if(m) m.classList.remove('show'); }
function uiConfirm(o){
  return new Promise(res=>{
    const m=dlgEnsure();
    m.querySelector('.dlg-title').textContent=o.title||'确认';
    m.querySelector('.dlg-msg').innerHTML=esc(o.msg||'')+(o.count?'<div><span class="dlg-count">'+esc(o.count)+'</span></div>':'');
    const acts=m.querySelector('.dlg-acts'); acts.innerHTML='';
    const cancel=document.createElement('button'); cancel.className='dlg-btn'; cancel.textContent='取消';
    const ok=document.createElement('button'); ok.className='dlg-btn '+(o.danger?'danger':'primary'); ok.textContent=o.okText||'确定';
    acts.append(cancel,ok);
    let settled=false;
    const done=v=>{ if(settled) return; settled=true; dlgClose(); res(v); };
    cancel.onclick=()=>done(false);
    ok.onclick=()=>done(true);
    m._onesc=()=>done(false);
    m.onclick=e=>{ if(e.target===m) done(false); };
    m.classList.add('show');
    ok.focus();
  });
}
function uiPrompt(o){
  return new Promise(res=>{
    const m=dlgEnsure();
    m.querySelector('.dlg-title').textContent=o.title||'输入';
    const body=m.querySelector('.dlg-body');
    body.innerHTML=o.multiline
      ?'<textarea class="dlg-input" rows="'+(o.rows||5)+'" style="resize:vertical"></textarea>'
      :'<input class="dlg-input" type="text" autocomplete="off">';
    const inp=body.firstChild;
    inp.value=o.value||'';
    if(o.placeholder) inp.placeholder=o.placeholder;
    if(o.max) inp.maxLength=+o.max;
    const msg=m.querySelector('.dlg-msg'); msg.innerHTML='';
    const acts=m.querySelector('.dlg-acts'); acts.innerHTML='';
    const cancel=document.createElement('button'); cancel.className='dlg-btn'; cancel.textContent='取消';
    const ok=document.createElement('button'); ok.className='dlg-btn primary'; ok.textContent=o.okText||'确定';
    acts.append(cancel,ok);
    let settled=false;
    const done=v=>{ if(settled) return; settled=true; dlgClose(); res(v); };
    const submit=()=>{
      const v=inp.value;
      if(o.required&&!v.trim()){ msg.innerHTML='<span class="dlg-err">内容不能为空</span>'; inp.focus(); return; }
      if(o.validate){ const err=o.validate(v); if(err){ msg.innerHTML='<span class="dlg-err">'+esc(err)+'</span>'; inp.focus(); return; } }
      done(v);
    };
    cancel.onclick=()=>done(null);
    ok.onclick=submit;
    inp.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Enter'&&!o.multiline){ e.preventDefault(); submit(); }
      if(e.key==='Enter'&&o.multiline&&(e.ctrlKey||e.metaKey)){ e.preventDefault(); submit(); }
      if(e.key==='Escape'){ e.preventDefault(); done(null); }
    });
    m._onesc=()=>done(null);
    m.onclick=e=>{ if(e.target===m) done(null); };
    m.classList.add('show');
    setTimeout(()=>{ inp.focus(); if(inp.select&&inp.tagName==='INPUT') inp.select(); },30);
  });
}
function uiPickFolder(title,opts){
  opts=opts||{};
  return new Promise(res=>{
    const m=dlgEnsure();
    m.querySelector('.dlg-title').textContent=title||'移动到…';
    m.querySelector('.dlg-msg').innerHTML='';
    const body=m.querySelector('.dlg-body');
    body.innerHTML='<input class="fp-search" type="text" placeholder="搜索收纳夹…" aria-label="搜索收纳夹" autocomplete="off"><div class="fp-list"></div>';
    const acts=m.querySelector('.dlg-acts'); acts.innerHTML='';
    const cancel=document.createElement('button'); cancel.className='dlg-btn'; cancel.textContent='取消';
    acts.appendChild(cancel);
    let settled=false;
    const done=v=>{ if(settled) return; settled=true; dlgClose(); res(v); };
    cancel.onclick=()=>done(null);
    const listEl=body.querySelector('.fp-list'), search=body.querySelector('.fp-search');
    const sf=sortedFolders();
    function renderList(q){
      q=(q||'').trim().toLowerCase();
      const rows=sf.filter(f=>!q||folderPath(f).join(' / ').toLowerCase().indexOf(q)>=0);
      const rootRow=(opts.root&&!q)?'<div class="fp-row" data-fid="__root__" style="padding-left:10px"><span>🏠</span><span>顶级（不放进任何分类）</span></div>':'';
      listEl.innerHTML=rootRow+(rows.length?rows.map(f=>{
        const d=folderDepth(f);
        const path=folderPath(f).slice(0,-1).join(' / ');
        return '<div class="fp-row" data-fid="'+f.id+'" style="padding-left:'+(10+d*16)+'px"><span>'+esc(f.icon)+'</span><span>'+esc(f.name)+'</span><span class="fp-path">'+esc(path)+'</span></div>';
      }).join(''):(q?'<div class="fp-empty">没有匹配的收纳夹</div>':''));
      listEl.querySelectorAll('.fp-row').forEach(r=>{ r.onclick=()=>done(r.dataset.fid); });
    }
    renderList('');
    search.addEventListener('input',()=>renderList(search.value));
    search.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'){ e.preventDefault(); done(null); }
      if(e.key==='Enter'){ const first=listEl.querySelector('.fp-row'); if(first) done(first.dataset.fid); }
    });
    m._onesc=()=>done(null);
    m.onclick=e=>{ if(e.target===m) done(null); };
    m.classList.add('show');
    setTimeout(()=>search.focus(),30);
  });
}

