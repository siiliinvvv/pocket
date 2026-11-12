/* ============================================================
   Pocket · 添加内容
   快速记录、上传照片/文件、新建链接与富文本笔记
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 交互：添加 ================= */
function addItem(obj){
  const fid=(currentFolderId===HOME_ID)?(state.folders[0]?state.folders[0].id:null):currentFolderId;
  state.items.push(Object.assign({id:uid(),folderId:fid,type:'note',text:'',tags:[],created:Date.now(),pinned:false},obj));
  save(); renderAll();
}

$('composerText').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){
    e.preventDefault();
    const v=e.target.value.trim();
    if(!v) return;
    addItem({type:'note',text:v});
    e.target.value=''; e.target.style.height='auto';
  }
});
$('homeColsSel').addEventListener('change',e=>{
  state.homeCols=parseInt(e.target.value,10)||4;
  save(); renderItems();
});
$('composerText').addEventListener('input',function(){
  this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,200)+'px';
});

$('addPhotoBtn').onclick=()=>$('photoInput').click();
$('addFileBtn').onclick=()=>$('fileInput').click();
$('addLinkBtn').onclick=()=>openEditor(null,'link');

$('photoInput').addEventListener('change',async e=>{
  const files=[...e.target.files]; e.target.value='';
  await ingestImages(files);
});
$('fileInput').addEventListener('change',async e=>{
  const files=[...e.target.files]; e.target.value='';
  if(files.length) await ingestFiles(files);
});
async function ingestImages(files){
  const imgs=files.filter(f=>f.type.startsWith('image/'));
  const others=files.filter(f=>!f.type.startsWith('image/'));
  if(imgs.length){
    const keys=[];
    for(const f of imgs){
      try{ const k=uid()+'_img'; await imgSet(k,await compressImage(f)); keys.push(k); }
      catch(err){ toast('有一张图片处理失败'); }
    }
    if(keys.length) addItem({type:'photo',images:keys,text:''});
  }
  if(others.length) ingestFiles(others);
}
/* 文件真实存储：≤上限（默认 50MB，可在设置里调）读为 dataURL 存入 IndexedDB，可随时下载；超出只登记信息 */
function fileLimitBytes(){ return Math.min(90,Math.max(5,state.maxFileMB||50))*1024*1024; }
function fileLimitMB(){ return Math.round(fileLimitBytes()/1024/1024); }
function readAsDataURL(f){
  return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(r.error); r.readAsDataURL(f); });
}
async function ingestFiles(files){
  let stored=0, reg=0;
  for(const f of files){
    const it={type:'file',fileName:f.name,text:'',fileSize:f.size,fileMime:f.type||'application/octet-stream'};
    if(f.size<=fileLimitBytes()){
      try{
        const dataUrl=await readAsDataURL(f);
        const k=uid()+'_file'; await imgSet(k,dataUrl); it.fileKey=k; stored++;
        /* HTML 顺手抽出正文，搜索时能搜到内容里的字 */
        if(/\.html?$/i.test(f.name)){
          try{ it.plain=htmlToPlain(dataUrlToText(dataUrl)).slice(0,8000); }catch(e){}
        }
      }catch(e){ it.tooBig=true; reg++; }
    }else{ it.tooBig=true; reg++; }
    addItem(it);
  }
  toast(stored?('已收纳 '+stored+' 个文件'+(reg?('，'+reg+' 个超大文件仅登记'):'')):('已登记 '+reg+' 个文件信息'));
}
function fileEmoji(name){
  const ext=((name||'').split('.').pop()||'').toLowerCase();
  if(ext==='pdf') return '📕';
  if(['doc','docx','wps'].includes(ext)) return '📘';
  if(['xls','xlsx','csv','et'].includes(ext)) return '📗';
  if(['ppt','pptx','dps'].includes(ext)) return '📙';
  if(['html','htm'].includes(ext)) return '🌐';
  if(['md','txt'].includes(ext)) return '📝';
  if(['zip','rar','7z'].includes(ext)) return '🗜️';
  if(['mp3','wav','flac'].includes(ext)) return '🎵';
  if(['mp4','mov','avi'].includes(ext)) return '🎬';
  return '📄';
}
function extOf(name){ const m=(name||'').match(/\.([A-Za-z0-9]{1,8})$/); return m?m[1].toLowerCase():'bin'; }

/* 拖拽收纳 */
let dragDepth=0;
document.addEventListener('dragenter',e=>{ e.preventDefault(); if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){ dragDepth++; $('dropMask').classList.add('show'); } });
document.addEventListener('dragleave',e=>{ e.preventDefault(); if(--dragDepth<=0){ dragDepth=0; $('dropMask').classList.remove('show'); } });
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{
  e.preventDefault(); dragDepth=0; $('dropMask').classList.remove('show');
  if(SHARED){ toast('这是分享只读版，不能添加内容哦'); return; }
  if(e.dataTransfer&&e.dataTransfer.files.length) ingestImages([...e.dataTransfer.files]);
});

