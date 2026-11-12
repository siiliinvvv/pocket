/* ============================================================
   Pocket · 编辑器增强
   撤销栈、Markdown 快捷输入、查找替换、图片工具、单篇版本、模板与新建文档
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 编辑器增强：撤销栈 / Markdown / 查找替换 / 图片工具 / 单篇版本 ================= */
function edDoc(){ const f=$('edFrame'); return (f&&f.contentDocument&&f.contentDocument.body)?f.contentDocument:null; }
/* ---- 保存状态三态 ---- */
function edSetStatus(kind){
  const el=$('edStatus');
  if(kind==='none'){ el.textContent=''; return; }
  if(kind==='dirty'){ el.innerHTML='<span class="ed-dot amber"></span>未保存'; return; }
  if(kind==='saving'){ el.innerHTML='<span class="ed-dot blue"></span>保存中…'; return; }
  if(kind==='saved'){
    const off=(!navigator.onLine)||!!(typeof ghLastErr!=='undefined'&&ghLastErr);
    el.innerHTML='<span class="ed-dot '+(off?'off':'green')+'"></span>'+(off?'已保存本地 · 离线待同步':'已保存 '+new Date().toLocaleTimeString());
    return;
  }
  el.textContent=kind;
}
/* ---- 字数统计 ---- */
function edCountNow(){
  const d=edDoc();
  if(!d||!d.body){ $('edCount').textContent=''; return; }
  const n=(d.body.textContent||'').replace(/\s+/g,'').length;
  $('edCount').textContent=n?n+' 字':'';
}
function edCountSoon(){ clearTimeout(edCountTimer); edCountTimer=setTimeout(edCountNow,300); }
/* ---- 编辑器专属撤销 / 重做（快照栈，不依赖已废弃的 undo manager） ---- */
function edInitUndo(){ const d=edDoc(); edUndoArr=(d&&d.body)?[d.body.innerHTML]:[]; edRedoArr=[]; }
function edCommitNow(){
  const d=edDoc(); if(!d||!d.body) return;
  const s=d.body.innerHTML;
  if(!edUndoArr.length||edUndoArr[edUndoArr.length-1]!==s){ edUndoArr.push(s); if(edUndoArr.length>100) edUndoArr.shift(); edRedoArr=[]; }
}
function edCommitSoon(){ clearTimeout(edCommitTimer); edCommitTimer=setTimeout(edCommitNow,450); }
function edApplyHTML(html){
  const d=edDoc(); if(!d||!d.body) return;
  d.body.innerHTML=html; hideImgTools(); edTouch(); edCountNow();
}
function edUndoOp(){
  const d=edDoc(); if(!d||!d.body) return;
  const s=d.body.innerHTML;
  while(edUndoArr.length&&edUndoArr[edUndoArr.length-1]===s) edUndoArr.pop();
  if(!edUndoArr.length) return;
  edRedoArr.push(s); if(edRedoArr.length>100) edRedoArr.shift();
  edApplyHTML(edUndoArr.pop());
}
function edRedoOp(){
  const d=edDoc(); if(!d||!d.body) return;
  const s=d.body.innerHTML;
  while(edRedoArr.length&&edRedoArr[edRedoArr.length-1]===s) edRedoArr.pop();
  if(!edRedoArr.length) return;
  edUndoArr.push(s);
  edApplyHTML(edRedoArr.pop());
}
function edTouch(){ editorDirty=true; edSetStatus('dirty'); queueEditorSave(); edCountSoon(); edFindRebuildSoon(); }
/* ---- 块级元素定位（Markdown 快捷输入用） ---- */
function edBlockOf(d,node){
  let n=node;
  while(n&&n!==d.body){
    if(n.nodeType===1&&/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName)) return n;
    n=n.parentNode;
  }
  return null;
}
function edSetCaret(d,node,atEnd){
  try{
    const r=d.createRange();
    if(atEnd) r.selectNodeContents(node), r.collapse(false);
    else r.setStart(node,0), r.collapse(true);
    const s=d.getSelection(); s.removeAllRanges(); s.addRange(r);
  }catch(e){}
}
/* ---- Markdown 快捷输入：# / - / 1. / > / [ ] + 空格；``` / --- + 回车 ---- */
function edMdSpace(d,e){
  const s=d.getSelection(); if(!s||!s.rangeCount||!s.isCollapsed) return false;
  const block=edBlockOf(d,s.getRangeAt(0).startContainer); if(!block||block.tagName==='PRE') return false;
  const t=(block.textContent||'').trim();
  let cmd=null,val=null,task=null;
  if(/^#{1}$/.test(t)){ cmd='formatBlock'; val='<h1>'; }
  else if(/^#{2}$/.test(t)){ cmd='formatBlock'; val='<h2>'; }
  else if(/^#{3}$/.test(t)){ cmd='formatBlock'; val='<h3>'; }
  else if(/^[-*+]$/.test(t)){ cmd='insertUnorderedList'; }
  /* 序号「1.」「2.」不再自动转成有序列表——保留为普通文字，避免误触发列表 / 标题 */
  else if(/^>$/.test(t)){ cmd='formatBlock'; val='blockquote'; }
  else if(/^[-*+]\s*\[\s?\]$/.test(t)){ task=false; }
  else if(/^[-*+]\s*\[x\]$/i.test(t)){ task=true; }
  else return false;
  e.preventDefault();
  block.textContent='';
  if(task!==null){
    const ul=d.createElement('ul'); ul.className='tb-task';
    const li=d.createElement('li');
    const cb=d.createElement('input'); cb.type='checkbox'; if(task) cb.checked=true;
    li.appendChild(cb); li.appendChild(d.createTextNode('\u00A0'));
    ul.appendChild(li);
    block.parentNode.replaceChild(ul,block);
    edSetCaret(d,li,true);
  }else{
    edSetCaret(d,block,false);
    try{ d.execCommand(cmd,false,val||null); }catch(err){}
  }
  edTouch();
  return true;
}
function edMdEnter(d,e){
  const s=d.getSelection(); if(!s||!s.rangeCount) return false;
  const block=edBlockOf(d,s.getRangeAt(0).startContainer); if(!block) return false;
  const t=(block.textContent||'').trim();
  if(/^(```|~~~)$/.test(t)){
    e.preventDefault();
    const pre=d.createElement('pre'); pre.className='tb-code'; pre.textContent='在这里写代码…';
    block.parentNode.replaceChild(pre,block);
    edSetCaret(d,pre,true); edTouch();
    return true;
  }
  if(/^(-{3,}|\*{3,})$/.test(t)){
    e.preventDefault();
    const hr=d.createElement('hr'); const p=d.createElement('p'); p.innerHTML='<br>';
    block.parentNode.replaceChild(hr,block);
    hr.parentNode.insertBefore(p,hr.nextSibling);
    edSetCaret(d,p,false); edTouch();
    return true;
  }
  if(block.tagName==='PRE'){ e.preventDefault(); try{ d.execCommand('insertText',false,'\n'); }catch(err){} edTouch(); return true; }
  /* 标题行回车：光标后的内容拆到新行，且新行一律是正文段落——
     不管是标题末尾、标题中间，还是标题里输入序号后回车，都不会自动变成标题 */
  if(/^H[1-6]$/.test(block.tagName)&&!e.shiftKey){
    e.preventDefault();
    const p=d.createElement('p');
    try{
      const r=d.getSelection().getRangeAt(0);
      const after=d.createRange();
      after.setStart(r.endContainer,r.endOffset);
      after.setEnd(block,block.childNodes.length);
      const frag=after.extractContents();
      if(frag&&frag.childNodes.length) p.appendChild(frag);
    }catch(err){}
    if(!p.childNodes.length) p.innerHTML='<br>';
    block.parentNode.insertBefore(p,block.nextSibling);
    edSetCaret(d,p,!p.textContent.trim());
    edTouch();
    return true;
  }
  /* 任务清单里回车：给新 li 自动补勾选框 */
  if(block.tagName==='LI'&&block.parentNode&&block.parentNode.classList&&block.parentNode.classList.contains('tb-task')){
    setTimeout(()=>{
      try{
        const s2=d.getSelection(); if(!s2||!s2.rangeCount) return;
        const nb=edBlockOf(d,s2.getRangeAt(0).startContainer);
        if(nb&&nb.tagName==='LI'&&nb.parentNode.classList.contains('tb-task')&&!nb.querySelector('input[type=checkbox]')){
          const cb=d.createElement('input'); cb.type='checkbox'; nb.insertBefore(cb,nb.firstChild);
          editorDirty=true; queueEditorSave();
        }
      }catch(err){}
    },0);
  }
  return false;
}
function looksLikeMarkdown(t){
  if(!t||t.length<10) return false;
  return /(^|\n)[ ]*(#{1,6} |[-*+] |\d+\. |> |```|\|.+\|)/.test(t);
}
/* ---- iframe 事件统一初始化 ---- */
function edInitFrameEvents(d,it){
  d.addEventListener('input',()=>{ edTouch(); edCommitSoon(); });
  /* Ctrl+V 贴截图；纯文本 Markdown 自动转富文本 */
  d.addEventListener('paste',e=>{
    const cd=e.clipboardData; if(!cd) return;
    const items=cd.items||[];
    for(let i=0;i<items.length;i++){
      if(items[i].type&&items[i].type.indexOf('image/')===0){
        e.preventDefault();
        const f=items[i].getAsFile();
        if(f) insertImageFile(f);
        return;
      }
    }
    try{
      const hasHtml=cd.types&&[].indexOf.call(cd.types,'text/html')>=0&&(cd.getData('text/html')||'').trim();
      const txt=cd.getData('text/plain')||'';
      if(!hasHtml&&txt&&looksLikeMarkdown(txt)){
        e.preventDefault();
        edExec('insertHTML',mdToHtml(txt));
        toast('已把 Markdown 转成富文本');
      }
    }catch(err){}
  });
  /* 把图片拖进正文 */
  d.addEventListener('dragover',e=>{ if(e.dataTransfer&&e.dataTransfer.types&&[].indexOf.call(e.dataTransfer.types,'Files')>=0) e.preventDefault(); });
  d.addEventListener('drop',e=>{
    const fs=e.dataTransfer&&e.dataTransfer.files;
    if(!fs||!fs.length) return;
    const imgs=[].slice.call(fs).filter(f=>f.type&&f.type.indexOf('image/')===0);
    if(!imgs.length) return;
    e.preventDefault();
    imgs.forEach(f=>insertImageFile(f));
  });
  /* 键盘：撤销重做 / 查找 / Markdown 快捷 / 代码块内缩进 */
  d.addEventListener('keydown',e=>{
    const mod=e.ctrlKey||e.metaKey;
    if(mod&&!e.shiftKey&&(e.key==='z'||e.key==='Z')){ e.preventDefault(); edUndoOp(); return; }
    if(mod&&((e.shiftKey&&(e.key==='z'||e.key==='Z'))||e.key==='y'||e.key==='Y')){ e.preventDefault(); edRedoOp(); return; }
    if(mod&&(e.key==='f'||e.key==='F')){ e.preventDefault(); edFindOpen(); return; }
    if(e.key==='Escape'){
      if($('edFind').classList.contains('show')){ e.preventDefault(); edFindClose(); }
      else if($('imgTools').classList.contains('show')){ hideImgTools(); }
      else closeDocEditor();
      return;
    }
    if(e.key==='Enter'&&edMdEnter(d,e)) return;
    /* 兜底：不管从哪种块、哪种输入法状态按回车，新行都不允许「继承」成 H1-H6。
       浏览器在标题 / 某些结构里按回车会复制当前块格式，这里在回车后校正为正文段落。 */
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){
      let before=null;
      try{ before=edBlockOf(d,d.getSelection().getRangeAt(0).startContainer); }catch(err){}
      setTimeout(()=>{
        try{
          const s2=d.getSelection(); if(!s2||!s2.rangeCount) return;
          const nb=edBlockOf(d,s2.getRangeAt(0).startContainer);
          if(!nb||!/^H[1-6]$/.test(nb.tagName)) return;
          if(before&&/^H[1-6]$/.test(before.tagName)) return;   /* 本来就在标题里：上面的逻辑已处理 */
          const p=d.createElement('p');
          while(nb.firstChild) p.appendChild(nb.firstChild);
          if(!p.childNodes.length) p.innerHTML='<br>';
          nb.parentNode.replaceChild(p,nb);
          edSetCaret(d,p,!p.textContent.trim());
          edTouch(); edCommitSoon();
        }catch(err){}
      },0);
    }
    if(e.key===' '&&!mod&&edMdSpace(d,e)) return;
    if(e.key==='Tab'){
      const s=d.getSelection();
      if(s&&s.rangeCount){
        const b=edBlockOf(d,s.getRangeAt(0).startContainer);
        if(b&&b.tagName==='PRE'){ e.preventDefault(); try{ d.execCommand('insertText',false,'  '); }catch(err){} edTouch(); }
      }
    }
  });
  /* 任务清单勾选：接管点击，保证切换并标脏 */
  d.addEventListener('mousedown',e=>{
    if(e.target&&e.target.tagName==='INPUT'&&e.target.type==='checkbox'){
      e.preventDefault();
      e.target.checked=!e.target.checked;
      editorDirty=true; edSetStatus('dirty'); queueEditorSave(); edCommitSoon();
    }
    if(e.target&&e.target.id==='tbImgHandle'){
      e.preventDefault();
      const img=edCurImg; if(!img) return;
      const startX=e.clientX, startW=img.getBoundingClientRect().width;
      const maxW=Math.max(120,d.body.clientWidth-40);
      const mv=ev=>{
        const w=Math.max(50,Math.min(maxW,startW+(ev.clientX-startX)));
        img.style.width=w+'px'; img.style.height='auto';
        edImgPos();
      };
      const up=()=>{ d.removeEventListener('mousemove',mv); d.removeEventListener('mouseup',up); edTouch(); };
      d.addEventListener('mousemove',mv); d.addEventListener('mouseup',up);
    }
  });
  /* 点图片 → 浮动工具条；点空白处 → 收起 */
  d.addEventListener('click',e=>{
    if(e.target&&e.target.tagName==='IMG'){ e.preventDefault(); edImgSelect(e.target); }
    else if(e.target&&e.target.id!=='tbImgHandle') hideImgTools();
  });
  d.addEventListener('scroll',()=>edImgPos(),true);
  setTimeout(()=>{ edInitUndo(); edCountNow(); },60);
}
/* ---- 任务清单 / 代码块按钮 ---- */
function edInsertTask(){
  edExec('insertHTML','<ul class="tb-task"><li><input type="checkbox">&nbsp;</li></ul><p><br></p>');
  toast('已插入任务清单，点击方块即可勾选');
}
function edInsertCode(){
  edExec('insertHTML','<pre class="tb-code">在这里写代码…</pre><p><br></p>');
  toast('已插入代码块（代码块内回车 / Tab 都按代码处理）');
}
/* ---- 查找替换 ---- */
let edFindMatches=[], edFindIdx=-1, edFindTimer=null;
function edFindOpen(){ $('edFind').classList.add('show'); $('edFindInput').focus(); $('edFindInput').select(); edFindBuild(); }
function edFindClose(){ $('edFind').classList.remove('show'); }
function edFindRebuildSoon(){
  if(!$('edFind').classList.contains('show')) return;
  clearTimeout(edFindTimer); edFindTimer=setTimeout(()=>edFindBuild(true),400);
}
function edClearSel(){ const d=edDoc(); if(d){ try{ d.getSelection().removeAllRanges(); }catch(e){} } }
function edFindBuild(keep){
  const d=edDoc();
  edFindMatches=[]; edFindIdx=-1;
  const q=$('edFindInput').value;
  if(d&&d.body&&q){
    const cs=$('edFindCase').checked; const needle=cs?q:q.toLowerCase();
    const tw=d.createTreeWalker(d.body,NodeFilter.SHOW_TEXT,null);
    const nodes=[];
    while(tw.nextNode()) nodes.push(tw.currentNode);
    for(const t of nodes){
      const v=t.nodeValue||''; const hay=cs?v:v.toLowerCase();
      let i=0;
      while((i=hay.indexOf(needle,i))>=0){ edFindMatches.push({node:t,start:i,end:i+needle.length}); i+=needle.length; if(edFindMatches.length>5000) break; }
      if(edFindMatches.length>5000) break;
    }
  }
  edFindShow();
  if(edFindMatches.length) edFindGoto(keep&&edFindIdx>=0?edFindIdx:0); else edClearSel();
}
function edFindShow(){
  const q=$('edFindInput').value;
  $('edFindCount').textContent=!q?'':(edFindMatches.length?((edFindIdx+1)+'/'+edFindMatches.length):'无结果');
}
function edFindGoto(i){
  if(!edFindMatches.length) return;
  edFindIdx=((i%edFindMatches.length)+edFindMatches.length)%edFindMatches.length;
  const m=edFindMatches[edFindIdx]; const d=edDoc();
  try{
    const r=d.createRange(); r.setStart(m.node,m.start); r.setEnd(m.node,m.end);
    const s=d.getSelection(); s.removeAllRanges(); s.addRange(r);
    m.node.parentNode.scrollIntoView({block:'center'});
  }catch(e){}
  edFindShow();
}
function edRepOne(){
  const d=edDoc(); const q=$('edFindInput').value;
  if(!d||!q) return;
  if(!edFindMatches.length){ edFindBuild(); if(!edFindMatches.length){ toast('没有找到「'+q+'」'); return; } }
  if(edFindIdx<0) edFindGoto(0);
  const m=edFindMatches[edFindIdx];
  try{
    const r=d.createRange(); r.setStart(m.node,m.start); r.setEnd(m.node,m.end);
    r.deleteContents();
    const rep=$('edReplaceInput').value;
    if(rep) r.insertNode(d.createTextNode(rep));
  }catch(e){}
  edTouch();
  const nxt=edFindIdx;
  setTimeout(()=>edFindBuild(true),60);
}
function edRepAll(){
  const d=edDoc(); const q=$('edFindInput').value;
  if(!d||!q) return;
  if(!edFindMatches.length) edFindBuild();
  if(!edFindMatches.length){ toast('没有找到「'+q+'」'); return; }
  const rep=$('edReplaceInput').value;
  let n=0;
  for(let i=edFindMatches.length-1;i>=0;i--){
    const m=edFindMatches[i];
    try{ const r=d.createRange(); r.setStart(m.node,m.start); r.setEnd(m.node,m.end); r.deleteContents(); if(rep) r.insertNode(d.createTextNode(rep)); n++; }catch(e){}
  }
  edTouch(); toast('已替换 '+n+' 处');
  setTimeout(()=>edFindBuild(),60);
}
$('edFindInput').addEventListener('input',()=>{ clearTimeout(edFindTimer); edFindTimer=setTimeout(()=>edFindBuild(),350); });
$('edFindInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); e.shiftKey?edFindGoto(edFindIdx-1):edFindGoto(edFindIdx+1); }
  if(e.key==='Escape'){ e.stopPropagation(); edFindClose(); }
});
$('edReplaceInput').addEventListener('keydown',e=>{
  if(e.key==='Enter'){ e.preventDefault(); edRepOne(); }
  if(e.key==='Escape'){ e.stopPropagation(); edFindClose(); }
});
$('edFindCase').addEventListener('change',()=>edFindBuild());
$('edFindPrev').onclick=()=>edFindGoto(edFindIdx-1);
$('edFindNext').onclick=()=>edFindGoto(edFindIdx+1);
$('edRepOne').onclick=edRepOne;
$('edRepAll').onclick=edRepAll;
$('edFindClose').onclick=edFindClose;
/* ---- 图片浮动工具条 ---- */
let edCurImg=null, edReplaceImg=null;
function edImgSelect(img){
  hideImgTools();
  const d=edDoc(); if(!d) return;
  edCurImg=img; img.classList.add('tb-sel');
  const h=d.createElement('div'); h.id='tbImgHandle'; d.body.appendChild(h);
  $('imgTools').classList.add('show');
  edImgPos();
}
function edImgPos(){
  const d=edDoc(); const img=edCurImg; const t=$('imgTools');
  if(!d||!img||!img.isConnected||!t.classList.contains('show')) return;
  const h=d.getElementById('tbImgHandle');
  const fr=$('edFrame').getBoundingClientRect(); const ir=img.getBoundingClientRect();
  if(ir.bottom<50||ir.top>window.innerHeight-70) return;
  if(h){ h.style.left=(fr.left+ir.right-8)+'px'; h.style.top=(fr.top+ir.bottom-8)+'px'; }
  t.style.left=Math.max(8,Math.min(window.innerWidth-t.offsetWidth-8,fr.left+ir.left+ir.width/2-t.offsetWidth/2))+'px';
  t.style.top=Math.min(window.innerHeight-t.offsetHeight-10,fr.top+ir.bottom+10)+'px';
}
function hideImgTools(){
  $('imgTools').classList.remove('show');
  const d=edDoc();
  if(d){
    const h=d.getElementById('tbImgHandle'); if(h) h.remove();
    d.querySelectorAll('img.tb-sel').forEach(x=>x.classList.remove('tb-sel'));
  }
  edCurImg=null;
}
window.addEventListener('resize',()=>edImgPos());
$('imgTools').addEventListener('mousedown',e=>{ if(e.target.closest('button')) e.preventDefault(); });
$('imgTools').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return;
  const img=edCurImg, d=edDoc();
  if(!img||!d||!img.isConnected){ hideImgTools(); return; }
  const act=b.dataset.it;
  if(act==='small'||act==='big'){
    const cur=img.getBoundingClientRect().width;
    const maxW=Math.max(120,d.body.clientWidth-40);
    img.style.width=Math.round(Math.max(50,Math.min(maxW,act==='big'?cur*1.25:cur*0.8)))+'px';
    img.style.height='auto';
  }
  else if(act==='w25'||act==='w50'||act==='w100'){ img.style.width=act.slice(1)+'%'; img.style.height='auto'; }
  else if(act==='left'){ img.dataset.float='left'; img.style.cssFloat=''; img.style.margin=''; img.style.display=''; }
  else if(act==='right'){ img.dataset.float='right'; img.style.cssFloat=''; img.style.margin=''; img.style.display=''; }
  else if(act==='center'){ img.dataset.float='center'; img.style.cssFloat=''; img.style.margin=''; img.style.display=''; }
  else if(act==='inline'){ img.removeAttribute('data-float'); img.style.cssFloat=''; img.style.margin=''; img.style.display=''; }
  else if(act==='caption'){
    const p=img.parentNode;
    if(p&&p.tagName==='FIGURE'&&p.classList.contains('tb-fig')){
      const cap=p.querySelector('figcaption');
      if(cap){
        const r=d.createRange(); r.selectNodeContents(cap);
        const s=d.getSelection(); s.removeAllRanges(); s.addRange(r);
        cap.scrollIntoView({block:'center'});
      }
    }else{
      const fig=d.createElement('figure'); fig.className='tb-fig';
      const cap=d.createElement('figcaption'); cap.textContent='图注：点这里改成你想写的说明';
      p.insertBefore(fig,img); fig.appendChild(img); fig.appendChild(cap);
      const r=d.createRange(); r.selectNodeContents(cap);
      const s=d.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
  }
  else if(act==='alt'){
    (async()=>{
      const v=await uiPrompt({title:'图片 ALT 描述',label:'给图片写一句描述（无障碍阅读 / 导出时有用）',value:img.getAttribute('alt')||'',max:120});
      if(v!=null){ img.setAttribute('alt',v); edTouch(); }
    })();
  }
  else if(act==='replace'){ edReplaceImg=img; $('edImgInput').click(); }
  else if(act==='del'){
    const fig=img.closest?img.closest('figure.tb-fig'):null;
    (fig||img).remove();
    hideImgTools();
  }
  edTouch(); edImgPos();
});
/* ---- 单篇文档版本历史（与整箱快照相互独立） ---- */
const DOCVER_KEY='tb_docver_v1';
function readDocVers(){ try{ const o=JSON.parse(localStorage.getItem(DOCVER_KEY)||'{}'); return (o&&typeof o==='object'&&!Array.isArray(o))?o:{}; }catch(e){ return {}; } }
function writeDocVers(o){
  try{ localStorage.setItem(DOCVER_KEY,JSON.stringify(o)); }
  catch(e){
    /* 存储超限：从最旧的文档开始收缩版本数 */
    try{
      const ks=Object.keys(o).sort((a,b)=>((o[a][0]&&o[a][0].t)||0)-((o[b][0]&&o[b][0].t)||0));
      for(const k of ks){
        o[k]=o[k].slice(-4);
        try{ localStorage.setItem(DOCVER_KEY,JSON.stringify(o)); return; }catch(_){}
      }
    }catch(_){}
  }
}
function maybeSnapDocVer(fileKey,html,force){
  if(!fileKey||!html||html.length>1500000) return;   /* 超大文档不进版本库，防止撑爆存储 */
  const all=readDocVers(); const arr=all[fileKey]||(all[fileKey]=[]);
  const last=arr[arr.length-1];
  if(last&&last.html===html) return;
  if(!force&&last&&Date.now()-last.t<3*60*1000) return;   /* 自动版本至少间隔 3 分钟；手动保存每次都留 */
  arr.push({t:Date.now(),html});
  while(arr.length>15) arr.shift();
  writeDocVers(all);
}
function loadEditorHTML(html){ const f=$('edFrame'); if(f) f.srcdoc=html; }
/* 文本行提取（差异对比用）：按块级元素切行 */
function docLines(html){
  try{
    const doc=new DOMParser().parseFromString(html,'text/html');
    doc.querySelectorAll('script,style,noscript').forEach(e=>e.remove());
    const lines=[];
    (doc.body?doc.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,tr,hr,figcaption'):[]).forEach(el=>{
      if(el.tagName!=='TR'&&el.closest('tr')) return;
      if(el.tagName!=='LI'&&el.closest('li')) return;
      if(el.tagName!=='PRE'&&el.closest('pre')) return;
      const t=el.tagName==='HR'?'———':(el.textContent||'').replace(/\s+/g,' ').trim();
      if(t) lines.push(t);
    });
    return lines;
  }catch(e){ return []; }
}
function diffLines(a,b){
  const n=a.length,m=b.length;
  if((n+1)*(m+1)>4000000) return null;
  const W=m+1;
  const dp=new Uint32Array((n+1)*W);
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--) dp[i*W+j]=(a[i]===b[j])?dp[(i+1)*W+j+1]+1:Math.max(dp[(i+1)*W+j],dp[i*W+j+1]);
  const out=[]; let i=0,j=0;
  while(i<n&&j<m){
    if(a[i]===b[j]){ out.push(['ctx',a[i]]); i++; j++; }
    else if(dp[(i+1)*W+j]>=dp[i*W+j+1]){ out.push(['del',a[i]]); i++; }
    else{ out.push(['add',b[j]]); j++; }
  }
  while(i<n) out.push(['del',a[i++]]);
  while(j<m) out.push(['add',b[j++]]);
  return out;
}
function renderDocDiff(oldHtml,newHtml){
  const box=$('dvDiffBox'); if(!box) return;
  const a=docLines(oldHtml), b=docLines(newHtml);
  const d=diffLines(a,b);
  if(!d){ box.innerHTML='<div class="dv-stats">内容太长，无法逐行对比。该版本共 '+a.length+' 行，当前 '+b.length+' 行。</div>'; return; }
  const del=d.filter(x=>x[0]==='del').length, add=d.filter(x=>x[0]==='add').length;
  let html='<div class="dv-stats">该版本 vs 当前：当前缺少 '+del+' 行 · 新增 '+add+' 行'+((del+add)?'':'（内容完全相同）')+'</div>';
  if(del+add){
    const parts=[]; let ctxRun=[];
    const flushCtx=()=>{
      if(ctxRun.length>8){
        parts.push(['ctx',ctxRun[0]]);
        parts.push(['skip','… 中间 '+(ctxRun.length-2)+' 行相同 …']);
        parts.push(['ctx',ctxRun[ctxRun.length-1]]);
      }else ctxRun.forEach(x=>parts.push(['ctx',x]));
      ctxRun=[];
    };
    d.forEach(x=>{ if(x[0]==='ctx') ctxRun.push(x[1]); else{ flushCtx(); parts.push(x); } });
    flushCtx();
    html+=parts.map(x=>x[0]==='skip'
      ?'<div class="dv-line ctx" style="text-align:center">'+esc(x[1])+'</div>'
      :'<div class="dv-line '+x[0]+'">'+esc(x[1])+'</div>').join('');
  }
  box.innerHTML=html;
}
function renderDocVerPanel(){
  const it=state.items.find(x=>x.id===editorItemId);
  if(!it||!it.fileKey){ toast('先打开一篇文档'); return; }
  const arr=(readDocVers()[it.fileKey]||[]).slice().reverse();
  openPanel('🕘 版本历史 · '+docTitle(it.fileName),'编辑保存后自动留版本（至少间隔 3 分钟），手动点「保存」每次都留。每篇最多 15 份，只存在本机。');
  const body=$('panelBody');
  if(!arr.length){
    body.innerHTML='<div class="rd-empty">这篇还没有版本。<br>继续编辑并保存，就会自动开始留底。</div>';
  }else{
    body.innerHTML=arr.map((v,i)=>{
      const d=new Date(v.t);
      return '<div class="tr-row"><div class="tr-ico">🕘</div><div class="tr-main">'+
        '<div class="tr-t">'+d.toLocaleString()+'</div>'+
        '<div class="tr-s">'+relTime(v.t)+' · 约 '+Math.max(1,Math.round(v.html.length/1024))+' KB</div></div>'+
        '<div class="tr-act"><button data-vdiff="'+i+'">对比当前</button><button data-vres="'+i+'">恢复</button></div></div>';
    }).join('')+'<div id="dvDiffBox" style="margin-top:10px"></div>';
    body.querySelectorAll('[data-vdiff]').forEach(b=>{
      b.onclick=()=>renderDocDiff(arr[+b.dataset.vdiff].html,serializeEditor()||'');
    });
    body.querySelectorAll('[data-vres]').forEach(b=>{
      b.onclick=async()=>{
        const v=arr[+b.dataset.vres];
        if(!await uiConfirm({title:'恢复此版本',msg:'编辑器内容会替换成 '+new Date(v.t).toLocaleString()+' 的版本。当前内容会先自动留一份版本，随时可以再恢复回来。',okText:'恢复'})) return;
        await saveEditorDoc(false);                                   /* 当前内容先落盘 */
        const cur=serializeEditor();
        if(cur) maybeSnapDocVer(it.fileKey,cur,true);                 /* 并强制留一版 */
        loadEditorHTML(v.html);
        editorDirty=true; queueEditorSave();
        closePanel(); toast('已恢复到 '+new Date(v.t).toLocaleString()+' 的版本');
      };
    });
  }
  $('panelFoot').innerHTML='<button class="btn ghost" id="panelCloseBtn">关闭</button>';
  $('panelCloseBtn').onclick=closePanel;
}
/* ================= 编辑器增强结束 ================= */

