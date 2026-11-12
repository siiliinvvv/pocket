/* ============================================================
   Pocket · 块级编辑菜单（参考飞书文档交互）
   编辑器里把鼠标移到任意块（段落 / 标题 / 列表项 / 引用 / 代码块）
   左侧会出现「手柄」：
     · 点击手柄  → 弹出格式菜单：正文 / H1 / H2 / H3 / 有序 / 无序 /
                   待办 / 代码块 / 引用 / 分隔线 / 缩进 / 复制块 / 删除块
     · 拖动手柄  → 块可拖到文档任意位置（拖出列表自动转正文）
   本模块全部 UI 都建在编辑器 iframe 内部，样式随文档注入；
   临时元素统一带 id 前缀 tbBlk*，保存时由 serializeEditor 清理。
   ------------------------------------------------------------
   依赖：edDoc / edBlockOf / edSetCaret / edTouch（33-editor-plus.js）
   ============================================================ */
'use strict';
function edInitBlockMenu(d){
  if(!d||!d.body||d.getElementById('tbBlkMenu')) return;
  const win=d.defaultView;

  /* ---------- 样式（注入 iframe 文档） ---------- */
  const st=d.createElement('style');
  st.textContent=
  '#tbBlkHandle{position:absolute;z-index:2147483000;opacity:0;pointer-events:none;transition:opacity .12s;user-select:none;-webkit-user-select:none}'+
  '#tbBlkHandle.show{opacity:1;pointer-events:auto}'+
  '#tbBlkHandle .tb-blk-btn{display:flex;align-items:center;justify-content:center;width:26px;height:24px;border-radius:8px;background:#fff;box-shadow:0 1px 5px rgba(30,50,90,.25);cursor:grab;color:#5b6b84;font-size:11px;font-weight:700;font-family:inherit;box-sizing:border-box;user-select:none;-webkit-user-select:none}'+
  '#tbBlkHandle .tb-blk-btn:hover{background:#eef4fd;color:#2b6cb0}'+
  '#tbBlkHandle .tb-blk-tag{min-width:14px;text-align:center}'+
  '#tbBlkMenu{position:absolute;z-index:2147483001;background:#fff;border:1px solid #e3e9f2;border-radius:12px;box-shadow:0 10px 30px rgba(30,50,90,.20);padding:8px;display:none;min-width:238px;font-family:inherit;color:#3d4c63}'+
  '#tbBlkMenu.show{display:block}'+
  '.tb-blk-row{display:flex;flex-wrap:wrap;gap:4px}'+
  '.tb-blk-item{flex:0 0 auto;min-width:32px;height:32px;border:0;background:transparent;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:4px;cursor:pointer;font-size:12.5px;color:#3d4c63;padding:0 8px;font-family:inherit}'+
  '.tb-blk-item:hover{background:#f0f5fd;color:#2b6cb0}'+
  '.tb-blk-item.on{background:#e6effc;color:#2b6cb0;font-weight:700}'+
  '.tb-blk-item.wide{flex:1 1 40%;justify-content:flex-start}'+
  '.tb-blk-item .ico{font-weight:700;font-size:12px;min-width:18px;text-align:center}'+
  '.tb-blk-sep{height:1px;background:#edf1f7;margin:6px 2px}'+
  '.tb-blk-line{position:absolute;height:3px;background:#5B99E2;border-radius:2px;z-index:2147482999;pointer-events:none;box-shadow:0 0 0 1px rgba(255,255,255,.75)}';
  (d.head||d.documentElement).appendChild(st);

  /* ---------- 手柄（只有一个按钮：显示块类型；点击开菜单，按住拖动移块） ---------- */
  const handle=d.createElement('div'); handle.id='tbBlkHandle'; handle.contentEditable='false';
  handle.innerHTML='<span class="tb-blk-btn tb-blk-grip" title="点击打开块菜单 / 按住拖动移动此块"><span class="tb-blk-tag"></span></span>';
  d.body.appendChild(handle);
  const grip=handle.querySelector('.tb-blk-grip');
  const tag=handle.querySelector('.tb-blk-tag');

  /* ---------- 菜单 ---------- */
  const menu=d.createElement('div'); menu.id='tbBlkMenu'; menu.contentEditable='false';
  const ROWS=[
    [{k:'p',ico:'T',title:'转为正文'},{k:'h1',ico:'H1',title:'转为标题一'},{k:'h2',ico:'H2',title:'转为标题二'},{k:'h3',ico:'H3',title:'转为标题三'},{k:'ol',ico:'1.',title:'有序列表'},{k:'ul',ico:'•',title:'无序列表'}],
    [{k:'task',ico:'✓',title:'待办清单'},{k:'pre',ico:'{}',title:'代码块'},{k:'quote',ico:'❝',title:'引用'},{k:'hr',ico:'—',title:'插入分隔线'}],
    [{k:'outdent',ico:'⇤',t:'减少缩进',wide:1},{k:'indent',ico:'⇥',t:'增加缩进',wide:1}],
    [{k:'copy',ico:'⧉',t:'复制块内容',wide:1},{k:'del',ico:'✕',t:'删除块',wide:1}]
  ];
  menu.innerHTML=ROWS.map(function(row,ri){
    return (ri?'<div class="tb-blk-sep"></div>':'')+
      '<div class="tb-blk-row">'+row.map(function(m){
        return '<button class="tb-blk-item'+(m.wide?' wide':'')+'" data-k="'+m.k+'" title="'+(m.title||m.t)+'">'+
          '<span class="ico">'+m.ico+'</span>'+(m.t?'<span>'+m.t+'</span>':'')+'</button>';
      }).join('')+'</div>';
  }).join('');
  d.body.appendChild(menu);

  const line=d.createElement('div'); line.className='tb-blk-line';   /* 拖拽插入线 */

  let curBlock=null;      /* hover 中的块 */
  let menuBlock=null;     /* 菜单对应的块 */
  let drag=null;          /* 拖拽状态 {block,sx,sy,moved,tgt,pos} */

  /* ---------- 工具 ---------- */
  function blockKind(b){
    if(b.tagName==='PRE') return 'pre';
    if(b.tagName==='BLOCKQUOTE') return 'quote';
    if(b.tagName==='LI'){
      const p=b.parentNode;
      if(p&&p.classList&&p.classList.contains('tb-task')) return 'task';
      if(p&&p.tagName==='OL') return 'ol';
      return 'ul';
    }
    return /^H[1-6]$/.test(b.tagName)?b.tagName.toLowerCase():'p';
  }
  const TAG_TXT={p:'T',h1:'H1',h2:'H2',h3:'H3',h4:'H4',h5:'H5',h6:'H6',ol:'1.',ul:'•',task:'✓',quote:'❝',pre:'{}'};
  function isTmpEl(el){ return el.closest&&el.closest('#tbBlkHandle,#tbBlkMenu,.tb-blk-line,#tbImgHandle,#tbAttachBox'); }
  function docWidth(){ return Math.max(d.body.scrollWidth,win.innerWidth||0); }
  function posY(rect){ return rect.top+(win.pageYOffset||0); }
  function posX(rect){ return rect.left+(win.pageXOffset||0); }

  /* ---------- 手柄显示 / 隐藏 ---------- */
  function placeHandle(b){
    const rect=b.getBoundingClientRect();
    handle.classList.add('show');
    handle.style.left=Math.max(2,posX(rect)-36)+'px';
    handle.style.top=posY(rect)+'px';
    tag.textContent=TAG_TXT[blockKind(b)]||'T';
  }
  function hideHandle(){ handle.classList.remove('show'); curBlock=null; }
  function hideMenu(){ menu.classList.remove('show'); menuBlock=null; }

  /* ---------- hover 找块（拖拽中不抢） ---------- */
  /* 同行保护：鼠标只要还处于当前块所在「行高度带」（含左侧整个留白区），
     就绝不能隐藏手柄——否则从正文移向手柄要横穿 body 空隙，
     手柄会在鼠标到达前消失（这才是之前点不到按钮的真正根因）。 */
  function inRowBand(e){
    if(!handle.classList.contains('show')||!curBlock) return false;
    const r=curBlock.getBoundingClientRect();
    if(e.clientY<r.top-8||e.clientY>r.bottom+8) return false;
    const hr=handle.getBoundingClientRect();
    return e.clientX>=hr.left-10&&e.clientX<=r.right;
  }
  function nearHandle(e){
    if(!handle.classList.contains('show')) return false;
    const r=handle.getBoundingClientRect();
    const m=14;
    return e.clientX>=r.left-m&&e.clientX<=r.right+m&&e.clientY>=r.top-m&&e.clientY<=r.bottom+m;
  }
  d.addEventListener('mousemove',function(e){
    if(drag) return;
    const t=e.target;
    if(!t||t.nodeType!==1) return;
    if(isTmpEl(t)) return;   /* 鼠标在手柄 / 菜单上：保持现状，绝不能隐藏手柄 */
    if(nearHandle(e)||inRowBand(e)) return;
    const b=edBlockOf(d,t);
    if(!b||b===d.body){ if(!menu.classList.contains('show')) hideHandle(); return; }
    curBlock=b;
    if(!menu.classList.contains('show')) placeHandle(b);
  });
  d.addEventListener('mouseleave',function(){ if(!menu.classList.contains('show')) hideHandle(); });

  /* ---------- 点击手柄 → 开菜单 ---------- */
  handle.addEventListener('click',function(e){
    if(drag&&drag.moved) return;
    if(!curBlock) curBlock=menuBlock;
    if(!curBlock) return;
    menuBlock=curBlock;
    markCurrent();
    menu.classList.add('show');
    const hr=handle.getBoundingClientRect();
    const mw=menu.offsetWidth, mh=menu.offsetHeight;
    let mx=posX(hr)+26, my=posY(hr);
    mx=Math.max(4,Math.min(mx,docWidth()-mw-8));
    my=Math.min(my,Math.max(4,(d.body.scrollHeight||mh)-mh+40));
    menu.style.left=mx+'px';
    menu.style.top=my+'px';
  });

  /* ---------- 菜单当前类型高亮 ---------- */
  function markCurrent(){
    if(!menuBlock) return;
    const k=blockKind(menuBlock);
    menu.querySelectorAll('.tb-blk-item').forEach(function(el){ el.classList.toggle('on',el.dataset.k===k); });
  }

  /* ---------- 块操作 ---------- */
  function stripCheckbox(el){
    const c=el.querySelector&&el.querySelector('input[type=checkbox]');
    if(c) c.remove();
  }
  function replaceBlock(oldEl,tag,keepTextOnly){
    const nu=d.createElement(tag);
    if(keepTextOnly) nu.textContent=oldEl.textContent||'';
    else{
      if(oldEl.tagName==='LI') stripCheckbox(oldEl);
      nu.innerHTML=oldEl.innerHTML;
    }
    oldEl.parentNode.replaceChild(nu,oldEl);
    return nu;
  }
  function wrapToList(b,listTag,task){
    if(b.tagName==='LI'){
      const p=b.parentNode;
      if(p&&(p.tagName===listTag.toUpperCase())&&(!task||(p.classList&&p.classList.contains('tb-task')))) return b;
      const li=d.createElement('li');
      stripCheckbox(b);
      li.innerHTML=b.innerHTML;
      if(task){ li.insertBefore(Object.assign(d.createElement('input'),{type:'checkbox'}),li.firstChild); li.appendChild(d.createTextNode('\u00A0')); }
      const ul=d.createElement(listTag); if(task) ul.className='tb-task';
      ul.appendChild(li);
      b.parentNode.replaceChild(ul,b);
      return li;
    }
    const li=d.createElement('li');
    li.innerHTML=b.innerHTML;
    if(task){ li.insertBefore(Object.assign(d.createElement('input'),{type:'checkbox'}),li.firstChild); li.appendChild(d.createTextNode('\u00A0')); }
    const ul=d.createElement(listTag); if(task) ul.className='tb-task';
    ul.appendChild(li);
    b.parentNode.replaceChild(ul,b);
    return li;
  }
  function runOp(k){
    const b=menuBlock;
    if(!b) return;
    if(k==='p'){
      if(b.tagName!=='P') replaceBlock(b,'p');
    }
    else if(k==='h1'||k==='h2'||k==='h3'||k==='h4'){
      if(blockKind(b)!==k) replaceBlock(b,k);
    }
    else if(k==='ul'||k==='ol'){ wrapToList(b,k,false); }
    else if(k==='task'){ if(blockKind(b)==='task'){ replaceBlock(b,'p'); } else wrapToList(b,'ul',true); }
    else if(k==='pre'){ replaceBlock(b,'pre',true); }
    else if(k==='quote'){
      if(b.tagName!=='BLOCKQUOTE') replaceBlock(b,'blockquote');
      else replaceBlock(b,'p');
    }
    else if(k==='hr'){
      const hr=d.createElement('hr'); const p=d.createElement('p'); p.innerHTML='<br>';
      b.parentNode.insertBefore(hr,b.nextSibling); hr.parentNode.insertBefore(p,hr.nextSibling);
    }
    else if(k==='indent'||k==='outdent'){
      edSetCaret(d,b,true);
      try{ d.execCommand(k,false,null); }catch(e){}
    }
    else if(k==='copy'){
      const txt=(b.textContent||'').trim();
      try{ (navigator.clipboard&&navigator.clipboard.writeText)?navigator.clipboard.writeText(txt):fallbackCopy(d,txt); toast('已复制块内容'); }
      catch(e){ fallbackCopy(d,txt); toast('已复制块内容'); }
      hideMenu(); return;
    }
    else if(k==='del'){
      b.remove();
      if(!d.body.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,ul,ol,table,hr,img,figure')){
        const p=d.createElement('p'); p.innerHTML='<br>'; d.body.appendChild(p);
        edSetCaret(d,p,true);
      }
      hideHandle(); hideMenu(); edTouch(); return;
    }
    hideMenu(); edTouch(); edCommitSoon();
  }
  function fallbackCopy(d,txt){
    const ta=d.createElement('textarea'); ta.value=txt;
    ta.style.position='fixed'; ta.style.left='-9999px';
    d.body.appendChild(ta); ta.select();
    try{ d.execCommand('copy'); }catch(e){}
    ta.remove();
  }
  menu.addEventListener('mousedown',function(e){ e.preventDefault(); });   /* 防止点击菜单丢失选区 */
  menu.addEventListener('click',function(e){
    const b=e.target.closest('.tb-blk-item');
    if(b) runOp(b.dataset.k);
  });

  /* ---------- Escape 只关菜单，不关编辑器 ---------- */
  d.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&menu.classList.contains('show')){
      e.preventDefault(); e.stopPropagation();
      hideMenu();
    }
  },true);

  /* ---------- 点空白处收起 ---------- */
  d.addEventListener('mousedown',function(e){
    if(e.target&&e.target.closest&&!e.target.closest('#tbBlkMenu,#tbBlkHandle')) hideMenu();
  },true);

  /* ---------- 拖拽移动块 ---------- */
  function dropTargetAt(ev){
    const el=d.elementFromPoint(ev.clientX,ev.clientY);
    if(!el||isTmpEl(el)) return null;
    const b=edBlockOf(d,el);
    if(!b||b===drag.block) return null;
    if(drag.block.contains(b)) return null;                 /* 不能拖进自己内部 */
    const rect=b.getBoundingClientRect();
    return {block:b,before:ev.clientY<rect.top+rect.height/2};
  }
  function showDropLine(t){
    const rect=t.block.getBoundingClientRect();
    line.style.left=Math.max(0,posX(rect))+'px';
    line.style.width=rect.width+'px';
    line.style.top=(t.before?posY(rect)-2:posY(rect)+rect.height-1)+'px';
    if(!line.parentNode) d.body.appendChild(line);
  }
  grip.addEventListener('mousedown',function(e){
    e.preventDefault(); e.stopPropagation();
    if(!curBlock) return;
    drag={block:curBlock,sx:e.clientX,sy:e.clientY,moved:false,tgt:null};
    hideMenu();
    const mv=function(ev){
      if(!drag) return;
      if(!drag.moved&&Math.abs(ev.clientY-drag.sy)+Math.abs(ev.clientX-drag.sx)<4) return;
      drag.moved=true;
      handle.style.cursor='grabbing';
      const t=dropTargetAt(ev);
      drag.tgt=t;
      if(t) showDropLine(t); else if(line.parentNode) line.remove();
    };
    const up=function(){
      d.removeEventListener('mousemove',mv); d.removeEventListener('mouseup',up);
      if(line.parentNode) line.remove();
      handle.style.cursor='';
      if(drag&&drag.moved&&drag.tgt) doMove(drag.block,drag.tgt);
      drag=null;
    };
    d.addEventListener('mousemove',mv); d.addEventListener('mouseup',up);
  });
  /* 从列表里拖出 → 转成正文段落再移动 */
  function detachAsParagraph(li){
    const p=d.createElement('p');
    stripCheckbox(li);
    p.innerHTML=li.innerHTML;
    li.parentNode.removeChild(li);
    return p;
  }
  function doMove(block,t){
    let el=block;
    if(el.tagName==='LI'&&t.block.tagName!=='LI'){        /* 拖出列表：变正文 */
      const list=el.closest('ul,ol');
      el=detachAsParagraph(el);
      if(list&&!list.querySelector('li')) list.remove();  /* 空列表顺手清掉 */
    }
    let anchor=t.block, before=t.before;
    if(el.tagName!=='LI'&&t.block.tagName==='LI'){
      const list=t.block.closest('ul,ol');
      if(list){ anchor=list; before=t.before; }
    }
    try{
      if(before) anchor.parentNode.insertBefore(el,anchor);
      else anchor.parentNode.insertBefore(el,anchor.nextSibling);
    }catch(e){ return; }
    hideHandle(); edTouch(); edCommitSoon();
  }

  /* ---------- 保存清理由 serializeEditor 在克隆副本上完成 ---------- */
}
/* 包装 iframe 事件初始化：原逻辑跑完后再挂块菜单 */
(function(){
  const orig=edInitFrameEvents;
  edInitFrameEvents=function(d,it){
    orig(d,it);
    try{ edInitBlockMenu(d); }catch(e){}
  };
})();
