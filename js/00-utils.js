/* ============================================================
   Pocket · 通用工具
   uid / esc / relTime / toast —— 全站最基础的函数，先于其它模块加载
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
function uid(){ return 'id_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function relTime(ts){
  const d=Date.now()-ts, m=6e4,h=36e5,day=864e5;
  if(d<m) return '刚刚';
  if(d<h) return Math.floor(d/m)+' 分钟前';
  if(d<day) return Math.floor(d/h)+' 小时前';
  if(d<day*7) return Math.floor(d/day)+' 天前';
  const t=new Date(ts);
  return t.getFullYear()==new Date().getFullYear()? (t.getMonth()+1)+'月'+t.getDate()+'日' : t.getFullYear()+'/'+(t.getMonth()+1)+'/'+t.getDate();
}
let _toastLastMsg='', _toastLastAt=0;
function toast(msg,ms){
  const now=Date.now();
  if(msg===_toastLastMsg&&now-_toastLastAt<8000) return;   /* 同一条提示 8 秒内不重复轰炸 */
  _toastLastMsg=msg; _toastLastAt=now;
  const box=document.getElementById('toasts'); if(!box) return;
  while(box.children.length>=4) box.removeChild(box.firstChild);
  const t=document.createElement('div');
  t.className='toast-item'; t.setAttribute('role','status'); t.textContent=msg;
  box.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('show'));
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); },ms||2400);
}

