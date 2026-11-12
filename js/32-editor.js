/* ============================================================
   Pocket · 文档编辑器
   可编辑 HTML 文档：打开、保存、附件、双向链接
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 文档编辑器（可编辑 HTML + 双向链接） ================= */
let editorItemId=null, editorSaveTimer=null, editorDirty=false;
let edOpenSeq=0, edLoadedSeq=-1;   /* 打开序号：防止「帧还显示 A 的内容、editorItemId 已指向 B」时把 A 写进 B */
let edUndoArr=[], edRedoArr=[], edCommitTimer=null, edCountTimer=null;
const DOC_CSS='body{font-family:sans-serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.8;color:#2d3748}h1{color:#2b6cb0}h2{color:#2c5282;margin-top:1.5em}h3{color:#2c5282}img{max-width:100%;height:auto}blockquote{border-left:3px solid #5B99E2;margin-left:0;padding-left:14px;color:#5a6778}table{border-collapse:collapse}td,th{border:1px solid #cbd5e0;padding:6px 10px}'+
/* 任务清单 / 代码块 / 图注 / 图片对齐（编辑、阅读、导出共用） */
'ul.tb-task{list-style:none;padding-left:6px}ul.tb-task li{margin:5px 0}ul.tb-task input[type=checkbox]{margin-right:7px;vertical-align:-2px;transform:scale(1.1)}'+
'pre.tb-code{background:#f4f7fb;border:1px solid #dbe4f0;border-radius:10px;padding:12px 14px;font-family:Consolas,Menlo,monospace;font-size:13px;white-space:pre-wrap;word-break:break-word;line-height:1.6;max-width:100%;overflow-x:auto}'+
'figure.tb-fig{margin:16px 0;text-align:center}figure.tb-fig figcaption{font-size:12.5px;color:#7a8699;margin-top:6px;line-height:1.5}'+
'.tb-grid-embed{display:flex;align-items:center;gap:8px;background:#eef4fb;border:1.5px dashed #9dbce0;border-radius:12px;padding:12px 16px;font-size:13px;color:#3a5578;margin:14px 0}'+
'img[data-float=left]{float:left;margin:4px 16px 10px 0}img[data-float=right]{float:right;margin:4px 0 10px 16px}img[data-float=center]{display:block;margin:12px auto;float:none}'+
'body::after{content:"";display:block;clear:both}';
const DOC_TEMPLATES={
  blank:{icon:'📄',name:'空白文档',desc:'一张白纸，从标题开始写',html:function(){ return '<p>开始写吧…输入 <b>[[文档名]]</b> 可以链接到其他文档，形成双向链接。</p>'; }},
  daily:{icon:'📅',name:'每日记录',desc:'今天做了什么 / 一个想法 / 明天',html:function(){ return '<h2>今天做了什么</h2><p></p><h2>一个想法</h2><p></p><h2>明天要做</h2><ul><li></li></ul>'; }},
  reading:{icon:'📚',name:'读书笔记',desc:'要点 / 金句 / 我的想法',html:function(){ return '<h2>这本书讲什么</h2><p></p><h2>三个关键点</h2><ul><li></li><li></li><li></li></ul><h2>金句摘录</h2><blockquote></blockquote><h2>我的想法</h2><p></p>'; }},
  idea:{icon:'💡',name:'灵感卡片',desc:'一个点子 + 为什么 + 下一步',html:function(){ return '<h2>灵感</h2><p></p><h2>为什么有意思</h2><p></p><h2>下一步</h2><ol><li></li></ol>'; }},
  list:{icon:'✅',name:'清单',desc:'待办 / 打包 / 购物清单',html:function(){ return '<h2>清单</h2><ul><li>第一项</li><li>第二项</li></ul>'; }}
};
function defaultDocHTML(title,tpl){
  const t=DOC_TEMPLATES[tpl]||DOC_TEMPLATES.blank;
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+DOC_CSS+'</style></head><body><h1>'+esc(title)+'</h1>'+t.html()+'</body></html>';
}
function htmlFromParas(title,text){
  const body=String(text||'').split(/\n+/).filter(s=>s.trim()).map(s=>'<p>'+esc(s)+'</p>').join('');
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>'+DOC_CSS+'</style></head><body><h1>'+esc(title)+'</h1>'+(body||'<p></p>')+'</body></html>';
}
function writeDocFile(key,html){
  return imgSet(key,'data:text/html;base64,'+btoa(unescape(encodeURIComponent(html))));
}
/* 新建文档：先选模板 */
function pickTemplate(cb){
  openPanel('＋ 新建文档','选一个起点，写起来更快；内容随时可以改。');
  const body=$('panelBody');
  body.innerHTML=Object.keys(DOC_TEMPLATES).map(function(k){
    const t=DOC_TEMPLATES[k];
    return '<div class="tr-row" data-tpl="'+k+'"><div class="tr-ico">'+t.icon+'</div>'+
      '<div class="tr-main"><div class="tr-t">'+t.name+'</div><div class="tr-s">'+t.desc+'</div></div>'+
      '<div class="tr-act"><button>选这个</button></div></div>';
  }).join('');
  body.querySelectorAll('[data-tpl]').forEach(function(el){
    el.onclick=function(){ const k=el.dataset.tpl; closePanel(); cb(k); };
  });
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">取消</button>';
  $('panelCloseBtn').onclick=closePanel;
}
/* 纯文字条目 → 可编辑文档（原文进回收站，可还原） */
async function noteToDoc(it){
  if(!it||it.type!=='note') return;
  const suggest=(it.text||'新文档').replace(/[\r\n]+/g,' ').slice(0,20);
  const name=await uiPrompt({title:'转成可编辑文档',label:'给文档起个名字',value:suggest,max:60});
  if(name==null) return;
  const title=(String(name).trim()||suggest||'新文档').slice(0,60);
  const html=htmlFromParas(title,it.text||'');
  const k='doc_'+uid();
  try{ await writeDocFile(k,html); }catch(e){ toast('创建失败：'+e.message); return; }
  const doc={id:uid(),folderId:it.folderId,type:'file',fileName:title+'.html',text:'',fileSize:html.length,fileMime:'text/html',fileKey:k,tags:(it.tags||[]).slice(),created:Date.now(),pinned:!!it.pinned,editable:true,wikilinks:[],plain:htmlToPlain(html)};
  state.items.push(doc);
  trashItem(it);
  save(); renderAll();
  toast('已转成文档，原文字放在回收站里');
  await openDocEditor(doc.id);
}
/* 单篇导出：HTML / Markdown / 打印成 PDF */
function downloadText(text,mime,name){
  const blob=new Blob([text],{type:mime});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download=name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
function htmlToMarkdown(html){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,noscript').forEach(el=>el.remove());
  const walk=node=>{
    let out='';
    node.childNodes.forEach(n=>{
      if(n.nodeType===3){ out+=n.textContent.replace(/\s+/g,' '); return; }
      if(n.nodeType!==1) return;
      const tag=n.tagName.toLowerCase();
      const inner=walk(n);
      if(tag==='h1') out+='\n# '+inner.trim()+'\n';
      else if(tag==='h2') out+='\n## '+inner.trim()+'\n';
      else if(tag==='h3'||tag==='h4') out+='\n### '+inner.trim()+'\n';
      else if(tag==='p') out+='\n'+inner.trim()+'\n';
      else if(tag==='br') out+='\n';
      else if(tag==='hr') out+='\n---\n';
      else if(tag==='strong'||tag==='b') out+='**'+inner.trim()+'**';
      else if(tag==='em'||tag==='i') out+='*'+inner.trim()+'*';
      else if(tag==='code') out+='`'+inner.trim()+'`';
      else if(tag==='blockquote') out+='\n> '+inner.trim().replace(/\n/g,'\n> ')+'\n';
      else if(tag==='li'){
        const cb=n.querySelector&&n.querySelector('input[type=checkbox]');
        out+='\n'+(cb?(cb.checked?'- [x] ':'- [ ] '):'- ')+inner.trim();
      }
      else if(tag==='pre') out+='\n```\n'+inner.trim()+'\n```\n';
      else if(tag==='ul'||tag==='ol'||tag==='table'||tag==='tbody'||tag==='thead') out+='\n'+inner+'\n';
      else if(tag==='tr') out+='\n|'+inner.replace(/\s+\|\s*$/,'')+'|';
      else if(tag==='td'||tag==='th') out+=' '+inner.trim()+' |';
      else if(tag==='a'){
        const href=n.getAttribute('href')||'';
        out+=href?('['+inner.trim()+']('+href+')'):inner;
      }
      else if(tag==='img'){
        const src=n.getAttribute('src')||'';
        out+=/^data:/i.test(src)?'':('![图片]('+src+')');
      }
      else out+=inner;
    });
    return out;
  };
  return walk(doc.body).replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n').trim()+'\n';
}
function printHtml(html){
  const w=window.open('','_blank');
  if(!w){ toast('浏览器拦截了新窗口，请允许弹出窗口'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(()=>{ try{ w.focus(); w.print(); }catch(e){} },500);
}
function currentReaderDoc(){ return docItems().find(x=>x.id===readerId)||null; }
function openExportPanel(){
  const it=currentReaderDoc();
  if(!it){ toast('先选一篇文档'); return; }
  openPanel('⬇ 导出「'+docTitle(it.fileName)+'」','导出的是当前阅读的这篇；要 PDF 就在打印窗口里选「另存为 PDF」。');
  const rows=[
    {k:'html',icon:'📄',t:'导出 HTML',d:'保留原样式，附件一并打包进文件，对方点「下载」即可取出'},
    {k:'md',icon:'📝',t:'导出 Markdown',d:'方便粘贴到其他笔记软件'},
    {k:'print',icon:'🖨',t:'打印 / 存为 PDF',d:'用系统打印对话框另存为 PDF'}
  ];
  const body=$('panelBody');
  body.innerHTML=rows.map(r=>'<div class="tr-row" data-ex="'+r.k+'"><div class="tr-ico">'+r.icon+'</div>'+
    '<div class="tr-main"><div class="tr-t">'+r.t+'</div><div class="tr-s">'+r.d+'</div></div>'+
    '<div class="tr-act"><button>导出</button></div></div>').join('');
  body.querySelectorAll('[data-ex]').forEach(el=>{
    el.onclick=()=>{ closePanel(); exportCurrentDoc(el.dataset.ex); };
  });
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
}
function parseDataUrl(d){
  const m=/^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(d||'');
  if(!m) return null;
  return {mime:m[1]||'application/octet-stream',b64:m[3]};
}
/* 导出用 HTML：把附件（base64）内嵌进文档，接收方点「下载」即可拿到原文件 */
async function buildExportHtml(it,html,interactive){
  let doc;
  try{ doc=new DOMParser().parseFromString(html,'text/html'); }catch(e){ return html; }
  if(!doc||!doc.documentElement) return html;
  const old=doc.getElementById('tbAttachBox'); if(old) old.remove();
  const atts=it.attachments||[];
  if(atts.length){
    const box=doc.createElement('div');
    box.id='tbAttachBox';
    box.setAttribute('style','margin:32px 0;padding:14px 16px;border:1.5px dashed #a9bedd;border-radius:12px;background:rgba(120,150,200,.06)');
    let inner='<div style="font-weight:700;font-size:14px;margin-bottom:6px">📎 附件（'+atts.length+'）</div>';
    const data={};
    for(let i=0;i<atts.length;i++){
      const a=atts[i];
      let item='<div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span>📄</span>'+
        '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+esc(a.name)+'">'+esc(a.name)+'</span>'+
        '<span style="font-size:11px;color:#8a99b3;flex-shrink:0">'+fmtSize(a.size||0)+'</span>';
      if(interactive){
        const du=await imgGet(a.key).catch(()=>null);
        const p=parseDataUrl(du);
        if(p){ data[i]={name:a.name,mime:p.mime,b64:p.b64};
          item+='<a href="javascript:void(0)" data-att="'+i+'" style="color:#4a8ede;cursor:pointer;text-decoration:none;flex-shrink:0">下载</a>'; }
        else item+='<span style="font-size:11px;color:#c08a8a">（数据丢失）</span>';
      }
      inner+=item+'</div>';
    }
    box.innerHTML=inner;
    let anchor=null;
    const cands=doc.querySelectorAll('h1,h2,h3,h4,b,strong');
    for(const el of cands){ if(/感想/.test(el.textContent||'')){ anchor=el; break; } }
    if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(box,anchor);
    else if(doc.body) doc.body.appendChild(box);
    if(interactive&&Object.keys(data).length){
      const scr=doc.createElement('script');
      scr.textContent='(function(){var D='+JSON.stringify(data).replace(/<\//g,'<\\/')+';'+
        'function dl(i){var a=D[i];if(!a)return;var s=atob(a.b64),n=s.length,u=new Uint8Array(n);while(n--)u[n]=s.charCodeAt(n);'+
        'var b=new Blob([u],{type:a.mime});var l=document.createElement("a");l.href=URL.createObjectURL(b);l.download=a.name;'+
        'document.body.appendChild(l);l.click();l.remove();setTimeout(function(){URL.revokeObjectURL(l.href)},4000);}'+
        'document.addEventListener("click",function(e){var t=e.target;while(t&&t!==document){if(t.getAttribute&&t.getAttribute("data-att")){dl(t.getAttribute("data-att"));return;}t=t.parentNode;}});})();';
      doc.body.appendChild(scr);
    }
  }
  return '<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
}
function attachMdList(it){
  const atts=it.attachments||[];
  if(!atts.length) return '';
  return '\n\n---\n\n**📎 附件（'+atts.length+'）：**\n\n'+atts.map(a=>'- '+a.name+'（'+fmtSize(a.size||0)+'，二进制附件不随 Markdown 导出，请从空间或 HTML 版下载）').join('\n')+'\n';
}
async function exportCurrentDoc(kind){
  const it=currentReaderDoc();
  if(!it){ toast('先选一篇文档'); return; }
  const u=await ensureItemLocal(it).catch(()=>null);
  if(!u){ toast('文档数据丢失，试试从云端恢复'); return; }
  const base=docTitle(it.fileName);
  if(isPdfName(it.fileName)){
    const a=document.createElement('a'); a.href=u; a.download=it.fileName;
    document.body.appendChild(a); a.click(); a.remove();
    toast('已下载 PDF 原文件');
    return;
  }
  const html=dataUrlToText(u);
  if(kind==='html'){
    const out=await buildExportHtml(it,html,true);
    downloadText(out,'text/html;charset=utf-8',base+'.html');
    toast('已导出 HTML'+((it.attachments||[]).length?'（含 '+it.attachments.length+' 个附件）':''));
  }
  else if(kind==='md'){
    downloadText(htmlToMarkdown(html)+attachMdList(it),'text/markdown;charset=utf-8',base+'.md');
    toast('已导出 Markdown');
  }
  else printHtml(await buildExportHtml(it,html,false));
}
function edStatus(t){ $('edStatus').textContent=t; }
async function openDocEditor(itemId){
  /* 关键：切换文档前，若上一篇还有未保存改动，趁旧帧内容还在先落盘——否则 pending 的自动保存会把 A 的内容写进 B */
  if(editorItemId&&editorDirty){ clearTimeout(editorSaveTimer); try{ await saveEditorDoc(false); }catch(e){} }
  const mySeq=++edOpenSeq;
  const it=state.items.find(x=>x.id===itemId);
  if(!it||!it.fileKey||!isDocLike(it.fileName)||isPdfName(it.fileName)){ edOpenSeq--; toast('HTML / 文本 / Markdown / docx 支持直接编辑'); return; }
  editorItemId=itemId; editorDirty=false; edLoadedSeq=-1;
  edFindClose(); hideImgTools(); edReplaceImg=null;
  $('edCount').textContent=''; edSetStatus('none');
  touchRecent(itemId);
  $('edTitle').textContent=it.fileName;
  edStatus('加载中…');
  const dataUrl=await ensureItemLocal(it).catch(()=>null);
  if(mySeq!==edOpenSeq) return;   /* 期间用户已切换/关闭了文档，放弃这次打开 */
  if(!dataUrl&&(it.cloudOnly||syncedKeys.has(it.fileKey))){
    edStatus('');
    editorItemId=null;
    $('docEditor').classList.remove('show');
    toast('该文档只存在云端且拉取失败，已取消打开以免覆盖云端内容');
    return;
  }
  let html;
  if(docStoredAsHtml(it,dataUrl)){
    html=dataUrlToText(dataUrl)||defaultDocHTML(stripExt(it.fileName));
  }else{
    if(!dataUrl){ editorItemId=null; edStatus(''); $('docEditor').classList.remove('show'); toast('文件内容缺失，无法编辑'); return; }
    try{
      if(isDocxName(it.fileName)) html=await docxToDocHTML(it,dataUrl);
      else html=textToDocHTML(it.fileName,dataUrlToText(dataUrl));
    }catch(e){
      edStatus('');
      editorItemId=null;
      $('docEditor').classList.remove('show');
      toast(e.message||'解析失败，无法编辑');
      return;
    }
    if(mySeq!==edOpenSeq) return;   /* docx 转换耗时期间切换了文档 */
    if(!it.convertedFrom){ it.convertedFrom=fileExt(it.fileName); save(); }   /* 记录原始格式，下载时保存为 HTML */
  }
  const frame=$('edFrame');
  frame.onload=()=>{
    if(mySeq!==edOpenSeq) return;   /* 过期的加载不接管（帧可能已是别的文档） */
    edLoadedSeq=mySeq;
    try{
      const d=frame.contentDocument;
      d.designMode='on';
      try{ d.execCommand('styleWithCSS',false,true); }catch(e){}
      const st=d.createElement('style');
      st.textContent='::selection{background:rgba(91,153,226,.3)}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #cbd5e0;padding:6px 10px}table tbody tr:nth-child(odd) td{background:#f7fafd}svg{max-width:100%}'+
        DOC_CSS.substring(DOC_CSS.indexOf('ul.tb-task'))+   /* 任务清单/代码块/图注/对齐样式与阅读视图一致 */
        'img.tb-sel{outline:2px solid #5B99E2;outline-offset:2px}'+
        '#tbImgHandle{position:fixed;width:14px;height:14px;background:#5B99E2;border:2.5px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,.35);cursor:nwse-resize;z-index:2147483647}';
      (d.head||d.documentElement).appendChild(st);
      edInitFrameEvents(d,it);
      edStatus((it.editable?'可编辑':'已转为可编辑')+'（自动保存 · 可 Ctrl+V 贴图 · 输入 # 、- 、> 有 Markdown 快捷）');
    }catch(e){ edStatus('此文档结构特殊，无法直接编辑'); }
  };
  $('docEditor').classList.add('show');
  frame.srcdoc=html;
}
function serializeEditor(){
  const d=$('edFrame').contentDocument;
  if(!d||!d.documentElement) return null;
  const root=d.documentElement.cloneNode(true);
  /* 清理编辑时的临时元素：附件框不写回、拖拽手柄移除、图片选中态还原 */
  const box=root.querySelector('#tbAttachBox'); if(box) box.remove();
  const handle=root.querySelector('#tbImgHandle'); if(handle) handle.remove();
  root.querySelectorAll('#tbBlkHandle,#tbBlkMenu,.tb-blk-line,#tbSelBar,#tbSelColors').forEach(x=>x.remove());   /* 块菜单 / 选区工具条临时 UI（js/38、39） */
  root.querySelectorAll('img.tb-sel').forEach(x=>x.classList.remove('tb-sel'));
  return '<!DOCTYPE html>\n'+root.outerHTML;
}
function queueEditorSave(){ clearTimeout(editorSaveTimer); editorSaveTimer=setTimeout(()=>saveEditorDoc(false),1200); }
async function insertImageFile(f){
  try{
    const dataUrl=await compressImage(f,1600,0.85);
    edExec('insertImage',dataUrl);
    toast('图片已嵌入文档');
  }catch(err){ toast('图片处理失败'); }
}
async function saveEditorDoc(manual){
  clearTimeout(editorSaveTimer);
  const saveId=editorItemId;
  if(!saveId) return;
  /* 帧还没加载好（刚切到新文档）——绝不能把上一份内容写进这一份；保持 dirty，稍后重试 */
  if(edLoadedSeq!==edOpenSeq||edLoadedSeq<0){ if(editorDirty) queueEditorSave(); return; }
  const it=state.items.find(x=>x.id===saveId);
  const html=serializeEditor();
  if(!it||!html) return;
  edSetStatus('saving');
  try{
    await imgSet(it.fileKey,'data:text/html;base64,'+btoa(unescape(encodeURIComponent(html))));
    /* 关键：内容已变，把「已上传云端」标记摘掉，强制下次同步重新上传文件本体——
       否则云端永远留着旧内容，本机清缓存 / 换设备后就「丢了」 */
    if(syncedKeys.has(it.fileKey)){ syncedKeys.delete(it.fileKey); saveSynced(); }
    /* 保存期间用户可能已切到别的文档：正文已按原文档安全写入，但元数据不能再用现在的帧（已是别的文档）更新 */
    if(editorItemId!==saveId) return;
    const plain=htmlToPlain(html);
    try{
      const names=[]; let m; const re=/\[\[([^\[\]]+?)\]\]/g;
      while((m=re.exec(plain))){ const n=m[1].trim(); if(n&&!names.includes(n)) names.push(n); }
      it.wikilinks=names;
    }catch(e){}
    it.plain=plain.slice(0,8000);
    it.editable=true; it.edited=Date.now();
    it.docFormat='html';        /* 正文已按 HTML 存盘：之后不论原扩展名是什么都按 HTML 读 */
    it.fileMime='text/html';
    it.fileSize=html.length;
    it.updatedAt=Date.now(); it.blobRev=it.updatedAt;   /* 版本戳：本地缓存正文与该版本一致，供多端合并判断 */
    editorDirty=false;
    save();
    maybeSnapDocVer(it.fileKey,html,!!manual);   /* 单篇版本：手动保存每次都留，自动保存至少间隔 3 分钟 */
    edCountNow();
    edSetStatus('saved');
    if(manual) toast('文档已保存');
  }catch(e){ edStatus('保存失败：'+e.message); }
}
function closeDocEditor(){
  if(editorDirty) saveEditorDoc(false);
  edOpenSeq++; edLoadedSeq=-1;   /* 作废所有未完成的加载/保存，防止关闭后残留串写 */
  clearTimeout(editorSaveTimer);
  $('docEditor').classList.remove('show');
  edFindClose(); hideImgTools(); edReplaceImg=null;
  hideWikiPick();
  editorItemId=null;
  renderAll();
  if($('reader').classList.contains('show')){ renderReaderSide(); showReaderDoc(); }
}
function edExec(cmd,val){
  const d=$('edFrame').contentDocument;
  if(!d) return;
  try{ d.execCommand(cmd,false,val||null); }catch(e){}
  editorDirty=true; edSetStatus('dirty'); queueEditorSave(); edCommitSoon(); edCountSoon();
}
$('edBar').addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
$('edBar').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  if(b.id==='edUndoBtn'){ edUndoOp(); return; }
  if(b.id==='edRedoBtn'){ edRedoOp(); return; }
  if(b.id==='edTaskBtn'){ edInsertTask(); return; }
  if(b.id==='edCodeBtn'){ edInsertCode(); return; }
  if(b.id==='edFindBtn'){ edFindOpen(); return; }
  if(b.dataset.block) edExec('formatBlock','<'+b.dataset.block+'>');
  else if(b.dataset.cmd) edExec(b.dataset.cmd,b.dataset.val);
});
$('edSave').onclick=()=>saveEditorDoc(true);
$('edClose').onclick=closeDocEditor;
/* 模块化版适配：renderDocVerPanel 定义在 js/33-editor-plus.js，
   改为点击时才调用，避免加载期引用未声明标识符。 */
$('edVerBtn').onclick=()=>renderDocVerPanel();
$('edImgBtn').onclick=()=>$('edImgInput').click();
$('edImgInput').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value='';
  if(!f) return;
  /* 替换模式：图片工具条里点了「替换」 */
  if(edReplaceImg&&edCurImg===edReplaceImg){
    try{
      const dataUrl=await compressImage(f,1600,0.85);
      edReplaceImg.src=dataUrl;
      edReplaceImg=null;
      edTouch(); toast('已替换图片');
    }catch(err){ toast('图片处理失败'); }
    return;
  }
  await insertImageFile(f);
});
/* 双向链接候选面板 */
function wikiCandidates(){ return state.items.filter(o=>o.type==='file'&&o.fileKey&&isHtmlName(o.fileName)); }
function showWikiPick(){
  const p=$('wikiPick'), inp=$('wikiPickInput');
  inp.value='';
  renderWikiPickList('');
  const bar=$('edBar').getBoundingClientRect();
  p.style.left=Math.max(12,bar.right-272)+'px';
  p.style.top=(bar.bottom+8)+'px';
  p.classList.add('show');
  inp.focus();
}
function hideWikiPick(){ $('wikiPick').classList.remove('show'); }
function renderWikiPickList(q){
  const list=$('wikiPickList');
  const docs=wikiCandidates().filter(o=>!q||o.fileName.toLowerCase().includes(q));
  list.innerHTML=docs.length
    ?docs.map(o=>'<div class="wp-item" data-name="'+esc(stripExt(o.fileName))+'">🌐 '+esc(o.fileName)+'</div>').join('')
    :'<div class="wp-empty">没有匹配的文档，按回车用输入的名字创建链接</div>';
  list.querySelectorAll('.wp-item').forEach(el=>{ el.onclick=()=>insertWiki(el.dataset.name); });
}
function insertWiki(name){
  const d=$('edFrame').contentDocument;
  if(d&&d.body) d.body.focus();
  edExec('insertText','[['+name+']]');
  hideWikiPick();
}
$('edWikiBtn').onclick=showWikiPick;
/* 文字颜色 / 背景高亮 / 表格 / 思维导图 */
function edColorExec(cmd,val){
  const d=$('edFrame').contentDocument;
  if(d){ try{ d.execCommand('styleWithCSS',false,true); }catch(e){} }
  edExec(cmd,val);
}
$('edFgColor').addEventListener('input',e=>edColorExec('foreColor',e.target.value));
$('edHlColor').addEventListener('input',e=>edColorExec('hiliteColor',e.target.value));
$('edTableBtn').onclick=async()=>{
  const s=await uiPrompt({title:'插入表格',label:'行数×列数（首行为表头）',value:'3×4',max:8});
  if(!s) return;
  const m=/(\d+)\s*[×xX*]\s*(\d+)/.exec(s);
  if(!m){ toast('格式不对，例如 3×4'); return; }
  const r0=Math.min(20,Math.max(2,+m[1])), c=Math.min(10,Math.max(1,+m[2]));
  let h='<table><thead><tr>';
  for(let i=0;i<c;i++) h+='<th>标题'+(i+1)+'</th>';
  h+='</tr></thead><tbody>';
  for(let i=1;i<r0;i++){ h+='<tr>'; for(let j=0;j<c;j++) h+='<td>&nbsp;</td>'; h+='</tr>'; }
  h+='</tbody></table><p><br></p>';
  edExec('insertHTML',h);
  toast('已插入 '+r0+'×'+c+' 表格，点击单元格即可编辑');
};
$('edMindBtn').onclick=async()=>{
  const s=await uiPrompt({title:'插入思维导图',label:'每行一个节点，行首用空格缩进表示层级（每 2 个空格一层）',value:'中心主题\n  分支一\n  分支二',multiline:true,rows:6});
  if(s===null) return;
  const svg=buildMindmapSVG(s);
  if(!svg){ toast('没有可用的内容'); return; }
  edExec('insertHTML',svg+'<p><br></p>');
  toast('已插入思维导图（想改就删掉重插一张）');
};
/* 多维表格嵌入文档：数据存条目 it.grid，占位块插进正文，点工具栏按钮随时打开编辑 */
$('edGridBtn').onclick=()=>{
  const it=state.items.find(x=>x.id===editorItemId);
  if(!it) return;
  const hasData=it.grid&&Array.isArray(it.grid.cols)&&Array.isArray(it.grid.rows);
  if(hasData){ openGridEmbed(it.id); return; }
  /* 首次插入：若正文还没有占位块则插入一块 */
  const fd=$('edFrame').contentDocument;
  if(fd&&!fd.querySelector('.tb-grid-embed')){
    edExec('insertHTML','<div class="tb-grid-embed" contenteditable="false">📊 多维表格 · 数据存在这篇文章里，点工具栏「多维表」维护</div><p><br></p>');
  }
  it.grid=gridDefaultData();
  save();
  openGridEmbed(it.id);
};
$('wikiPickInput').addEventListener('input',function(){ renderWikiPickList(this.value.trim().toLowerCase()); });
$('wikiPickInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ const v=$('wikiPickInput').value.trim(); if(v) insertWiki(v); }
  if(e.key==='Escape'){ e.stopPropagation(); hideWikiPick(); }
});
document.addEventListener('click',e=>{
  const p=$('wikiPick');
  if(p.classList.contains('show')&&!p.contains(e.target)&&e.target.id!=='edWikiBtn') hideWikiPick();
});
