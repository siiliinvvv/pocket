/* ============================================================
   Pocket · 主题外观
   皮肤预设、自定义主题色、字号缩放
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 主题色与外观（自定义色 + 字号，记忆在本机） ================= */
/* 第二十九批：按用户要求取消「主题预设」色点，只保留「主题色」取色器 + 「字体颜色」。
   这里保留旧皮肤 id → 颜色的映射，仅用于把老用户当时选的预设迁移成自定义主题色，
   迁移后外观不变，之后完全由取色器控制。 */
const SKIN_COLORS={ocean:'#5B99E2',teal:'#2c9d9a',violet:'#805ad5',rose:'#d95f83',amber:'#c05621',forest:'#2f855a'};
let UIP={};
try{ UIP=JSON.parse(localStorage.getItem('tb_ui_v1')||'{}'); }catch(e){ UIP={}; }
let UIP_MIGRATED=false;
if(!UIP.customAccent&&UIP.skinId&&SKIN_COLORS[UIP.skinId]){ UIP.customAccent=SKIN_COLORS[UIP.skinId]; UIP_MIGRATED=true; }
if(UIP.skinId!==undefined){ delete UIP.skinId; UIP_MIGRATED=true; }
function saveUIP(){ try{ localStorage.setItem('tb_ui_v1',JSON.stringify(UIP)); }catch(e){} }
if(UIP_MIGRATED) saveUIP();
/* ================= 颜色换算工具 ================= */
function rgbHsl(r,g,b){
  r/=255; g/=255; b/=255;
  const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2;
  if(mx===mn) return [0,0,Math.round(l*100)];
  const dd=mx-mn;
  const s=l>0.5?dd/(2-mx-mn):dd/(mx+mn);
  let h;
  if(mx===r) h=((g-b)/dd+(g<b?6:0));
  else if(mx===g) h=(b-r)/dd+2;
  else h=(r-g)/dd+4;
  return [Math.round(h*60),Math.round(s*100),Math.round(l*100)];
}
function hslCss(h,s,l){ return 'hsl('+h+','+s+'%,'+l+'%)'; }

function applySkin(){
  const dark=!!state.dark;
  const c=UIP.customAccent||(dark?'#63b3ed':'#5B99E2');
  /* body.dark 里也定义了一整套同名变量，只写在 html 上会被它盖掉
     （表现为深色模式下自定义主题色 / 字体颜色不生效）。两个节点都写。 */
  const roots=[document.documentElement,document.body].filter(Boolean);
  const setV=(k,v)=>roots.forEach(x=>x.style.setProperty(k,v));
  const delV=(k)=>roots.forEach(x=>x.style.removeProperty(k));
  let r=91,g=153,b=226;
  const m=/^#([0-9a-f]{6})$/i.exec(c);
  if(m){ const n=parseInt(m[1],16); r=n>>16&255; g=n>>8&255; b=n&255; }
  setV('--accent',c);
  setV('--accent-soft','rgba('+r+','+g+','+b+','+(dark?.2:.15)+')');
  setV('--hover','rgba('+r+','+g+','+b+','+(dark?.16:.13)+')');
  /* 主题色很浅时，纯色主题底上的白字会看不清 → 自动换成深色文字。
     这只是对比度兜底，不是「文字跟着主题色染色」：文字色相始终由字体颜色决定。 */
  const bright=(r*299+g*587+b*114)/1000;
  setV('--on-accent',bright>150?(dark?'#101a2b':'#1e2738'):'#ffffff');
  /* 自定义字体颜色：正文 / 次要 / 弱化按同一色相派生，
     --ink / --ink2 同步取同一套值，供按钮、徽标、链接、选中态使用。
     主题色（--accent）完全不参与任何文字颜色的计算。 */
  const tm=/^#([0-9a-f]{6})$/i.exec(UIP.customText||'');
  if(tm){
    const tn=parseInt(tm[1],16);
    const [th,ts,tl]=rgbHsl(tn>>16&255,tn>>8&255,tn&255);
    /* 亮度封顶：浅色模式下正文 ≤28%、次要 ≤36%、弱化 ≤44%，
       深色模式下分别 ≥86% / ≥76% / ≥68%，保证浅背景 / 深背景都读得清。 */
    let v1,v2,v3;
    if(dark){
      v1=hslCss(th,ts,Math.max(86,tl));
      v2=hslCss(th,Math.max(0,ts-6),Math.min(94,Math.max(76,tl+8)));
      v3=hslCss(th,Math.max(0,ts-12),Math.min(96,Math.max(68,tl+16)));
    }else{
      v1=hslCss(th,ts,Math.min(28,tl));
      v2=hslCss(th,Math.max(0,ts-8),Math.min(36,Math.max(24,tl-8)));
      v3=hslCss(th,Math.max(0,ts-14),Math.min(44,Math.max(32,tl-16)));
    }
    setV('--text',v1); setV('--text2',v2); setV('--text3',v3);
    setV('--ink',v1);  setV('--ink2',v2);
  }else{
    ['--text','--text2','--text3','--ink','--ink2'].forEach(delV);
  }
  /* 整套配色随主题色染色：背景 / 卡片 / 阴影都向主题色偏移。
     只变色相、不动明暗结构——拟物风格的立体感依赖「元素与底色近等的亮度」，
     所以这里做的是「往中性色里掺主题色」，而不是直接把底色换成主题色。 */
  const tint=(br,bg,bb,t)=>'rgb('+Math.round(br+(r-br)*t)+','+Math.round(bg+(g-bg)*t)+','+Math.round(bb+(b-bb)*t)+')';
  if(dark){
    setV('--bg1',tint(31,42,64,.12));
    setV('--bg2',tint(22,33,62,.16));
    setV('--el1',tint(22,33,62,.16));
    setV('--el2',tint(31,42,64,.12));
    setV('--sh-dark','rgba(4,8,18,.55)');
    setV('--sh-light','rgba('+tint(58,74,118,.4).slice(4,-1)+',.5)');
  }else{
    setV('--bg1',tint(245,247,250,.10));
    setV('--bg2',tint(228,234,245,.14));
    setV('--el1',tint(228,234,245,.14));
    setV('--el2',tint(245,247,250,.10));
    setV('--sh-dark','rgba('+tint(174,190,212,.35).slice(4,-1)+',.4)');
    setV('--sh-light','rgba(255,255,255,.9)');
  }
  try{ document.body.style.zoom=UIP.scale||1; }catch(e){}
}

