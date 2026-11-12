/* ============================================================
   OVOvv · 主页自定义板块（参考 Notion 可自由拼装页面）
   ------------------------------------------------------------
   数据存于 state.homeBlocks（随 save() 持久化、随分享版导出）。
   板块类型：
     h 标题 / text 文本 / quote 引用 / divider 分隔线
     image 图片 / cols 多列图文 / cards 快捷入口 / embed 视频网页嵌入
   编辑模式：主页顶部「✏️ 编辑板块」进入——板块可拖拽排序 /
   ▲▼ 上移下移 / ✎ 编辑 / ⧉ 复制 / ✕ 删除；「＋ 添加板块」选类型。
   分享版（BOX_HIDE）只渲染板块内容，隐藏编辑条。
   ============================================================ */
'use strict';

let hbEdit=false;           /* 是否处于主页板块编辑模式 */
let hbDragId=null;          /* 拖拽中的板块 id */

const HB_TYPES=[
  {k:'h',    cat:'type', ico:'🔠',name:'标题',      desc:'大 / 中 / 小三档标题'},
  {k:'text', cat:'type', ico:'📝',name:'文本',      desc:'多行文字，适合自我介绍、说明'},
  {k:'quote',cat:'type', ico:'❝',name:'引用',      desc:'一句话签名或强调'},
  {k:'callout',cat:'type',ico:'📣',name:'公告栏',   desc:'带图标的彩色提示条'},
  {k:'divider',cat:'type',ico:'➖',name:'分隔线',   desc:'划分内容区域'},
  {k:'image',cat:'media',ico:'🖼',name:'图片',      desc:'贴一张图，可配说明文字'},
  {k:'cols', cat:'media',ico:'🧱',name:'多列图文',  desc:'两列 / 三列，可放图文、日期钟、倒计时'},
  {k:'embed',cat:'media',ico:'▶', name:'视频 / 网页',desc:'嵌入 B 站、YouTube 视频或网页'},
  {k:'cards',cat:'cards',ico:'🔗',name:'快捷入口',  desc:'把常用文件 / 分类摆成小卡或画廊大卡'},
  {k:'auto', cat:'cards',ico:'🗂',name:'自动分区',  desc:'每个分类自动生成「标题 + 画廊卡片」，内容随数据自动更新'},
  {k:'pin',  cat:'cards',ico:'📌',name:'置顶文档库',desc:'自动列出置顶的文档，点击直达（空时显示分类）'},
  {k:'stats',cat:'cards',ico:'🧮',name:'分类统计卡片',desc:'每个一级分类一张淡彩卡片，直观展示文件数量与占比，点击直达'},
  {k:'menu', cat:'cards',ico:'🧭',name:'导航列表',  desc:'自动列出所有分类，点击直达'},
  {k:'board',cat:'cards',ico:'📈',name:'统计看板',  desc:'条目总数 / 本周新增 / 标签云 / 高频打开 Top10 / 存储分布，数据现场聚合'},
  {k:'calendar',cat:'time',ico:'🗓',name:'本月日历',desc:'当月日历网格，今天高亮；点日期可看当天打卡情况'},
  {k:'months',cat:'time',ico:'🗓',name:'月份列表', desc:'12 个月一览，当月高亮'},
  {k:'timeline',cat:'time',ico:'🧵',name:'时间线',  desc:'按创建时间把内容排成时间轴，按月分组，适合日记与复盘'},
  {k:'bars', cat:'time', ico:'📊',name:'时间进度条',desc:'年 / 季 / 月 / 周 / 日 已过百分比，自动更新'},
  {k:'clock',cat:'time', ico:'🕒',name:'日期钟',    desc:'翻页钟样式的大日期卡片，自动更新'},
  {k:'countdown',cat:'time',ico:'⏳',name:'倒计时',desc:'距离目标日期还剩几天'},
  {k:'todo', cat:'time', ico:'☑️',name:'待办清单',  desc:'可打勾的任务清单（目标 / 打卡 / 最近任务），随保存记录'},
  {k:'news', cat:'ai', ico:'📰',name:'AI 资讯',    desc:'自动拉取当天的真实 AI 新闻，点「存档」可查看 / 删除往期记录'},
  {k:'llm',  cat:'ai', ico:'🤖',name:'AI 助手',    desc:'接入大模型，在主页直接对话；接口与密钥在「设置 → 接入大模型」里填'}
];
/* 添加板块菜单的分类（21 种板块分成 5 组，避免一屏塞 21 行） */
const HB_CATS=[
  {k:'type', name:'排版',   ico:'🔠'},
  {k:'media',name:'图文',   ico:'🖼'},
  {k:'cards',name:'卡片导航',ico:'🔗'},
  {k:'time', name:'时间待办',ico:'🗓'},
  {k:'ai',   name:'AI',     ico:'🤖'}
];

