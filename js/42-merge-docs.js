/* ============================================================
   OVOvv · 文档合并
   批量勾选多篇文档 → 合并成一份新的 HTML 文档：
   · 目录合并（默认）：每篇文档的文件名/标题作为章节标题，开头自动生成目录（可点击跳转）
   · 直接合并：按勾选顺序拼接正文，中间用分隔线隔开
   可合并对象：文字笔记（it.text）与 HTML / 编辑过的文档（fileKey 里存 HTML 正文）；
   PDF / 照片 / 网页链接没有可合并正文，自动跳过并提示。
   ============================================================ */
'use strict';
/* ================= 文档合并 ================= */
(function(){
  /* 样式：批量栏按钮 + 合并弹窗模式卡 */
  const st=document.createElement('style');
  st.textContent=
    '.mg-modes{display:flex;flex-direction:column;gap:8px;margin:10px 0 8px}'+
    '.mg-mode{display:flex;align-items:flex-start;gap:10px;border:1.5px solid var(--inset);border-radius:12px;padding:10px 12px;cursor:pointer;transition:border-color .15s,background .15s}'+
    '.mg-mode:has(input:checked){border-color:var(--accent);background:var(--accent-soft)}'+
    '.mg-mode input{margin-top:3px;accent-color:var(--accent)}'+
    '.mg-mode b{display:block;font-size:13px;color:var(--text)}'+
    '.mg-mode span{display:block;font-size:11.5px;color:var(--text3);margin-top:2px;line-height:1.5}'+
    '.mg-list{max-height:130px;overflow:auto;border:1px solid var(--inset);border-radius:10px;padding:6px 10px;margin-top:6px;background:var(--bg1)}'+
    '.mg-row{font-size:12px;color:var(--text2);padding:4px 0;border-bottom:1px dashed var(--inset);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
    '.mg-row:last-child{border-bottom:none}'+
    '.mg-lab{display:block;font-size:12px;color:var(--text2);margin:8px 0 4px}';
  document.head.appendChild(st);

  /* 纯文本扩展名（可作为同格式直接拼接输出） */
  const TXT_EXT=/\.(txt|md|markdown|csv|log|json|ya?ml|ini|conf)$/i;
  function isTxtName(n){ return TXT_EXT.test(n||''); }
  /* 可合并对象：文字笔记、HTML / 编辑过的文档、以及任意文本类文档（txt / md / csv / json…）；
     PDF / 照片 / 网页链接没有可合并正文，自动跳过并提示 */
  function mergeDocCandidates(){
    return batchTargets().filter(function(it){
      if(it.type==='note') return true;
      if(it.type==='file'&&it.fileKey){
        if(isPdfName(it.fileName)) return false;
        if(it.docFormat==='html'||isHtmlName(it.fileName)||it.editable) return true;
        if(it.fileMime&&String(it.fileMime).indexOf('image/')===0) return false;
        if(isTxtName(it.fileName)) return true;
        /* 未知类型：内容能按文本读出来就允许（读取阶段读不出会自动跳过） */
        if(!it.fileMime||String(it.fileMime).indexOf('text/')===0) return true;
      }
      return false;
    });
  }
  /* 所有候选是否同为某一种纯文本扩展名（可启用「保留原格式合并」） */
  function sameTxtExt(cands){
    if(!cands.length) return null;
    const first=(cands[0].fileName||'').match(TXT_EXT);
    if(!first) return null;
    const ext=first[1].toLowerCase();
    return cands.every(it=>{ const m=(it.fileName||'').match(TXT_EXT); return m&&m[1].toLowerCase()===ext; })?ext:null;
  }
  function mergeDocTitle(it){
    let t=it.title||docTitle(it.fileName)||'';
    if(!t&&it.text){ const first=String(it.text).split(/\r?\n/)[0].trim(); if(first) t=first.slice(0,40); }
    return t||'无题文档';
  }
  function noteParasHTML(text){
    const ps=String(text||'').split(/\n+/).map(function(p){return p.trim();}).filter(Boolean);
    if(!ps.length) return '<p>（本篇正文为空）</p>';
    return ps.map(function(p){return '<p>'+esc(p)+'</p>';}).join('\n');
  }
  /* 取一篇文档的正文 HTML（笔记取 text；文档读 fileKey 缓存），取不到返回 null */
  async function docBodyHTML(it){
    if(it.type==='note'&&!it.fileKey) return noteParasHTML(it.text);
    if(it.fileKey){
      try{
        const dataUrl=await ensureItemLocal(it);
        const txt=dataUrl?dataUrlToText(dataUrl):null;
        if(txt){
          /* 纯文本类（txt/md/csv…）按段落转 HTML，保留换行 */
          if(isTxtName(it.fileName)&&!isHtmlName(it.fileName)) return noteParasHTML(txt);
          const d=new DOMParser().parseFromString(txt,'text/html');
          const inner=(d.body?d.body.innerHTML:'').trim();
          if(inner) return inner;
          const plain=htmlToPlain(txt).trim();
          if(plain) return noteParasHTML(plain);
        }
      }catch(e){}
    }
    if(it.type==='note') return noteParasHTML(it.text);
    return null;
  }
  /* 取一篇文档的纯文本（用于「保留原格式合并」） */
  async function docBodyPlain(it){
    if(it.type==='note'&&!it.fileKey) return String(it.text||'');
    if(it.fileKey){
      try{
        const dataUrl=await ensureItemLocal(it);
        const txt=dataUrl?dataUrlToText(dataUrl):null;
        if(txt!=null){
          if(isTxtName(it.fileName)&&!isHtmlName(it.fileName)) return txt;
          return htmlToPlain(txt);
        }
      }catch(e){}
    }
    return String(it.text||'');
  }
  /* 合并弹窗：文档名 + 模式（同为同一纯文本扩展名时，额外提供「保留原格式合并」） */
  function uiMergeDocs(cands,txtExt){
    return new Promise(function(res){
      const m=dlgEnsure();
      m.querySelector('.dlg-title').textContent='合并文档（'+cands.length+' 篇）';
      m.querySelector('.dlg-msg').innerHTML='';
      const body=m.querySelector('.dlg-body');
      const today=new Date();
      const defName='合并文档 '+today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
      body.innerHTML='<label class="mg-lab">合并后的文档名</label>'+
        '<input class="dlg-input" id="mgName" type="text" maxlength="60" value="'+esc(defName)+'">'+
        '<div class="mg-modes">'+
          '<label class="mg-mode"><input type="radio" name="mgmode" value="toc" checked><div><b>📑 目录合并</b><span>每篇文档的文件名作为章节标题（一、二、三…），开头自动生成可点击的目录</span></div></label>'+
          '<label class="mg-mode"><input type="radio" name="mgmode" value="plain"><div><b>📄 直接合并</b><span>按勾选顺序拼接正文，篇与篇之间用分隔线隔开，不加标题</span></div></label>'+
          (txtExt?('<label class="mg-mode"><input type="radio" name="mgmode" value="txt"><div><b>📝 保留原格式（.'+esc(txtExt)+'）</b><span>所有文档都是 .'+esc(txtExt)+'，按原格式纯文本拼接成一份 .'+esc(txtExt)+'，不转成 HTML 文档</span></div></label>'):'')+
        '</div>'+
        '<div class="mg-list">'+cands.map(function(it){return '<div class="mg-row">'+esc(mergeDocTitle(it))+'</div>';}).join('')+'</div>';
      const acts=m.querySelector('.dlg-acts'); acts.innerHTML='';
      const cancel=document.createElement('button'); cancel.className='dlg-btn'; cancel.textContent='取消';
      const ok=document.createElement('button'); ok.className='dlg-btn primary'; ok.textContent='合并';
      acts.append(cancel,ok);
      let settled=false;
      const done=function(v){ if(settled) return; settled=true; dlgClose(); res(v); };
      cancel.onclick=function(){ done(null); };
      ok.onclick=function(){
        const name=body.querySelector('#mgName').value.trim();
        if(!name){ m.querySelector('.dlg-msg').innerHTML='<span class="dlg-err">文档名不能为空</span>'; return; }
        const mode=(body.querySelector('input[name="mgmode"]:checked')||{}).value||'toc';
        done({name:name,mode:mode});
      };
      m._onesc=function(){ done(null); };
      m.onclick=function(e){ if(e.target===m) done(null); };
      m.classList.add('show');
      setTimeout(function(){ const inp=body.querySelector('#mgName'); inp.focus(); inp.select(); },30);
    });
  }
  /* 组装合并后的完整 HTML 文档 */
  function buildMergeHTML(name,mode,parts){
    let html='<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>'+esc(name)+'</title>'+
      '<style>body{font-family:system-ui,"Noto Sans SC",sans-serif;max-width:820px;margin:0 auto;padding:36px 28px;line-height:1.85;color:#2f3437}h1{font-size:26px;border-bottom:2px solid #e5e7eb;padding-bottom:10px}h2{font-size:19px;margin-top:34px}hr{border:none;border-top:1px dashed #cbd2d9;margin:28px 0}.mg-toc{background:#f6f7f9;border-radius:12px;padding:14px 22px}.mg-toc h2{margin:4px 0 10px;font-size:16px;border:none}.mg-toc a{color:#4a6bdf;text-decoration:none}.mg-toc a:hover{text-decoration:underline}</style>'+
      '</head><body>\n';
    html+='<h1>'+esc(name)+'</h1>\n';
    if(mode==='toc'){
      html+='<div class="mg-toc"><h2>📑 目录</h2><ol>'+
        parts.map(function(p,i){return '<li><a href="#mgsec-'+i+'">'+esc(p.title)+'</a></li>';}).join('')+
        '</ol></div>\n';
      parts.forEach(function(p,i){
        html+='<h2 id="mgsec-'+i+'">'+p.cn+'. '+esc(p.title)+'</h2>\n'+p.body+'\n';
      });
    }else{
      html+=parts.map(function(p){return p.body;}).join('\n<hr>\n')+'\n';
    }
    html+='</body></html>';
    return html;
  }
  const CN_NUM=['一','二','三','四','五','六','七','八','九','十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十'];
  /* 供自动化探针测试的只读钩子（不影响运行时行为） */
  try{ window.__mergeTest={buildMergeHTML:buildMergeHTML,mergeDocTitle:mergeDocTitle,noteParasHTML:noteParasHTML,mergeDocCandidates:mergeDocCandidates}; }catch(e){}
  /* 主流程 */
  $('batchMergeBtn').onclick=async function(){
    if(SHARED){ toast('分享版只读，不能合并'); return; }
    if(!batchSel.size){ toast('先勾选要合并的文档'); return; }
    const cands=mergeDocCandidates();
    if(cands.length<2){ toast('可合并的文档不足 2 篇（文字笔记 / HTML / txt / md / csv 等文本文档均可）'); return; }
    const txtExt=sameTxtExt(cands);
    const opt=await uiMergeDocs(cands,txtExt);
    if(!opt) return;
    toast('正在读取正文并合并…');
    /* 「保留原格式」：全部为同一纯文本扩展名 → 直接拼纯文本输出 */
    if(opt.mode==='txt'&&txtExt){
      const chunks=[]; let skippedTxt=0;
      for(const it of cands){
        const plain=await docBodyPlain(it);
        if(!plain&&!it.text&&(it.type!=='note')&&!plain&&plain!=='' ){ skippedTxt++; continue; }
        chunks.push({title:mergeDocTitle(it),body:plain,cn:(CN_NUM[chunks.length]||String(chunks.length+1))});
      }
      if(chunks.length<2){ toast('可读取正文的文档不足 2 篇，已取消合并'); return; }
      const text=opt.mode==='txt'
        ?chunks.map(p=>p.cn+'、 '+p.title+'\n\n'+p.body.trim()).join('\n\n\n')+'\n'
        :'';
      try{
        const key=uid()+'_file';
        await imgSet(key,'data:text/plain;base64,'+utf8ToB64(text));
        const fid=(currentFolderId!==HOME_ID&&!searchQuery)?currentFolderId:(cands[0].folderId||null);
        const it2={
          id:uid(),folderId:fid,type:'file',fileName:opt.name+'.'+txtExt,text:'',
          fileMime:'text/plain',fileSize:text.length,fileKey:key,
          editable:false,docFormat:'txt',
          plain:text.slice(0,8000),
          tags:[],created:Date.now(),pinned:false
        };
        it2.updatedAt=it2.created; it2.blobRev=it2.created;
        state.items.unshift(it2);
        pushUndo('合并文档「'+opt.name+'」');
        save(); renderAll();
        const del=await uiConfirm({title:'合并完成',msg:'已生成「'+opt.name+'.'+txtExt+'」'+(skippedTxt?('，跳过了 '+skippedTxt+' 篇无法读取的'):'')+'。要删除参与合并的原文档吗？（可在回收站找回）',okText:'删除原文档',danger:true});
        if(del&&batchMode){
          batchTargets().forEach(function(o){ if(cands.indexOf(o)>=0) trashItem(o,true); });
          renderTrashCount();
        }
        batchSel.clear();
        if(batchMode) setBatch(false);
        if(fid&&currentFolderId!==fid){ currentFolderId=fid; searchQuery=''; }
        renderItems();
        toast('合并完成：'+chunks.length+' 篇 → 「'+opt.name+'.'+txtExt+'」');
        return;
      }catch(e){ toast('合并失败：'+(e.message||e)); return; }
    }
    const parts=[]; let skipped=0;
    for(const it of cands){
      const bodyHtml=await docBodyHTML(it);
      if(bodyHtml==null){ skipped++; continue; }
      const i=parts.length;
      parts.push({title:mergeDocTitle(it),body:bodyHtml,cn:(CN_NUM[i]||String(i+1))});
    }
    if(parts.length<2){ toast('可读取正文的文档不足 2 篇，已取消合并'); return; }
    const html=buildMergeHTML(opt.name,opt.mode,parts);
    try{
      const key=uid()+'_file';
      await imgSet(key,'data:text/html;base64,'+utf8ToB64(html));
      /* 生成的新文档放进当前分类（主页时放第一篇所在分类） */
      const fid=(currentFolderId!==HOME_ID&&!searchQuery)?currentFolderId:(cands[0].folderId||null);
      const it={
        id:uid(),folderId:fid,type:'file',fileName:opt.name+'.html',text:'',
        fileMime:'text/html',fileSize:html.length,fileKey:key,
        editable:true,docFormat:'html',
        plain:htmlToPlain(html).slice(0,8000),
        tags:[],created:Date.now(),pinned:false
      };
      it.updatedAt=it.created; it.blobRev=it.created;
      pushUndo('合并文档「'+opt.name+'」');
      state.items.push(it);
      save();
      /* 合并后是否删掉原文档由用户决定 */
      const del=await uiConfirm({title:'合并完成',msg:'已生成「'+opt.name+'.html」'+(skipped?('，跳过了 '+skipped+' 条不支持合并的内容'):'')+'。要删除参与合并的原文档吗？（可在回收站找回）',okText:'删除原文档',danger:true});
      if(del&&batchMode){
        batchTargets().forEach(function(o){ if(cands.indexOf(o)>=0) trashItem(o,true); });
        renderTrashCount();
      }
      batchSel.clear();
      if(batchMode) setBatch(false);
      if(fid&&currentFolderId!==fid){ currentFolderId=fid; searchQuery=''; }
      renderItems();
      toast('合并完成：'+parts.length+' 篇 → 「'+opt.name+'.html」');
    }catch(e){ toast('合并失败：'+(e&&e.message||e)); }
  };
})();
