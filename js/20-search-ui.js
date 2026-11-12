/* ============================================================
   Pocket · 搜索交互
   输入防抖、命中缓存、搜索历史、结果排序与空态
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 搜索：防抖 + 命中缓存 + 历史记录 + 结果排序 ================= */
let searchTimer=null, lastRenderedQuery=null;
/* 第二十九批：只有「用户真的点了搜索框 / 在里面打过字」才允许进入搜索态。
   之前只要有 input 事件就切到搜索结果页——浏览器自动填充、刷新后还原输入框内容
   都会触发 input，于是没点搜索也会停在一个空空的「搜索结果」页。 */
let searchArmed=false;
function setSearchClear(on){
  const b=$('searchClear');
  if(b) b.style.display=on?'flex':'none';
}
const SEARCH_HIST_KEY='tb_search_hist_v1';
function readSearchHist(){ try{ const a=JSON.parse(localStorage.getItem(SEARCH_HIST_KEY)||'[]'); return Array.isArray(a)?a.slice(0,8):[]; }catch(e){ return []; } }
function pushSearchHist(q){
  q=String(q||'').trim(); if(!q) return;
  const a=readSearchHist().filter(x=>x!==q); a.unshift(q);
  try{ localStorage.setItem(SEARCH_HIST_KEY,JSON.stringify(a.slice(0,8))); }catch(e){}
}
function positionSearchHist(){
  const box=$('searchHist'), inp=$('searchInput');
  if(!box||!inp) return;
  const r=inp.getBoundingClientRect();
  box.style.position='fixed';
  box.style.left=Math.max(8,r.left)+'px';
  box.style.top=(r.bottom+6)+'px';
  box.style.width=Math.max(200,r.width)+'px';
}
function renderSearchHist(){
  const box=$('searchHist'); if(!box) return;
  const a=readSearchHist();
  if(!a.length){
    box.innerHTML='<div class="sh-empty">还没有搜索记录。<br>试试 <b>#标签</b>、<b>类型:pdf</b>、<b>夹:读书</b>，或直接敲关键词。</div>';
    positionSearchHist(); box.classList.add('show'); return;
  }
  box.innerHTML='<div class="sh-head"><span>最近搜索</span><button id="shClear" type="button">清空</button></div>'+
    a.map(q=>'<div class="sh-item" data-q="'+esc(q)+'" role="option"><span style="opacity:.55">🕘</span><span class="sh-q">'+esc(q)+'</span><span class="sh-x" data-del="'+esc(q)+'" title="删除这条记录">✕</span></div>').join('');
  positionSearchHist();
  box.classList.add('show');
  box.querySelector('#shClear').onclick=e=>{
    e.stopPropagation();
    try{ localStorage.removeItem(SEARCH_HIST_KEY); }catch(_){}
    renderSearchHist();
  };
  box.querySelectorAll('.sh-item').forEach(el=>{
    el.onclick=e=>{
      const del=e.target&&e.target.dataset?e.target.dataset.del:null;
      if(del!=null){
        e.stopPropagation();
        const rest=readSearchHist().filter(x=>x!==del);
        try{ localStorage.setItem(SEARCH_HIST_KEY,JSON.stringify(rest)); }catch(_){}
        renderSearchHist(); return;
      }
      $('searchInput').value=el.dataset.q;
      hideSearchHist();
      runSearch(el.dataset.q,true);
    };
  });
}
function hideSearchHist(){ const b=$('searchHist'); if(b) b.classList.remove('show'); }
function runSearch(v,force){
  const cur=$('searchInput')?$('searchInput').value:'';
  if(!force&&String(v||'')!==cur) return;   /* 防抖定时器过期（输入框已被别处清空）时不再生效 */
  const q=String(v||'').trim();
  if(!force&&q===searchQuery&&lastRenderedQuery===q) return;
  const wasSearching=!!searchQuery;
  searchQuery=q; lastRenderedQuery=q;
  setSearchClear(!!q);
  if(wasSearching!==!!q) renderSidebar();   /* 只在进出搜索态时重建侧栏树，打字过程不动它 */
  renderHeader(); renderItems();
}
/* 退出搜索：清空输入框与结果，回到进入搜索前的收纳夹 / 主页 */
function exitSearch(){
  clearTimeout(searchTimer);
  const inp=$('searchInput');
  if(inp) inp.value='';
  hideSearchHist();
  setSearchClear(false);
  searchArmed=false;
  if(inp) inp.blur();
  if(searchQuery){ searchQuery=''; lastRenderedQuery=''; renderAll(); }
  else { renderItems(); }
}
$('searchInput').addEventListener('pointerdown',()=>{ searchArmed=true; });
$('searchInput').addEventListener('keydown',()=>{ searchArmed=true; });
$('searchInput').addEventListener('input',function(){
  setSearchClear(!!this.value.trim());
  /* 没有用户交互、输入框也没焦点 → 这是浏览器自动填充 / 页面还原，不切搜索页 */
  if(!searchArmed&&document.activeElement!==this) return;
  if(!this.value.trim()) hideSearchHist();
  clearTimeout(searchTimer);
  searchTimer=setTimeout(()=>runSearch(this.value),180);   /* 180ms 防抖 */
});
$('searchInput').addEventListener('focus',function(){ if(!this.value.trim()) renderSearchHist(); });
$('searchInput').addEventListener('keydown',function(e){
  if(e.key==='Enter'){ clearTimeout(searchTimer); runSearch(this.value,true); pushSearchHist(this.value); hideSearchHist(); }
  if(e.key==='Escape'){
    /* Esc = 退出搜索（原来是「只收起历史」，结果页会一直停在那里） */
    if(this.value.trim()||searchQuery) exitSearch();
    else { hideSearchHist(); this.blur(); }
  }
});
$('searchInput').addEventListener('blur',()=>{ setTimeout(()=>{ hideSearchHist(); searchArmed=false; },160); if(searchQuery) pushSearchHist(searchQuery); });
const _searchClearBtn=$('searchClear');
if(_searchClearBtn) _searchClearBtn.onclick=e=>{ e.stopPropagation(); exitSearch(); };
/* 刷新 / 从 bfcache 回来时，浏览器会把上次的输入框内容还原（不触发 input）→ 清掉，
   否则看起来像「没点搜索却停在搜索结果页」 */