function homeBlocks(){ if(!Array.isArray(state.homeBlocks)) state.homeBlocks=[]; return state.homeBlocks; }
/* 动态占位符：{name}=空间名（在 esc 前替换，由 hbNl 统一转义） */
function hbDyn(s){ return (s||'').replace(/\{name\}/g,(state.spaceName||'OVOvv')); }
/* 动态占位符：{name}=空间名 */
function hbNl(s){ return esc(hbDyn(s||'')).replace(/\n/g,'<br>'); }
function hb2(n){ return String(n).padStart(2,'0'); }
const HB_WD=['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
/* 画廊卡片封面的柔和渐变（循环取色） */
const HB_G=['linear-gradient(135deg,#fbc2eb,#a6c1ee)','linear-gradient(135deg,#a1c4fd,#c2e9fb)','linear-gradient(135deg,#fddb92,#d1fdff)','linear-gradient(135deg,#e0c3fc,#8ec5fc)','linear-gradient(135deg,#f8c8b8,#fbc2eb)','linear-gradient(135deg,#84fab0,#8fd3f4)'];

/* B 站 / YouTube 链接 → 可嵌入播放地址；其余原样 iframe */
function hbEmbedUrl(u){
  u=(u||'').trim(); if(!u) return '';
  let m=u.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  if(m) return 'https://player.bilibili.com/player.html?bvid='+m[1]+'&autoplay=0';
  m=u.match(/b23\.tv\/[\w]+/i);
  if(m) return u;   /* 短链交给 iframe 自行跳转 */
  m=u.match(/youtube\.com\/watch\?v=([\w-]+)/i)||u.match(/youtu\.be\/([\w-]+)/i);
  if(m) return 'https://www.youtube.com/embed/'+m[1];
  return u;
}

/* ---------- 日期翻页钟（自动显示今天） ---------- */
function hbClockHTML(p){
  const now=new Date();
  const ap=now.getHours()<12?'AM':'PM';
  return '<div class="hb-clock hb-w-'+((p&&p.w)==='full'?'full':'half')+'" data-hbclock="1">'+
    '<div class="hb-clock-cell"><b>'+hb2(now.getDate())+'</b><i>'+ap+'</i></div>'+
    '<div class="hb-clock-cell"><b>'+hb2(now.getMonth()+1)+'</b><i>'+HB_WD[now.getDay()]+'</i></div>'+
    '</div>';
}
/* ---------- 倒计时 ---------- */
function hbCountdownHTML(p){
  let target=p.target;
  if(target==='newyear'){   /* 动态：距离最近的元旦（当天显示「就是今天」） */
    const now0=new Date(); now0.setHours(0,0,0,0);
    const y=now0.getFullYear();
    target=(new Date(y,0,1).getTime()>=now0.getTime())?(y+'-01-01'):((y+1)+'-01-01');
  }
  const t=target?new Date(target+'T00:00:00'):null;
  if(!t||isNaN(t)) return '<div class="hb-text hb-muted">（倒计时未设置目标日期，点 ✎ 填写）</div>';
  const today=new Date(); today.setHours(0,0,0,0);
  const days=Math.ceil((t-today)/86400000);
  const txt=days>0?'还剩 <b>'+days+'</b> 天':(days===0?'就是今天 🎉':'已过去 <b>'+(-days)+'</b> 天');
  return '<div class="hb-count hb-w-'+((p&&p.w)==='full'?'full':'half')+'">'+
    '<div class="hb-count-label">'+hbNl(p.label||'倒计时')+'</div>'+
    '<div class="hb-count-date">'+t.getFullYear()+'/'+hb2(t.getMonth()+1)+'/'+hb2(t.getDate())+'</div>'+
    '<div class="hb-count-days">'+txt+'</div></div>';
}

/* ---------- 自动分区：每个根分类 → 标题 + 该分类最近内容画廊（空分类显示分类卡） ---------- */
function hbItemGCard(it,gi){
  const ico=it.type==='note'?'📝':(isPdfName(it.fileName)?'📕':(it.editable?'🌐':'📄'));
  const nav=it.type==='note'?('data-open="'+it.id+'"'):('data-read="'+it.id+'"');
  return '<button class="hb-card hb-gcard" '+nav+'>'+
    '<span class="hb-gcover" style="background:'+HB_G[gi%HB_G.length]+'"><span class="hb-gemoji">'+ico+'</span></span>'+
    '<span class="hb-card-name">'+esc(docTitle(it.fileName||it.text||'（无题）'))+'</span>'+
    '<span class="hb-card-sub">'+esc((it.tags&&it.tags[0])||(it.type==='note'?'笔记':'内容'))+'</span></button>';
}
function hbFolderGCard(f,gi){
  return '<button class="hb-card hb-gcard" data-goto="'+f.id+'">'+
    '<span class="hb-gcover" style="background:'+HB_G[gi%HB_G.length]+'"><span class="hb-gemoji">'+esc(f.icon)+'</span></span>'+
    '<span class="hb-card-name">'+esc(f.name)+'</span><span class="hb-card-sub">分类</span></button>';
}
function hbAutoHTML(){
  const roots=state.folders.filter(f=>!f.parentId);
  if(!roots.length) return '<div class="hb-text hb-muted">还没有分类——在左侧新建一个分类，这里会自动生成「标题 + 画廊卡片」分区</div>';
  let out='', gi=0;
  roots.forEach(f=>{
    const kidIds=state.folders.filter(x=>x.parentId===f.id).map(x=>x.id);
    const its=state.items.filter(it=>it.folderId===f.id||kidIds.indexOf(it.folderId)>=0)
      .sort((a,b)=>((b.pinned?1:0)-(a.pinned?1:0))||((b.openedAt||b.created||0)-(a.openedAt||a.created||0)))
      .slice(0,6);   /* 置顶优先 + 最近打开，最多 6 张 */
    out+='<div class="hb-h hb-h2">'+esc(f.name)+'</div><div class="hb-cards hb-gallery">';
    its.forEach(it=>{ out+=hbItemGCard(it,gi++); });
    if(!its.length) out+=hbFolderGCard(f,gi++);
    out+='</div>';
  });
  return out;
}

/* ---------- 时间进度条组（自动：年/季/月/周/日 已过百分比；样式参考 Notion 截图：深色细条 + 右侧标签） ---------- */
function hbProgressHTML(){
  const now=new Date();
  function pct(s,e){ return Math.max(0,Math.min(100,Math.round((now-s)/(e-s)*100))); }
  const y=now.getFullYear();
  const qi=Math.floor(now.getMonth()/3);
  const wd=(now.getDay()+6)%7;   /* 周一为一周之始 */
  const w0=new Date(y,now.getMonth(),now.getDate()-wd);
  const d0=new Date(y,now.getMonth(),now.getDate());
  const rows=[
    ['Year 年', pct(new Date(y,0,1),new Date(y+1,0,1))],
    ['Quarter 季', pct(new Date(y,qi*3,1),new Date(y,qi*3+3,1))],
    ['Month 月', pct(new Date(y,now.getMonth(),1),new Date(y,now.getMonth()+1,1))],
    ['Week 周', pct(w0,new Date(w0.getTime()+7*86400000))],
    ['Day 日', pct(d0,new Date(d0.getTime()+86400000))]
  ];
  return '<div class="hb-bars">'+rows.map(function(r){
    return '<div class="hb-bar-row"><span class="hb-bar-track"><span class="hb-bar-fill" style="width:'+r[1]+'%"></span></span>'+
      '<span class="hb-bar-label">'+r[0]+': '+r[1]+'%</span></div>';
  }).join('')+'</div>';
}
/* ---------- 导航列表（自动列出根分类，点击直达） ---------- */
function hbMenuHTML(){
  const roots=state.folders.filter(f=>!f.parentId);
  if(!roots.length) return '<div class="hb-text hb-muted">还没有分类——在左侧新建分类后，这里会自动列出导航</div>';
  return '<div class="hb-menu">'+roots.map(function(f){
    return '<button class="hb-menu-row" data-goto="'+f.id+'"><span class="hb-menu-ico">'+esc(f.icon)+'</span>'+
      '<span class="hb-menu-name">'+esc(f.name)+'</span></button>';
  }).join('')+'</div>';
}
/* ---------- 置顶文档库（自动列出置顶条目；没有置顶时退回显示根分类） ---------- */
function hbPinRows(){
  const pins=state.items.filter(it=>it.pinned)
    .sort((a,b)=>(b.pinnedAt||b.created||0)-(a.pinnedAt||a.created||0));
  if(pins.length){
    return pins.slice(0,10).map(function(it){
      const ico=it.type==='note'?'📝':(isPdfName(it.fileName)?'📕':(it.editable?'🌐':'📄'));
      const nav=it.type==='note'?('data-open="'+it.id+'"'):('data-read="'+it.id+'"');
      return '<button class="hb-menu-row" '+nav+'><span class="hb-menu-ico">'+ico+'</span>'+
        '<span class="hb-menu-name">'+esc(docTitle(it.fileName||it.text||'（无题）'))+'</span></button>';
    }).join('');
  }
  const roots=state.folders.filter(f=>!f.parentId);
  if(!roots.length) return '<div class="hb-text hb-muted">在左侧长按条目选「置顶」，或新建分类，这里会自动列出</div>';
  return roots.map(function(f){
    return '<button class="hb-menu-row" data-goto="'+f.id+'"><span class="hb-menu-ico">'+esc(f.icon)+'</span>'+
      '<span class="hb-menu-name">'+esc(f.name)+'</span></button>';
  }).join('');
}
function hbPinHTML(){
  return '<div class="hb-menu hb-pin">'+hbPinRows()+'</div>';
}
/* ---------- 按天打卡：每一天都有自己的一份待办清单（第二十四批） ---------- */
function hbDayKey(y,m,d){ return y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0'); }
function hbTodayKey(){ const n=new Date(); return hbDayKey(n.getFullYear(),n.getMonth(),n.getDate()); }
const HB_CAL_BOX='__cal__';
/* 数据结构：state.calDayTodos = { 'YYYY-MM-DD': [{t,done}, …] }
   旧版把一份全局清单（state.calTodos / 主页待办板块）给所有日期共用，
   于是在 11 月 11 日加的「11.11作业」点开 11 月 10 日也能看到。
   现在按日期各存一份：添加、勾选、删除都只影响当前查看的这一天。
   主页的「☑️ 待办清单」仍是它自己的全局清单，与打卡日历互不干扰。 */
function hbDayItems(key){
  if(!state.calDayTodos||typeof state.calDayTodos!=='object'||Array.isArray(state.calDayTodos)) state.calDayTodos={};
  /* 老数据迁移（幂等）：旧的全局打卡清单挪到「今天」；
     若之前打卡待办是存在主页「待办清单」板块里的，也一次性并进今天，避免升级后
     在日历里凭空消失。之后各天完全独立，主页清单怎么改都不会再灌进日历。 */
  const old=Array.isArray(state.calTodos)?state.calTodos:[];
  if(old.length||!state.calDayV24){
    const today=hbTodayKey();
    const dst=state.calDayTodos[today]||(state.calDayTodos[today]=[]);
    const add=function(it){ if(it&&it.t&&!dst.some(x=>x.t===it.t)) dst.push({t:it.t,done:!!it.done}); };
    old.forEach(add);
    if(!state.calDayV24){
      homeBlocks().forEach(function(b){
        if(b.type==='todo'&&b.props&&Array.isArray(b.props.items)) b.props.items.forEach(add);
      });
      state.calDayV24=1;
    }
    state.calTodos=[];
    save();
  }
  if(!Array.isArray(state.calDayTodos[key])) state.calDayTodos[key]=[];
  return state.calDayTodos[key];
}
/* 兼容旧调用点：现在只负责确保「今天」的容器存在，不再写全局打卡快照 */
function hbTodoSnap(){ if(typeof BOX_HIDE!=='undefined'&&BOX_HIDE) return; hbDayItems(hbTodayKey()); }
function hbDayBoxes(key){ return [{id:HB_CAL_BOX,title:'',items:hbDayItems(key)}]; }
function hbDayInfo(y,m,d){
  const key=hbDayKey(y,m,d);
  const wd=['周日','周一','周二','周三','周四','周五','周六'][new Date(y,m,d).getDay()];
  let h='<div class="hb-day-date">'+(m+1)+' 月 '+d+' 日 · '+wd+'</div>';
  /* 只渲染这一天的清单：别的日期加的待办不会出现在这里 */
  let tsec='';
  hbDayBoxes(key).forEach(function(bx){
    const rows=bx.items.map(function(it,i){
      const done=!!it.done;
      return '<div class="hb-day-row'+(done?' is-done':'')+'" data-dt="'+i+'" data-db="'+bx.id+'" title="点击即可完成 / 取消完成这一天的待办">'+
        '<span class="hb-day-box'+(done?' on':'')+'">'+(done?'✓':'')+'</span>'+
        '<span class="hb-day-txt'+(done?' done':'')+'">'+hbNl(it.t)+'</span>'+
        '<button class="hb-day-del" data-dtdel="'+i+'" data-db="'+bx.id+'" title="从这一天删除这条待办">✕</button></div>';
    }).join('');
    tsec+='<div class="hb-day-group">'+rows+
      '<div class="hb-day-add"><input type="text" data-dadd="'+bx.id+'" maxlength="60" placeholder="＋ 添加这一天的待办，回车确认"></div></div>';
  });
  h+='<div class="hb-day-sec"><div class="hb-day-st">☑️ 待办打卡</div>'+tsec+'</div>';
  /* 第三十二批：这一天新增了哪些笔记 / 文件（按 created 归日，点击直达） */
  const dayItems=(state.items||[]).filter(function(it){
    const c=new Date(it.created||0);
    return c.getFullYear()===y&&c.getMonth()===m&&c.getDate()===d;
  }).sort(function(a,b){ return (b.created||0)-(a.created||0); });
  h+='<div class="hb-day-sec"><div class="hb-day-st">📥 当日新增'+
    (dayItems.length?'<em class="hb-day-cnt">'+dayItems.length+' 条</em>':'')+'</div>';
  if(!dayItems.length){
    h+='<div class="hb-day-hint">这一天还没有新增内容</div>';
  }else{
    h+=dayItems.map(function(it){
      const f=state.folders.find(x=>x.id===it.folderId);
      const t=new Date(it.created||Date.now());
      return '<button class="hb-day-item" type="button" data-dayit="'+it.id+'" title="打开这条内容">'+
        '<span class="hb-day-item-ico">'+itemIcon(it)+'</span>'+
        '<span class="hb-day-item-t">'+esc(docTitle(it.fileName||it.text||it.title||it.url||'（无题）'))+'</span>'+
        '<span class="hb-day-item-s">'+esc(f?f.name:'未分类')+' · '+hb2(t.getHours())+':'+hb2(t.getMinutes())+'</span></button>';
    }).join('');
  }
  h+='</div>';
  /* 只读 + 可勾选 / 可增删待办的弹窗（复用 hb-modal 样式，无保存按钮） */
  const mask=document.createElement('div'); mask.className='hb-mask';
  mask.innerHTML='<div class="hb-modal"><div class="hb-modal-head"><span>📅 当天情况</span>'+
    '<button class="hb-modal-x" title="关闭">✕</button></div>'+
    '<div class="hb-modal-body">'+h+'</div></div>';
  document.body.appendChild(mask);
  const close=()=>mask.remove();
  mask.addEventListener('click',e=>{ if(e.target===mask||e.target.closest('[data-x],.hb-modal-x')) close(); });
  mask.addEventListener('mousedown',e=>{ if(e.target===mask) close(); });
  const redraw=()=>{
    save();
    if(typeof renderItems==='function'){ try{ renderItems(); }catch(err){} }
    close(); hbDayInfo(y,m,d);
  };
  /* 点待办行 = 直接完成 / 取消完成，只改这一天 */
  mask.addEventListener('click',e=>{
    if(e.target.closest('[data-dtdel]')) return;   /* 删除按钮单独处理 */
    const row=e.target.closest('[data-dt]');
    if(!row) return;
    const it=hbDayItems(key)[+row.dataset.dt];
    if(!it) return;
    it.done=!it.done;
    redraw();
  });
  /* 删除待办：只从这一天移除，其他日期不受影响 */
  mask.addEventListener('click',e=>{
    const del=e.target.closest('[data-dtdel]');
    if(!del) return;
    const items=hbDayItems(key);
    const idx=+del.dataset.dtdel;
    if(!items[idx]) return;
    items.splice(idx,1);
    redraw();
  });
  /* 添加待办：只加进当前查看的这一天 */
  mask.querySelectorAll('input[data-dadd]').forEach(inp=>{
    inp.addEventListener('keydown',ev=>{
      if(ev.key!=='Enter') return;
      const t=inp.value.trim(); if(!t) return;
      const items=hbDayItems(key);
      if(items.some(x=>x.t===t)){ toast('这一天已经有这条待办了'); return; }
      items.push({t:t,done:false});
      redraw();
    });
  });
  /* 当日新增条目：点一下关掉弹窗并直接打开那条内容 */
  mask.addEventListener('click',e=>{
    const row=e.target.closest('[data-dayit]');
    if(!row) return;
    const it=state.items.find(x=>x.id===row.dataset.dayit);
    if(!it) return;
    close();
    if(it.type==='note') openEditor(it);
    else openReader(it.id);
  });
}
/* ---------- 本月日历（周一开头，今天高亮；点日期看当天打卡） ---------- */
function hbCalHTML(){
  const now=new Date();
  const y=now.getFullYear(), m=now.getMonth(), today=now.getDate();
  const off=(new Date(y,m,1).getDay()+6)%7;                 /* 1 号是周几（周一=0） */
  const dim=new Date(y,m+1,0).getDate();                    /* 当月天数 */
  let cells='';
  for(let i=0;i<off;i++) cells+='<span class="hb-cal-d"></span>';
  for(let d=1;d<=dim;d++){
    const dk=hbDayKey(y,m,d);
    const own=state.calDayTodos&&Array.isArray(state.calDayTodos[dk])&&state.calDayTodos[dk].length;
    cells+='<span class="hb-cal-d'+(d===today?' today':'')+(own?' rec':'')+'" data-cday="'+d+'">'+d+'</span>';
  }
  return '<div class="hb-cal">'+
    '<div class="hb-cal-head">'+(m+1)+' 月</div>'+
    '<div class="hb-cal-grid">'+
      ['一','二','三','四','五','六','日'].map(function(w){return '<span class="hb-cal-w">'+w+'</span>';}).join('')+
      cells+'</div></div>';
}
/* ---------- 月份列表（当月高亮） ---------- */
function hbMonthsHTML(){
  const names=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const m=new Date().getMonth();
  return '<div class="hb-months">'+names.map(function(n,i){
    return '<button class="hb-month'+(i===m?' on':'')+'" type="button"><b>'+(i+1)+'</b>'+n+'</button>';
  }).join('')+'</div>';
}
/* ---------- 分类统计卡片（每个一级分类一张淡彩卡片：文件数 + 占比条） ---------- */
const HB_STAT_COLORS=[
  {bg:'#eef7ee',icoBg:'#dcf0dd',bar:'#7cc47f'},
  {bg:'#eaf3fb',icoBg:'#d8eafc',bar:'#7db4e8'},
  {bg:'#fdf6e7',icoBg:'#faedcf',bar:'#e6b95c'},
  {bg:'#fbeef2',icoBg:'#f7dfe7',bar:'#e79ab2'},
  {bg:'#f1eefa',icoBg:'#e5dffb',bar:'#a78edd'},
  {bg:'#eaf6f4',icoBg:'#d9efe9',bar:'#6ec3b4'}
];
function hbStatsHTML(){
  const roots=state.folders.filter(f=>!f.parentId);
  if(!roots.length) return '<div class="hb-text hb-muted">还没有分类——在左侧新建分类后，这里会自动生成统计卡片</div>';
  const total=state.items.length;
  const cards=roots.map(function(f,i){
    const c=HB_STAT_COLORS[i%HB_STAT_COLORS.length];
    const ids=new Set();
    (function collect(pid){ childFolders(pid).forEach(x=>{ ids.add(x.id); collect(x.id); }); })(f.id);
    ids.add(f.id);
    const n=state.items.filter(it=>ids.has(it.folderId)).length;
    const pct=total?Math.round(n/total*100):0;
    return '<button class="hb-stat" data-goto="'+f.id+'" style="background:'+c.bg+'" type="button">'+
      '<div class="hb-stat-top"><span class="hb-stat-ico" style="background:'+c.icoBg+'">'+esc(f.icon)+'</span>'+
      '<span class="hb-stat-name">'+esc(f.name)+'</span></div>'+
      '<div class="hb-stat-num">'+n+'<i>个文件</i></div>'+
      '<div class="hb-stat-sub">'+(total?('占总内容 '+pct+'%'):'开始收纳后这里会显示占比')+'</div>'+
      '<div class="hb-stat-bar"><i style="width:'+pct+'%;background:'+c.bar+'"></i></div></button>';
  }).join('');
  return '<div class="hb-stats">'+cards+'</div>';
}
/* ---------- 统计看板（第三十二批）：数字全部现场从 state 聚合 ---------- */
function hbBoardStats(){
  const items=state.items||[];
  const now=new Date();
  const wd=(now.getDay()+6)%7;                                  /* 周一为一周之始 */
  const ws=new Date(now.getFullYear(),now.getMonth(),now.getDate()-wd).getTime();
  const weekNew=items.filter(it=>(it.created||0)>=ws).length;
  const tags={};
  items.forEach(it=>(it.tags||[]).forEach(t=>{ if(t) tags[t]=(tags[t]||0)+1; }));
  const tagList=Object.keys(tags).map(k=>({t:k,n:tags[k]})).sort((a,b)=>b.n-a.n||a.t.localeCompare(b.t));
  /* 高频打开：先看打开次数（第十二批起累计），没有计数的老数据退回最近打开时间 */
  const hot=items.filter(it=>it.opens||it.openedAt)
    .sort((a,b)=>((b.opens||0)-(a.opens||0))||((b.openedAt||0)-(a.openedAt||0))).slice(0,10);
  let textBytes=0,fileBytes=0,fileN=0,photoN=0;
  items.forEach(it=>{
    if(it.type==='note') textBytes+=new Blob([it.text||'']).size;
    if(it.type==='file'){ fileBytes+=it.fileSize||0; fileN++; }
    if(it.type==='photo') photoN+=((it.images||[]).length||1);
  });
  return {n:items.length,weekNew:weekNew,folderN:state.folders.length,tagList:tagList,hot:hot,
    textBytes:textBytes,fileBytes:fileBytes,fileN:fileN,photoN:photoN,known:textBytes+fileBytes};
}
function hbBoardHTML(opt){
  const full=!!(opt&&opt.full);
  const s=hbBoardStats();
  if(!s.n) return '<div class="hb-text hb-muted">还没有内容——收进第一条笔记 / 文件后，这里会自动长出统计</div>';
  const tagShow=full?s.tagList:s.tagList.slice(0,10);
  const hotShow=full?s.hot:s.hot.slice(0,5);
  const maxTag=s.tagList.length?s.tagList[0].n:1;
  let h='<div class="hb-bd">'+(full?'':
    '<div class="hb-sec-head">📈 统计看板<em>'+s.n+' 条内容 · 本周 +'+s.weekNew+'</em></div>')+
    '<div class="hb-bd-nums">'+
    '<div class="hb-bd-num"><b>'+s.n+'</b><span>条内容</span></div>'+
    '<div class="hb-bd-num"><b>'+s.weekNew+'</b><span>本周新增</span></div>'+
    '<div class="hb-bd-num"><b>'+s.folderN+'</b><span>个分类</span></div>'+
    '</div>';
  /* 标签云：出现次数越多字号越大 */
  h+='<div class="hb-bd-sec"><div class="hb-bd-st">🏷️ 标签云'+(s.tagList.length?'<em>'+s.tagList.length+' 个</em>':'')+'</div>';
  if(!tagShow.length) h+='<div class="hb-bd-hint">还没有标签——给条目加上标签后，这里会按出现次数排成云</div>';
  else h+='<div class="hb-bd-tags">'+tagShow.map(function(t){
    const lv=t.n>=Math.max(3,Math.ceil(maxTag*0.6))?3:(t.n>=2?2:1);
    return '<span class="hb-bd-tag lv'+lv+'">'+esc(t.t)+'<i>'+t.n+'</i></span>';
  }).join('')+'</div>';
  if(!full&&s.tagList.length>tagShow.length) h+='<div class="hb-bd-hint">还有 '+(s.tagList.length-tagShow.length)+' 个标签，完整版里看</div>';
  h+='</div>';
  /* 高频打开（还没有累计次数时就写成「最近打开」，不冒充高频） */
  const anyOpens=s.hot.some(function(it){ return it.opens>0; });
  h+='<div class="hb-bd-sec"><div class="hb-bd-st">'+(anyOpens?'🔥 高频打开 Top ':'🕘 最近打开 Top ')+(full?hotShow.length:5)+'</div>';
  if(!hotShow.length) h+='<div class="hb-bd-hint">还没有打开记录——点开几条内容后这里会排出常用榜</div>';
  else h+='<div class="hb-bd-hot">'+hotShow.map(function(it,i){
    const f=state.folders.find(x=>x.id===it.folderId);
    return '<button class="hb-bd-hot-row" type="button" data-tl="'+it.id+'" title="打开这条内容">'+
      '<span class="hb-bd-rank'+(i<3?' top':'')+'">'+(i+1)+'</span>'+
      '<span class="hb-bd-hot-ico">'+itemIcon(it)+'</span>'+
      '<span class="hb-bd-hot-t">'+esc(docTitle(it.fileName||it.text||it.title||it.url||'（无题）'))+'</span>'+
      '<span class="hb-bd-hot-n">'+(it.opens?it.opens+' 次':relTime(it.openedAt||it.created))+'</span>'+
      '<span class="hb-bd-hot-f">'+esc(f?f.name:'未分类')+'</span></button>';
  }).join('')+'</div>';
  h+='</div>';
  /* 存储分布：正文与文件的已知体积 */
  const total=s.known;
  const fp=total?Math.round(s.fileBytes/total*100):0;
  h+='<div class="hb-bd-sec"><div class="hb-bd-st">📦 存储分布</div>';
  if(!total) h+='<div class="hb-bd-hint">还没有可统计的体积——正文与文件都是空的</div>';
  else h+='<div class="hb-bd-bar"><i class="f" style="width:'+fp+'%"></i><i class="n" style="width:'+(100-fp)+'%"></i></div>'+
    '<div class="hb-bd-legend">'+
    '<span><i class="dot f"></i>文件 '+fmtSize(s.fileBytes)+' · '+s.fileN+' 个</span>'+
    '<span><i class="dot n"></i>正文 '+fmtSize(s.textBytes)+'</span></div>';
  h+='<div class="hb-bd-hint">照片 '+s.photoN+' 张——原始体积存在浏览器本地库，这里不估算</div></div>';
  if(!full) h+='<button class="hb-bd-more" type="button" data-bd="1">在弹窗里看完整看板 ›</button>';
  return h+'</div>';
}
/* ---------- 时间线（第三十二批）：按创建时间倒序，按月分组 ---------- */
function hbTimelineHTML(){
  const arr=(state.items||[]).slice().sort((a,b)=>((b.created||0)-(a.created||0)));
  if(!arr.length) return '<div class="hb-text hb-muted">还没有内容——记下第一条后，这里会按月份排出时间线</div>';
  const limit=12;
  const list=arr.slice(0,limit);
  let out='<div class="hb-sec-head">🧵 时间线<em>最近 '+list.length+' 条'+
    (arr.length>list.length?' / 共 '+arr.length+' 条':'')+'</em></div><div class="hb-tl">', lastM='';
  list.forEach(function(it){
    const d=new Date(it.created||Date.now());
    const mk=d.getFullYear()+'-'+d.getMonth();
    if(mk!==lastM){
      lastM=mk;
      out+='<div class="hb-tl-m">'+d.getFullYear()+' 年 '+(d.getMonth()+1)+' 月</div>';
    }
    const f=state.folders.find(x=>x.id===it.folderId);
    out+='<button class="hb-tl-row" type="button" data-tl="'+it.id+'" title="打开这条内容">'+
      '<span class="hb-tl-dot"></span>'+
      '<span class="hb-tl-day">'+hb2(d.getDate())+'</span>'+
      '<span class="hb-tl-ico">'+itemIcon(it)+'</span>'+
      '<span class="hb-tl-main"><span class="hb-tl-t">'+esc(docTitle(it.fileName||it.text||it.title||it.url||'（无题）'))+'</span>'+
      '<span class="hb-tl-s">'+esc(f?f.name:'未分类')+' · '+relTime(it.created)+'</span></span></button>';
  });
  out+='</div>';
  return out;
}
/* ---------- 待办清单（点方框打勾，随保存持久化） ---------- */
function hbTodoHTML(b){
  const p=b.props||{};
  const items=Array.isArray(p.items)?p.items:[];
  let out='<div class="hb-todo">'+(p.title?'<div class="hb-todo-title">'+hbNl(p.title)+'</div>':'');
  if(!items.length) out+='<div class="hb-text hb-muted">（清单是空的，点右上角 ✏️ 编辑添加）</div>';
  items.forEach(function(it,i){
    out+='<label class="hb-todo-row"><input type="checkbox" data-hbchk="'+i+'"'+(it.done?' checked':'')+'>'+
      '<span class="hb-todo-text'+(it.done?' done':'')+'">'+hbNl(it.t)+'</span></label>';
  });
  return out+'</div>';
}

/* 首屏占位：45-ai-news.js 尚未执行时也能看到资讯板块的标题，
   不会出现「板块凭空消失」的空白行。模块加载完成后会被真实内容替换。 */
function hbNewsPlaceholder(){
  return '<div class="hb-news"><div class="hb-news-head"><span class="hb-news-title">📰 今日 AI 资讯</span></div>'+
    '<div class="hb-day-hint">正在加载今天的 AI 资讯…</div></div>';
}
/* 46-llm.js 排在最后加载，首屏先给一个静态占位，模块就绪后自动重绘 */
function hbLLMPlaceholder(){
  return '<div class="hb-llm"><div class="hb-llm-head"><span class="hb-llm-title">🤖 AI 助手</span></div>'+
    '<div class="hb-day-hint">正在加载 AI 助手…</div></div>';
}

/* ---------- 单个板块的渲染 ---------- */
function hbBlockInner(b){
  const p=b.props||{};
  switch(b.type){
    case 'h':{
      const lv=(p.lv===1||p.lv===3)?p.lv:2;
      return '<div class="hb-h hb-h'+lv+'">'+hbNl(p.text)+'</div>';
    }
    case 'text': return '<div class="hb-text">'+hbNl(p.text)+'</div>';
    case 'quote': return '<blockquote class="hb-quote">'+hbNl(p.text)+'</blockquote>';
    case 'callout':
      return '<div class="hb-callout hb-tone-'+(p.tone||'pink')+'"><span class="hb-callout-ico">'+esc(p.ico||'📣')+'</span><div class="hb-callout-text">'+hbNl(p.text)+'</div></div>';
    case 'clock': return hbClockHTML(p);
    case 'countdown': return hbCountdownHTML(p);
    case 'auto': return hbAutoHTML();
    case 'bars': return hbProgressHTML();
    case 'pin': return hbPinHTML();
    case 'calendar': return hbCalHTML();
    case 'stats': return hbStatsHTML();
    case 'timeline': return hbTimelineHTML();
    case 'board': return hbBoardHTML();
    /* 资讯模块在本文件之后加载：首屏渲染时 hbNewsHTML 可能还不存在。
       给一个静态占位，保证板块永远不是空白（模块加载完会立刻重绘成真实内容）。 */
    case 'news': return (typeof hbNewsHTML==='function')?hbNewsHTML():hbNewsPlaceholder();
    case 'llm':  return (typeof hbLLMHTML==='function')?hbLLMHTML():hbLLMPlaceholder();
    case 'menu': return hbMenuHTML();
    case 'months': return hbMonthsHTML();
    case 'todo': return hbTodoHTML(b);
    case 'divider': return '<hr class="hb-divider">';
    case 'image':{
      if(!p.src) return '<div class="hb-text hb-muted">（图片未设置，点 ✎ 填图片链接）</div>';
      return '<figure class="hb-fig hb-w-'+(p.w||'full')+'"><img src="'+esc(p.src)+'" alt="'+esc(p.cap||'')+'" loading="lazy">'+
        (p.cap?'<figcaption>'+hbNl(p.cap)+'</figcaption>':'')+'</figure>';
    }
    case 'cols':{
      const n=(+p.n===3)?3:2;
      let cells='';
      for(let i=0;i<n;i++){
        const c=(p.cols&&p.cols[i])||{};
        let body;
        if(c.widget==='clock') body=hbClockHTML({w:'full'});
        else if(c.widget==='count') body=hbCountdownHTML(c);
        else if(c.widget==='menu') body=hbMenuHTML();
        else if(c.widget==='pin') body=hbPinHTML();
        else if(c.widget==='calendar') body=hbCalHTML();
        else if(c.widget==='bars') body=hbProgressHTML();
        else body=(c.src?'<img src="'+esc(c.src)+'" loading="lazy" alt="">':'')+
          (c.text?'<div class="hb-col-text">'+hbNl(c.text)+'</div>':'')+
          ((!c.src&&!c.text)?'<div class="hb-col-text hb-muted">🖼 空列——点右上角 ✏️ 编辑，贴一张图或写点文字</div>':'');
        cells+='<div class="hb-col">'+body+'</div>';
      }
      /* fr = 各列宽度权重（fr 单位），如 [2,1,1] = 第一列占一半 */
      const fr=(Array.isArray(p.fr)&&p.fr.length===n)?' style="grid-template-columns:'+p.fr.map(function(f){return Math.max(1,+f||1)+'fr';}).join(' ')+'"':'';
      return '<div class="hb-cols hb-cols'+n+'"'+fr+'>'+cells+'</div>';
    }
    case 'cards':{
      const ids=Array.isArray(p.ids)?p.ids:[];
      if(!ids.length) return '<div class="hb-text hb-muted">（快捷入口未选择内容，点 ✎ 勾选）</div>';
      const gal=p.style==='gallery';
      let out='<div class="hb-cards'+(gal?' hb-gallery':'')+'">';
      let gi=0;
      ids.forEach(id=>{
        if(id.indexOf('f:')===0){
          const f=state.folders.find(x=>x.id===id.slice(2));
          if(!f) return;
          out+='<button class="hb-card'+(gal?' hb-gcard':'')+'" data-goto="'+f.id+'">'+
            (gal?'<span class="hb-gcover" style="background:'+HB_G[gi++%HB_G.length]+'"><span class="hb-gemoji">'+esc(f.icon)+'</span></span>':'<span class="hb-card-ico">'+esc(f.icon)+'</span>')+
            '<span class="hb-card-name">'+esc(f.name)+'</span><span class="hb-card-sub">分类</span></button>';
        }else{
          const it=state.items.find(x=>x.id===id);
          if(!it) return;
          const ico=it.type==='note'?'📝':(isPdfName(it.fileName)?'📕':(it.editable?'🌐':'📄'));
          const nav=it.type==='note'?('data-open="'+it.id+'"'):('data-read="'+it.id+'"');
          out+='<button class="hb-card'+(gal?' hb-gcard':'')+'" '+nav+'>'+
            (gal?'<span class="hb-gcover" style="background:'+HB_G[gi++%HB_G.length]+'"><span class="hb-gemoji">'+ico+'</span></span>':'<span class="hb-card-ico">'+ico+'</span>')+
            '<span class="hb-card-name">'+esc(docTitle(it.fileName||it.text||'（无题）'))+'</span>'+
            '<span class="hb-card-sub">'+esc((it.tags&&it.tags[0])||(it.type==='note'?'笔记':'内容'))+'</span></button>';
        }
      });
      return out+'</div>';
    }
    case 'embed':{
      const u=hbEmbedUrl(p.url);
      if(!u) return '<div class="hb-text hb-muted">（视频 / 网页未设置，点 ✎ 填链接）</div>';
      return '<div class="hb-embed-box"><iframe src="'+esc(u)+'" allowfullscreen="true" scrolling="no" frameborder="no" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>'+
        (p.cap?'<div class="hb-embed-cap">'+hbNl(p.cap)+'</div>':'');
    }
  }
  return '';
}

/* ---------- 主页板块区整体 HTML（编辑条 + 板块列表） ---------- */
function homeBlocksHTML(){
  let arr=homeBlocks();
  /* 同步覆盖 / 老数据导入后 homeBlocks 可能丢失 → 渲染前自动补种一次 */
  const SHARE=(typeof BOX_HIDE!=='undefined'&&BOX_HIDE);
  if(!SHARE&&!arr.length&&typeof hbSeedDefaults==='function'){ hbSeedDefaults(); arr=homeBlocks(); }
  /* 「AI 资讯」是常驻功能：只要用户没主动删过，就保证它一定在主页里。
     旧版用 newsV1「只补一次」，云端同步覆盖 / 老备份恢复后板块被抹掉就不会再加回，
     表现为「一刷新新闻板块就没了」。改为每次渲染自愈，删除时记 newsHidden 标记。 */
  if(!SHARE&&!state.newsHidden&&!arr.some(b=>b.type==='news')){
    arr=homeBlocks(); arr.push({id:uid(),type:'news',props:{}}); save();
  }
  /* 「AI 助手」同样常驻：用户主动删掉后记 llmHidden，不再强行加回 */
  if(!SHARE&&!SHARED&&!state.llmHidden&&!arr.some(b=>b.type==='llm')){
    arr=homeBlocks(); arr.push({id:uid(),type:'llm',props:{}}); save();
  }
  if(!SHARE) hbTodoSnap();   /* 每次渲染确保「今天」的打卡快照存在 */
  let h='<div class="hb-root">';
  if(!SHARE){
    if(!hbEdit){
      /* 只留一枚编辑入口：设置按钮已移除，设置仍可从左侧栏同步状态行 / 命令面板进入 */
      h+='<div class="hb-tools">'+
        '<button class="hb-tool-btn primary" id="hbEditBtn" title="自定义主页板块：添加 / 排序 / 编辑">✏️ 编辑主页</button>'+
        '</div>';
    }else{
      h+='<div class="hb-bar" id="hbBar">'+
        '<button class="hb-bar-btn" id="hbEditBtn">✅ 完成编辑</button>'+
        '<button class="hb-bar-btn hb-bar-add" id="hbAddBtn" style="display:inline-flex">＋ 添加板块</button>'+
        '<span class="hb-bar-hint">拖 ⠿ 或点 ▲▼ 调顺序，✎ 改内容</span>'+
        '</div>';
    }
  }
  if(!arr.length){
    if(hbEdit&&!SHARE) h+='<div class="hb-empty">主页还是空的。点上方「＋ 添加板块」，放标题、图片、快捷入口……拼出你自己的主页</div>';
    return h+'</div>';
  }
  h+='<div class="hb-list">';
  arr.forEach(b=>{
    h+='<div class="hb-block'+(hbEdit?' editing':'')+'" data-hbid="'+b.id+'">'+
      (hbEdit&&!SHARE?'<div class="hb-ctl">'+
        '<span class="hb-ctl-btn hb-grip" draggable="true" title="拖动排序">⠿</span>'+
        '<button class="hb-ctl-btn" data-hbup="1" title="上移">▲</button>'+
        '<button class="hb-ctl-btn" data-hbdown="1" title="下移">▼</button>'+
        '<button class="hb-ctl-btn" data-hbedit="1" title="编辑内容">✎</button>'+
        '<button class="hb-ctl-btn" data-hbdup="1" title="复制板块">⧉</button>'+
        '<button class="hb-ctl-btn danger" data-hbdel="1" title="删除板块">✕</button>'+
        '</div>':'')+
      '<div class="hb-inner">'+hbBlockInner(b)+'</div>'+
      '</div>';
  });
  return h+'</div></div>';
}

/* ---------- 增删改 / 排序 ---------- */
function hbMove(id,dir){
  const arr=homeBlocks(); const i=arr.findIndex(x=>x.id===id); if(i<0) return;
  const j=i+dir; if(j<0||j>=arr.length) return;
  pushUndo('调整板块顺序');
  arr.splice(j,0,arr.splice(i,1)[0]); save(); renderItems();
}
function hbDel(id){
  const arr=homeBlocks(); const i=arr.findIndex(x=>x.id===id); if(i<0) return;
  /* 主动删除资讯板块 → 记住，别在下次渲染时又自动加回来 */
  if(arr[i].type==='news') state.newsHidden=1;
  if(arr[i].type==='llm')  state.llmHidden=1;
  pushUndo('删除主页板块'); arr.splice(i,1); save(); renderItems(); toast('已删除板块');
}
function hbDup(id){
  const arr=homeBlocks(); const i=arr.findIndex(x=>x.id===id); if(i<0) return;
  pushUndo('复制主页板块');
  const c=JSON.parse(JSON.stringify(arr[i])); c.id=uid();
  arr.splice(i+1,0,c); save(); renderItems(); toast('已复制板块');
}
function hbReorder(dragId,targetId,before){
  const arr=homeBlocks();
  const from=arr.findIndex(x=>x.id===dragId); if(from<0) return;
  const moved=arr.splice(from,1)[0];
  let idx=arr.findIndex(x=>x.id===targetId);
  if(idx<0){ arr.splice(from,0,moved); return; }
  if(!before) idx++;
  arr.splice(idx,0,moved);
  pushUndo('调整板块顺序'); save(); renderItems();
}
function hbCreate(k){
  const b={id:uid(),type:k,props:{}};
  if(k==='h') b.props={text:'新的标题',lv:2};
  else if(k==='text') b.props={text:'写点什么…'};
  else if(k==='quote') b.props={text:'一句话签名'};
  else if(k==='callout') b.props={ico:'📣',text:'写一条公告或给自己打打气…',tone:'pink'};
  else if(k==='cols') b.props={n:2,cols:[{widget:'text',src:'',text:'左列文字'},{widget:'text',src:'',text:'右列文字'}]};
  else if(k==='clock') b.props={w:'half'};
  else if(k==='countdown') b.props={label:'倒计时',target:'',w:'half'};
  else if(k==='todo') b.props={title:'☑️ 待办清单',items:[{t:'第一条待办（点 ✎ 可修改）',done:false}]};
  pushUndo('添加主页板块');
  if(k==='news') state.newsHidden=0;   /* 手动加回资讯板块 → 重新允许自愈 */
  if(k==='llm')  state.llmHidden=0;
  homeBlocks().push(b); save();
  hbEdit=true; renderItems();
  if(k!=='clock'&&k!=='bars'&&k!=='menu'&&k!=='months'&&k!=='pin'&&k!=='calendar'&&k!=='stats'&&k!=='news'&&k!=='llm'&&k!=='timeline'&&k!=='board') hbOpenEditor(b);   /* 无需填内容的类型不弹表单 */
}

/* ---------- 通用小弹窗 ---------- */
function hbModal(title,bodyHTML,onSave){
  const mask=document.createElement('div'); mask.className='hb-mask';
  mask.innerHTML='<div class="hb-modal"><div class="hb-modal-head"><span>'+esc(title)+'</span>'+
    '<button class="hb-modal-x" title="关闭">✕</button></div>'+
    '<div class="hb-modal-body">'+bodyHTML+'</div>'+
    '<div class="hb-modal-foot"><button class="hb-btn" data-x>取消</button><button class="hb-btn primary" data-ok>保存</button></div></div>';
  document.body.appendChild(mask);
  const close=()=>mask.remove();
  mask.addEventListener('click',e=>{ if(e.target===mask||e.target.closest('[data-x],.hb-modal-x')) close(); });
  mask.addEventListener('mousedown',e=>{ if(e.target===mask) close(); });
  mask.querySelector('[data-ok]').onclick=()=>{ if(onSave(mask)!==false) close(); };
  const inp=mask.querySelector('input,textarea,select'); if(inp) setTimeout(()=>inp.focus(),30);
  return mask;
}

/* ---------- 快捷入口选择器 ---------- */
function hbCardPicker(pids){
  let h='<div class="hb-pick">';
  state.folders.forEach(f=>{
    const d=folderDepth(f);
    h+='<label class="hb-pick-row"><input type="checkbox" value="f:'+f.id+'"'+(pids.indexOf('f:'+f.id)>=0?' checked':'')+'>'+
      '<span class="hb-pick-ico">'+esc(f.icon)+'</span><span style="margin-left:'+(d*14)+'px">'+esc(f.name)+'</span></label>';
  });
  state.items.forEach(it=>{
    h+='<label class="hb-pick-row"><input type="checkbox" value="'+it.id+'"'+(pids.indexOf(it.id)>=0?' checked':'')+'>'+
      '<span class="hb-pick-ico">'+(it.type==='note'?'📝':'📄')+'</span><span>'+esc(docTitle(it.fileName||it.text||'（无题）'))+'</span></label>';
  });
  return h+'</div><div class="hb-f-hint" style="margin-top:8px">按勾选顺序展示；勾选分类会跳到该分类，勾选文件会直接打开</div>';
}

/* ---------- 板块编辑表单 ---------- */
function hbOpenEditor(b){
  const p=b.props||(b.props={});
  if(b.type==='divider') return;
  if(b.type==='auto'){ toast('自动分区无需编辑——内容随分类与条目自动更新'); return; }
  if(b.type==='bars'||b.type==='months'){ toast('这个板块自动更新，无需编辑'); return; }
  if(b.type==='pin'){ toast('置顶文档库自动跟随置顶条目，长按左侧条目选「置顶」即可添加'); return; }
  if(b.type==='calendar'){ toast('本月日历自动更新，点击日期可查看当天打卡情况'); return; }
  if(b.type==='stats'){ toast('分类统计卡片自动跟随分类与条目数量，无需编辑'); return; }
  if(b.type==='timeline'){ toast('时间线按创建时间自动排列（最近 12 条）——新增 / 删除内容后会自动更新'); return; }
  if(b.type==='board'){ toast('统计看板的数据全部现场聚合，无需编辑；点板块底部可打开完整看板'); return; }
  if(b.type==='news'){ toast('AI 资讯每天自动拉取，无需编辑；点板块右上角「🗂 存档」管理往期记录'); return; }
  if(b.type==='llm'){ toast('AI 助手的接口地址 / 密钥在「设置 → 🤖 接入大模型」里配置'); return; }
  if(b.type==='menu'){ toast('导航列表自动跟随分类，无需编辑'); return; }
  if(b.type==='cards'){
    const curStyle=p.style||'chip';
    const styleSel='<label class="hb-f"><span>卡片样式</span><select data-f="cstyle">'+
      '<option value="chip"'+(curStyle==='chip'?' selected':'')+'>紧凑小卡（一行多个）</option>'+
      '<option value="gallery"'+(curStyle==='gallery'?' selected':'')+'>画廊大卡（带封面，类似 Notion 画廊）</option></select></label>';
    hbModal('选择快捷入口',styleSel+hbCardPicker(p.ids||[]),function(m){
      const ids=[].slice.call(m.querySelectorAll('.hb-pick input:checked')).map(x=>x.value);
      if(!ids.length){ toast('至少勾选一个入口'); return false; }
      pushUndo('编辑主页板块'); p.ids=ids; p.style=m.querySelector('[data-f=cstyle]').value;
      save(); renderItems(); toast('快捷入口已更新');
    });
    return;
  }
  let body='';
  if(b.type==='h'){
    body='<label class="hb-f"><span>标题文字</span><input data-f="text" value="'+esc(p.text||'')+'" maxlength="80"></label>'+
      '<label class="hb-f"><span>大小</span><select data-f="lv">'+
      '<option value="1"'+(p.lv===1?' selected':'')+'>大标题</option>'+
      '<option value="2"'+((p.lv||2)===2?' selected':'')+'>中标题</option>'+
      '<option value="3"'+(p.lv===3?' selected':'')+'>小标题</option></select></label>';
  }else if(b.type==='text'||b.type==='quote'){
    body='<label class="hb-f"><span>'+(b.type==='quote'?'引用文字':'文字内容（回车换行）')+'</span>'+
      '<textarea data-f="text" rows="5" maxlength="2000">'+esc(p.text||'')+'</textarea></label>';
  }else if(b.type==='callout'){
    body='<div class="hb-f-row">'+
      '<label class="hb-f"><span>图标（emoji）</span><input data-f="ico" value="'+esc(p.ico||'📣')+'" maxlength="4"></label>'+
      '<label class="hb-f"><span>底色</span><select data-f="tone">'+
      '<option value="pink"'+((p.tone||'pink')==='pink'?' selected':'')+'>粉</option>'+
      '<option value="blue"'+(p.tone==='blue'?' selected':'')+'>蓝</option>'+
      '<option value="green"'+(p.tone==='green'?' selected':'')+'>绿</option>'+
      '<option value="yellow"'+(p.tone==='yellow'?' selected':'')+'>黄</option>'+
      '<option value="gray"'+(p.tone==='gray'?' selected':'')+'>灰</option></select></label></div>'+
      '<label class="hb-f"><span>公告文字（回车换行）</span><textarea data-f="text" rows="3" maxlength="300">'+esc(p.text||'')+'</textarea></label>';
  }else if(b.type==='clock'){
    body='<label class="hb-f"><span>宽度</span><select data-f="w">'+
      '<option value="half"'+((p.w||'half')==='half'?' selected':'')+'>半宽（可与其他板块并排）</option>'+
      '<option value="full"'+(p.w==='full'?' selected':'')+'>通栏</option></select></label>'+
      '<div class="hb-f-hint">日期钟自动显示今天的日期和星期，无需填写内容</div>';
  }else if(b.type==='countdown'){
    body='<label class="hb-f"><span>名字（如：考试 / 生日 / 寒假）</span><input data-f="label" value="'+esc(p.label||'')+'" maxlength="40"></label>'+
      '<label class="hb-f"><span>目标日期</span><input data-f="target" type="date" value="'+esc(p.target||'')+'"></label>'+
      '<label class="hb-f"><span>宽度</span><select data-f="w">'+
      '<option value="half"'+((p.w||'half')==='half'?' selected':'')+'>半宽</option>'+
      '<option value="full"'+(p.w==='full'?' selected':'')+'>通栏</option></select></label>';
  }else if(b.type==='image'){
    body='<label class="hb-f"><span>图片链接（URL）</span><input data-f="src" value="'+esc(p.src||'')+'" placeholder="https://…"></label>'+
      '<label class="hb-f"><span>说明文字（可留空）</span><input data-f="cap" value="'+esc(p.cap||'')+'" maxlength="120"></label>'+
      '<label class="hb-f"><span>宽度</span><select data-f="w">'+
      '<option value="full"'+((p.w||'full')==='full'?' selected':'')+'>通栏</option>'+
      '<option value="wide"'+(p.w==='wide'?' selected':'')+'>较宽</option>'+
      '<option value="half"'+(p.w==='half'?' selected':'')+'>居中较窄</option></select></label>';
  }else if(b.type==='cols'){
    const n=(+p.n===3)?3:2;
    let colHTML='';
    for(let i=0;i<n;i++){
      const c=(p.cols&&p.cols[i])||{};
      const w=c.widget||'text';
      colHTML+='<div class="hb-f-group"><div class="hb-f-title">第 '+(i+1)+' 列</div>'+
        '<label class="hb-f"><span>这列放什么</span><select data-f="cw'+i+'">'+
        '<option value="text"'+(w==='text'?' selected':'')+'>图文</option>'+
        '<option value="clock"'+(w==='clock'?' selected':'')+'>日期钟</option>'+
        '<option value="count"'+(w==='count'?' selected':'')+'>倒计时</option>'+
        '<option value="menu"'+(w==='menu'?' selected':'')+'>导航列表</option>'+
        '<option value="pin"'+(w==='pin'?' selected':'')+'>置顶文档库</option>'+
        '<option value="calendar"'+(w==='calendar'?' selected':'')+'>本月日历</option>'+
        '<option value="stats"'+(w==='stats'?' selected':'')+'>分类统计卡片</option>'+
        '<option value="bars"'+(w==='bars'?' selected':'')+'>时间进度条</option></select></label>'+
        '<input data-f="csrc'+i+'" value="'+esc(c.src||'')+'" placeholder="图片链接（仅图文列，可留空）">'+
        '<textarea data-f="ctext'+i+'" rows="3" placeholder="文字（仅图文列，可留空）">'+esc(c.text||'')+'</textarea>'+
        '<input data-f="clabel'+i+'" value="'+esc(c.label||'')+'" placeholder="倒计时名字（仅倒计时列）">'+
        '<input data-f="ctarget'+i+'" type="date" value="'+esc(c.target||'')+'" title="倒计时目标日期">'+
        '</div>';
    }
    body='<label class="hb-f"><span>列数</span><select data-f="n">'+
      '<option value="2"'+(n===2?' selected':'')+'>两列</option>'+
      '<option value="3"'+(n===3?' selected':'')+'>三列</option></select></label>'+colHTML+
      '<div class="hb-f-hint">每列可以选「图文 / 日期钟 / 倒计时 / 导航列表 / 时间进度条」；选了组件的列，其他输入框会被忽略。改列数保存后，再点 ✎ 可编辑新增列</div>';
  }else if(b.type==='todo'){
    body='<label class="hb-f"><span>清单标题（如：🎯 年度目标 / ✅ 每日挑战）</span><input data-f="title" value="'+esc(p.title||'')+'" maxlength="60"></label>'+
      '<label class="hb-f"><span>条目（每行一条；打勾状态会按内容保留）</span>'+
      '<textarea data-f="lines" rows="7">'+esc((Array.isArray(p.items)?p.items:[]).map(function(x){return x.t;}).join('\n'))+'</textarea></label>';
  }else if(b.type==='embed'){
    body='<label class="hb-f"><span>视频 / 网页链接</span><input data-f="url" value="'+esc(p.url||'')+'" placeholder="B 站 / YouTube 视频链接或任意网页"></label>'+
      '<label class="hb-f"><span>说明文字（可留空）</span><input data-f="cap" value="'+esc(p.cap||'')+'" maxlength="120"></label>'+
      '<div class="hb-f-hint">支持 B 站视频（bilibili.com/video/BV…）、YouTube 链接，其他链接会以网页方式嵌入（部分网站禁止嵌入时显示空白）</div>';
  }
  hbModal('编辑板块',body,function(m){
    if(b.type==='h'){
      const t=m.querySelector('[data-f=text]').value.trim();
      if(!t){ toast('标题不能为空'); return false; }
      p.text=t; p.lv=+m.querySelector('[data-f=lv]').value;
    }else if(b.type==='text'||b.type==='quote'){
      p.text=m.querySelector('[data-f=text]').value;
    }else if(b.type==='callout'){
      p.ico=m.querySelector('[data-f=ico]').value.trim()||'📣';
      p.tone=m.querySelector('[data-f=tone]').value;
      p.text=m.querySelector('[data-f=text]').value;
    }else if(b.type==='clock'){
      p.w=m.querySelector('[data-f=w]').value;
    }else if(b.type==='countdown'){
      p.label=m.querySelector('[data-f=label]').value.trim();
      p.target=m.querySelector('[data-f=target]').value;
      p.w=m.querySelector('[data-f=w]').value;
      if(!p.target){ toast('请选择目标日期'); return false; }
    }else if(b.type==='image'){
      const s=m.querySelector('[data-f=src]').value.trim();
      if(!s){ toast('请填图片链接'); return false; }
      p.src=s; p.cap=m.querySelector('[data-f=cap]').value.trim(); p.w=m.querySelector('[data-f=w]').value;
    }else if(b.type==='cols'){
      const n=+m.querySelector('[data-f=n]').value;
      p.n=n; p.cols=p.cols||[];
      for(let i=0;i<n;i++){
        p.cols[i]={
          widget:m.querySelector('[data-f=cw'+i+']').value,
          src:m.querySelector('[data-f=csrc'+i+']').value.trim(),
          text:m.querySelector('[data-f=ctext'+i+']').value,
          label:m.querySelector('[data-f=clabel'+i+']').value.trim(),
          target:m.querySelector('[data-f=ctarget'+i+']').value
        };
      }
    }else if(b.type==='todo'){
      const title=m.querySelector('[data-f=title]').value.trim();
      const lines=m.querySelector('[data-f=lines]').value.split('\n').map(function(x){return x.trim();}).filter(Boolean);
      if(!lines.length){ toast('至少写一条条目'); return false; }
      const oldMap={};
      (Array.isArray(p.items)?p.items:[]).forEach(function(x){ oldMap[x.t]=x.done; });
      p.title=title;
      p.items=lines.map(function(t){ return {t:t,done:!!oldMap[t]}; });
    }else if(b.type==='embed'){
      const u=m.querySelector('[data-f=url]').value.trim();
      if(!u){ toast('请填链接'); return false; }
      p.url=u; p.cap=m.querySelector('[data-f=cap]').value.trim();
    }
    pushUndo('编辑主页板块'); save(); renderItems(); toast('板块已更新');
  });
}

/* ---------- 「添加板块」弹出菜单（第三十批：21 种按 5 组一次平铺，顶部可跳组） ---------- */
function hbAddRender(kw){
  const box=$('hbAddList'); if(!box) return;
  const q=String(kw||'').trim().toLowerCase();
  const hit=t=>!q||t.name.toLowerCase().indexOf(q)>=0||t.desc.toLowerCase().indexOf(q)>=0;
  const groups=HB_CATS.map(c=>({c:c, list:HB_TYPES.filter(t=>t.cat===c.k&&hit(t))})).filter(g=>g.list.length);
  if(!groups.length){
    box.innerHTML='<div class="hb-add-none">没有匹配的板块，换个词试试</div>';
    return;
  }
  box.innerHTML=groups.map(g=>
    '<div class="hb-add-group" data-g="'+g.c.k+'">'+
      '<div class="hb-add-gt"><span>'+g.c.ico+'</span>'+esc(g.c.name)+'<i>'+g.list.length+'</i></div>'+
      '<div class="hb-add-grid">'+g.list.map(t=>
        '<button data-t="'+t.k+'" title="'+esc(t.name+'：'+t.desc)+'">'+
          '<span class="ico">'+t.ico+'</span><span class="nm">'+esc(t.name)+'</span>'+
        '</button>').join('')+'</div>'+
    '</div>').join('');
}
function hbAddMenu(anchor){
  const old=$('hbAddPop');
  if(old){ old.remove(); return; }
  const pop=document.createElement('div'); pop.id='hbAddPop'; pop.className='hb-add-pop';
  pop.innerHTML=
    '<div class="hb-add-head"><input id="hbAddSearch" type="text" placeholder="搜索板块…（共 '+HB_TYPES.length+' 种）" autocomplete="off" aria-label="搜索板块类型"><button class="hb-add-x" id="hbAddClose" title="关闭" aria-label="关闭">✕</button></div>'+
    '<div class="hb-add-chips" id="hbAddChips">'+HB_CATS.map(c=>'<button data-c="'+c.k+'">'+esc(c.name)+'</button>').join('')+'</div>'+
    '<div class="hb-add-list" id="hbAddList"></div>';
  document.body.appendChild(pop);
  hbAddRender('');
  const r=anchor.getBoundingClientRect();
  const w=pop.offsetWidth, h=pop.offsetHeight;
  let left=Math.max(8,Math.min(r.left, window.innerWidth-w-10));
  let top=r.bottom+8;
  if(top+h>window.innerHeight-10) top=Math.max(8,r.top-h-8);
  pop.style.left=left+'px'; pop.style.top=top+'px';
  const inp=$('hbAddSearch'), chips=$('hbAddChips'), list=$('hbAddList');
  if(chips) chips.addEventListener('click',e=>{
    const b=e.target.closest('[data-c]'); if(!b||!list) return;
    const g=list.querySelector('[data-g="'+b.dataset.c+'"]');
    if(g) list.scrollTop=Math.max(0,g.offsetTop-list.offsetTop-2);
    chips.querySelectorAll('[data-c]').forEach(x=>x.classList.toggle('on',x===b));
  });
  if(list) list.addEventListener('scroll',()=>{ if(chips) chips.querySelectorAll('.on').forEach(x=>x.classList.remove('on')); },{passive:true});
  if(inp){
    inp.addEventListener('input',()=>{
      hbAddRender(inp.value);
      if(chips) chips.style.display=inp.value.trim()?'none':'';
    });
    inp.addEventListener('keydown',e=>{
      if(e.key==='Escape'){ e.stopPropagation(); pop.remove(); }
      if(e.key==='Enter'){
        const first=list&&list.querySelector('[data-t]');
        if(first){ const k=first.dataset.t; pop.remove(); hbCreate(k); }
      }
    });
    setTimeout(()=>{ try{ inp.focus(); }catch(err){} },30);
  }
  const x=$('hbAddClose'); if(x) x.onclick=()=>pop.remove();
  pop.addEventListener('click',e=>{
    const bt=e.target.closest('[data-t]');
    if(!bt) return;
    pop.remove(); hbCreate(bt.dataset.t);
  });
}

/* ---------- 渲染后绑定事件 ---------- */
function bindHomeBlocks(wrap){
  const eb=$('hbEditBtn');
  /* 一点就进 / 出编辑模式：之前无论浏览态还是编辑态都只弹菜单，
     导致「✅ 完成」点了没反应，看起来像编辑按钮消失了 */
  if(eb) eb.onclick=(e)=>{
    e.stopPropagation(); hbEdit=!hbEdit; renderItems();
    toast(hbEdit?'已进入主页编辑模式':'已退出编辑模式');
  };
  /* 设置入口保留在左侧栏「同步状态」行与命令面板，主页工具行不再放设置按钮 */
  const ab=$('hbAddBtn');
  if(ab) ab.onclick=(e)=>{ e.stopPropagation(); hbAddMenu(ab); };
  /* 待办清单打勾（浏览态直接可点，随保存持久化；同时写入当天打卡快照） */
  wrap.querySelectorAll('.hb-todo-row input[data-hbchk]').forEach(function(c){
    c.addEventListener('change',function(){
      const blk=c.closest('.hb-block'); if(!blk) return;
      const b=homeBlocks().find(function(x){ return x.id===blk.dataset.hbid; });
      const it=b&&b.props&&b.props.items&&b.props.items[+c.dataset.hbchk];
      if(!it) return;
      it.done=c.checked;
      const tx=c.closest('.hb-todo-row').querySelector('.hb-todo-text');
      if(tx) tx.classList.toggle('done',c.checked);
      hbTodoSnap();
      save();
    });
  });
  /* 日历点日期 → 查看当天打卡情况 */
  wrap.querySelectorAll('.hb-cal-d[data-cday]').forEach(function(el){
    el.onclick=function(){
      if(hbEdit) return;
      const now=new Date();
      hbDayInfo(now.getFullYear(),now.getMonth(),+el.dataset.cday);
    };
  });
  /* 浏览态：笔记类快捷入口直接开编辑器（文件 / 分类由全局 data-read / data-goto 代理处理） */
  wrap.querySelectorAll('.hb-card[data-open]').forEach(c=>{
    c.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      if(hbEdit) return;
      const it=state.items.find(x=>x.id===c.dataset.open);
      if(it) openEditor(it);
    };
  });
  /* 第三十二批：时间线 / 统计看板里的条目行，点一下直接打开 */
  wrap.querySelectorAll('[data-tl]').forEach(el=>{
    el.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      if(hbEdit) return;
      const it=state.items.find(x=>x.id===el.dataset.tl);
      if(!it) return;
      if(it.type==='note') openEditor(it); else openReader(it.id);
    };
  });
  /* 统计看板板块底部：打开独立弹窗看完整看板 */
  wrap.querySelectorAll('[data-bd]').forEach(el=>{
    el.onclick=(e)=>{
      e.preventDefault(); e.stopPropagation();
      if(hbEdit) return;
      if(typeof renderStatsPanel==='function') renderStatsPanel();
    };
  });
  if(!hbEdit) return;
  wrap.querySelectorAll('.hb-block').forEach(el=>{
    const id=el.dataset.hbid;
    /* 编辑态拦截板块内容的点击，防止误开文件 */
    const inner=el.querySelector('.hb-inner');
    if(inner) inner.addEventListener('click',ev=>{ ev.stopPropagation(); ev.preventDefault(); },true);
    el.addEventListener('click',ev=>{
      if(ev.target.closest('[data-hbup]')){ hbMove(id,-1); return; }
      if(ev.target.closest('[data-hbdown]')){ hbMove(id,1); return; }
      if(ev.target.closest('[data-hbedit]')){ const b=homeBlocks().find(x=>x.id===id); if(b) hbOpenEditor(b); return; }
      if(ev.target.closest('[data-hbdup]')){ hbDup(id); return; }
      if(ev.target.closest('[data-hbdel]')){ hbDel(id); return; }
    });
    const grip=el.querySelector('.hb-grip');
    if(grip){
      grip.addEventListener('dragstart',e=>{
        hbDragId=id; e.dataTransfer.effectAllowed='move';
        try{ e.dataTransfer.setData('text/plain',id); }catch(err){}
        requestAnimationFrame(()=>el.classList.add('hb-dragging'));
      });
      grip.addEventListener('dragend',()=>{
        hbDragId=null; el.classList.remove('hb-dragging');
        wrap.querySelectorAll('.hb-block').forEach(x=>x.classList.remove('hb-drop-top','hb-drop-bottom'));
      });
    }
    el.addEventListener('dragover',e=>{
      if(!hbDragId||hbDragId===id) return;
      e.preventDefault();
      const r=el.getBoundingClientRect();
      const before=e.clientY<r.top+r.height/2;
      el.classList.toggle('hb-drop-top',before);
      el.classList.toggle('hb-drop-bottom',!before);
    });
    el.addEventListener('dragleave',()=>el.classList.remove('hb-drop-top','hb-drop-bottom'));
    el.addEventListener('drop',e=>{
      if(!hbDragId||hbDragId===id) return;
      e.preventDefault();
      const r=el.getBoundingClientRect();
      hbReorder(hbDragId,id,e.clientY<r.top+r.height/2);
      hbDragId=null;
      wrap.querySelectorAll('.hb-block').forEach(x=>x.classList.remove('hb-drop-top','hb-drop-bottom','hb-dragging'));
    });
  });
}

