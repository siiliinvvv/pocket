/* ============================================================
   Pocket · 内置阅读器
   HTML/PDF 阅读器开合、文档列表与目录
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= HTML / PDF 内置阅读器 ================= */
function docItems(){ return state.items.filter(it=>it.type==='file'&&it.fileKey&&isDocLike(it.fileName)); }
function updateReaderCount(){ const n=docItems().length; const el=$('readerCount'); if(el) el.textContent=n?String(n):''; }
function b64ToBytes(b64){
  const bin=atob(b64.replace(/\s/g,''));
  const bytes=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return bytes;
}
/* dataURL → html 文本（自动识别 utf-8 / gbk 等编码） */
function dataUrlToText(u){
  const i=u.indexOf(',');
  const head=u.slice(0,i), body=u.slice(i+1);
  if(!/;base64/i.test(head)){ try{ return decodeURIComponent(body); }catch(e){ return body; } }
  const bytes=b64ToBytes(body);
  let cs='utf-8';
  try{
    const probe=new TextDecoder('utf-8').decode(bytes.slice(0,2048));
    const m=/charset\s*=\s*["']?([\w-]+)/i.exec(probe);
    if(m&&m[1]&&m[1].toLowerCase()!=='utf-8') cs=m[1].toLowerCase();
  }catch(e){}
  try{ return new TextDecoder(cs).decode(bytes); }catch(e){ return new TextDecoder('utf-8').decode(bytes); }
}
let readerDocs=[], readerId=null, readerToc=[], readerBlobUrl=null, readerTab='toc', rdFolderFilter='all', tocShowH3=false;
/* 当前筛选下的文档列表 */
function rdList(){ return rdFolderFilter==='all'?readerDocs:readerDocs.filter(it=>it.folderId===rdFolderFilter); }

/* ================= 阅读器 · 划线标注（第二十九批） =================
   选中正文 → 浮出「高亮 / 下划线 / 波浪线 / 批注」→ 存进条目的 it.marks。
   锚点用「原文 + 前后各 40 字上下文」，因此重新打开、换设备、同步合并后
   仍能落回同一段文字（原文被改动对不上时，标注页签里标注为「未定位」）。
   只支持 HTML / 文本 / Markdown / Word（这些文档由平台自己渲染）；
   PDF 交给浏览器自带阅读器，无法注入文本层，页签里会给出说明。 */
const MARK_STYLES={hl:'高亮',ul:'下划线',wavy:'波浪线'};
/* 本次渲染没能在正文里定位到的标注（原文改动太大 / 换了文件版本） */
let readerMarkMiss=new Set();
function markOf(it){
  if(!it) return [];
  if(!Array.isArray(it.marks)) it.marks=[];
  return it.marks;
}
function readerCurDoc(){ return readerDocs.find(x=>x.id===readerId)||null; }
function canMarkReaderDoc(it){ return !!(it&&!isPdfName(it.fileName)); }
function normMarkText(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
function shortMarkText(s,n){ const t=normMarkText(s); const m=n||70; return t.length>m?t.slice(0,m)+'…':t; }
/* 把标注推给 iframe（不重载文档，保住滚动位置） */
function pushMarksToFrame(){
  const it=readerCurDoc();
  if(!it||!canMarkReaderDoc(it)) return;
  const f=$('rdFrame'); if(!f||!f.contentWindow) return;
  try{ f.contentWindow.postMessage({action:'marks',list:markOf(it)},'*'); }catch(e){}
}
function addReaderMark(style,sel,note){
  const it=readerCurDoc(); if(!it) return;
  if(SHARED){ toast('这是只读分享版，标注不会保存'); return; }
  const q=normMarkText(sel&&sel.q);
  if(!q){ toast('先选中要标注的文字'); return; }
  if(q.length>800){ toast('一次最多标注 800 字，分段划更清楚'); return; }
  const arr=markOf(it);
  if(arr.some(m=>m.q===q&&(m.before||'')===(sel.before||'')&&(m.after||'')===(sel.after||''))){
    toast('这段文字已经标注过了'); return;
  }
  arr.push({
    id:uid(), style:MARK_STYLES[style]?style:'hl', q:q,
    before:String(sel.before||'').slice(-40), after:String(sel.after||'').slice(0,40),
    note:String(note||'').trim(), created:Date.now()
  });
  save(); pushMarksToFrame(); renderReaderMarks();
  toast(note?'已添加批注':'已添加'+MARK_STYLES[style]+'标注');
}
async function addReaderMarkNote(sel){
  if(SHARED){ toast('这是只读分享版，标注不会保存'); return; }
  const q=normMarkText(sel&&sel.q);
  if(!q){ toast('先选中要写批注的文字'); return; }
  const v=await uiPrompt({title:'写批注',label:'批注内容（会显示在「标注」页签里）',multiline:true,rows:4,max:500});
  if(v==null) return;
  addReaderMark('hl',sel,v.trim());
}
function delReaderMark(id){
  const it=readerCurDoc(); if(!it||SHARED) return;
  const arr=markOf(it); const i=arr.findIndex(m=>m.id===id);
  if(i<0) return;
  arr.splice(i,1);
  save(); pushMarksToFrame(); renderReaderMarks();
  toast('已删除这处标注');
}
async function editReaderMarkNote(id){
  const it=readerCurDoc(); if(!it||SHARED) return;
  const m=markOf(it).find(x=>x.id===id); if(!m) return;
  const v=await uiPrompt({title:'修改批注',label:'批注内容（留空 = 只保留划线）',value:m.note||'',multiline:true,rows:4,max:500});
  if(v==null) return;
  m.note=v.trim();
  save(); pushMarksToFrame(); renderReaderMarks();
  toast(m.note?'批注已保存':'已清空批注，保留划线');
}
/* 「标注」页签 */
function renderReaderMarks(){
  const box=$('rdMarks'); if(!box) return;
  const it=readerCurDoc();
  if(!it){ box.innerHTML='<div class="rd-empty">先选择一个文档。</div>'; return; }
  if(!canMarkReaderDoc(it)){
    box.innerHTML='<div class="rd-empty">PDF 暂不支持划线标注。<br><br>HTML / 文本 / Markdown / Word 文档可以：<br>在正文里选中一段文字，就会浮出<br>「高亮 / 下划线 / 波浪线 / 批注」。</div>';
    return;
  }
  const list=markOf(it);
  if(!list.length){
    box.innerHTML='<div class="rd-empty">这篇还没有标注。<br><br>在右侧正文里<b>选中一段文字</b>，<br>会浮出「高亮 / 下划线 / 波浪线 / 批注」。'+
      (SHARED?'<br><br>分享版只读，标注不会保存。':'')+'</div>';
    return;
  }
  box.innerHTML='<div class="rd-mark-count">共 '+list.length+' 处 · 点一条可跳回原文</div>'+
    list.map(m=>{
      const miss=readerMarkMiss.has(m.id);
      return '<div class="rd-mark-item'+(miss?' is-miss':'')+'" data-mid="'+esc(m.id)+'" role="button" tabindex="0" title="'+(miss?'原文已改动，这处标注暂时定位不到':'跳到原文位置')+'">'+
        '<div class="rd-mark-head"><span class="rd-mark-badge rd-mark-'+m.style+'">'+(MARK_STYLES[m.style]||'高亮')+'</span>'+
        (m.note?'<span class="rd-mark-note">📝 '+esc(m.note)+'</span>':'')+
        (miss?'<span class="rd-mark-miss">未定位</span>':'')+
        '<button class="rd-mark-del" data-del="'+esc(m.id)+'" title="删除这处标注">✕</button></div>'+
        '<div class="rd-mark-q">'+esc(shortMarkText(m.q,90))+'</div>'+
      '</div>';
    }).join('');
  box.querySelectorAll('.rd-mark-item').forEach(el=>{
    const jump=()=>{
      const f=$('rdFrame');
      if(f&&f.contentWindow) f.contentWindow.postMessage({action:'markScroll',id:el.dataset.mid},'*');
      if(window.innerWidth<=768) $('rdSide').classList.remove('open');
    };
    el.onclick=e=>{
      const del=e.target&&e.target.dataset?e.target.dataset.del:null;
      if(del){ e.stopPropagation(); delReaderMark(del); return; }
      jump();
    };
    el.onkeydown=e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); jump(); } };
  });
}
/* iframe 内的划线工具条 / 批注气泡（随文档注入，样式自带） */
function readerMarkInject(){
  return '<scr'+'ipt>(function(){'+
    'if(window.__tbMarkInit) return; window.__tbMarkInit=1;'+
    'var tbEsc=function(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");};'+
    'var st=document.createElement("style");'+
    'st.textContent='+
      '"html,body{-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}"'+
      '+"::selection{background:#cfe3ff;color:inherit}"'+
      '+"mark.tb-mark{cursor:pointer;border-radius:3px;padding:0 1px;background:#ffe27a;box-decoration-break:clone;-webkit-box-decoration-break:clone}"'+
      '+"mark.tb-mark.tb-ul{background:transparent;border-bottom:2px solid #e8734a;border-radius:0;padding:0}"'+
      '+"mark.tb-mark.tb-wavy{background:transparent;text-decoration:underline wavy #2f9e6f;text-decoration-thickness:1.5px;text-underline-offset:3px}"'+
      '+"mark.tb-mark.tb-note{background:#fff0ad;border-bottom:1px dashed #d99a00}"'+
      '+"mark.tb-mark.tb-flash{animation:tbFlash 1.2s ease}"'+
      '+"@keyframes tbFlash{0%,100%{outline:0 solid transparent}25%{outline:3px solid #7fc4ff}}"'+
      '+"#tbMarkBar{position:fixed;z-index:2147483600;display:none;gap:2px;padding:4px;background:#fff;border-radius:10px;box-shadow:0 6px 22px rgba(20,40,80,.22);font-family:inherit}"'+
      '+"#tbMarkBar.show{display:flex}"'+
      '+"#tbMarkBar button{border:0;background:transparent;border-radius:7px;padding:5px 9px;font-size:12.5px;color:#33445c;cursor:pointer;font-family:inherit;white-space:nowrap}"'+
      '+"#tbMarkBar button:hover{background:#eef4fd;color:#2b6cb0}"'+
      '+"#tbMarkBar .tb-dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:4px;vertical-align:middle}"'+
      '+"#tbMarkBar.tb-bottom{left:50%!important;transform:translateX(-50%);top:auto!important;bottom:calc(18px + env(safe-area-inset-bottom));box-shadow:0 10px 30px rgba(20,40,80,.26);padding:5px}"'+
      '+"#tbMarkTip{position:fixed;z-index:2147483601;display:none;max-width:290px;background:#fff;border-radius:10px;box-shadow:0 8px 26px rgba(20,40,80,.24);padding:10px 12px;font-family:inherit;font-size:12.5px;color:#33445c;line-height:1.7}"'+
      '+"#tbMarkTip.show{display:block}"'+
      '+"#tbMarkTip .tb-tip-q{font-size:11.5px;color:#8a99b3;border-left:3px solid #ffe27a;padding-left:7px;margin-bottom:6px;max-height:50px;overflow:hidden}"'+
      '+"#tbMarkTip .tb-tip-note{white-space:pre-wrap;word-break:break-word}"'+
      '+"#tbMarkTip .tb-tip-acts{display:flex;gap:6px;margin-top:8px}"'+
      '+"#tbMarkTip .tb-tip-acts button{flex:1;border:0;border-radius:7px;padding:5px 0;font-size:12px;cursor:pointer;font-family:inherit;background:#eef4fd;color:#2b6cb0}"'+
      '+"#tbMarkTip .tb-tip-acts button.tb-danger{background:#fdecec;color:#c94b4b}";'+
    '(document.head||document.documentElement).appendChild(st);'+
    'var bar=document.createElement("div");bar.id="tbMarkBar";bar.contentEditable="false";'+
    'bar.innerHTML=\'<button data-s="hl"><span class="tb-dot" style="background:#ffe27a"></span>高亮</button>'+
      '<button data-s="ul"><span class="tb-dot" style="background:#e8734a"></span>下划线</button>'+
      '<button data-s="wavy"><span class="tb-dot" style="background:#2f9e6f"></span>波浪线</button>'+
      '<button data-s="note">✎ 批注</button>\';'+
    'document.body.appendChild(bar);'+
    'var tip=document.createElement("div");tip.id="tbMarkTip";tip.contentEditable="false";document.body.appendChild(tip);'+
    'var MARKS=[];'+
    'function skip(n){var p=n.parentNode;if(!p)return true;var t=p.nodeName;if(t==="SCRIPT"||t==="STYLE"||t==="NOSCRIPT"||t==="TEXTAREA")return true;if(p.closest&&p.closest("#tbMarkBar,#tbMarkTip"))return true;return false;}'+
    'function rawMap(){var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,false);var segs=[],raw="",n;'+
      'while((n=w.nextNode())){if(skip(n))continue;var v=n.nodeValue||"";if(!v)continue;segs.push({n:n,s:raw.length,e:raw.length+v.length});raw+=v;}return {segs:segs,raw:raw};}'+
    'function normMap(raw){var out="",map=[],i=0,len=raw.length;while(i<len){var c=raw.charAt(i);'+
      'if(/\\s/.test(c)){var j=i;while(j<len&&/\\s/.test(raw.charAt(j)))j++;out+=" ";map.push(i);i=j;}'+
      'else{out+=c;map.push(i);i++;}}return {norm:out,map:map};}'+
    'function findMark(m,M){var q=String(m.q||"").replace(/\\s+/g," ").trim();if(!q)return null;'+
      'var norm=M.norm,start=0,hit=-1;'+
      'var pre=String(m.before||"").replace(/\\s+/g," ").slice(-30),post=String(m.after||"").replace(/\\s+/g," ").slice(0,30);'+
      'while(true){var i=norm.indexOf(q,start);if(i<0)break;'+
      'var okPre=!pre||norm.slice(Math.max(0,i-pre.length),i)===pre;'+
      'var okPost=!post||norm.slice(i+q.length,i+q.length+post.length)===post;'+
      'if(okPre&&okPost){hit=i;break;}start=i+1;}'+
      'if(hit<0)return null;return {s:M.map[hit],e:M.map[hit+q.length-1]+1};}'+
    /* 逐文本节点分段包 <mark>：跨段落 / 跨列表项选择也不会改动原文结构
       （若用一个 range.extractContents 包起来，会把块级元素塞进 inline 的 mark 里，重排时越包越乱） */
    'function wrapSegments(mid,cls,note,s,e){var R=rawMap(),segs=[],i,g;'+
      'for(i=0;i<R.segs.length;i++){g=R.segs[i];var st=Math.max(s,g.s),en=Math.min(e,g.e);'+
        'if(en<=st)continue;segs.push({n:g.n,a:st-g.s,b:en-g.s});}'+
      'if(!segs.length)return false;'+
      'for(var k=segs.length-1;k>=0;k--){var t=segs[k].n,a=segs[k].a,b=segs[k].b;'+
        'if(a>0)t=t.splitText(a);'+
        'if(b-a<t.nodeValue.length)t.splitText(b-a);'+
        'var mk=document.createElement("mark");mk.className="tb-mark "+cls;mk.setAttribute("data-mid",mid);if(note)mk.title=note;'+
        't.parentNode.insertBefore(mk,t);mk.appendChild(t);}'+
      'return true;}'+
    'function clearMarks(){var ms=document.querySelectorAll("mark.tb-mark");'+
      'for(var i=ms.length-1;i>=0;i--){var m=ms[i],p=m.parentNode;while(m.firstChild)p.insertBefore(m.firstChild,m);p.removeChild(m);}}'+
    'function applyMarks(list){clearMarks();try{document.body.normalize();}catch(e){}MARKS=list||[];var miss=[];'+
      '(list||[]).forEach(function(m){if(!m||!m.q)return;var R=rawMap(),M=normMap(R.raw),pos=findMark(m,M);if(!pos){miss.push(m.id);return;}'+
      'var cls=m.style==="ul"?"tb-ul":(m.style==="wavy"?"tb-wavy":(m.note?"tb-note":"tb-hl"));if(!wrapSegments(m.id,cls,m.note,pos.s,pos.e))miss.push(m.id);});'+
      'parent.postMessage({action:"marksMiss",ids:miss},"*");}'+
    'function selInfo(){var s=window.getSelection();if(!s||!s.rangeCount||s.isCollapsed)return null;'+
      'var txt=String(s.toString()||"");if(!txt.trim())return null;var r=s.getRangeAt(0),R=rawMap();'+
      'function off(node,o){for(var i=0;i<R.segs.length;i++){if(R.segs[i].n===node)return R.segs[i].s+o;}return -1;}'+
      'var s0=-1,e0=-1;if(r.startContainer.nodeType===3)s0=off(r.startContainer,r.startOffset);if(r.endContainer.nodeType===3)e0=off(r.endContainer,r.endOffset);'+
      'if(s0<0||e0<0||e0<=s0)return {q:txt,before:"",after:""};'+
      'return {q:R.raw.slice(s0,e0),before:R.raw.slice(Math.max(0,s0-40),s0),after:R.raw.slice(e0,e0+40)};}'+
    'function showBar(){var info=selInfo(),s=window.getSelection();if(!info){bar.classList.remove("show");return;}'+
      'var rect=s.getRangeAt(0).getBoundingClientRect();var narrow=window.innerWidth<700;'+
      'bar.classList.toggle("tb-bottom",narrow);bar.classList.add("show");'+
      'if(narrow)return;'+
      'var w=bar.offsetWidth||230,h=bar.offsetHeight||34;'+
      'var left=Math.min(Math.max(8,rect.left+rect.width/2-w/2),window.innerWidth-w-8);'+
      'var top=rect.top-h-8;if(top<8)top=rect.bottom+8;'+
      'bar.style.left=left+"px";bar.style.top=top+"px";}'+
    /* 触屏设备屏蔽长按 / 右键弹出的原生「复制·粘贴·查询」菜单，避免它盖住选区；桌面端保留右键 */
    'if(window.matchMedia&&window.matchMedia("(pointer:coarse)").matches){'+
      'document.addEventListener("contextmenu",function(e){if(e.target&&e.target.closest&&e.target.closest("#tbMarkBar,#tbMarkTip"))return;e.preventDefault();},true);}'+
    'bar.addEventListener("touchstart",function(e){e.stopPropagation();},{passive:true});'+
    'bar.addEventListener("mousedown",function(e){e.preventDefault();});'+
    'bar.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button[data-s]"):null;if(!b)return;'+
      'var info=selInfo();if(!info){bar.classList.remove("show");return;}'+
      'var act=b.getAttribute("data-s");'+
      'parent.postMessage({action:(act==="note"?"markNote":"markAdd"),style:(act==="note"?"hl":act),sel:info},"*");'+
      'bar.classList.remove("show");try{window.getSelection().removeAllRanges();}catch(err){}});'+
    'document.addEventListener("mouseup",function(e){if(e.target&&e.target.closest&&e.target.closest("#tbMarkBar,#tbMarkTip"))return;setTimeout(showBar,10);});'+
    /* 手机 / 平板：长按选中不会触发 mouseup，改用 selectionchange 与 touchend 兜底 */
    'var tbSelTimer=null;'+
    'document.addEventListener("selectionchange",function(){clearTimeout(tbSelTimer);tbSelTimer=setTimeout(showBar,240);});'+
    'document.addEventListener("touchend",function(e){if(e.target&&e.target.closest&&e.target.closest("#tbMarkBar,#tbMarkTip"))return;setTimeout(showBar,260);});'+
    'document.addEventListener("mousedown",function(e){if(e.target&&e.target.closest&&e.target.closest("#tbMarkBar,#tbMarkTip"))return;'+
      'bar.classList.remove("show");tip.classList.remove("show");},true);'+
    'document.addEventListener("click",function(ev){var mk=ev.target.closest?ev.target.closest("mark.tb-mark"):null;'+
      'if(!mk){tip.classList.remove("show");return;}'+
      'var id=mk.getAttribute("data-mid"),m=null;'+
      'for(var i=0;i<MARKS.length;i++){if(MARKS[i].id===id){m=MARKS[i];break;}}'+
      'tip.innerHTML=\'<div class="tb-tip-q">\'+tbEsc((m&&m.q)||mk.textContent||"")+\'</div>\'+'+
      '\'<div class="tb-tip-note">\'+((m&&m.note)?tbEsc(m.note):\'<span style="color:#98a6bb">还没有批注</span>\')+\'</div>\'+'+
      '\'<div class="tb-tip-acts"><button data-act="note">\'+((m&&m.note)?"改批注":"写批注")+\'</button>\'+'+
      '\'<button data-act="del" class="tb-danger">删除标注</button></div>\';'+
      'tip.dataset.mid=id;tip.classList.add("show");'+
      'var r=mk.getBoundingClientRect(),tw=tip.offsetWidth,th=tip.offsetHeight;'+
      'var left=Math.min(Math.max(8,r.left),window.innerWidth-tw-8);var top=r.bottom+8;'+
      'if(top+th>window.innerHeight-8)top=Math.max(8,r.top-th-8);'+
      'tip.style.left=left+"px";tip.style.top=top+"px";'+
      'ev.preventDefault();ev.stopPropagation();},true);'+
    'tip.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button[data-act]"):null;if(!b)return;'+
      'parent.postMessage({action:(b.getAttribute("data-act")==="del"?"markDel":"markEdit"),id:tip.dataset.mid},"*");'+
      'tip.classList.remove("show");});'+
    'window.addEventListener("message",function(e){var d=e.data||{};if(!d||typeof d.action!=="string")return;'+
      'if(d.action==="marks"){applyMarks(d.list||[]);}'+
      'if(d.action==="markScroll"){var el=document.querySelector(\'mark.tb-mark[data-mid="\'+d.id+\'"]\');'+
        'if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.classList.remove("tb-flash");void el.offsetWidth;el.classList.add("tb-flash");}}});'+
    '})();</scr'+'ipt>';
}
window.addEventListener('message',e=>{
  const f=$('rdFrame'); if(!f||e.source!==f.contentWindow) return;
  const d=e.data||{}; if(!d||typeof d.action!=='string') return;
  if(d.action==='markAdd') addReaderMark(d.style,d.sel);
  else if(d.action==='markNote') addReaderMarkNote(d.sel);
  else if(d.action==='markDel') delReaderMark(d.id);
  else if(d.action==='markEdit') editReaderMarkNote(d.id);
  else if(d.action==='marksMiss'){
    readerMarkMiss=new Set(Array.isArray(d.ids)?d.ids:[]);
    if(readerTab==='marks') renderReaderMarks();
  }
});

