/* ============================================================
   Pocket · 全局配置
   严格模式、分享快照模式标记、页面源码快照（供导出分享版使用）
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 分享快照模式 ================= */
const SHARED=!!window.__BOX_SHARED__;
const SHARE_ASSETS=window.__BOX_ASSETS__||{};
const BOX_HIDE=!!window.__BOX_HIDE__;   /* 分享版隐私模式：只展示结构，不展示内容 */
/* 第二十五批：分享链接「不包含分享数据」——URL 带 ?nodata=1 或空白分享版注入
   __BOX_NODATA__ 时，跳过站点种子并改用独立 localStorage 空间，
   避免同域下和本人数据串在一起。 */
const NO_DATA=!!(window.__BOX_NODATA__||
  (function(){ try{ return new URLSearchParams(location.search).get('nodata')==='1'; }catch(e){ return false; } })());
/* 第二十三批：随站点分发的初始数据（首次访问自动载入，含用户上传的文件）。
   只在 index.html 判断「本机无数据」时才会加载这个脚本，已有数据不会覆盖。 */
const SEED=window.__BOX_SEED__||null;
const SEED_ASSETS=(SEED&&SEED.assets)||{};
const SEED_STATE=(SEED&&SEED.state)||null;
/* 捕获当前文档源码快照（此刻 DOM 尚未被 JS 渲染改动），用于「生成分享版 HTML」 */
/* 模块化版注意：快照里的样式/脚本是 <link> 与 <script src> 外链，
   导出分享版时由 js/27-share-export.js 的 inlineAssets() 内联回单文件。 */
const SRC_HTML='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