/* ---------- 「添加板块」菜单点外面关闭 ---------- */
document.addEventListener('click',e=>{
  const pop=$('hbAddPop');
  if(pop&&!pop.contains(e.target)&&!(e.target.closest&&e.target.closest('#hbAddBtn'))) pop.remove();
});

/* ---------- 样式（注入主文档，全部走主题变量） ---------- */
(function(){
  const st=document.createElement('style');
  st.textContent=
  '.hb-root{position:relative}'+
  /* 第二十一批：工具行只留一枚克制的编辑入口，文字色跟「字体颜色」走，不跟主题色走 */
  '.hb-tools{display:flex;align-items:center;gap:8px;margin:0 0 10px;flex-wrap:wrap}'+
  '.hb-tool-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--sh-dark);background:transparent;box-shadow:none;border-radius:9px;padding:5px 11px;font-size:12.5px;font-weight:600;color:var(--text2);cursor:pointer;font-family:inherit;transition:background .15s,color .15s}'+
  '.hb-tool-btn:hover{color:var(--ink);background:var(--hover)}'+
  '.hb-tool-btn.primary{color:var(--text2)}'+
  '.hb-bar{display:flex;align-items:center;gap:8px;margin:2px 0 10px;flex-wrap:wrap}'+
  '.hb-bar-btn{display:inline-flex;align-items:center;gap:5px;border:none;background:var(--el-bg);box-shadow:var(--raised);border-radius:10px;padding:7px 14px;cursor:pointer;color:var(--text);font-weight:600;font-size:13px;font-family:inherit;transition:background .15s,color .15s}'+
  '.hb-bar-btn:hover{color:var(--ink);background:var(--hover)}'+
  '.hb-bar-add{color:var(--text2)}'+
  '.hb-bar-hint{font-size:12px;color:var(--text3)}'+
  '.hb-empty{border:1.5px dashed var(--text3);border-radius:14px;padding:22px 16px;text-align:center;color:var(--text3);font-size:13px}'+
  '.hb-list{margin-bottom:8px}'+
  '.hb-block{position:relative;margin:12px 0;border-radius:14px}'+
  '.hb-block.editing{outline:1.5px dashed var(--accent);outline-offset:8px;outline-color:var(--accent-soft)}'+
  /* 编辑控件常显：手机 / 触屏没有 hover，之前只有鼠标悬停才看得到 */
  '.hb-ctl{position:absolute;top:-16px;right:4px;display:none;gap:2px;z-index:30;background:var(--el-bg);border-radius:10px;box-shadow:var(--raised);padding:3px}'+
  '.hb-block.editing .hb-ctl{display:flex}'+
  '.hb-ctl-btn{border:none;background:transparent;cursor:pointer;width:26px;height:26px;border-radius:7px;color:var(--text2);font-size:12px;font-family:inherit;display:flex;align-items:center;justify-content:center;padding:0}'+
  '.hb-ctl-btn:hover{background:var(--hover);color:var(--ink)}'+
  '.hb-ctl-btn.danger:hover{color:#e05656}'+
  '.hb-grip{cursor:grab;font-size:13px}'+
  '.hb-block.hb-dragging{opacity:.45}'+
  '.hb-block.hb-drop-top{box-shadow:0 -3px 0 0 var(--accent)}'+
  '.hb-block.hb-drop-bottom{box-shadow:0 3px 0 0 var(--accent)}'+
  '.hb-h1{font-size:26px;font-weight:800;line-height:1.5}'+
  '.hb-h2{font-size:21px;font-weight:700;line-height:1.5}'+
  '.hb-h3{font-size:16.5px;font-weight:700;line-height:1.6}'+
  '.hb-h{color:var(--text);margin:4px 0}'+
  '.hb-text{font-size:14.5px;line-height:1.9;color:var(--text);margin:4px 0}'+
  '.hb-muted{color:var(--text3);font-size:13px}'+
  '.hb-quote{border-left:3px solid var(--accent);background:var(--hover);margin:8px 0;padding:10px 14px;border-radius:0 10px 10px 0;color:var(--text2);font-size:14.5px;line-height:1.8}'+
  '.hb-divider{border:none;border-top:1.5px dashed var(--text3);opacity:.45;margin:18px 0}'+
  '.hb-fig{margin:8px 0;text-align:center}'+
  '.hb-fig img{max-width:100%;border-radius:12px;box-shadow:var(--raised)}'+
  '.hb-w-wide{max-width:78%;margin-left:auto;margin-right:auto}'+
  '.hb-w-half{max-width:52%;margin-left:auto;margin-right:auto}'+
  '.hb-fig figcaption{font-size:12.5px;color:var(--text3);margin-top:6px}'+
  '.hb-cols{display:grid;gap:14px;margin:10px 0}'+
  '.hb-cols2{grid-template-columns:1fr 1fr}'+
  '.hb-cols3{grid-template-columns:1fr 1fr 1fr}'+
  '.hb-col{background:var(--el-bg);box-shadow:var(--raised);border-radius:14px;padding:12px;overflow:hidden}'+
  '.hb-col .hb-count{height:100%;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center}'+
  '.hb-bars{display:flex;flex-direction:column;gap:12px;margin:4px 0}'+
  '.hb-bar-row{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--text)}'+
  /* 黑边白底胶囊轨道 + 内部黑进度条（与边框留 3px 间距），参考用户截图 */
  '.hb-bar-track{flex:1;height:18px;background:var(--el-bg);border:1.5px dashed var(--text);border-radius:11px;box-sizing:border-box;padding:4px 6px;overflow:hidden}'+
  '.hb-bar-fill{display:block;height:100%;background:var(--text);border-radius:5px;transition:width .4s}'+
  '.hb-bar-label{flex:none;white-space:nowrap;font-weight:600;color:var(--text);font-size:12px}'+
  '.hb-menu{display:flex;flex-direction:column;gap:2px;margin:2px 0}'+
  '.hb-menu-row{display:flex;align-items:center;gap:8px;border:none;background:transparent;border-radius:9px;padding:7px 9px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--text);text-align:left;transition:background .12s}'+
  '.hb-menu-row:hover{background:var(--hover)}'+
  '.hb-menu-ico{flex:none}'+
  '.hb-menu-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-months{display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin:6px 0}'+
  '.hb-month{display:flex;align-items:center;gap:8px;border:none;background:transparent;border-radius:8px;padding:6px 9px;cursor:default;font-family:inherit;font-size:12.5px;color:var(--text2);text-align:left}'+
  '.hb-month b{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:var(--accent);color:var(--on-accent);font-size:10.5px;flex:none;font-weight:700}'+
  '.hb-month.on{background:var(--accent-soft);color:var(--ink);font-weight:700}'+
  '.hb-cal{font-size:11.5px;margin:2px 0;min-width:0}'+
  '.hb-cal-head{font-weight:700;font-size:12.5px;color:var(--text);margin-bottom:6px}'+
  '.hb-cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;text-align:center}'+
  '.hb-cal-w{color:var(--text3);font-size:10px;padding:2px 0}'+
  '.hb-cal-d{padding:3px 0;border-radius:6px;color:var(--text2);font-size:11px;line-height:1.2}'+
  '.hb-cal-d.today{background:var(--accent);color:var(--on-accent);font-weight:700}'+
  '.hb-cal-d[data-cday]{cursor:pointer;transition:background .12s}'+
  '.hb-cal-d[data-cday]:hover{background:var(--hover)}'+
  '.hb-cal-d.today[data-cday]:hover{background:var(--accent)}'+
  '.hb-cal-d.rec{position:relative}'+
  '.hb-cal-d.rec::after{content:"";position:absolute;left:50%;transform:translateX(-50%);bottom:0;width:4px;height:4px;border-radius:50%;background:var(--accent);opacity:.75}'+
  '.hb-cal-d.today.rec::after{background:#fff}'+
  /* 分类统计卡片 */
  '.hb-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:4px 0}'+
  '.hb-stat{border:none;border-radius:13px;padding:12px 14px 13px;text-align:left;cursor:pointer;font-family:inherit;box-shadow:0 2px 10px rgba(90,100,120,.07);transition:transform .15s,box-shadow .15s;display:block}'+
  '.hb-stat:hover{transform:translateY(-2px);box-shadow:0 5px 16px rgba(90,100,120,.12)}'+
  '.hb-stat-top{display:flex;align-items:center;gap:7px;min-width:0}'+
  '.hb-stat-ico{width:26px;height:26px;flex:none;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px}'+
  '.hb-stat-name{font-size:12px;font-weight:700;color:#3a4150;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-stat-num{font-size:24px;font-weight:800;color:#2f3437;margin-top:8px;line-height:1.1}'+
  '.hb-stat-num i{font-style:normal;font-size:11px;font-weight:600;color:#5d6572;margin-left:4px}'+
  '.hb-stat-sub{font-size:11px;color:#69707e;margin-top:5px}'+
  '.hb-stat-bar{height:5px;border-radius:3px;background:#ffffffb0;margin-top:9px;overflow:hidden}'+
  '.hb-stat-bar i{display:block;height:100%;border-radius:3px;transition:width .4s}'+
  /* 日期详情弹窗 */
  '.hb-day-date{font-size:14px;font-weight:800;color:var(--text);margin-bottom:10px}'+
  '.hb-day-sec{margin-bottom:14px}'+
  '.hb-day-st{font-size:12px;font-weight:700;color:var(--text2);margin-bottom:7px}'+
  '.hb-day-group{margin-bottom:9px}'+
  '.hb-day-gt{font-size:11.5px;color:var(--text3);margin-bottom:4px}'+
  '.hb-day-row{display:flex;align-items:center;gap:8px;padding:4px 2px;font-size:13px;color:var(--text);cursor:pointer;border-radius:7px}'+
  '.hb-day-row:hover{background:var(--hover)}'+
  /* 明确的复选框：一眼看出「可以点一下完成」 */
  '.hb-day-box{flex:none;width:17px;height:17px;border:1.6px solid var(--text3);border-radius:5px;background:transparent;color:var(--on-accent);font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;box-sizing:border-box}'+
  '.hb-day-box.on{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}'+
  '.hb-day-ok{flex:none;width:18px;height:18px;border-radius:50%;background:var(--accent);color:var(--on-accent);font-size:11px;display:flex;align-items:center;justify-content:center}'+
  '.hb-day-no{flex:none;width:18px;height:18px;border-radius:50%;border:1.5px dashed var(--text3);color:var(--text3);font-size:11px;display:flex;align-items:center;justify-content:center}'+
  '.hb-day-row.is-done .hb-day-txt,.hb-day-txt.done{text-decoration:line-through;color:var(--text3)}'+
  '.hb-day-hint{font-size:12.5px;color:var(--text3);padding:6px 0}'+
  '.hb-day-del{margin-left:auto;border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:11px;width:20px;height:20px;border-radius:6px;flex:none;font-family:inherit}'+
  '.hb-day-del:hover{background:var(--hover);color:#e05656}'+
  '.hb-day-add{margin-top:6px}'+
  '.hb-day-add input{width:100%;box-sizing:border-box;border:1.5px dashed var(--text3);border-radius:9px;padding:6px 10px;font-size:12.5px;background:transparent;color:var(--text);font-family:inherit;outline:none}'+
  '.hb-day-add input:focus{border-color:var(--accent);border-style:solid}'+
  '.hb-todo{margin:4px 0}'+
  '.hb-todo-title{font-weight:700;font-size:14.5px;color:var(--text);margin-bottom:5px}'+
  '.hb-todo-row{display:flex;align-items:flex-start;gap:9px;padding:5px 6px;border-radius:8px;cursor:pointer;transition:background .12s}'+
  '.hb-todo-row:hover{background:var(--hover)}'+
  '.hb-todo-row input[type=checkbox]{width:15px;height:15px;flex:none;margin-top:2px;cursor:pointer;accent-color:var(--accent)}'+
  '.hb-todo-text{font-size:13.5px;color:var(--text);line-height:1.5}'+
  '.hb-todo-text.done{color:var(--text3);text-decoration:line-through}'+
  '.hb-col img{width:100%;border-radius:9px;margin-bottom:8px;display:block}'+
  '.hb-col-text{font-size:13.5px;line-height:1.8;color:var(--text2)}'+
  '.hb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:10px 0}'+
  '.hb-card{display:flex;align-items:center;gap:9px;background:var(--el-bg);box-shadow:var(--raised);border:none;border-radius:12px;padding:11px 12px;cursor:pointer;text-align:left;font-family:inherit;transition:transform .12s,color .12s;min-width:0}'+
  '.hb-card:hover{color:var(--ink);transform:translateY(-1px)}'+
  '.hb-card-ico{font-size:19px;flex-shrink:0}'+
  '.hb-card-name{font-size:13.5px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}'+
  '.hb-card:hover .hb-card-name{color:var(--ink)}'+
  '.hb-card-sub{font-size:11px;color:var(--text3);flex-shrink:0}'+
  '.hb-embed-box{position:relative;padding-top:56.25%;border-radius:12px;overflow:hidden;box-shadow:var(--raised);margin:10px 0;background:#000}'+
  '.hb-embed-box iframe{position:absolute;left:0;top:0;width:100%;height:100%;border:0}'+
  '.hb-embed-cap{font-size:12.5px;color:var(--text3);text-align:center;margin-top:4px}'+
  '.hb-mask{position:fixed;inset:0;background:rgba(20,30,50,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px}'+
  '.hb-modal{background:var(--el-bg);border-radius:16px;box-shadow:var(--raised-lg);width:min(520px,94vw);max-height:86vh;display:flex;flex-direction:column}'+
  '.hb-modal-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 10px;font-weight:700;font-size:14.5px;color:var(--text)}'+
  '.hb-modal-x{border:none;background:transparent;cursor:pointer;font-size:14px;color:var(--text3);width:26px;height:26px;border-radius:8px}'+
  '.hb-modal-x:hover{background:var(--hover);color:var(--text)}'+
  '.hb-modal-body{padding:4px 18px 8px;overflow:auto}'+
  '.hb-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 18px 16px}'+
  '.hb-btn{border:none;border-radius:9px;padding:8px 18px;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--text);background:var(--el-bg);box-shadow:var(--raised)}'+
  '.hb-btn.primary{background:var(--accent);color:var(--on-accent);box-shadow:none}'+
  '.hb-btn.primary:hover{opacity:.9}'+
  '.hb-f{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}'+
  '.hb-f>span{font-size:12.5px;color:var(--text2);font-weight:600}'+
  '.hb-f input,.hb-f textarea,.hb-f select{border:none;background:var(--el-bg);box-shadow:var(--inset);border-radius:9px;padding:9px 11px;font:inherit;font-size:13.5px;color:var(--text);outline:none;resize:vertical}'+
  '.hb-f input:focus,.hb-f textarea:focus,.hb-f select:focus{box-shadow:var(--inset),0 0 0 2px var(--accent)}'+
  '.hb-f-group{box-shadow:var(--inset);border-radius:11px;padding:10px;margin-bottom:10px;display:flex;flex-direction:column;gap:7px}'+
  '.hb-f-title{font-size:12px;font-weight:700;color:var(--ink)}'+
  '.hb-f-group input,.hb-f-group textarea{border:none;background:transparent;outline:none;font:inherit;font-size:13px;color:var(--text);resize:vertical}'+
  '.hb-f-hint{font-size:11.5px;color:var(--text3);line-height:1.6}'+
  '.hb-pick{max-height:46vh;overflow:auto;display:flex;flex-direction:column;gap:2px}'+
  '.hb-pick-row{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:8px;cursor:pointer;font-size:13.5px;color:var(--text)}'+
  '.hb-pick-row:hover{background:var(--hover)}'+
  '.hb-pick-row input{accent-color:var(--accent)}'+
  '.hb-pick-ico{font-size:15px;width:20px;text-align:center;flex-shrink:0}'+
  /* 添加板块菜单：左侧分类 + 右侧双列网格 + 顶部搜索（21 种板块不再铺成一长条） */
  '.hb-add-pop{position:fixed;z-index:10000;width:min(452px,94vw);background:var(--el-bg);border-radius:16px;box-shadow:var(--raised-lg);padding:10px;display:flex;flex-direction:column;max-height:min(70vh,560px)}'+
  '.hb-add-head{display:flex;gap:6px;align-items:center;padding:0 0 8px}'+
  '.hb-add-head input{flex:1;min-width:0;border:none;border-radius:9px;background:var(--el-bg);box-shadow:var(--inset);padding:7px 11px;font:inherit;font-size:12.5px;color:var(--text);outline:none}'+
  '.hb-add-head input:focus{box-shadow:var(--inset),0 0 0 2px var(--accent)}'+
  '.hb-add-x{border:none;background:transparent;color:var(--text3);cursor:pointer;font-size:12px;width:24px;height:24px;border-radius:8px;flex-shrink:0;font-family:inherit}'+
  '.hb-add-x:hover{background:var(--hover);color:var(--text)}'+
  '.hb-add-chips{display:flex;gap:5px;overflow-x:auto;padding:0 0 8px;scrollbar-width:none}'+
  '.hb-add-chips::-webkit-scrollbar{display:none}'+
  '.hb-add-chips button{flex:none;border:none;background:rgba(128,128,128,.11);color:var(--text2);font-family:inherit;font-size:11.5px;padding:4px 10px;border-radius:999px;cursor:pointer;white-space:nowrap}'+
  '.hb-add-chips button:hover,.hb-add-chips button.on{background:var(--accent-soft);color:var(--ink)}'+
  '.hb-add-list{flex:1;min-height:0;overflow-y:auto;padding:0 2px 2px 0}'+
  '.hb-add-group{margin-bottom:10px}'+
  '.hb-add-gt{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--text3);padding:2px 2px 6px;letter-spacing:.03em}'+
  '.hb-add-gt i{font-style:normal;font-weight:400;opacity:.65}'+
  '.hb-add-grid{display:grid;grid-template-columns:1fr 1fr;gap:3px}'+
  '.hb-add-grid button{display:flex;align-items:center;gap:8px;border:none;background:transparent;padding:8px 9px;border-radius:10px;cursor:pointer;text-align:left;font-family:inherit;color:var(--text);min-width:0}'+
  '.hb-add-grid button:hover{background:var(--hover)}'+
  '.hb-add-grid .ico{font-size:16px;width:22px;text-align:center;flex-shrink:0}'+
  '.hb-add-grid .nm{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'+
  '.hb-add-none{padding:20px 8px;text-align:center;font-size:12.5px;color:var(--text3)}'+
  '@media(max-width:520px){.hb-add-pop{width:94vw;max-height:72vh}.hb-add-grid button{padding:8px 7px}.hb-add-grid .nm{font-size:12.5px}.hb-add-chips{padding-bottom:6px}}'+
  '.hb-f-row{display:flex;gap:10px}.hb-f-row .hb-f{flex:1}'+
  '.hb-callout{display:flex;gap:11px;align-items:flex-start;margin:8px 0;padding:12px 14px;border-radius:12px;font-size:14px;line-height:1.8}'+
  '.hb-callout-ico{font-size:19px;line-height:1.4;flex-shrink:0}'+
  '.hb-callout-text{color:var(--text);min-width:0;word-break:break-word}'+
  '.hb-tone-pink{background:#fdeef4}.hb-tone-blue{background:#e8f3fd}.hb-tone-green{background:#e9f9ef}.hb-tone-yellow{background:#fdf6e3}.hb-tone-gray{background:var(--hover)}'+
  '.hb-clock{display:flex;gap:10px;margin:8px 0}'+
  '.hb-w-half.hb-clock{max-width:300px}.hb-w-full.hb-clock{max-width:420px}'+
  '.hb-clock-cell{flex:1;aspect-ratio:.82;border-radius:16px;background:var(--accent);color:var(--on-accent);box-shadow:var(--raised);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0}'+
  '.hb-clock-cell b{font-size:clamp(44px,9vw,64px);font-weight:800;line-height:1;letter-spacing:2px}'+
  '.hb-clock-cell i{font-style:normal;font-size:11px;font-weight:700;letter-spacing:2px;opacity:.85}'+
  '.hb-count{background:var(--el-bg);box-shadow:var(--raised);border-radius:16px;padding:16px 18px;margin:8px 0}'+
  '.hb-w-half.hb-count{max-width:300px}'+
  '.hb-count-label{font-size:13px;font-weight:700;color:var(--text2)}'+
  '.hb-count-date{font-size:11.5px;color:var(--text3);margin-top:2px}'+
  '.hb-count-days{font-size:15px;color:var(--text);margin-top:8px}'+
  '.hb-count-days b{font-size:30px;font-weight:800;color:var(--ink);margin:0 2px}'+
  '.hb-cards.hb-gallery{grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px}'+
  '.hb-gcard{flex-direction:column;align-items:stretch;padding:0;overflow:hidden;gap:0}'+
  '.hb-gcover{height:88px;display:flex;align-items:center;justify-content:center;flex-shrink:0}'+
  '.hb-gemoji{font-size:34px;filter:drop-shadow(0 2px 4px rgba(0,0,0,.15))}'+
  '.hb-gcard .hb-card-name{padding:10px 12px 2px;white-space:normal;line-height:1.5;flex:none}'+
  '.hb-gcard .hb-card-sub{padding:0 12px 10px}'+
  /* ===== 第三十二批：时间线 / 统计看板 / 当日新增 ===== */
  '.hb-tl{position:relative;margin:2px 0 2px 6px;padding-left:16px;max-width:640px}'+
  '.hb-tl:before{content:"";position:absolute;left:5px;top:10px;bottom:10px;width:1.5px;background:rgba(128,128,128,.28)}'+
  '.hb-tl-m{position:relative;font-size:11.5px;font-weight:800;color:var(--text3);margin:10px 0 5px;letter-spacing:.02em}'+
  '.hb-tl-m:first-child{margin-top:2px}'+
  '.hb-tl-row{position:relative;display:flex;align-items:center;gap:8px;width:100%;border:none;background:transparent;padding:6px;border-radius:9px;font-family:inherit;text-align:left;cursor:pointer;transition:background .12s}'+
  '.hb-tl-row:hover{background:var(--hover)}'+
  '.hb-tl-day{flex:none;width:22px;font-size:11.5px;font-weight:800;color:var(--text3);font-variant-numeric:tabular-nums}'+
  '.hb-tl-dot{position:absolute;left:-15px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}'+
  '.hb-tl-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}'+
  '.hb-tl-t{font-size:13px;color:var(--text);line-height:1.45;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-tl-s{font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-tl-ico{flex:none;width:16px;text-align:center;font-size:13px;opacity:.9}'+
  '.hb-tl-more{font-size:11px;color:var(--text3);margin-top:6px;padding-left:20px}'+
  '.hb-sec-head{display:flex;align-items:center;gap:7px;max-width:640px;font-size:12.5px;font-weight:800;color:var(--text2);margin:2px 0 8px}'+
  '.hb-sec-head em{font-style:normal;font-size:10.5px;font-weight:600;color:var(--text3);background:var(--hover);border-radius:999px;padding:1px 8px}'+
  '.hb-bd{max-width:640px}'+
  '.hb-bd-nums{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}'+
  '.hb-bd-num{background:var(--el-bg);box-shadow:var(--inset);border-radius:12px;padding:9px 8px;text-align:center}'+
  '.hb-bd-num b{display:block;font-size:20px;font-weight:800;color:var(--text);line-height:1.25}'+
  '.hb-bd-num span{font-size:10.5px;color:var(--text3)}'+
  '.hb-bd-sec{margin-bottom:12px}'+
  '.hb-bd-st{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px}'+
  '.hb-bd-st em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--text3);background:var(--hover);border-radius:999px;padding:1px 7px}'+
  '.hb-bd-hint{font-size:11px;color:var(--text3);line-height:1.65}'+
  '.hb-bd-tags{display:flex;flex-wrap:wrap;gap:6px}'+
  '.hb-bd-tag{display:inline-flex;align-items:center;gap:4px;border-radius:999px;background:var(--accent-soft);color:var(--text2);padding:2px 9px;font-size:11.5px;line-height:1.7}'+
  '.hb-bd-tag i{font-style:normal;font-size:10px;font-weight:700;color:var(--text3)}'+
  '.hb-bd-tag.lv2{font-size:12.5px;font-weight:700}'+
  '.hb-bd-tag.lv3{font-size:13.5px;font-weight:800;background:var(--accent);color:var(--on-accent)}'+
  '.hb-bd-tag.lv3 i{color:var(--on-accent);opacity:.75}'+
  '.hb-bd-hot{display:flex;flex-direction:column;gap:1px}'+
  '.hb-bd-hot-row{display:flex;align-items:center;gap:7px;width:100%;border:none;background:transparent;border-radius:8px;padding:5px 6px;font-family:inherit;font-size:12.5px;color:var(--text);text-align:left;cursor:pointer}'+
  '.hb-bd-hot-row:hover{background:var(--hover)}'+
  '.hb-bd-rank{flex:none;width:16px;text-align:center;font-size:10.5px;font-weight:800;color:var(--text3)}'+
  '.hb-bd-rank.top{color:var(--ink)}'+
  '.hb-bd-hot-ico{flex:none;font-size:13px}'+
  '.hb-bd-hot-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-bd-hot-n{flex:none;font-size:10.5px;color:var(--text3)}'+
  '.hb-bd-hot-f{flex:none;max-width:92px;font-size:10.5px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-bd-bar{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--hover);box-shadow:inset 0 0 0 1px var(--sh-dark);margin-bottom:7px}'+
  '.hb-bd-bar .f{background:var(--accent)}'+
  '.hb-bd-bar .n{background:var(--text3);opacity:.45}'+
  '.hb-bd-legend{display:flex;flex-wrap:wrap;gap:10px;font-size:11px;color:var(--text3);margin-bottom:3px}'+
  '.hb-bd-legend .dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:4px;vertical-align:1px}'+
  '.hb-bd-legend .dot.f{background:var(--accent)}'+
  '.hb-bd-legend .dot.n{background:var(--text3);opacity:.45}'+
  '.hb-bd-more{margin-top:2px;border:none;background:transparent;color:var(--text3);font-family:inherit;font-size:11.5px;padding:4px 0;cursor:pointer}'+
  '.hb-bd-more:hover{color:var(--ink)}'+
  '.hb-day-cnt{font-style:normal;font-size:10.5px;font-weight:700;color:var(--text3);background:var(--hover);border-radius:999px;padding:1px 7px;margin-left:5px}'+
  '.hb-day-item{display:flex;align-items:center;gap:7px;width:100%;border:none;background:transparent;border-radius:8px;padding:5px 4px;font-family:inherit;text-align:left;cursor:pointer}'+
  '.hb-day-item:hover{background:var(--hover)}'+
  '.hb-day-item-ico{flex:none;font-size:13px}'+
  '.hb-day-item-t{flex:1;min-width:0;font-size:12.5px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
  '.hb-day-item-s{flex:none;font-size:10.5px;color:var(--text3)}'+
  '@media(max-width:720px){.hb-cols2,.hb-cols3{grid-template-columns:1fr!important}.hb-h1{font-size:22px}.hb-h2{font-size:18.5px}.hb-bd-hot-f{display:none}}';
  document.head.appendChild(st);
})();

