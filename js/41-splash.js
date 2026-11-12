/* ============================================================
   OVOvv · 开屏页内容填充
   开屏的结构/样式/关闭逻辑都内联在 index.html（不依赖外链脚本，
   分享版即使内联缺失也不会卡在开屏）；本脚本只负责把自定义
   头像 emoji 与空间名填进开屏（需要 state，加载完数据后执行）。
   ============================================================ */
'use strict';
(function(){
  try{
    const sp=document.getElementById('splash');
    if(!sp||sp.classList.contains('out')) return;
    const av=(state.profile&&state.profile.avatarEmoji)||'🧸';
    const logo=document.getElementById('spLogo');
    if(logo&&av) logo.textContent=av;
    const name=document.getElementById('spName');
    if(name&&state.spaceName) name.textContent=state.spaceName;
  }catch(e){}
})();
