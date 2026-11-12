/* ============================================================
   OVOvv · 画布
   无限白板：便签卡片自由摆放 / 拖动 / 编辑，支持连线梳理思路。
   数据存条目 text（JSON），随云端同步。
   ============================================================ */
'use strict';
/* ---------- 数据 ---------- */
function canvasParse(it){
  try{
    const d=JSON.parse(it.text||'{}');
    if(d&&Array.isArray(d.nodes)) return d;
  }catch(e){}
  return null;
}
function canvasDefaultData(){
  return {nodes:[
    {id:'n1',x:120,y:120,text:'双击空白处新建便签',color:'#fff3ac'},
    {id:'n2',x:380,y:220,text:'拖动标题栏移动，选中后可改色 / 删除',color:'#d3f0e2'}
  ],edges:[]};
}
const CANVAS_COLORS=['#fff3ac','#ffdfc9','#d3f0e2','#cfe4ff','#ecd9ff','#f6cfd8','#e8e8e8'];
/* ---------- 创建入口 ---------- */
function createCanvas(){
  const d=new Date(), pad=n=>(n<10?'0':'')+n;
  const name='画布 '+(d.getMonth()+1)+'-'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  addItem({type:'canvas',title:name,text:JSON.stringify(canvasDefaultData())});
  const it=state.items[state.items.length-1];
  toast('已创建「'+name+'」');
  openCanvasView(it.id);
}
/* ---------- 卡片 ---------- */
function canvasCardHTML(it){
  if(BOX_HIDE) return '<div class="locked-line">🔒 作者未公开这个画布</div>';
  const d=canvasParse(it)||{nodes:[],edges:[]};
  return '<div class="canvas-card" data-opencanvas="'+it.id+'" title="点击打开画布">'+
    '<div class="gv-head"><span class="gv-ico">🎨</span><span class="gv-title">'+esc(it.title||'画布')+'</span></div>'+
    '<div class="cv-mini">'+d.nodes.slice(0,6).map(n=>'<span class="cv-chip" style="background:'+esc(n.color||'#fff3ac')+'">'+esc((n.text||'').slice(0,10)||'便签')+'</span>').join('')+
    (d.nodes.length>6?'<span class="cv-chip">+'+(d.nodes.length-6)+'</span>':'')+
    (d.nodes.length?'':'<span class="cv-chip cv-empty">空白画布</span>')+'</div>'+
    '<div class="gv-meta">'+d.nodes.length+' 张便签 · '+((d.edges||[]).length)+' 条连线</div>'+
    '<div class="gv-open">打开画布 ›</div></div>';
}
/* ---------- 编辑器 ---------- */
let cbItemId=null, cbScale=1, cbPanX=0, cbPanY=0, cbSel=null, cbLinkFrom=null, cbDrag=null;
function openCanvasView(id){
  const it=state.items.find(x=>x.id===id);
  if(!it||it.type!=='canvas') return;
  cbItemId=id; cbScale=1; cbPanX=60; cbPanY=30; cbSel=null; cbLinkFrom=null;
  $('cbTitle').textContent=it.title||'画布';
  renderCanvas();
  $('canvasView').classList.add('show');
}
function closeCanvasView(){
  $('canvasView').classList.remove('show');
  cbItemId=null;
}
function cbCur(){
  const it=state.items.find(x=>x.id===cbItemId);
  return it?canvasParse(it):null;
}
function cbSave(d){
  const it=state.items.find(x=>x.id===cbItemId);
  if(!it) return;
  it.text=JSON.stringify(d); it.updatedAt=Date.now();
  save();
}
function renderCanvas(){
  const d=cbCur(); if(!d) return;
  const stage=$('cbStage');
  stage.style.transform='translate('+cbPanX+'px,'+cbPanY+'px) scale('+cbScale+')';
  const edges=(d.edges||[]).map(ed=>{
    const a=d.nodes.find(n=>n.id===ed.a), b=d.nodes.find(n=>n.id===ed.b);
    if(!a||!b) return '';
    const x1=a.x+90, y1=a.y+45, x2=b.x+90, y2=b.y+45;
    const mx=(x1+x2)/2;
    return '<path d="M'+x1+' '+y1+' C '+mx+' '+y1+', '+mx+' '+y2+', '+x2+' '+y2+'" class="cb-edge"/>';
  }).join('');
  stage.innerHTML='<svg class="cb-edges" width="4000" height="3000">'+edges+'</svg>'+
    d.nodes.map(n=>'<div class="cb-note'+(cbSel===n.id?' sel':'')+(cbLinkFrom===n.id?' from':'')+'" data-node="'+n.id+'" style="left:'+n.x+'px;top:'+n.y+'px;background:'+(n.color||'#fff3ac')+'">'+
      '<div class="cb-note-bar"></div><div class="cb-note-txt">'+esc(n.text||'')+'</div></div>').join('');
  $('cbStatus').textContent=d.nodes.length+' 张便签'+((d.edges||[]).length?(' · '+d.edges.length+' 条连线'):'')+(cbLinkFrom?' · 点击另一张便签完成连线':'');
}
function cbSyncText(){
  const el=$('cbEdit');
  const d=cbCur(); if(!d||cbSel==null) return;
  const n=d.nodes.find(x=>x.id===cbSel);
  if(n&&el.value!==n.text){ n.text=el.value; cbSave(d); renderCanvas(); }
}
function initCanvasEvents(){
  $('cbClose').onclick=closeCanvasView;
  $('cbRename').onclick=()=>{
    const it=state.items.find(x=>x.id===cbItemId); if(!it) return;
    const v=prompt('画布名称',it.title||''); if(v==null) return;
    it.title=v.trim()||it.title; save(); $('cbTitle').textContent=it.title; renderAll();
  };
  $('cbZoomIn').onclick=()=>{ cbScale=Math.min(2,cbScale+0.15); renderCanvas(); };
  $('cbZoomOut').onclick=()=>{ cbScale=Math.max(0.4,cbScale-0.15); renderCanvas(); };
  $('cbZoomFit').onclick=()=>{ cbScale=1; cbPanX=60; cbPanY=30; renderCanvas(); };
  $('cbAdd').onclick=()=>cbAddNote(160,120);
  $('cbLink').onclick=()=>{
    if(cbLinkFrom){ cbLinkFrom=null; renderCanvas(); return; }
    if(cbSel==null){ toast('先点选一张便签，再点「连线」，然后点另一张便签'); return; }
    cbLinkFrom=cbSel; renderCanvas();
  };
  $('cbColor').onclick=()=>{
    if(cbSel==null){ toast('先选中一张便签'); return; }
    const d=cbCur(); const n=d&&d.nodes.find(x=>x.id===cbSel); if(!n) return;
    const cur=CANVAS_COLORS.indexOf(n.color);
    n.color=CANVAS_COLORS[(cur+1)%CANVAS_COLORS.length];
    cbSave(d); renderCanvas();
  };
  $('cbDel').onclick=()=>{
    if(cbSel==null){ toast('先选中一张便签'); return; }
    const d=cbCur(); if(!d) return;
    pushUndo('删除便签');
    d.nodes=d.nodes.filter(n=>n.id!==cbSel);
    d.edges=(d.edges||[]).filter(e=>e.a!==cbSel&&e.b!==cbSel);
    cbSel=null; cbSave(d); renderCanvas();
  };
  $('cbEditText').addEventListener('input',cbSyncText);
  /* 画布交互：空白拖动平移、双击新建、点选便签、拖标题栏移动 */
  const board=$('cbBoard');
  let pan=null;
  board.addEventListener('mousedown',e=>{
    if(e.target.closest('.cb-note')||e.target.closest('.cb-side')||e.target.closest('.cb-top')) return;
    pan={x:e.clientX-cbPanX,y:e.clientY-cbPanY};
    e.preventDefault();
  });
  board.addEventListener('mousemove',e=>{
    if(pan){ cbPanX=e.clientX-pan.x; cbPanY=e.clientY-pan.y; renderCanvas(); return; }
    if(cbDrag){
      const d=cbCur(); const n=d&&d.nodes.find(x=>x.id===cbDrag.id);
      if(n){
        n.x=Math.round((e.clientX-cbDrag.ox-cbPanX)/cbScale);
        n.y=Math.round((e.clientY-cbDrag.oy-cbPanY)/cbScale);
        renderCanvas();
      }
    }
  });
  window.addEventListener('mouseup',()=>{
    if(pan){ pan=null; const d=cbCur(); if(d) cbSave(d); }
    if(cbDrag){ cbDrag=null; const d=cbCur(); if(d) cbSave(d); }
  });
  board.addEventListener('dblclick',e=>{
    if(e.target.closest('.cb-note')||e.target.closest('.cb-side')||e.target.closest('.cb-top')) return;
    const r=board.getBoundingClientRect();
    cbAddNote(Math.round((e.clientX-r.left-cbPanX)/cbScale-90),Math.round((e.clientY-r.top-cbPanY)/cbScale-40));
  });
  $('cbStage').addEventListener('mousedown',e=>{
    const nd=e.target.closest('.cb-note'); if(!nd) return;
    e.preventDefault();
    const nid=nd.dataset.node;
    if(cbLinkFrom&&cbLinkFrom!==nid){
      const d=cbCur();
      if(d){
        if(!(d.edges||[]).some(x=>(x.a===cbLinkFrom&&x.b===nid)||(x.a===nid&&x.b===cbLinkFrom))){
          d.edges=(d.edges||[]); d.edges.push({a:cbLinkFrom,b:nid});
          cbSave(d); toast('已连线');
        }else toast('这两张便签已经连过了');
      }
      cbLinkFrom=null; cbSel=nid; renderCanvas(); return;
    }
    cbSel=nid;
    const d=cbCur(); const n=d&&d.nodes.find(x=>x.id===nid);
    if(n) $('cbEditText').value=n.text||'';
    if(e.target.closest('.cb-note-bar')||e.shiftKey) cbDrag={id:nid,ox:e.clientX,oy:e.clientY};
    renderCanvas();
  });
  $('cbStage').addEventListener('dblclick',e=>{
    const nd=e.target.closest('.cb-note'); if(!nd) return;
    e.preventDefault(); e.stopPropagation();
    cbSel=nd.dataset.node; renderCanvas(); $('cbEditText').focus();
  });
  document.addEventListener('keydown',e=>{
    if(!$('canvasView').classList.contains('show')) return;
    if(e.target===$('cbEditText')&&e.key!=='Escape') return;
    if(e.key==='Escape'){ e.preventDefault(); closeCanvasView(); }
    else if((e.key==='Delete'||e.key==='Backspace')&&cbSel!=null){ e.preventDefault(); $('cbDel').click(); }
  });
}
function cbAddNote(x,y){
  const d=cbCur(); if(!d) return;
  if(d.nodes.length>=200){ toast('便签有点多了（上限 200）'); return; }
  const n={id:'n'+uid(),x:Math.max(0,x),y:Math.max(0,y),text:'新便签',color:CANVAS_COLORS[d.nodes.length%CANVAS_COLORS.length]};
  d.nodes.push(n); cbSel=n.id;
  $('cbEditText').value=n.text;
  cbSave(d); renderCanvas();
}
initCanvasEvents();
$('addCanvasBtn').onclick=createCanvas;
/* 测试钩子 */
window.__canvasTest={canvasParse,canvasDefaultData,canvasCardHTML,createCanvas};
