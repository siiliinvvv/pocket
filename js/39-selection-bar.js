/* ============================================================
   Pocket · 选区浮动工具条（参考飞书文档交互）
   编辑器里选中一段文字，选区上方自动浮出格式条：
     B 粗体 · I 斜体 · U 下划线 · S 删除线
     <> 行内代码 · 🔗 链接 · A 字体颜色 · 🖍 高亮色 · 清除格式
   全部 UI 建在编辑器 iframe 内部；临时元素 id 前缀 tbSel*，
   保存时由 serializeEditor 清理，不会写进文档。
   ------------------------------------------------------------
   依赖：edDoc / edExec / edTouch / edCommitSoon（32/33 模块）、uiPrompt（06-dialog.js）
   ============================================================ */
'use strict';
function edInitSelBar(d){
  if(!d||!d.body||d.getElementById('tbSelBar')) return;
  const win=d.defaultView;

  /* ---------- 样式 ---------- */
  const st=d.createElement('style');
  st.textContent=
  '#tbSelBar{position:absolute;z-index:2147483002;display:none;align-items:center;gap:1px;background:#fff;border:1px solid #e3e9f2;border-radius:10px;box-shadow:0 8px 26px rgba(30,50,90,.22);padding:4px;user-select:none;-webkit-user-select:none;font-family:inherit}'+
  '#tbSelBar.show{display:flex}'+
  '.tb-sel-btn{min-width:26px;height:26px;border:0;background:transparent;border-radius:6px;cursor:pointer;font-size:13px;color:#3d4c63;display:flex;align-items:center;justify-content:center;gap:2px;padding:0 5px;font-family:inherit;white-space:nowrap}'+
  '.tb-sel-btn:hover{background:#f0f5fd;color:#2b6cb0}'+
  '.tb-sel-btn b{font-weight:800}.tb-sel-btn i{font-style:italic;font-family:Georgia,serif}.tb-sel-btn s{text-decoration:line-through}'+
  '.tb-sel-btn .ucode{font-family:Consolas,Menlo,monospace;font-weight:700;font-size:12px}'+
  '.tb-sel-btn .uhl{font-weight:800;border-bottom:4px solid #ffe08a;line-height:14px}'+
  '.tb-sel-sep{width:1px;height:18px;background:#e8edf4;margin:0 3px}'+
  '#tbSelColors{position:absolute;display:none;flex-wrap:wrap;gap:5px;background:#fff;border:1px solid #e3e9f2;border-radius:10px;box-shadow:0 8px 24px rgba(30,50,90,.24);padding:8px;width:132px;z-index:2147483003;user-select:none}'+
  '#tbSelColors.show{display:flex}'+
  '.tb-sel-color{width:20px;height:20px;border-radius:5px;border:1px solid rgba(0,0,0,.14);cursor:pointer;padding:0}'+
  '.tb-sel-color:hover{transform:scale(1.15)}'+
  '.tb-sel-color.none{background:repeating-linear-gradient(45deg,#eee,#eee 3px,#fff 3px,#fff 6px);position:relative}';
  (d.head||d.documentElement).appendChild(st);

  const FG=['#b02a2a','#c2571a','#1e7e34','#1d6fb8','#6b3fa0','#c7215d','#243447','#6b7280','#111111'];
  const HI=['#fff59d','#c8e6c9','#bbdefb','#f8bbd0','#ffe0b2','#d1c4e9','#e0e0e0'];
  const HI_NAMES=['黄','绿','蓝','粉','橙','紫','灰'];

  const bar=d.createElement('div'); bar.id='tbSelBar'; bar.contentEditable='false';
  bar.innerHTML=
    '<button class="tb-sel-btn" data-c="bold" title="粗体 (Ctrl+B)"><b>B</b></button>'+
    '<button class="tb-sel-btn" data-c="italic" title="斜体 (Ctrl+I)"><i>I</i></button>'+
    '<button class="tb-sel-btn" data-c="underline" title="下划线 (Ctrl+U)"><u>U</u></button>'+
    '<button class="tb-sel-btn" data-c="strikeThrough" title="删除线"><s>S</s></button>'+
    '<span class="tb-sel-sep"></span>'+
    '<button class="tb-sel-btn" data-c="code" title="行内代码"><span class="ucode">&lt;&gt;</span></button>'+
    '<button class="tb-sel-btn" data-c="link" title="插入链接">🔗</button>'+
    '<button class="tb-sel-btn" data-c="fg" title="字体颜色">A ▾</button>'+
    '<button class="tb-sel-btn" data-c="hl" title="高亮背景色"><span class="uhl">A</span> ▾</button>'+
    '<span class="tb-sel-sep"></span>'+
    '<button class="tb-sel-btn" data-c="clear" title="清除格式">清除</button>';
  d.body.appendChild(bar);

  const colors=d.createElement('div'); colors.id='tbSelColors'; colors.contentEditable='false';
  d.body.appendChild(colors);

  let colorsMode=null;   /* 'fg' | 'hl' */

  function hideBar(){ bar.classList.remove('show'); hideColors(); }
  function hideColors(){ colors.classList.remove('show'); colorsMode=null; }

  /* ---------- 色板 ---------- */
  function openColors(mode,btn){
    colorsMode=mode;
    const list=mode==='hl'
      ?HI.map(function(c,i){ return '<button class="tb-sel-color" data-v="'+c+'" title="高亮·'+HI_NAMES[i]+'" style="background:'+c+'"></button>'; }).join('')
      :FG.map(function(c){ return '<button class="tb-sel-color" data-v="'+c+'" title="'+c+'" style="background:'+c+'"></button>'; }).join('');
    colors.innerHTML=list+
      (mode==='hl'?'<button class="tb-sel-color none" data-v="transparent" title="取消高亮"></button>'
                  :'<button class="tb-sel-color none" data-v="inherit" title="恢复默认色"></button>');
    colors.classList.add('show');
    const br=btn.getBoundingClientRect();
    let cx=posX(br), cy=posY(br)+br.height+6;
    colors.style.left=Math.max(4,Math.min(cx,docW()-140))+'px';
    colors.style.top=cy+'px';
  }
  function docW(){ return Math.max(d.body.scrollWidth,win.innerWidth||0); }
  function posX(rect){ return rect.left+(win.pageXOffset||0); }
  function posY(rect){ return rect.top+(win.pageYOffset||0); }

  /* ---------- 选区保护（弹 prompt 期间选区可能丢） ---------- */
  function saveSel(){
    const s=d.getSelection();
    if(!s||!s.rangeCount) return null;
    const r=s.getRangeAt(0);
    return r.cloneRange();
  }
  function restoreSel(r){
    if(!r) return;
    const s=d.getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /* ---------- 行内代码 ---------- */
  function wrapCode(){
    const s=d.getSelection(); if(!s||!s.rangeCount||s.isCollapsed) return;
    const r=s.getRangeAt(0);
    try{
      const frag=r.extractContents();
      const code=d.createElement('code');
      code.appendChild(frag);
      code.style.cssText='background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:1px 5px;font-family:Consolas,Menlo,monospace;font-size:.92em';
      r.insertNode(code);
      s.removeAllRanges();
      const r2=d.createRange(); r2.selectNodeContents(code); s.addRange(r2);
      edTouch(); edCommitSoon();
    }catch(e){ edExec('insertHTML','<code>'+esc(s.toString())+'</code>'); }
  }

  /* ---------- 链接 ---------- */
  async function addLink(){
    const s=d.getSelection(); if(!s||!s.rangeCount||s.isCollapsed) return;
    const saved=saveSel();
    const v=await uiPrompt({title:'插入链接',label:'链接地址（留空取消）',value:'https://',max:300});
    if(!v){ restoreSel(saved); return; }
    restoreSel(saved);
    edExec('createLink',v.trim());
  }

  /* ---------- 按钮分发 ---------- */
  bar.addEventListener('mousedown',function(e){ e.preventDefault(); });   /* 保住选区 */
  bar.addEventListener('click',function(e){
    const b=e.target.closest('.tb-sel-btn'); if(!b) return;
    const c=b.dataset.c;
    if(c==='code'){ wrapCode(); return; }
    if(c==='link'){ addLink(); return; }
    if(c==='fg'||c==='hl'){
      if(colorsMode===c){ hideColors(); } else openColors(c,b);
      return;
    }
    hideColors();
    edExec(c,null);
  });
  colors.addEventListener('mousedown',function(e){ e.preventDefault(); });
  colors.addEventListener('click',function(e){
    const b=e.target.closest('.tb-sel-color'); if(!b) return;
    const v=b.dataset.v;
    edExec(colorsMode==='hl'?'hiliteColor':'foreColor',v);
    hideColors();
  });

  /* ---------- 何时显示 ---------- */
  function checkSel(){
    const s=d.getSelection();
    if(!s||!s.rangeCount||s.isCollapsed){ hideBar(); return; }
    const r=s.getRangeAt(0);
    const anc=r.commonAncestorContainer;
    if(!anc||(anc.nodeType!==1&&!anc.parentNode)||!d.body.contains(anc.nodeType===1?anc:anc.parentNode)){ hideBar(); return; }
    /* 折叠的表格单元格选择等不弹 */
    let rect=null;
    try{ rect=r.getBoundingClientRect(); }catch(e){}
    if(!rect||(rect.width===0&&rect.height===0)){
      const el=anc.nodeType===1?anc:anc.parentNode;
      rect=el.getBoundingClientRect();
    }
    if(!rect||!rect.width&&!rect.height){ hideBar(); return; }
    if(!bar.classList.contains('show')) hideColors();
    bar.classList.add('show');
    const bw=bar.offsetWidth||260;
    let bx=posX(rect)+rect.width/2-bw/2;
    let by=posY(rect)-40;
    if(by<4) by=posY(rect)+rect.height+8;   /* 顶部放不下就放到下方 */
    bx=Math.max(4,Math.min(bx,docW()-bw-8));
    bar.style.left=bx+'px';
    bar.style.top=by+'px';
  }
  let chkTimer=null;
  function checkSoon(){ clearTimeout(chkTimer); chkTimer=setTimeout(checkSel,60); }

  d.addEventListener('mouseup',checkSoon);
  d.addEventListener('keyup',function(e){
    if(e.key==='Shift'||e.key==='Escape'||(e.ctrlKey||e.metaKey)&&(e.key==='a'||e.key==='A')) checkSoon();
  });
  d.addEventListener('selectionchange',function(){
    const s=d.getSelection();
    if(!s||!s.rangeCount||s.isCollapsed){ hideBar(); return; }
    checkSoon();
  });
  /* 点击正文空白 / 图片等，选区折叠后自动收起（上面 selectionchange 已覆盖） */
  d.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&bar.classList.contains('show')){
      e.preventDefault(); e.stopPropagation();
      hideBar();
    }
  },true);
  d.addEventListener('scroll',function(){ if(bar.classList.contains('show')) checkSoon(); },true);
}
/* 包装 iframe 事件初始化：原逻辑（含 38 的块菜单）跑完后再挂选区工具条 */
(function(){
  const orig=edInitFrameEvents;
  edInitFrameEvents=function(d,it){
    orig(d,it);
    try{ edInitSelBar(d); }catch(e){}
  };
})();
