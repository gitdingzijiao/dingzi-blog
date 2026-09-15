/**
 * DingLang 语法高亮
 *
 * 为什么不用现成的 lexer？
 *   编辑器里随时可能是"写到一半"的代码（括号没闭合、字符串没结束），
 *   真正的 lexer 会直接抛错。所以这里写一个"宽容版"扫描器：
 *   遇到不认识的东西就当普通文本，绝不抛错。
 */
'use strict';

(function (global) {
  var KW = new Set(['let', 'fn', 'if', 'else', 'for', 'in', 'while',
    'return', 'true', 'false', 'break', 'continue']);

  // 内置函数（含藏文别名）
  var BUILTIN = new Set(['print', 'len', 'str', 'num',
    '藏文数字', 'བོད་ཨང', 'བོད_ཨང', 'པར']);

  // Unicode：字母 / 组合记号 / 十进制数字 / tsheg
  var RE_L = /\p{L}/u;
  var RE_M = /\p{M}/u;
  var RE_ND = /\p{Nd}/u;
  var TSHEG = '\u0F0B';

  function isIdStart(c) { return RE_L.test(c) || c === '_' || c === '$'; }
  function isIdCont(c) { return RE_L.test(c) || RE_M.test(c) || RE_ND.test(c) || c === '_' || c === '$' || c === TSHEG; }
  function isDigit(c) { return RE_ND.test(c); }

  function esc(s) {
    return s.replace(/[&<>]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m];
    });
  }

  var SPAN = {
    com: 'c-com',   // 注释
    str: 'c-str',   // 字符串
    num: 'c-num',   // 数字
    kw: 'c-kw',     // 关键字
    bi: 'c-bi',     // 内置函数
    op: 'c-op',     // 运算符
    pun: 'c-pun',   // 括号标点
    id: 'c-id',     // 标识符
  };
  function span(cls, text) { return '<span class="' + cls + '">' + esc(text) + '</span>'; }

  var OPERATORS = ['..=', '==', '!=', '<=', '>=', '&&', '||', '..',
    '+', '-', '*', '/', '%', '<', '>', '=', '!'];
  var PUNCT = '(){}[],:;.';

  /** 高亮一段字符串的内部（把 {表达式} 掏出来递归高亮） */
  function highlightStringBody(body) {
    var out = '', i = 0;
    while (i < body.length) {
      var open = body.indexOf('{', i);
      if (open < 0) { out += esc(body.slice(i)); break; }
      out += esc(body.slice(i, open));
      // 找配对的 }
      var depth = 1, j = open + 1;
      while (j < body.length) {
        if (body[j] === '{') depth++;
        else if (body[j] === '}') { depth--; if (depth === 0) break; }
        j++;
      }
      out += span(SPAN.pun, '{') + highlight(body.slice(open + 1, Math.min(j, body.length))) +
        (j < body.length ? span(SPAN.pun, '}') : '');
      i = j + 1;
    }
    return out;
  }

  /** 主函数：源码 → 高亮后的 HTML */
  function highlight(src) {
    var out = '', i = 0, n = src.length;

    while (i < n) {
      var c = src[i];

      // ── 注释：# 到行尾 ──
      if (c === '#') {
        var e1 = src.indexOf('\n', i);
        if (e1 < 0) e1 = n;
        out += span(SPAN.com, src.slice(i, e1));
        i = e1;
        continue;
      }

      // ── 字符串：支持未闭合（写到一半）──
      if (c === '"' || c === "'") {
        var q = c, j = i + 1, body = '';
        while (j < n && src[j] !== q) {
          if (src[j] === '\\') { body += src.slice(j, j + 2); j += 2; continue; }
          if (src[j] === '\n') break;   // 字符串不能跨行
          body += src[j]; j++;
        }
        var closed = j < n && src[j] === q;
        out += span(SPAN.str, q) + '<span class="' + SPAN.str + '">' +
          highlightStringBody(body) + '</span>' + (closed ? span(SPAN.str, q) : '');
        i = closed ? j + 1 : j;
        continue;
      }

      // ── 数字（含藏文 ༠-༩ 及其他文字的数字）──
      if (isDigit(c)) {
        var k = i;
        while (k < n && isDigit(src[k])) k++;
        if (src[k] === '.' && src[k + 1] !== '.' && isDigit(src[k + 1] || '')) {
          k++;
          while (k < n && isDigit(src[k])) k++;
        }
        out += span(SPAN.num, src.slice(i, k));
        i = k;
        continue;
      }

      // ── 标识符 / 关键字（含中文、藏文）──
      if (isIdStart(c)) {
        var m = i;
        while (m < n && isIdCont(src[m])) m++;
        var word = src.slice(i, m);
        if (KW.has(word)) out += span(SPAN.kw, word);
        else if (BUILTIN.has(word)) out += span(SPAN.bi, word);
        else out += span(SPAN.id, word);
        i = m;
        continue;
      }

      // ── 运算符 ──
      var hit = null;
      for (var o = 0; o < OPERATORS.length; o++) {
        if (src.startsWith(OPERATORS[o], i)) { hit = OPERATORS[o]; break; }
      }
      if (hit) { out += span(SPAN.op, hit); i += hit.length; continue; }

      // ── 括号标点 ──
      if (PUNCT.indexOf(c) >= 0) { out += span(SPAN.pun, c); i++; continue; }

      // ── 空白和其他 ──
      out += esc(c);
      i++;
    }

    // 末尾多补一个换行，保证 pre 和 textarea 高度一致
    if (src.endsWith('\n')) out += '\n';
    return out;
  }

  global.DingHighlight = { highlight: highlight };
})(typeof window !== 'undefined' ? window : globalThis);
