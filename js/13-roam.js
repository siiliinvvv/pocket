/* ============================================================
   Pocket · 知识漫游
   把某个范围内的知识点串成卡片逐张翻看
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 知识漫游：把某个范围里的知识点串成卡片逐张翻 ================= */
function folderSubtreeIds(fid){
  if(fid==='all') return state.folders.map(f=>f.id);
  const out=[fid];
  const walk=pid=>{ state.folders.filter(f=>f.parentId===pid).forEach(f=>{ out.push(f.id); walk(f.id); }); };
  walk(fid);
  return out;
}
async function buildRoamPoints(fid){
  const ids=new Set(folderSubtreeIds(fid));
  const items=state.items.filter(it=>fid==='all'||ids.has(it.folderId));
  const pts=[];
  /* html 参数：可选的「按原文格式」的安全 HTML（仅用于展示，text 始终保留纯文本兜底） */
  const add=(title,text,it,hidx,html)=>{
    const t=String(text||'').replace(/\s+/g,' ').trim();
    if(t.length<6) return;
    pts.push({title:(title||'').trim()||'（无标题）',text:t.slice(0,600),docId:it.id,docName:it.type==='note'?'文字条目':(it.fileName||''),hidx:(hidx==null?null:hidx),html:html||null});
  };
  for(const it of items){
    if(it.type==='note'){
      const first=(it.text||'').split('\n')[0].slice(0,36);
      pts.push({title:first||'一条想法',text:(it.text||'').slice(0,600),docId:it.id,docName:'文字条目',hidx:null});
      continue;
    }
    if(it.type==='link'){ add(it.title||it.url,it.text||it.url,it,null); continue; }
    if(it.type!=='file') continue;
    let html=null;
    const u=await imgGet(it.fileKey).catch(()=>null);
    if(u&&isHtmlName(it.fileName)) html=dataUrlToText(u);
    if(html){
      try{
        const doc=new DOMParser().parseFromString(html,'text/html');
        doc.querySelectorAll('script,style,noscript,button,input,svg').forEach(n=>n.remove());
        const hs=[...doc.querySelectorAll('h1,h2,h3')];
        if(hs.length){
          hs.slice(0,14).forEach((h,hi)=>{
            /* 按原文格式：抓取该标题到下一个标题之间的元素，净化后作为 HTML 展示 */
            const parts=[]; let n=h.nextElementSibling;
            while(n&&!/^H[1-3]$/.test(n.tagName)&&parts.map(p=>p.textContent||'').join('').length<700){
              parts.push(n); n=n.nextElementSibling;
            }
            let frag=null;
            if(parts.length){
              frag=document.createElement('div');
              parts.forEach(el=>frag.appendChild(el.cloneNode(true)));
              sanitizeRoamNode(frag);
              if(frag.innerHTML.length>6000||!frag.textContent.trim()) frag=null;
            }
            if(frag){
              add(shortHeading(h.textContent||''),frag.textContent,it,hi,frag.innerHTML);
            }else{
              let txt='', m=h.nextElementSibling;
              while(m&&!/^H[1-3]$/.test(m.tagName)){ txt+=' '+(m.textContent||''); m=m.nextElementSibling; if(txt.length>620) break; }
              if(!txt.trim()){ const p=h.parentElement&&h.parentElement.nextElementSibling; if(p) txt=p.textContent||''; }
              add(shortHeading(h.textContent||''),txt,it,hi);
            }
          });
        }else{
          const txt=(doc.body?doc.body.textContent:'').replace(/\s+/g,' ').trim();
          if(txt) add(docTitle(it.fileName),txt,it,null);
        }
      }catch(e){}
    }else if(it.plain){
      const chunks=(it.plain.replace(/\s+/g,' ').match(/[^。！？!?\.]{12,200}[。！？!?\.]?/g)||[]).slice(0,6);
      if(chunks.length) chunks.forEach((c,i)=>add(docTitle(it.fileName)+(i?(' · 片段 '+(i+1)):''),c,it,null));
      else add(docTitle(it.fileName),it.plain,it,null);
    }else{
      add(docTitle(it.fileName)||it.fileName,'（这个文件还没有可漫游的文字内容'+(it.cloudOnly?'，本机未缓存':'')+'）',it,null);
    }
  }
  /* 打散顺序，让不同文档的知识点交错出现 */
  for(let i=pts.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [pts[i],pts[j]]=[pts[j],pts[i]]; }
  return pts.slice(0,160);
}
let roamPoints=[], roamIdx=0, roamScopeName='';
/* 净化漫游正文 HTML：去掉脚本 / 表单 / 媒体嵌入和内联事件，防止注入 */
function sanitizeRoamNode(el){
  el.querySelectorAll('script,style,iframe,frame,object,embed,link,meta,form,button,input,textarea,select,video,audio,svg,canvas,noscript').forEach(n=>n.remove());
  el.querySelectorAll('*').forEach(n=>{
    [...n.attributes].forEach(a=>{
      const nm=(a.name||'').toLowerCase(), v=a.value||'';
      if(/^on/i.test(nm)) n.removeAttribute(a.name);
      else if((nm==='href'||nm==='src')&&/^\s*javascript:/i.test(v)) n.removeAttribute(a.name);
      else if(nm==='target') n.setAttribute('target','_blank');
    });
  });
}
function roamFolderOptions(sel){
  let html='<option value="all">全部内容（所有分类）</option>';
  sortedFolders().forEach(f=>{
    const d=folderDepth(f);
    html+='<option value="'+esc(f.id)+'">'+'　'.repeat(d)+(d?'└ ':'')+esc(f.name)+'（'+state.items.filter(i=>i.folderId===f.id).length+'）</option>';
  });
  return html;
}
async function openRoam(){
  const fid=state.roamFolder||'all';
  const f=state.folders.find(x=>x.id===fid);
  roamScopeName=(fid==='all'||!f)?'全部内容':(folderPath(f).join(' / '));
  toast('正在整理这个范围的知识点…');
  roamPoints=await buildRoamPoints(fid);
  if(!roamPoints.length){ toast('这个范围里还没有可以漫游的内容'); return; }
  roamIdx=0;
  $('roam').classList.add('show');
  renderRoam();
}
/* 整理漫游正文：去掉源码缩进 / 空段落造成的「假空行」，让段落之间只有一个行距 */
function tidyRoamHtml(box){
  /* 1) 去掉纯占位元素（空 p/div/span、只有 &nbsp; 的段落、连续的 br） */
  box.querySelectorAll('p,div,span,li,blockquote,section,article,td,th').forEach(el=>{
    if(el.querySelector('img,table,pre,hr,input')) return;
    const t=(el.textContent||'').replace(/[\s\u00a0]+/g,'');
    if(!t) el.remove();
  });
  /* 连续 br、以及夹在两个块级元素之间的 br 都是「空行」，直接去掉（块级本身有段距） */
  const BLOCK=/^(P|DIV|UL|OL|LI|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|TABLE|PRE|HR|SECTION|ARTICLE|TR|TD|TH)$/;
  const near=(node,dir)=>{
    let n=dir<0?node.previousSibling:node.nextSibling;
    while(n&&n.nodeType===3&&!n.nodeValue.trim()) n=dir<0?n.previousSibling:n.nextSibling;
    return n;
  };
  [...box.querySelectorAll('br')].forEach(br=>{
    if(!br.parentNode) return;
    const p=near(br,-1), n=near(br,1);
    const pBlock=!p||p.nodeName==='BR'||(p.nodeType===1&&BLOCK.test(p.nodeName));
    const nBlock=!n||(n.nodeType===1&&BLOCK.test(n.nodeName));
    if(pBlock||nBlock) br.remove();
  });
  /* 2) 文本节点里的连续空行压成单个换行（保留 <br> 的语义，不制造空白段） */
  const walker=document.createTreeWalker(box,NodeFilter.SHOW_TEXT,null);
  const texts=[]; let n;
  while((n=walker.nextNode())) texts.push(n);
  texts.forEach(t=>{
    const pn=t.parentNode; if(!pn||/^(PRE|CODE)$/.test(pn.nodeName)) return;
    if(/^[\s\u00a0]*$/.test(t.nodeValue)){
      /* 行内元素之间只留一个普通空格，块级之间直接去掉 */
      const prev=t.previousSibling, next=t.nextSibling;
      const inline=x=>x&&x.nodeType===1&&/^(A|B|STRONG|EM|I|SPAN|CODE|SMALL|SUB|SUP)$/.test(x.nodeName);
      t.nodeValue=(inline(prev)||inline(next))?' ':'';
    }else{
      t.nodeValue=t.nodeValue.replace(/[\t\u00a0]+/g,' ').replace(/\s*\n\s*/g,' ');
    }
  });
  /* 3) 首尾多余内容清掉，避免顶部空一块 / 底部拖一条空白 */
  while(box.firstChild){
    const f=box.firstChild;
    if(f.nodeType===3&&!f.nodeValue.trim()){ box.removeChild(f); continue; }
    if(f.nodeType===1&&/^(BR)$/.test(f.nodeName)){ box.removeChild(f); continue; }
    break;
  }
  while(box.lastChild){
    const l=box.lastChild;
    if(l.nodeType===3&&!l.nodeValue.trim()){ box.removeChild(l); continue; }
    if(l.nodeType===1&&/^(BR)$/.test(l.nodeName)){ box.removeChild(l); continue; }
    break;
  }
}
function renderRoam(){
  const p=roamPoints[roamIdx]; if(!p) return;
  $('roamScope').textContent='🧭 '+roamScopeName;
  $('roamPos').textContent=(roamIdx+1)+' / '+roamPoints.length;
  $('roamProg').style.width=(((roamIdx+1)/roamPoints.length)*100).toFixed(1)+'%';
  $('roamTitle').textContent=p.title;
  const box=$('roamText');
  /* 有原文格式：按 HTML 渲染并整理间距；纯文本：按行拆成段落（吃掉空行，段距统一） */
  if(p.html){ box.innerHTML=p.html; tidyRoamHtml(box); }
  else{
    const raw=String(p.text||'');
    if(raw.indexOf('\n')>=0){
      box.innerHTML=raw.split(/\n+/).map(l=>l.trim()).filter(Boolean).map(l=>'<p>'+esc(l)+'</p>').join('');
    }else box.textContent=raw;
  }
  $('roamSrc').textContent=p.docName?('来源：'+p.docName):'';
  $('roamOpen').style.display=p.docId?'':'none';
  const body=document.querySelector('#roam .roam-body'); if(body) body.scrollTop=0;
}
function roamStep(delta){
  if(!roamPoints.length) return;
  roamIdx=(roamIdx+delta+roamPoints.length)%roamPoints.length;
  renderRoam();
}
async function roamOpenDoc(){
  const p=roamPoints[roamIdx]; if(!p||!p.docId) return;
  const it=state.items.find(x=>x.id===p.docId); if(!it) return;
  $('roam').classList.remove('show');
  if(it.type==='note'||it.type==='link'){ openEditor(it); return; }
  if(!(isHtmlName(it.fileName)||isPdfName(it.fileName))){ downloadFileByItem(it); return; }
  await openReader(it.id);
  if(p.hidx!=null) setTimeout(()=>{ try{ $('rdFrame').contentWindow.postMessage({action:'scroll',ridx:p.hidx},'*'); }catch(e){} },800);
}
function downloadFileByItem(it){
  (async()=>{
    const u=await ensureItemLocal(it);
    if(!u){ toast('文件数据丢失'); return; }
    /* 转换过的文档正文已是 HTML，下载时按 .html 命名，否则下下来是个改了后缀的 HTML */
    let name=it.fileName||'file';
    if(it.docFormat==='html'&&!isHtmlName(name)) name=stripAnyExt(name)+'.html';
    const a=document.createElement('a'); a.href=u; a.download=name; a.click();
  })();
}

