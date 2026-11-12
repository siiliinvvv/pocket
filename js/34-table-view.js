/* ============================================================
   Pocket · 表格视图
   条目以表格展示：类型 / 名称 / 标签 / 时间 / 操作。
   适用于主页分区、分类页面与搜索结果（由 viewMode='table' 触发）。
   ------------------------------------------------------------
   依赖：cardHTML 所在的 12-search-core（TYPE_BADGE）、00-utils（esc/relTime）、
   02-store（state/save）。因为要参与首屏渲染，必须在 36-boot.js 之前加载。
   ============================================================ */
'use strict';

/* 把一组条目渲染成表格（主页分区与整页列表共用） */
function tableViewHTML(items){
  const rows=items.map(it=>{
    const name=it.type==='note'
      ?String(it.text||'').split('\n')[0].slice(0,80)
      :(it.title||it.fileName||'（无标题）');
    const sub=it.type==='link'?safeHost(it.url||''):'';
    const tags=(it.tags||[]).map(t=>'<span class="card-tag">'+esc(t)+'</span>').join('');
    return '<tr class="tb-row" draggable="true" data-topen="'+it.id+'" title="点击打开 · 可拖到左侧分类移动">'+
      '<td class="tb-pin">'+(it.pinned?'📌':'')+'</td>'+
      '<td class="tb-type"><span class="type-badge">'+(TYPE_BADGE[it.type]||'条目')+'</span></td>'+
      '<td class="tb-name" title="'+esc(name)+'">'+esc(name)+(sub?'<span class="tb-sub">'+esc(sub)+'</span>':'')+'</td>'+
      '<td class="tb-tags">'+tags+'</td>'+
      '<td class="tb-time">'+relTime(it.created)+'</td>'+
      '<td class="tb-acts">'+
        '<button data-tact="open" data-tid="'+it.id+'">打开</button>'+
        '<button data-tact="edit" data-tid="'+it.id+'">编辑</button>'+
        '<button data-tact="pin" data-tid="'+it.id+'">'+(it.pinned?'取消置顶':'置顶')+'</button>'+
        '<button data-tact="del" data-tid="'+it.id+'">删除</button>'+
      '</td></tr>';
  }).join('');
  return '<div class="tb-wrap"><table class="tb-table">'+
    '<thead><tr><th class="tb-pin"></th><th class="tb-type">类型</th><th>名称 / 内容</th>'+
    '<th class="tb-tags">标签</th><th class="tb-time">时间</th><th class="tb-acts">操作</th></tr></thead>'+
    '<tbody>'+(rows||'<tr><td colspan="6" class="tb-empty">这一栏还没有内容</td></tr>')+'</tbody></table></div>';
}

/* 表格里「打开」一个条目：文件走阅读器 / 看图，其余走编辑 */
function openItemInTable(it){
  if(!it) return;
  if(it.type==='file'&&it.fileKey){
    if(typeof isImgFileName==='function'&&isImgFileName(it.fileName)) openFileImage(it);
    else openReader(it.id);
    return;
  }
  openEditor(it);
}

/* 事件委托：行点击 = 打开；操作列按钮各自生效（不与卡片 .card-acts 冲突） */
$('items').addEventListener('click',e=>{
  const btn=e.target.closest('button[data-tact]');
  if(btn){
    e.preventDefault(); e.stopPropagation();
    const it=state.items.find(x=>x.id===btn.dataset.tid); if(!it) return;
    const act=btn.dataset.tact;
    if(act==='open') openItemInTable(it);
    else if(act==='edit') openEditor(it);
    else if(act==='pin'){ it.pinned=!it.pinned; save(); renderAll(); }
    else if(act==='del'){ trashItem(it); save(); renderAll(); toast('已移入回收站，可在左下角还原'); }
    return;
  }
  if(e.target.closest('a,button,input,label,select')) return;
  const row=e.target.closest('tr.tb-row[data-topen]');
  if(row){ const it=state.items.find(x=>x.id===row.dataset.topen); if(it) openItemInTable(it); }
});

/* 顶栏第三个视图按钮：画廊 / 列表 / 表格 */
(function(){
  const btn=$('viewTable'); if(!btn) return;
  btn.onclick=()=>{ viewMode='table'; try{ localStorage.setItem('tb_view',viewMode); }catch(e){}
    renderHeader(); renderItems(); };
})();