window.addEventListener('pageshow',()=>{
  const inp=$('searchInput');
  if(inp&&!searchQuery&&inp.value){ inp.value=''; setSearchClear(false); }
});
document.addEventListener('click',e=>{ if(!e.target.closest('.search-wrap')) hideSearchHist(); });
window.addEventListener('resize',()=>hideSearchHist());
if($('scrollArea')) $('scrollArea').addEventListener('scroll',()=>hideSearchHist(),{passive:true});
$('searchSort').onchange=function(){ state.searchSort=this.value; save(); renderItems(); };
/* 排序方式 */
$('sortSel').value=state.sortMode||'time';
$('sortSel').onchange=function(){
  state.sortMode=this.value; save(); renderItems();
  if(this.value==='custom') toast('自定义排序：直接把卡片拖到想要的位置');
};


/* 漫游：按钮 + 键盘 */
$('roamClose').onclick=()=>$('roam').classList.remove('show');
$('roam').addEventListener('click',e=>{ if(e.target===$('roam')) $('roam').classList.remove('show'); });
$('roamPrev').onclick=()=>roamStep(-1);
$('roamNext').onclick=()=>roamStep(1);
$('roamShuffle').onclick=()=>{ if(roamPoints.length<2) return; let n=roamIdx; while(n===roamIdx) n=Math.floor(Math.random()*roamPoints.length); roamIdx=n; renderRoam(); };
$('roamOpen').onclick=roamOpenDoc;
document.addEventListener('keydown',e=>{
  if(!$('roam').classList.contains('show')) return;
  if(e.key==='Escape'){ $('roam').classList.remove('show'); }
  else if(e.key==='ArrowRight'||e.key===' '){ e.preventDefault(); roamStep(1); }
  else if(e.key==='ArrowLeft'){ e.preventDefault(); roamStep(-1); }
});

