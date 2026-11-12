/* ============================================================
   OVOvv · 多维表格
   Airtable 式轻量表格：自定义列（文本/数字/单选/日期/勾选），
   行列增删、单元格即点即编；数据存条目 text（JSON），随云端同步。
   ============================================================ */
'use strict';
/* ---------- 数据 ---------- */
function gridParse(it){
  try{
    const d=JSON.parse(it.text||'{}');
    if(d&&Array.isArray(d.cols)&&Array.isArray(d.rows)) return d;
  }catch(e){}
  return null;
}
function gridDefaultData(){
  return {
    cols:[
      {id:'c1',name:'名称',type:'text'},
      {id:'c2',name:'状态',type:'select',opts:['待办','进行中','已完成']},
      {id:'c3',name:'日期',type:'date'},
      {id:'c4',name:'完成',type:'check'}
    ],
    rows:[{id:'r1',c:{c1:''}}]
  };
}
function gridNewCol(d){
  const n=d.cols.length+1;
  return {id:'c'+uid(),name:'字段'+n,type:'text'};
}
/* ---------- 创建入口 ---------- */
function createGrid(){
  const d=new Date(), pad=n=>(n<10?'0':'')+n;
  const name='多维表格 '+(d.getMonth()+1)+'-'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes());
  addItem({type:'grid',title:name,text:JSON.stringify(gridDefaultData())});
  const it=state.items[state.items.length-1];
  toast('已创建「'+name+'」');
  openGridView(it.id);
}
/* ---------- 卡片 ---------- */
function gridCardHTML(it){
  if(BOX_HIDE) return '<div class="locked-line">🔒 作者未公开这个表格</div>';
  const d=gridParse(it)||{cols:[],rows:[]};
  const preview=d.rows.slice(0,3).map(r=>{
    const first=d.cols.map(c=>r.c&&r.c[c.id]).find(v=>v!==''&&v!=null&&v!==false);
    return '<div class="gv-prow">'+esc(String(first==null?'':(first===true?'✓':first)).slice(0,26))+'</div>';
  }).join('')||'<div class="gv-prow gv-empty">还没有记录</div>';
  return '<div class="grid-card" data-opengrid="'+it.id+'" title="点击打开多维表格">'+
    '<div class="gv-head"><span class="gv-ico">📊</span><span class="gv-title">'+esc(it.title||'多维表格')+'</span></div>'+
    '<div class="gv-meta">'+d.cols.length+' 列 · '+d.rows.length+' 行记录</div>'+preview+
    '<div class="gv-open">打开编辑 ›</div></div>';
}
/* ---------- 编辑器 ---------- */
let gridItemId=null, gridEmbedded=false;   /* gridEmbedded=true：表格数据存文档条目的 it.grid（嵌入文档） */
function openGridView(id){
  const it=state.items.find(x=>x.id===id);
  if(!it||it.type!=='grid') return;
  gridItemId=id; gridEmbedded=false;
  $('gvTitle').textContent=it.title||'多维表格';
  renderGridEditor();
  $('gridView').classList.add('show');
}
/* 打开嵌入在文档里的多维表格（数据存 it.grid；首次调用会生成默认表格） */
function openGridEmbed(id){
  const it=state.items.find(x=>x.id===id);
  if(!it) return;
  if(!gridDataOf(it)){
    it.grid=gridDefaultData();
    it.updatedAt=Date.now(); save();
  }
  gridItemId=id; gridEmbedded=true;
  $('gvTitle').textContent=(docTitle(it.fileName||it.text||'')||'文档')+' · 多维表格';
  renderGridEditor();
  $('gridView').classList.add('show');
}
function closeGridView(){
  $('gridView').classList.remove('show');
  gridItemId=null; gridEmbedded=false;
}
function gridDataOf(it){
  if(it.type==='grid') return gridParse(it);
  const d=it.grid;
  if(d&&Array.isArray(d.cols)&&Array.isArray(d.rows)) return d;
  return null;
}
function gridCur(){
  const it=state.items.find(x=>x.id===gridItemId);
  return it?gridDataOf(it):null;
}
function gridSave(d){
  const it=state.items.find(x=>x.id===gridItemId);
  if(!it) return;
  if(it.type==='grid') it.text=JSON.stringify(d);
  else it.grid=d;
  it.updatedAt=Date.now();
  save();
}
function renderGridEditor(){
  const d=gridCur();
  if(!d) return;
  const TYPES={text:'文本',num:'数字',select:'单选',date:'日期',check:'勾选'};
  const head=d.cols.map(c=>'<th data-col="'+c.id+'"><div class="gv-col"><span class="gv-cname" data-cname="'+c.id+'" title="点击改列名">'+esc(c.name)+'</span>'+
    '<span class="gv-ctype" data-ctype="'+c.id+'" title="点击改类型">'+TYPES[c.type]+'</span>'+
    '<button class="gv-x" data-cdel="'+c.id+'" title="删除此列">✕</button></div></th>').join('');
  const body=d.rows.map(r=>{
    const tds=d.cols.map(c=>{
      const v=r.c?r.c[c.id]:'';
      let cell='';
      if(c.type==='check') cell='<input type="checkbox" class="gv-chk" data-cell="'+r.id+'|'+c.id+'"'+(v?' checked':'')+'>';
      else if(c.type==='select'){
        const opts=(c.opts||[]);
        cell='<select class="gv-sel" data-cell="'+r.id+'|'+c.id+'"><option value="">—</option>'+
          opts.map(o=>'<option'+(o===v?' selected':'')+'>'+esc(o)+'</option>').join('')+'</select>';
      }
      else if(c.type==='date') cell='<input type="date" class="gv-in" data-cell="'+r.id+'|'+c.id+'" value="'+esc(String(v||''))+'">';
      else cell='<input type="'+(c.type==='num'?'number':'text')+'" class="gv-in" data-cell="'+r.id+'|'+c.id+'" value="'+esc(String(v==null?'':v))+'">';
      return '<td>'+cell+'</td>';
    }).join('');
    return '<tr><td class="gv-rn">'+('<button class="gv-x" data-rdel="'+r.id+'" title="删除此行">✕</button>')+'</td>'+tds+'</tr>';
  }).join('');
  $('gvTable').innerHTML='<table><thead><tr><th class="gv-rn"></th>'+head+'<th class="gv-addcol"><button id="gvAddCol">＋ 列</button></th></tr></thead>'+
    '<tbody>'+body+'<tr class="gv-addrow"><td class="gv-rn"></td><td colspan="'+(d.cols.length+1)+'"><button id="gvAddRow">＋ 添加记录</button></td></tr></tbody></table>';
}
function initGridEvents(){
  $('gvClose').onclick=closeGridView;
  $('gvRename').onclick=()=>{
    const it=state.items.find(x=>x.id===gridItemId); if(!it) return;
    if(gridEmbedded){ toast('嵌入表格随文档命名，改文档名即可'); return; }
    const v=prompt('表格名称',it.title||''); if(v==null) return;
    it.title=v.trim()||it.title; save(); $('gvTitle').textContent=it.title; renderAll();
  };
  $('gvTable').addEventListener('click',e=>{
    if(e.target.closest('#gvAddCol')){ const d=gridCur(); if(!d) return; if(d.cols.length>=12){ toast('最多 12 列'); return; } d.cols.push(gridNewCol(d)); gridSave(d); renderGridEditor(); return; }
    if(e.target.closest('#gvAddRow')){ const d=gridCur(); if(!d) return; if(d.rows.length>=500){ toast('最多 500 行'); return; } d.rows.push({id:'r'+uid(),c:{}}); gridSave(d); renderGridEditor(); return; }
    const cd=e.target.closest('[data-cdel]');
    if(cd){ const d=gridCur(); if(!d) return; if(d.cols.length<=1){ toast('至少保留一列'); return; } pushUndo('删除列'); d.cols=d.cols.filter(c=>c.id!==cd.dataset.cdel); gridSave(d); renderGridEditor(); return; }
    const rd=e.target.closest('[data-rdel]');
    if(rd){ const d=gridCur(); if(!d) return; pushUndo('删除记录'); d.rows=d.rows.filter(r=>r.id!==rd.dataset.rdel); gridSave(d); renderGridEditor(); return; }
    const cn=e.target.closest('[data-cname]');
    if(cn){ const d=gridCur(); const c=d&&d.cols.find(x=>x.id===cn.dataset.cname); if(!c) return; const v=prompt('列名',c.name); if(v!=null&&v.trim()){ c.name=v.trim(); gridSave(d); renderGridEditor(); } return; }
    const ct=e.target.closest('[data-ctype]');
    if(ct){
      const d=gridCur(); const c=d&&d.cols.find(x=>x.id===ct.dataset.ctype); if(!c) return;
      const order=['text','num','select','date','check'], names={text:'文本',num:'数字',select:'单选',date:'日期',check:'勾选'};
      const v=prompt('列类型（'+order.map(t=>names[t]).join(' / ')+'）',names[c.type]); if(v==null) return;
      const k=order.find(t=>names[t]===v.trim());
      if(!k){ toast('没有这种类型'); return; }
      if(k==='select'&&!(c.opts&&c.opts.length)){
        const o=prompt('单选项（用 / 分隔）','待办/进行中/已完成');
        c.opts=o?o.split('/').map(s=>s.trim()).filter(Boolean):[];
      }
      c.type=k; gridSave(d); renderGridEditor(); return;
    }
  });
  $('gvTable').addEventListener('change',e=>{
    const el=e.target.closest('[data-cell]'); if(!el) return;
    const d=gridCur(); if(!d) return;
    const p=el.dataset.cell.split('|'), r=d.rows.find(x=>x.id===p[0]);
    if(!r) return;
    r.c=r.c||{};
    if(el.type==='checkbox') r.c[p[1]]=el.checked;
    else if(el.type==='number') r.c[p[1]]=el.value===''?'':+el.value;
    else r.c[p[1]]=el.value;
    gridSave(d);
  });
  document.addEventListener('keydown',e=>{
    if(!$('gridView').classList.contains('show')) return;
    if(e.key==='Escape'){ e.preventDefault(); closeGridView(); }
  });
}
initGridEvents();
$('addGridBtn').onclick=createGrid;
/* 测试钩子 */
window.__gridTest={gridParse,gridDefaultData,gridCardHTML,createGrid};