/* ---------- 日期钟自动刷新：每 30 秒重渲染主页（编辑模式 / 无钟时跳过） ---------- */
setInterval(function(){
  if(hbEdit) return;
  if(typeof currentFolderId==='undefined'||currentFolderId!==(typeof HOME_ID!=='undefined'?HOME_ID:'__home__')) return;
  if(!document.querySelector('.hb-clock,.hb-bars')) return;
  renderItems();
},30000);

/* 第三十二批：去掉主页顶部与顶栏重复的空间名大标题（幂等，只跑一次） */
function hbDropNameHeading(){
  if(state.homeV6) return;
  if(typeof SHARED!=='undefined'&&SHARED) return;      /* 分享版保持导出时的样子，不改访客本地 */
  const arr=Array.isArray(state.homeBlocks)?state.homeBlocks:[];
  const i=arr.findIndex(function(b){
    return b&&b.type==='h'&&String((b.props&&b.props.text)||'').trim()==='{name}';
  });
  if(i>=0) arr.splice(i,1);
  state.homeV6=1;
  save();
}

/* 第三十二批：给老用户一次性补上「🧵 时间线 / 📈 统计看板」两个新板块
   （用户主动删掉后不再加回：homeV32 只打一次标） */
function hbAddNewBlocks(){
  if(state.homeV32) return;
  if(typeof SHARED!=='undefined'&&SHARED) return;
  const arr=homeBlocks();
  if(!arr.length){ state.homeV32=1; return; }        /* 空箱交给默认布局，别把空主页塞满 */
  if(!arr.some(function(b){ return b.type==='timeline'; })) arr.push({id:uid(),type:'timeline',props:{}});
  if(!arr.some(function(b){ return b.type==='board'; })) arr.push({id:uid(),type:'board',props:{}});
  state.homeV32=1;
  save();
}

