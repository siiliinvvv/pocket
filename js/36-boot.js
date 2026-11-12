/* ============================================================
   Pocket · 启动
   初始化：应用外观、首屏渲染、回收站清理、云端轮询
   ------------------------------------------------------------
   由原单文件版按功能切片而来，模块之间通过全局函数 / 常量互调，
   因此 js/ 下脚本的加载顺序不能改动。
   ============================================================ */
'use strict';
/* ================= 启动 ================= */
if(SHARED) document.body.classList.add('shared');
applyDark();
renderAll();
renderSyncLine();
autoPurgeTrash();
renderTrashCount();
setTimeout(()=>{ backfillPlain(); },1800);   /* 给老文档补建正文索引 */
/* 云端轮询：多端改动自动落下来 */
startGhPoll();
if(ghReady()&&state.gh.autoSync) setTimeout(()=>{ ghMergeIfChanged(); },2500);
