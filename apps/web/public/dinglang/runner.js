/**
 * DingLang 执行器（Web Worker）
 *
 * 为什么放 Worker 里？
 *   用户在编辑器里写 `while true {}` 是很容易发生的事。
 *   如果在主线程执行，整个页面会直接卡死，连"停止"都点不了。
 *   放进 Worker 后，主线程可以随时 terminate() 掉它。
 */
'use strict';

importScripts('compiler.js');

self.onmessage = function (e) {
  var src = e.data.src;
  var id = e.data.id;
  var code = null;

  // ── ① 编译 ──
  try {
    code = DingLang.compile(src, '<网页编辑器>').code;
  } catch (err) {
    var d = err.dingError;
    self.postMessage({
      id: id,
      phase: 'compile',
      ok: false,
      error: {
        message: err.message,
        line: d ? d.line : null,
        col: d ? d.col : null,
      },
    });
    return;
  }

  // ── ② 执行 ──
  // __quiet 传 true：print 只往 __out 里攒，不调 console.log
  // __host 传空对象：浏览器没有文件系统，调用文件函数会给出友好报错
  var output = [];
  try {
    var fn = new Function(
      '__quiet', '__host',
      DingLang.PRELUDE + '\n' + code + '\nreturn __out;'
    );
    output = fn(true, { argv: [] }) || [];
  } catch (err) {
    self.postMessage({
      id: id,
      phase: 'runtime',
      ok: false,
      code: code,
      output: output,
      error: { message: String(err && err.message || err), line: null, col: null },
    });
    return;
  }

  self.postMessage({ id: id, phase: 'done', ok: true, code: code, output: output });
};