/* 新建可编辑文档 */
async function newEditableDoc(forcedName,tpl){
  let name=forcedName;
  if(!name){ name=await uiPrompt({title:'新建文档',label:'文档名字',max:60,required:true}); if(!name||!name.trim()) return; name=name.trim(); }
  const fid=(rdFolderFilter!=='all')?rdFolderFilter:(currentFolderId!==HOME_ID?currentFolderId:(state.folders[0]?state.folders[0].id:null));
  const k='doc_'+uid();
  const html=defaultDocHTML(name,tpl);
  try{
    await writeDocFile(k,html);
  }catch(e){ toast('创建失败：'+e.message); return; }
  const it={id:uid(),folderId:fid,type:'file',fileName:name+'.html',text:'',fileSize:html.length,fileMime:'text/html',fileKey:k,tags:[],created:Date.now(),pinned:false,editable:true,wikilinks:[],plain:htmlToPlain(html)};
  state.items.push(it); save();
  toast('已创建「'+name+'」，开始编辑吧');
  await openDocEditor(it.id);
}
$('rdNewDoc').onclick=()=>pickTemplate(function(k){ newEditableDoc(null,k); });
/* 笔记按钮：一键新建富文本笔记并直接进入编辑（像飞书文档） */
$('addNoteBtn').onclick=createRichNote;
async function createRichNote(){
  const d=new Date();
  const pad=n=>(n<10?'0':'')+n;
  const name='笔记 '+(d.getMonth()+1)+'-'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  const fid=(currentFolderId===HOME_ID)?(state.folders[0]?state.folders[0].id:null):currentFolderId;
  const k='doc_'+uid();
  const html=defaultDocHTML(name,'blank');
  try{ await writeDocFile(k,html); }catch(e){ toast('创建失败：'+e.message); return; }
  const it={id:uid(),folderId:fid,type:'file',fileName:name+'.html',text:'',fileSize:html.length,fileMime:'text/html',fileKey:k,tags:[],created:Date.now(),pinned:false,editable:true,wikilinks:[],plain:htmlToPlain(html),rich:true,attachments:[]};
  state.items.push(it); save();
  renderAll();
  toast('新笔记已创建，输入即自动保存');
  await openDocEditor(it.id);
}
$('rdEdit').onclick=()=>{ if(readerId) openDocEditor(readerId); };
$('rdExport').onclick=openExportPanel;
/* 双向链接跳转（阅读器 iframe → 父窗口） */
window.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.action==='openWiki'){
    const target=docItems().find(o=>stripExt(o.fileName)===d.name);
    if(target){ readerId=target.id; renderReaderSide(); showReaderDoc(); }
    else{ toast('「'+d.name+'」还不存在，已为你创建'); newEditableDoc(d.name); }
  }
  if(d.action==='tocPos'){
    document.querySelectorAll('#rdToc .rd-toc-item').forEach(b=>b.classList.toggle('on',+b.dataset.idx===d.ridx));
    const on=document.querySelector('#rdToc .rd-toc-item.on');
    if(on) on.scrollIntoView({block:'nearest'});
  }
  /* 附件：iframe 内的附件框 → 父页处理存储/下载 */
  if(d.action==='attachAdd'){ $('attachInput').click(); }
  if(d.action==='attachDl'){
    const it=curAttachIt();
    const meta=((it&&it.attachments)||[]).find(a=>a.key===d.key);
    imgGet(d.key).then(u=>{
      if(!u){ toast('附件数据丢失，试试从云端恢复'); return; }
      const a=document.createElement('a'); a.href=u; a.download=(meta&&meta.name)||'attachment';
      document.body.appendChild(a); a.click(); a.remove();
    });
  }
  if(d.action==='attachDel'){
    const it=curAttachIt(); if(!it) return;
    it.attachments=(it.attachments||[]).filter(a=>a.key!==d.key);
    imgDel(d.key).catch(()=>{});
    save(); renderAttachData(); toast('附件已删除');
  }
});
/* 当前阅读文档的附件 */
function curAttachIt(){ return state.items.find(x=>x.id===readerId)||null; }
function renderAttachData(){
  const it=curAttachIt(); if(!it) return;
  const list=(it.attachments||[]).map(a=>({key:a.key,name:a.name,sizeTxt:fmtSize(a.size||0)}));
  const w=$('rdFrame').contentWindow;
  if(w) w.postMessage({action:'attachData',list},'*');
  $('rdAttach').textContent='📎 附件'+(list.length?'（'+list.length+'）':'');
}
$('attachInput').addEventListener('change',async e=>{
  const files=[...e.target.files]; e.target.value='';
  if(!files.length) return;
  const it=curAttachIt(); if(!it){ toast('先选择一篇文档'); return; }
  if(!Array.isArray(it.attachments)) it.attachments=[];
  let ok=0;
  for(const f of files){
    if(f.size>fileLimitBytes()){ toast('「'+f.name+'」超过 '+fileLimitMB()+'MB，已跳过（可在设置里调高上限）'); continue; }
    try{
      const key='att_'+uid();
      await imgSet(key,await readAsDataURL(f));
      it.attachments.push({key,name:f.name,size:f.size,mime:f.type||'application/octet-stream'});
      ok++;
    }catch(err){ toast('「'+f.name+'」存储失败：'+err.message); }
  }
  if(ok){ save(); toast('已添加 '+ok+' 个附件'); renderAttachData(); }
});
$('rdAttach').onclick=()=>{
  const it=curAttachIt();
  if(!it){ toast('先选一篇文档'); return; }
  if(isPdfName(it.fileName)){ toast('PDF 暂不支持附件，可把文件上传到收纳夹'); return; }
  const w=$('rdFrame').contentWindow;
  if(w) w.postMessage({action:'scrollAttach'},'*');
};

