/* ============================================================
   Pocket · 编辑弹窗
   编辑条目的标题 / 正文 / 标签
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 编辑弹窗 ================= */
function openEditor(it,forceType){
  editingItemId=it?it.id:null;
  const type=it?it.type:(forceType||'note');
  $('modalTitle').textContent=it?'编辑'+TYPE_BADGE[type]+'条目':'添加链接';
  const F=$('modalFields'); F.innerHTML='';
  const field=(label,inputHTML)=>{ const l=document.createElement('label'); l.textContent=label; F.appendChild(l); const w=document.createElement('div'); w.innerHTML=inputHTML; F.appendChild(w.firstChild||w); return F.lastChild; };
  if(type==='note'){
    F.innerHTML='<label>内容</label><textarea id="mf_text" rows="6">'+esc(it?it.text:'')+'</textarea>';
  }else if(type==='link'){
    F.innerHTML='<label>网址</label><input type="text" id="mf_url" placeholder="https://…" value="'+esc(it?it.url:'')+'">'+
                '<label>标题（可留空自动用网址）</label><input type="text" id="mf_title" value="'+esc(it?it.title||'':'')+'">'+
                '<label>备注</label><input type="text" id="mf_text" value="'+esc(it?it.text:'')+'">';
  }else if(type==='file'){
    F.innerHTML='<label>文件名</label><input type="text" id="mf_file" value="'+esc(it?it.fileName:'')+'">'+
                '<label>备注（来自哪里、是什么）</label><input type="text" id="mf_text" value="'+esc(it?it.text:'')+'">';
  }else{ /* photo：只编辑配文 */
    F.innerHTML='<label>配文</label><textarea id="mf_text" rows="4">'+esc(it?it.text:'')+'</textarea>';
  }
  F.insertAdjacentHTML('beforeend','<label>标签（用空格或逗号分隔）</label><input type="text" id="mf_tags" value="'+esc((it?(it.tags||[]):[]).join(' '))+'">');
  $('modalDelete').style.display=it?'':'none';
  $('modalMask').classList.add('show');
  const first=F.querySelector('textarea,input'); if(first) first.focus();
}
$('modalCancel').onclick=()=>$('modalMask').classList.remove('show');
$('modalMask').addEventListener('click',e=>{ if(e.target===e.currentTarget) $('modalMask').classList.remove('show'); });
$('modalSave').onclick=()=>{
  const v=id=>{ const el=$('modalFields').querySelector('#'+id); return el?el.value.trim():''; };
  const tags=v('mf_tags').split(/[\s,，、]+/).filter(Boolean);
  if(editingItemId){
    const it=state.items.find(x=>x.id===editingItemId);
    if(it){
      if(it.type==='link'){ it.url=v('mf_url'); it.title=v('mf_title'); if(!it.url){ toast('网址不能为空'); return; } }
      if(it.type==='file') it.fileName=v('mf_file');
      it.text=v('mf_text'); it.tags=tags;
    }
  }else{
    const url=v('mf_url');
    if(!url){ toast('网址不能为空'); return; }
    addItem({type:'link',url,title:v('mf_title'),text:v('mf_text'),tags});
  }
  $('modalMask').classList.remove('show');
  save(); renderAll(); toast('已保存');
};
$('modalDelete').onclick=()=>{
  const it=state.items.find(x=>x.id===editingItemId);
  if(!it) return;
  trashItem(it);
  $('modalMask').classList.remove('show');
  save(); renderAll(); toast('已移入回收站，可在左下角还原');
};

