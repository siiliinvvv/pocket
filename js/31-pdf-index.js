/* ============================================================
   Pocket · PDF 全文索引
   按需从 CDN 加载 pdf.js，建立全文索引与命中跳转
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= PDF 全文索引（按需从 CDN 加载 pdf.js） + 命中跳转 ================= */
let pendingPdfPage=0, _pdfjsLoading=null;
const pdfIdxTried=new Set();
function loadPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(_pdfjsLoading) return _pdfjsLoading;
  _pdfjsLoading=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
    s.onload=()=>{
      try{ window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'; }catch(e){}
      res(window.pdfjsLib);
    };
    s.onerror=()=>{ _pdfjsLoading=null; rej(new Error('联网加载 PDF 解析器失败')); };
    document.head.appendChild(s);
  });
  return _pdfjsLoading;
}
async function indexPdfDoc(it,silent){
  if(!it||!isPdfName(it.fileName)||it.pdfIndexed) return false;
  if(pdfIdxTried.has(it.id)) return false;
  pdfIdxTried.add(it.id);
  const du=await ensureItemLocal(it).catch(()=>null);
  if(!du) return false;
  if(!silent) toast('正在为这篇 PDF 建立全文索引…');
  try{
    const lib=await loadPdfJs();
    const buf=await (await fetch(du)).arrayBuffer();
    const pdf=await lib.getDocument({data:buf}).promise;
    const pages=[]; let all='';
    const maxP=Math.min(pdf.numPages,200);
    for(let p=1;p<=maxP;p++){
      const page=await pdf.getPage(p);
      const tc=await page.getTextContent();
      let t='';
      tc.items.forEach(x=>{ if(x.str) t+=x.str; if(x.hasEOL) t+=' '; });
      t=t.replace(/\s+/g,' ').trim();
      pages.push(t); all+=t+'\n';
      if(all.length>90000) break;
    }
    it.pdfPages=pages;
    it.pdfPageCount=pdf.numPages;
    it.pdfIndexed=Date.now();
    it.plain=((it.plain||'')+'\n'+all).trim().slice(0,100000);
    hayCache.delete(it.id);
    save();
    if(!silent) toast('已建立全文索引（'+pdf.numPages+' 页），现在能搜到正文了');
    return true;
  }catch(e){
    if(!silent) toast('PDF 索引失败：'+(e.message||'需要联网'));
    return false;
  }
}
function pdfPageOf(it,term){
  const ps=(it&&it.pdfPages)||[];
  const t=String(term||'').toLowerCase();
  if(!t) return 0;
  for(let i=0;i<ps.length;i++){ if(String(ps[i]||'').toLowerCase().indexOf(t)>=0) return i+1; }
  return 0;
}
/* 点搜索命中片段 → 打开原文并定位到第一处命中 */
async function jumpToHit(e,id){
  if(e){ e.stopPropagation(); if(e.preventDefault) e.preventDefault(); }
  const it=state.items.find(x=>x.id===id);
  if(!it){ return; }
  const p=parseQuery(searchQuery);
  const term=(p.terms[0]||'').trim();
  if(it.type==='note'||it.type==='photo'||it.type==='link'){ openEditor(it); return; }
  if(isPdfName(it.fileName)){
    pendingPdfPage=term?pdfPageOf(it,term):0;
    await openReader(id);
    if(pendingPdfPage){ setTimeout(()=>{ const f=$('rdFrame'); if(f&&readerBlobUrl) f.src=readerBlobUrl+'#page='+pendingPdfPage; },350); }
    else if(term&&!it.pdfIndexed){ toast('这篇 PDF 还没有全文索引，先打开一次即可自动建立'); }
    return;
  }
  await openReader(id);
  if(term) setTimeout(()=>{
    const f=$('rdFrame');
    try{ if(f&&f.contentWindow) f.contentWindow.postMessage({action:'findText',term:term},'*'); }catch(_){}
  },700);
}
async function openReader(itemId){
  readerDocs=docItems();
  if(!readerDocs.length){ toast('文库还是空的，先上传 / 拖入文档文件吧'); return; }  /* 若当前筛选不包含要打开的文件，自动切回全部 */
  if(itemId){
    const src=readerDocs.find(it=>it.id===itemId);
    if(src&&(rdFolderFilter==='all'||src.folderId!==rdFolderFilter)) rdFolderFilter=src.folderId;   /* 打开文档时落到其所在收纳夹 */
  }
  const list=rdList();
  readerId=(itemId&&list.some(it=>it.id===itemId))?itemId:(list[0]||readerDocs[0]).id;
  readerTab='toc';
  $('reader').classList.add('show');
  renderReaderSide();
  await showReaderDoc();
}
function renderReaderSide(){
  $('tabDocs').classList.toggle('on',readerTab==='docs');
  $('tabToc').classList.toggle('on',readerTab==='toc');
  $('tabMarks').classList.toggle('on',readerTab==='marks');
  $('tabLinks').classList.toggle('on',readerTab==='links');
  $('rdDocList').style.display=readerTab==='docs'?'':'none';
  $('rdToc').style.display=readerTab==='toc'?'':'none';
  $('rdMarks').style.display=readerTab==='marks'?'':'none';
  $('rdLinks').style.display=readerTab==='links'?'':'none';
  $('rdFilter').style.display=readerTab==='docs'?'':'none';
  if(readerTab==='marks') renderReaderMarks();
  const _cd=readerCurDoc();
  const _mc=(_cd&&!isPdfName(_cd.fileName))?markOf(_cd).length:0;
  if($('tabMarks')) $('tabMarks').title=_mc?('本文有 '+_mc+' 处标注'):'选中正文里的文字即可划线标注';
  /* 收纳夹筛选下拉 */
  const sel=$('rdFolderSel');
  const opts=[{v:'all',label:'全部收纳夹（'+readerDocs.length+'）'}];
  state.folders.forEach(f=>{
    const n=readerDocs.filter(it=>it.folderId===f.id).length;
    if(n) opts.push({v:f.id,label:f.icon+' '+f.name+'（'+n+'）',n:n});
  });
  if(!opts.some(o=>o.v===rdFolderFilter)){
    /* 默认定位到文档最多的收纳夹，避免「全部」一屏铺满 */
    const best=opts.slice(1).sort((a,b)=>b.n-a.n)[0];
    rdFolderFilter=best?best.v:'all';
  }
  sel.innerHTML=opts.map(o=>'<option value="'+esc(o.v)+'">'+esc(o.label)+'</option>').join('');
  sel.value=rdFolderFilter;
  const list=rdList();
  $('rdFilterCount').textContent=(rdFolderFilter==='all'?readerDocs.length:list.length)+' 篇';
  /* 文档列表 */
  const dl=$('rdDocList'); dl.innerHTML='';
  if(rdFolderFilter==='all'){
    dl.innerHTML='<div class="rd-empty">文库共 <b>'+readerDocs.length+' 篇</b>文档。<br>为保持列表清爽，「全部收纳夹」不直接展开文档，<br>请在上方选择一个具体收纳夹查看。</div>';
  }else if(!list.length){
    dl.innerHTML='<div class="rd-empty">这个收纳夹里还没有可阅读的文档。<br>HTML / PDF / 文本 / Markdown / docx 上传后都会出现在这里。</div>';
  }
  if(rdFolderFilter!=='all') list.forEach(it=>{
    const d=document.createElement('div');
    d.className='rd-doc'+(it.id===readerId?' on':'');
    const f=state.folders.find(x=>x.id===it.folderId);
    d.innerHTML='<span class="d-icon">'+(isPdfName(it.fileName)?'📕':(isTextName(it.fileName)||isDocxName(it.fileName))?'📄':'🌐')+'</span><span class="d-name">'+esc(it.fileName)+'</span>'+
      (rdFolderFilter==='all'?'<span class="d-folder" title="'+esc(f?f.name:'未分类')+'">'+esc(f?f.icon:'')+'</span>':'');
    d.onclick=()=>{ readerId=it.id; renderReaderSide(); showReaderDoc(); };
    dl.appendChild(d);
  });
  /* 本文目录 */
  const tl=$('rdToc'); tl.innerHTML='';
  const cur=readerDocs.find(x=>x.id===readerId);
  if(cur&&isPdfName(cur.fileName)){
    tl.innerHTML='<div class="rd-empty">PDF 使用自带的滚动 / 缩放浏览，可在右侧直接翻页。</div>';
  }else if(!readerToc.length){
    tl.innerHTML='<div class="rd-empty">本文没有提取到 h1–h3 标题。<br>若 HTML 自带目录（锚点链接），在右侧正文中直接点击即可跳转。</div>';
  }else{
    /* 目录样式贴近源文件自带目录：顶部文档标题 + 扁平单行条目 + 当前进度高亮 */
    const h1s=readerToc.filter(t=>t.level===1);
    const head=document.createElement('div');
    head.className='rd-toc-head';
    head.textContent=(h1s.length===1&&h1s[0].text)?h1s[0].text:docTitle(cur.fileName);
    tl.appendChild(head);
    const sub=document.createElement('div');
    sub.className='rd-toc-sub'; sub.textContent='目录 · 点击跳转，滚动时自动跟随高亮';
    tl.appendChild(sub);
    const dropTitle=(h1s.length===1&&readerToc.length>1);   /* 唯一的大标题不重复进目录 */
    const h3count=readerToc.filter(t=>t.level>=3).length;
    const shown=readerToc.filter(t=>(!dropTitle||t.level>1)&&(t.level<3||tocShowH3));
    const list2=(shown.length?shown:readerToc.filter(t=>!dropTitle||t.level>1));   /* 若全是三级标题则不隐藏 */
    list2.forEach(t=>{
      const b=document.createElement('button');
      b.className='rd-toc-item'+(t.level>=3?' l3':'');
      b.dataset.idx=t.idx;
      b.textContent=shortHeading(t.text)||'(无标题)';
      b.title=t.text||'';
      b.onclick=()=>{ const w=$('rdFrame').contentWindow; if(w) w.postMessage({action:'scroll',ridx:t.idx},'*'); };
      tl.appendChild(b);
    });
    if(h3count){
      const more=document.createElement('button');
      more.className='rd-toc-more';
      more.textContent=tocShowH3?('▴ 收起三级标题'):('▾ 展开三级标题（'+h3count+'）');
      more.onclick=()=>{ tocShowH3=!tocShowH3; renderReaderSide(); };
      tl.appendChild(more);
    }
    const top=document.createElement('button');
    top.className='rd-toc-top'; top.textContent='↑ 回到顶部';
    top.onclick=()=>{ const w=$('rdFrame').contentWindow; if(w) w.postMessage({action:'scrollTop'},'*'); };
    tl.appendChild(top);
  }
  /* 关联（双向链接） */
  const ll=$('rdLinks'); ll.innerHTML='';
  const curDoc=readerDocs.find(x=>x.id===readerId);
  if(!curDoc){ ll.innerHTML='<div class="rd-empty">先选择一个文档。</div>'; }
  else{
    const curName=stripExt(curDoc.fileName);
    const fwd=(curDoc.wikilinks||[]);
    const back=readerDocs.filter(o=>o.id!==curDoc.id&&(o.wikilinks||[]).includes(curName));
    if(!fwd.length&&!back.length){
      ll.innerHTML='<div class="rd-empty">本文还没有双向链接。<br>在编辑器里用「🔗 链接」插入 <b>[[文档名]]</b>，<br>即可和其他文档互相跳转。</div>';
    }
    if(fwd.length){
      const h=document.createElement('div'); h.className='rd-link-head'; h.textContent='→ 链接到（'+fwd.length+'）'; ll.appendChild(h);
      fwd.forEach(n=>{
        const target=readerDocs.find(o=>stripExt(o.fileName)===n);
        const b=document.createElement('button');
        b.className='rd-link-item';
        b.innerHTML='<span class="d-icon">'+(target?'🌐':'')+'</span> '+(target?esc(target.fileName):('<span class="lk-missing">'+esc(n)+'（尚未创建）</span>'));
        b.title=target?('跳到「'+target.fileName+'」'):('创建「'+n+'」');
        b.onclick=()=>{ if(target){ readerId=target.id; renderReaderSide(); showReaderDoc(); } else newEditableDoc(n); };
        ll.appendChild(b);
      });
    }
    if(back.length){
      const h=document.createElement('div'); h.className='rd-link-head'; h.textContent='← 反向链接（'+back.length+'）'; ll.appendChild(h);
      back.forEach(o=>{
        const b=document.createElement('button');
        b.className='rd-link-item';
        b.textContent=o.fileName;
        b.title='「'+o.fileName+'」引用了本文';
        b.onclick=()=>{ readerId=o.id; renderReaderSide(); showReaderDoc(); };
        ll.appendChild(b);
      });
    }
  }
}
function stripExt(n){ return (n||'').replace(/\.html?$/i,''); }
async function showReaderDoc(){
  const it=readerDocs.find(x=>x.id===readerId);
  if(!it) return;
  touchRecent(it.id);
  readerMarkMiss=new Set();   /* 换文档：上一份的「未定位」状态不带到这一份 */
  const list=rdList();
  const idx=list.findIndex(x=>x.id===it.id);
  $('rdTitle').textContent=it.fileName;
  $('rdPos').textContent=(idx>=0?idx+1:1)+' / '+(list.length||1);
  $('rdEdit').style.display=(isHtmlName(it.fileName)||isTextName(it.fileName)||isDocxName(it.fileName))?'':'none';
  rdLoading(true,'正在载入文档…');
  const dataUrl=await ensureItemLocal(it).catch(()=>null);
  if(!dataUrl){ rdLoading(false); toast('文件数据丢失，试试从云端恢复'); return; }
  const frame=$('rdFrame');
  frame.onload=()=>{
    rdLoading(false);
    if($('rdSide').classList.contains('closed')) sendReaderTocHide(true);
    pushMarksToFrame();   /* 文档就绪后把本文已有的划线标注画上去 */
  };
  setTimeout(()=>rdLoading(false),5000);   /* 兜底：异常时别一直转 */
  if(readerBlobUrl){ URL.revokeObjectURL(readerBlobUrl); readerBlobUrl=null; }
  /* 纯文本 / Markdown / docx：先生成文档 HTML，再走同一套目录 + 附件 + 双向链接管线 */
  let baseHtml=null;
  if(docStoredAsHtml(it,dataUrl)){
    baseHtml=dataUrlToText(dataUrl);
  }else if(!isPdfName(it.fileName)){
    try{
      if(isDocxName(it.fileName)) baseHtml=await docxToDocHTML(it,dataUrl);
      else baseHtml=textToDocHTML(it.fileName,dataUrlToText(dataUrl));
    }catch(e){ toast(e.message||'解析失败，无法预览'); return; }
    if(!baseHtml){ toast('解析失败，无法预览'); return; }
  }
  if(baseHtml!==null){
    let html=baseHtml;
    /* 提取 h1-h3 生成目录 + 注入附件框（插在「补充/感想」章节前，否则放文末） */
    try{
      const doc=new DOMParser().parseFromString(html,'text/html');
      readerToc=[...doc.querySelectorAll('h1,h2,h3')].map((h,i)=>({level:+h.tagName[1],text:(h.textContent||'').trim().replace(/\s+/g,' ').slice(0,200),idx:i}));
      const oldBox=doc.getElementById('tbAttachBox'); if(oldBox) oldBox.remove();
      const box=doc.createElement('div');
      box.id='tbAttachBox';
      box.setAttribute('style','margin:32px 0;padding:14px 16px;border:1.5px dashed #a9bedd;border-radius:12px;background:rgba(120,150,200,.06)');
      box.innerHTML='<div style="font-weight:700;font-size:14px;margin-bottom:2px">📎 附件</div>'+
        '<div id="tbAttachList" style="font-size:13px;color:#5a6b85"></div>'+
        '<button id="tbAttachAdd" style="margin-top:8px;cursor:pointer;padding:5px 14px;border-radius:8px;border:none;background:#5B99E2;color:#fff;font-size:12.5px">＋ 上传附件</button>';
      let anchor=null;
      const cands=doc.querySelectorAll('h1,h2,h3,h4,b,strong');
      for(const el of cands){ if(/感想/.test(el.textContent||'')){ anchor=el; break; } }
      if(anchor&&anchor.parentNode) anchor.parentNode.insertBefore(box,anchor);
      else if(doc.body) doc.body.appendChild(box);
      const initList=(it.attachments||[]).map(a=>({key:a.key,name:a.name,sizeTxt:fmtSize(a.size||0)}));
      const initScr=doc.createElement('script');
      initScr.textContent='window.__TB_ATTACH__='+JSON.stringify(initList).replace(/<\//g,'<\\\\/')+';';
      box.appendChild(initScr);
      html='<!DOCTYPE html>\n'+doc.documentElement.outerHTML;
    }catch(e){ readerToc=[]; }
    /* 注入脚本：目录滚动 + 锚点 + 双向链接渲染/跳转 */
    const inj='<scr'+'ipt>(function(){'+
      'var st=document.createElement("style");st.textContent=".wikilink{color:#4a8ede;background:rgba(91,153,226,.12);border-bottom:1px dashed #7fb1e8;cursor:pointer;text-decoration:none;padding:0 2px;border-radius:3px}.wikilink:hover{background:rgba(91,153,226,.25)}";document.head.appendChild(st);'+
      'var re=/\\[\\[([^\\[\\]]+?)\\]\\]/g;'+
      'function conv(root){var tw=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);var nodes=[];while(tw.nextNode()){if(re.test(tw.currentNode.nodeValue))nodes.push(tw.currentNode);re.lastIndex=0;}nodes.forEach(function(t){var frag=document.createDocumentFragment();var s=t.nodeValue,m,last=0;re.lastIndex=0;while((m=re.exec(s))){if(m.index>last)frag.appendChild(document.createTextNode(s.slice(last,m.index)));var a=document.createElement("a");a.className="wikilink";a.textContent=m[0];a.dataset.wiki=m[1];frag.appendChild(a);last=m.index+m[0].length;}if(last<s.length)frag.appendChild(document.createTextNode(s.slice(last)));t.parentNode.replaceChild(frag,t);});}'+
      'conv(document.body);'+
      /* 文中自带目录：收起侧栏目录时一起隐藏（避免和侧栏重复） */
      'function tbTocFind(){var all=document.querySelectorAll(\'a[href^="#"]\');if(all.length<3)return null;var links=[],i,h,id;for(i=0;i<all.length;i++){h=all[i].getAttribute("href")||"";if(h.length<2)continue;try{id=decodeURIComponent(h.slice(1));}catch(e){id=h.slice(1);}if(id&&(document.getElementById(id)||document.getElementsByName(id).length))links.push(all[i]);}if(links.length<3)return null;var el=links[0];while(el&&el!==document.body){if(el.querySelectorAll(\'a[href^="#"]\').length>=3)break;el=el.parentNode;}if(!el||el===document.body||el===document.documentElement)return null;var n=el.querySelectorAll(\'a[href^="#"]\').length,ll=(el.textContent||"").length,bodyLen=(document.body.textContent||"").length;while(el.parentNode&&el.parentNode!==document.body){var p=el.parentNode;if(p.querySelectorAll(\'a[href^="#"]\').length!==n)break;var pl=(p.textContent||"").length;if(pl>ll*2+120)break;el=p;ll=pl;}var lt=0,ls=el.querySelectorAll(\'a[href^="#"]\');for(i=0;i<ls.length;i++)lt+=(ls[i].textContent||"").length;if(ll<=0||lt/ll<0.55||ll>bodyLen*0.6||lt<10)return null;return el;}'+
      'var TBFIX=[];'+
      'function tbKebab(p){return p.replace(/[A-Z]/g,function(m){return "-"+m.toLowerCase();});}'+
      'function tbRestore(){for(var i=TBFIX.length-1;i>=0;i--){var f=TBFIX[i];try{if(f.n&&f.n.style){if(f.had)f.n.style[f.p]=f.old;else f.n.style.removeProperty(tbKebab(f.p));}}catch(e){}}TBFIX=[];}'+
      /* 隐藏目录后补掉为它预留的空白：祖先/兄弟的 margin-left、padding-left 与 grid 轨道 */
      'function tbFixGap(hidden,w){var cands=[],seen=[];function add(x){if(!x||x.nodeType!==1||seen.indexOf(x)>=0)return;seen.push(x);cands.push(x);}var n=hidden;while(n&&n!==document.documentElement){var p=n.parentNode;if(p){if(p.children){for(var i=0;i<p.children.length;i++){var ch=p.children[i];if(ch!==hidden&&!hidden.contains(ch))add(ch);}}add(p);}n=p;}for(var k=0;k<cands.length;k++){var x=cands[k],c;try{c=getComputedStyle(x);}catch(e){continue;}if(!c||c.display==="none")continue;var props=["marginLeft","paddingLeft"];for(var j=0;j<props.length;j++){var pr=props[j],v=parseFloat(c[pr])||0;if(v>=w*0.7&&v<=w*1.4){TBFIX.push({n:x,p:pr,old:x.style[pr],had:x.style[pr]!==""});try{x.style[pr]="0px";}catch(e){}}}if(c.display==="grid"||c.display==="inline-grid"){var gtc=c.gridTemplateColumns||"",tr=gtc.split(" "),hit=-1;for(var t=0;t<tr.length;t++){var px=parseFloat(tr[t]);if(!isNaN(px)&&px>=w*0.7&&px<=w*1.4){hit=t;break;}}if(hit>=0&&tr.length>1){tr[hit]="0px";TBFIX.push({n:x,p:"gridTemplateColumns",old:x.style.gridTemplateColumns,had:x.style.gridTemplateColumns!==""});try{x.style.gridTemplateColumns=tr.join(" ");}catch(e){}}}}}'+
      'function tbToc(hide){var sel=\'[id*="toc" i],[class*="toc" i],[id*="目录"],[class*="目录"],[role="doc-toc"]\';var els=[].slice.call(document.querySelectorAll(sel));var dyn=null;try{dyn=tbTocFind();}catch(e){}if(dyn&&els.indexOf(dyn)<0)els.push(dyn);if(!els.length)return;if(hide){var ref=null,refW=0;for(var i=0;i<els.length;i++){var rw=0;try{rw=els[i].getBoundingClientRect().width||0;}catch(e){}if(!rw){try{rw=parseFloat(getComputedStyle(els[i]).width)||0;}catch(e){}}if(rw>refW){refW=rw;ref=els[i];}if(els[i].getAttribute("data-tbh")!=="1"){els[i].setAttribute("data-tbh","1");els[i].style.display="none";}}if(ref&&refW>=120){try{tbFixGap(ref,refW);}catch(e){}}}else{tbRestore();for(var i=0;i<els.length;i++){var el=els[i];if(el.getAttribute("data-tbh")==="1"){el.style.display="";el.removeAttribute("data-tbh");}}}}'+
      'try{if(localStorage.getItem("tb_rdtoc_hide_v1")==="1")tbToc(true);}catch(e){}'+
      'var hs=document.querySelectorAll("h1,h2,h3");'+
      'window.addEventListener("message",function(e){var d=e.data||{};if(d&&d.action==="scroll"){var el=hs[d.ridx];if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}if(d&&d.action==="scrollTop"){window.scrollTo({top:0,behavior:"smooth"});}if(d&&d.action==="tocHide"){tbToc(!!d.hide);}if(d&&d.action==="findText"){try{if(!window.find(d.term,false,false,true))window.scrollTo({top:0});}catch(err){}}if(d&&d.action==="scrollAttach"){var ab2=document.getElementById("tbAttachBox");if(ab2)ab2.scrollIntoView({behavior:"smooth",block:"start"});}if(d&&d.action==="attachData"){rAtt(d.list);}});'+
      'function rAtt(list){var el=document.getElementById("tbAttachList");if(!el)return;if(!list||!list.length){el.textContent="还没有附件，点下方按钮上传，任意类型文件都可以（单个 ≤ 20MB）。";return;}el.innerHTML=list.map(function(a){return "<div style=\\"display:flex;align-items:center;gap:8px;padding:4px 0\\"><span>📄</span><span style=\\"flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\\" title=\\""+a.name+"\\">"+a.name+"</span><span style=\\"font-size:11px;color:#8a99b3;flex-shrink:0\\">"+a.sizeTxt+"</span><a href=\\"javascript:void(0)\\" data-att-dl=\\""+a.key+"\\" style=\\"color:#4a8ede;cursor:pointer;text-decoration:none;flex-shrink:0\\">下载</a><a href=\\"javascript:void(0)\\" data-att-del=\\""+a.key+"\\" style=\\"color:#d16a6a;cursor:pointer;text-decoration:none;flex-shrink:0\\">删除</a></div>";}).join("");}'+
      'rAtt(window.__TB_ATTACH__||[]);'+
      'var spyLast=-2;'+
      'var spy=function(){var pos=-1;for(var i=0;i<hs.length;i++){if(hs[i].getBoundingClientRect().top<=140)pos=i;else break;}if(pos!==spyLast){spyLast=pos;parent.postMessage({action:"tocPos",ridx:pos},"*");}};'+
      'window.addEventListener("scroll",spy,{passive:true});'+
      'document.addEventListener("click",function(ev){'+
      'var w=ev.target.closest?ev.target.closest("a.wikilink"):null;if(w){ev.preventDefault();parent.postMessage({action:"openWiki",name:w.dataset.wiki},"*");return;}'+
      'var ab=ev.target.closest?ev.target.closest("#tbAttachAdd"):null;if(ab){ev.preventDefault();parent.postMessage({action:"attachAdd"},"*");return;}'+
      'var adl=ev.target.closest?ev.target.closest("[data-att-dl]"):null;if(adl){ev.preventDefault();parent.postMessage({action:"attachDl",key:adl.getAttribute("data-att-dl")},"*");return;}'+
      'var adel=ev.target.closest?ev.target.closest("[data-att-del]"):null;if(adel){ev.preventDefault();parent.postMessage({action:"attachDel",key:adel.getAttribute("data-att-del")},"*");return;}'+
      'var a=ev.target.closest?ev.target.closest("a[href^=\'#\']"):null;if(a){ev.preventDefault();var id=decodeURIComponent((a.getAttribute("href")||"#").slice(1));var el=document.getElementById(id)||document.getElementsByName(id)[0];if(el)el.scrollIntoView({behavior:"smooth",block:"start"});}});'+
      '})();</scr'+'ipt>';
    const injAll=inj+(typeof readerMarkInject==='function'?readerMarkInject():'');
    if(/<\/body>/i.test(html)) html=html.replace(/<\/body>/i,injAll+'</body>');
    else html+=injAll;
    frame.removeAttribute('src');
    frame.srcdoc=html;
    renderAttachData();
  }else{
    readerToc=[];
    $('rdAttach').textContent='📎 附件';
    try{
      const blob=await (await fetch(dataUrl)).blob();
      readerBlobUrl=URL.createObjectURL(blob);
      frame.removeAttribute('srcdoc');
      const pg=pendingPdfPage; pendingPdfPage=0;
      frame.src=readerBlobUrl+(pg?('#page='+pg):'');
      if(!it.pdfIndexed&&!it.pdfPages&&navigator.onLine) setTimeout(()=>indexPdfDoc(it,true),900);
    }catch(e){ rdLoading(false); toast('PDF 预览失败：'+e.message); return; }
  }
  renderReaderSide();
}
$('tabDocs').onclick=()=>{ readerTab='docs'; renderReaderSide(); };
$('tabToc').onclick=()=>{ readerTab='toc'; renderReaderSide(); };
$('tabMarks').onclick=()=>{ readerTab='marks'; renderReaderSide(); };
$('tabLinks').onclick=()=>{ readerTab='links'; renderReaderSide(); };
const _rdMarksBtn=$('rdMarksBtn');
if(_rdMarksBtn) _rdMarksBtn.onclick=()=>{
  readerTab='marks'; renderReaderSide();
  if(window.innerWidth<=768) $('rdSide').classList.add('open');
};
$('rdFolderSel').addEventListener('change',async e=>{
  rdFolderFilter=e.target.value;
  const list=rdList();
  if(list.length&&!list.some(x=>x.id===readerId)){ readerId=list[0].id; await showReaderDoc(); }
  renderReaderSide();
});
$('rdClose').onclick=()=>$('reader').classList.remove('show');
/* 悬浮工具球：文库 / 回收站 / 备份 / 深色 */
const closeFab=()=>{ $('fab').classList.remove('open'); $('fabMain').classList.remove('on'); };
$('fabMain').onclick=()=>{ $('fab').classList.toggle('open'); $('fabMain').classList.toggle('on'); };
$('fabReader').onclick=()=>{ closeFab(); openReader(null); };
$('fabTrash').onclick=()=>{ closeFab(); renderTrashPanel(); };
document.addEventListener('click',e=>{
  const f=$('fab');
  if(f.classList.contains('open')&&!f.contains(e.target)){ f.classList.remove('open'); $('fabMain').classList.remove('on'); }
});
/* 目录（侧栏）可收起：桌面直接收起/展开，移动端沿用抽屉；收起时同步隐藏文中自带目录 */
const RDTOC_HIDE_KEY='tb_rdtoc_hide_v1';
function sendReaderTocHide(hide){
  try{ localStorage.setItem(RDTOC_HIDE_KEY,hide?'1':'0'); }catch(e){}
  try{ const f=$('rdFrame'); if(f&&f.contentWindow) f.contentWindow.postMessage({action:'tocHide',hide:!!hide},'*'); }catch(e){}
}
function rdLoading(on,txt){
  const el=$('rdLoading'); if(!el) return;
  el.classList.toggle('show',!!on);
  if(txt&&$('rdLoadingTxt')) $('rdLoadingTxt').textContent=txt;
}
$('rdSideBtn').onclick=()=>{
  if(window.innerWidth<=768){ $('rdSide').classList.toggle('open'); return; }
  const side=$('rdSide');
  side.classList.toggle('closed');
  const closed=side.classList.contains('closed');
  $('rdSideBtn').textContent=closed?'☰ 展开目录':'☰';
  sendReaderTocHide(closed);
};
$('rdFrame').addEventListener('load',()=>{ $('rdSide').classList.remove('open'); });