/* ============================================================
   默认主页布局：首次加载自动生成（参考 Notion 设计稿），无需手动拼装。
   {name}=空间名；target=newyear=倒计时自动指向最近的元旦；auto=分类自动分区。
   仅在从未初始化过（无 homeV5 标记）且没有自定义板块时注入一次。
   ============================================================ */
function hbSeedDefaults(){
  if(typeof BOX_HIDE!=='undefined'&&BOX_HIDE) return;
  /* 第三十二批：顶栏已经显示空间名，主页开头那块同名的「{name}」大标题成了重复信息 →
     一次性去掉（只删占位符原样、没被改过的标题；用户自己改过文案的标题不动）。 */
  hbDropNameHeading();
  hbAddNewBlocks();
  if(state.homeV5) return;
  const old=Array.isArray(state.homeBlocks)?state.homeBlocks:[];
  /* 仅当从未自定义过（空 / v2 默认 / v3 默认 / v4 默认）时升级为最新设计 */
  const isV2Default=old.length===4&&old[0].type==='h'&&old[1].type==='callout'&&old[2].type==='cols'&&old[3].type==='auto';
  const isV3Default=old.length===7&&old[0].type==='h'&&old[1].type==='cols'&&old[1].props&&old[1].props.n===3&&
    old[2].type==='todo'&&old[2].props&&String(old[2].props.title||'').indexOf('年度目标')>=0&&old[3].type==='divider'&&old[4].type==='months';
  const isV4Default=old.length===6&&old[0].type==='h'&&old[1].type==='cols'&&old[1].props&&old[1].props.n===2&&
    old[1].props.cols&&old[1].props.cols[0]&&old[1].props.cols[0].widget==='pin'&&old[2].type==='divider'&&old[3].type==='months';
  if(!old.length||isV2Default||isV3Default||isV4Default){
    state.homeV5=1;
    state.homeV6=1;
    state.homeBlocks=[
      /* 顶栏已经显示空间名，这里不再重复放一块同名大标题（第三十二批） */
      /* 置顶文档库占一半；右一半 = 时间进度条 + 本月日历 */
      {id:uid(),type:'cols', props:{n:3,fr:[2,1,1],cols:[{widget:'pin'},{widget:'bars'},{widget:'calendar'}]}},
      {id:uid(),type:'divider',props:{}},
      {id:uid(),type:'months',props:{}},
      {id:uid(),type:'todo', props:{title:'✅ 每日挑战',items:[{t:'运动 30 分钟',done:false},{t:'阅读 30 分钟',done:false},{t:'23:30 前睡觉',done:false}]}},
      {id:uid(),type:'todo', props:{title:'📌 最近任务',items:[{t:'整理收藏夹',done:false},{t:'写本周复盘',done:false}]}},
      {id:uid(),type:'timeline',props:{}}
    ];
    save();
  }else{
    state.homeV5=1;   /* 已自定义：不再覆盖，只标记版本 */
  }
}
hbSeedDefaults();
