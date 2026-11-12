/* ============================================================
   OVOvv · 更新公告（第三十一批）
   ------------------------------------------------------------
   首次进入、以及每次更新后首次进入，弹一次「这一版改了什么」。
   内容只写概括性说明：新增 / 优化 / 修复三组，每条一句话，不堆细节。
   ------------------------------------------------------------
   发版流程：
     1) WN_VER 改成新版本号；
     2) 在 WHATS_NEW 最前面插一条 {v, date, title, groups}。
   已读标记存本机 localStorage（不进 state，所以不会被云端同步覆盖、
   也不会带进分享版），换设备会再看一次，属预期。
   ============================================================ */
'use strict';
(function(){
  const WN_VER='2.32';
  const WN_DATE='2026-11-11';
  const WN_KEY='ovovv_wn_seen_v1';

  /* 最新的一版放最前面；同一版里的条目按「新增 → 优化 → 修复」排列 */
  const WHATS_NEW=[
    {
      v:'2.32', date:'2026-11-11', title:'统计看板、时间线与「当日新增」',
      groups:[
        {t:'新增', items:[
          '统计看板：主页可选板块 + 独立弹窗（命令面板「打开统计看板」），一眼看到条目总数、本周新增、标签云、高频打开 Top10 与存储分布',
          '时间线板块：按创建时间把内容排成时间轴、按月分组，适合做日记与复盘',
          '日历弹窗新增「当日新增」：点任意日期即可看到那天收录的笔记与文件，点一下直接打开'
        ]},
        {t:'优化', items:[
          '主页顶栏显示空间名之后，去掉了下方重复的同名大标题',
          '设置删除「操作说明」卡片，界面更短；云端同步卡片里直接写清仓库路径'
        ]},
        {t:'修复', items:[
          '打开次数改为累计记录，统计看板的「高频打开」不再只反映最后一次'
        ]}
      ]
    },
    {
      v:'2.31', date:'2026-11-11', title:'划线标注、更新公告与一轮细节打磨',
      groups:[
        {t:'新增', items:[
          '阅读器划线标注：选中文字即可高亮 / 下划线 / 波浪线，还能随手写批注，侧栏「🖍 标注」统一回看与删除',
          '更新公告：每次更新后首次打开自动说明改了什么，也就是现在这个窗口'
        ]},
        {t:'优化', items:[
          '主页顶栏改为显示你的空间名称，点一下就能改名',
          '时间进度条改成虚线描边，视觉更轻盈',
          '「＋ 添加板块」改为 21 种一次平铺，分 5 组 + 搜索，找起来更快',
          '搜索框没点过不再自己弹出结果页，✕ 或 Esc 一次退出',
          '设置去掉重复的主题预设与链接预览，主题色仍可自由自定义'
        ]},
        {t:'修复', items:[
          '手机上选字标注不再误触系统的复制 / 粘贴菜单，工具条贴底不挡正文',
          '手机顶部刘海与底部手势条区域不再留白或被遮挡'
        ]}
      ]
    }
  ];

  let built=false, mask=null, card=null, bodyEl=null, lastFocus=null;

  function injectStyle(){
    if(document.getElementById('wnStyle')) return;
    const st=document.createElement('style');
    st.id='wnStyle';
    st.textContent=
      '.wn-mask{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;'+
        'background:rgba(18,25,38,.42);backdrop-filter:blur(3px);padding:20px;opacity:0;pointer-events:none;transition:opacity .18s ease}'+
      '.wn-mask.show{opacity:1;pointer-events:auto}'+
      '.wn-card{width:min(460px,94vw);max-height:min(82vh,660px);display:flex;flex-direction:column;overflow:hidden;'+
        'border-radius:18px;background:var(--bg1);box-shadow:0 24px 60px rgba(12,20,36,.24);'+
        'transform:translateY(10px) scale(.985);transition:transform .2s ease}'+
      '.wn-mask.show .wn-card{transform:none}'+
      '.wn-head{padding:18px 20px 12px;border-bottom:1px solid var(--sh-dark);display:flex;align-items:flex-start;gap:10px}'+
      '.wn-head-txt{flex:1;min-width:0}'+
      '.wn-badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;letter-spacing:.02em;'+
        'color:var(--ink);background:var(--accent-soft);border-radius:999px;padding:3px 9px;margin-bottom:7px}'+
      '.wn-title{font-size:16.5px;font-weight:800;color:var(--text);line-height:1.45}'+
      '.wn-sub{font-size:12px;color:var(--text3);margin-top:4px;line-height:1.6}'+
      '.wn-x{flex:none;width:28px;height:28px;border-radius:9px;font-size:16px;line-height:1;color:var(--text3);'+
        'display:flex;align-items:center;justify-content:center;transition:background .15s,color .15s}'+
      '.wn-x:hover{background:var(--hover);color:var(--ink)}'+
      '.wn-body{overflow:auto;padding:14px 20px 6px;-webkit-overflow-scrolling:touch}'+
      '.wn-group{margin-bottom:14px}'+
      '.wn-gt{display:flex;align-items:center;gap:7px;font-size:12.5px;font-weight:800;color:var(--ink);margin-bottom:7px}'+
      '.wn-gt i{font-style:normal;font-size:13px}'+
      '.wn-gt em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--text3);background:var(--hover);'+
        'border-radius:999px;padding:1px 7px}'+
      '.wn-list{display:flex;flex-direction:column;gap:7px}'+
      '.wn-li{position:relative;padding-left:15px;font-size:13px;line-height:1.75;color:var(--text2)}'+
      '.wn-li:before{content:"";position:absolute;left:2px;top:9px;width:5px;height:5px;border-radius:50%;background:var(--accent);opacity:.75}'+
      '.wn-ver{font-size:11.5px;color:var(--text3);margin:2px 0 16px}'+
      '.wn-foot{padding:12px 20px 16px;border-top:1px solid var(--sh-dark);display:flex;align-items:center;gap:10px}'+
      '.wn-tip{flex:1;font-size:11.5px;color:var(--text3);line-height:1.55}'+
      '.wn-ok{flex:none;border:none;border-radius:11px;padding:9px 20px;font-size:13px;font-weight:700;'+
        'background:var(--accent);color:var(--on-accent);transition:filter .15s}'+
      '.wn-ok:hover{filter:brightness(1.05)}'+
      '@media (max-width:520px){'+
        '.wn-card{width:94vw;max-height:86vh}.wn-head{padding:16px 16px 11px}.wn-body{padding:12px 16px 4px}'+
        '.wn-foot{padding:10px 16px calc(12px + env(safe-area-inset-bottom));justify-content:flex-end}'+
        '.wn-title{font-size:15.5px}.wn-tip{display:none}'+
      '}';
    document.head.appendChild(st);
  }

  function build(){
    if(built) return;
    injectStyle();
    const cur=WHATS_NEW[0]||{v:WN_VER,date:WN_DATE,title:'',groups:[]};
    mask=document.createElement('div');
    mask.className='wn-mask';
    mask.setAttribute('role','dialog');
    mask.setAttribute('aria-modal','true');
    mask.setAttribute('aria-label','更新公告');
    card=document.createElement('div');
    card.className='wn-card';
    let h='<div class="wn-head"><div class="wn-head-txt">'+
      '<span class="wn-badge">📣 更新公告 · v'+esc(cur.v)+'</span>'+
      '<div class="wn-title">'+esc(cur.title||'这一版改了什么')+'</div>'+
      '<div class="wn-sub">'+esc(cur.date||WN_DATE)+' 发布 · 之后的版本有更新会再提醒你一次</div>'+
      '</div><button class="wn-x" type="button" aria-label="关闭">×</button></div>';
    h+='<div class="wn-body">';
    (cur.groups||[]).forEach(function(g){
      h+='<div class="wn-group"><div class="wn-gt"><i>'+
        (g.t==='新增'?'✨':g.t==='优化'?'🛠':'🔧')+'</i>'+esc(g.t)+
        '<em>'+g.items.length+'</em></div><div class="wn-list">'+
        g.items.map(function(x){ return '<div class="wn-li">'+esc(x)+'</div>'; }).join('')+
        '</div></div>';
    });
    h+='<div class="wn-ver">以上为概括说明，细节可在「设置 → 关于」里随时重看。</div>';
    h+='</div>';
    h+='<div class="wn-foot"><div class="wn-tip">看过就不会再打扰你，直到下一次更新。</div>'+
      '<button class="wn-ok" type="button">知道了</button></div>';
    card.innerHTML=h;
    mask.appendChild(card);
    document.body.appendChild(mask);
    bodyEl=mask.querySelector('.wn-body');
    mask.addEventListener('click',function(e){ if(e.target===mask) wnClose(); });
    mask.querySelector('.wn-x').addEventListener('click',wnClose);
    mask.querySelector('.wn-ok').addEventListener('click',wnClose);
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'&&mask&&mask.classList.contains('show')){ e.stopPropagation(); wnClose(); }
    },true);
    built=true;
  }

  function wnOpen(){
    build();
    lastFocus=document.activeElement;
    mask.classList.add('show');
    if(bodyEl) bodyEl.scrollTop=0;
    const ok=mask.querySelector('.wn-ok'); if(ok) ok.focus({preventScroll:true});
  }
  function wnClose(){
    if(!mask) return;
    mask.classList.remove('show');
    try{ localStorage.setItem(WN_KEY,WN_VER); }catch(e){}
    if(lastFocus&&lastFocus.focus) { try{ lastFocus.focus({preventScroll:true}); }catch(e){} }
  }
  function wnSeen(){ try{ return localStorage.getItem(WN_KEY)===WN_VER; }catch(e){ return true; } }

  /* 对外：设置里的「更新公告」入口 / 控制台调试 */
  window.wnOpen=wnOpen;
  window.wnClose=wnClose;
  window.WN_VER=WN_VER;

  function boot(){
    injectStyle();
    const btn=document.getElementById('whatsNewBtn');
    if(btn){
      btn.addEventListener('click',wnOpen);
      const v=document.getElementById('wnVer'); if(v) v.textContent='v'+WN_VER;
    }
    /* 分享版（访客看别人的空间）不弹主人的更新公告 */
    if(typeof SHARED!=='undefined'&&SHARED) return;
    if(wnSeen()) return;
    /* 等开屏页收起（约 1.65s）再弹，避免两个动画叠在一起 */
    setTimeout(function(){ if(!wnSeen()) wnOpen(); },2100);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
