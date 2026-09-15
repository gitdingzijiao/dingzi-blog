/**
 * DingLang 执行器（Web Worker）
 *
 * 两个职责：
 *   ① 在 Worker 里跑代码 —— 用户在编辑器里写 `while true {}` 不会卡死页面
 *   ② 接上文件系统 —— 桌面版有本地文件 API，浏览器版没有
 *
 * ⚠️ 这里踩过一个坑：
 *    原来 __host 写死成空对象，结果桌面版里调用 读文件() 也报
 *    「浏览器里不可用」—— 明明 Python 那边的文件 API 是好的。
 *
 * 难点：DingLang 的文件函数是【同步】的，而 fetch 是异步的。
 *      所以这里用同步 XMLHttpRequest（Worker 里允许，本地服务延迟极低）。
 */
'use strict';

importScripts('compiler.js');

// ── 同步请求本地文件 API ──
function syncJSON(method, path, body) {
  var x = new XMLHttpRequest();
  x.open(method, path, false);            // false = 同步
  if (body !== undefined) x.setRequestHeader('Content-Type', 'application/json');
  x.send(body === undefined ? null : JSON.stringify(body));
  if (x.status < 200 || x.status >= 300) {
    var msg = 'API 错误 ' + x.status;
    try { msg = JSON.parse(x.responseText).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return JSON.parse(x.responseText);
}

/** 探测桌面版文件 API 是否可用 */
function hasFileAPI() {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', '/api/cwd', false);
    x.send();
    return x.status === 200;
  } catch (e) {
    return false;
  }
}

/** 用本地文件 API 造一个 __host（桌面版）*/
function makeFileHost() {
  return {
    argv: [],
    readFile: function (p) {
      return syncJSON('GET', '/api/read?path=' + encodeURIComponent(p)).content;
    },
    readLines: function (p) {
      return syncJSON('GET', '/api/read?path=' + encodeURIComponent(p)).content.split('\n');
    },
    writeFile: function (p, s) {
      syncJSON('POST', '/api/write', { path: p, content: s });
      return true;
    },
    appendFile: function (p, s) {
      // 桌面版 API 只有覆盖写，所以先读再写
      var old = '';
      try { old = syncJSON('GET', '/api/read?path=' + encodeURIComponent(p)).content; } catch (e) { old = ''; }
      syncJSON('POST', '/api/write', { path: p, content: old + s });
      return true;
    },
    exists: function (p) {
      try {
        syncJSON('GET', '/api/read?path=' + encodeURIComponent(p));
        return true;
      } catch (e) {
        // 可能是目录
        try {
          syncJSON('GET', '/api/list?path=' + encodeURIComponent(p));
          return true;
        } catch (e2) { return false; }
      }
    },
    remove: function (p) {
      syncJSON('POST', '/api/delete', { path: p });
      return true;
    },
    listDir: function (p) {
      var d = syncJSON('GET', '/api/list?path=' + encodeURIComponent(p));
      return d.entries.map(function (e) { return e.name; });
    },
  };
}

// 缓存探测结果，避免每次都发请求
var FS_AVAILABLE = null;

self.onmessage = function (e) {
  var src = e.data.src;
  var id = e.data.id;
  var argv = e.data.argv || [];
  var code = null;

  // ── ① 编译 ──
  try {
    code = DingLang.compile(src, '<网页编辑器>').code;
  } catch (err) {
    var d = err.dingError;
    self.postMessage({
      id: id, phase: 'compile', ok: false,
      error: { message: err.message, line: d ? d.line : null, col: d ? d.col : null },
    });
    return;
  }

  // ── ② 准备运行环境 ──
  if (FS_AVAILABLE === null) FS_AVAILABLE = hasFileAPI();
  var host = FS_AVAILABLE ? makeFileHost() : { argv: [] };
  if (argv.length) host.argv = argv;

  var output = [];
  try {
    var fn = new Function(
      '__quiet', '__host',
      DingLang.PRELUDE + '\n' + code + '\nreturn __out;'
    );
    output = fn(true, host) || [];
  } catch (err) {
    var msg = String((err && err.message) || err);
    // 文件相关的报错 —— 给出可操作的提示
    if (/需要文件系统/.test(msg)) {
      var fnName = msg.split(' ')[0];
      var hint = FS_AVAILABLE
        ? '文件操作失败：' + msg
        : '「' + fnName + '」需要读写本地文件，浏览器里做不到。\n\n' +
          '三个办法：\n' +
          '  ① 用桌面版：双击 DingLang\\桌面版.bat，那里能读写本地文件\n' +
          '  ② 用命令行：ding run 你的程序.ding -- 文件.txt\n' +
          '  ③ 换成「藏文文本分析」示例 —— 那个把文本内嵌在代码里，浏览器直接能跑';
      msg = hint;
    }
    self.postMessage({
      id: id, phase: 'runtime', ok: false, code: code, output: output,
      error: { message: msg, line: null, col: null },
    });
    return;
  }

  self.postMessage({ id: id, phase: 'done', ok: true, code: code, output: output });
};
