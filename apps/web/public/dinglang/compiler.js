/**
 * DingLang 浏览器版编译器 —— 自动生成，请勿直接编辑
 * 源文件: src/lexer.js src/parser.js src/checker.js src/codegen.js
 * 重新生成: node build-web.js
 */
(function (global) {
  'use strict';

  var __modules = {};
  var __cache = {};

  function __define(name, fn) { __modules[name] = fn; }

  function __require(name) {
    // 统一路径写法：'./lexer' 和 'lexer' 等价
    var key = name.replace(/^\.\//, './');
    if (__cache[key]) return __cache[key].exports;
    if (!__modules[key]) throw new Error('模块不存在: ' + name);
    var module = { exports: {} };
    __cache[key] = module;
    __modules[key](module, module.exports, __require);
    return module.exports;
  }

// ─── src/lexer.js ───────────────────────────────────────
__define("./lexer", function (module, exports, require) {
/**
 * DingLang 词法分析器（Lexer）
 * ------------------------------------------------------------
 * 把源码字符串切成 token 列表。
 *
 * 特色：原生支持 Unicode 标识符
 *   ✅ 中文   名字
 *   ✅ 藏文   བོད་ཡིག      ← 注意 tsheg 音节点，JS 里不合法，我们额外放行
 *   ✅ 日文   なまえ
 *   ✅ 韩文   이름
 *   ✗ emoji   🎉
 */

// ── Unicode 标识符规则 ──
// \p{ID_Start} / \p{ID_Continue} 是 Unicode 标准里"能当标识符"的属性
// 中文、藏文辅音字母、日文假名、韩文…… 都天然满足
const ID_START = /[\p{ID_Start}_$]/u;
const ID_CONT = /[\p{ID_Continue}$\u200C\u200D]/u;

// ★ 额外放行藏文音节点 tsheg（U+0F0B）
//   藏文里 ་ 是分隔音节的，比如 བོད་ཡིག = "藏文"
//   但它不是 ID_Continue，所以标准 JS 不接受。我们自己的语言收下它。
const TIBETAN_TSHEG = '\u0F0B';

function isIdStart(ch) {
  return ch !== undefined && ID_START.test(ch);
}
function isIdCont(ch) {
  return ch !== undefined && (ID_CONT.test(ch) || ch === TIBETAN_TSHEG);
}

// ── 关键字（英文，避免和中文标识符混淆）──
const KEYWORDS = new Set([
  'let', 'fn', 'if', 'else', 'for', 'in', 'while',
  'return', 'true', 'false', 'break', 'continue',
]);

// ── 运算符和符号 ──
// 按长度从长到短排，保证 `..=` 优先于 `..` 优先于 `.`
const SYMBOLS = [
  '..=', '==', '!=', '<=', '>=', '&&', '||', '..',
  '+', '-', '*', '/', '%',
  '<', '>', '=', '!',
  '(', ')', '{', '}', '[', ']',
  ',', ':', ';', '.',
];

/**
 * 把源码切成 token
 * @param {string} src 源码
 * @param {string} file 文件名（报错用）
 * @returns {Array<{type, value, line, col}>}
 */
function tokenize(src, file = '<输入>') {
  const tokens = [];
  let pos = 0;
  let line = 1;
  let col = 1;

  // 记录换行，方便报错定位
  const advance = (n = 1) => {
    for (let i = 0; i < n; i++) {
      if (src[pos] === '\n') { line++; col = 1; }
      else { col++; }
      pos++;
    }
  };

  const peek = (offset = 0) => src[pos + offset];
  const atEnd = () => pos >= src.length;

  const push = (type, value, l = line, c = col) => {
    tokens.push({ type, value, line: l, col: c });
  };

  const error = (msg, l = line, c = col) => {
    const e = new Error(msg);
    e.dingError = { message: msg, line: l, col: c, file };
    throw e;
  };

  while (!atEnd()) {
    const ch = peek();

    // ── 空白（含 BOM）──
    // U+FEFF 是字节序标记，Windows 记事本/PowerShell 存 UTF-8 时会加在开头。
    // 编程语言应该忽略它，否则用户会遇到莫名其妙的"无法识别的字符"。
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\uFEFF') {
      advance();
      continue;
    }

    // ── 注释：# 到行尾 ──
    if (ch === '#') {
      while (!atEnd() && peek() !== '\n') advance();
      continue;
    }

    // ── 数字 ──
    if (ch >= '0' && ch <= '9') {
      const startLine = line, startCol = col;
      let value = '';
      while (!atEnd() && peek() >= '0' && peek() <= '9') {
        value += peek();
        advance();
      }
      // 小数点（不能和范围运算符 .. 冲突）
      if (peek() === '.' && peek(1) !== '.' && peek(1) >= '0' && peek(1) <= '9') {
        value += '.';
        advance();
        while (!atEnd() && peek() >= '0' && peek() <= '9') {
          value += peek();
          advance();
        }
      }
      push('number', value, startLine, startCol);
      // 数字后面直接跟标识符字符 → 报错（let 1abc 是常见笔误）
      if (isIdStart(peek()) || isIdCont(peek())) {
        error(`数字后面不能直接跟字符 "${peek()}"，是不是想写 "${value} ${peek()}"？`, line, col);
      }
      continue;
    }

    // ── 字符串（支持 {表达式} 插值）──
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const startLine = line, startCol = col;
      advance(); // 跳过开引号

      const parts = [];      // 插值后的片段：字符串 或 {expr: 源码}
      let buf = '';

      while (!atEnd() && peek() !== quote) {
        if (peek() === '\\') {
          // 转义
          advance();
          const e = peek();
          const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", '{': '{', '}': '}' };
          buf += map[e] !== undefined ? map[e] : e;
          advance();
          continue;
        }
        if (peek() === '{') {
          // 插值开始
          if (buf) { parts.push({ kind: 'text', value: buf }); buf = ''; }
          advance();
          let depth = 1;
          let expr = '';
          while (!atEnd() && depth > 0) {
            const c2 = peek();
            if (c2 === '{') depth++;
            else if (c2 === '}') { depth--; if (depth === 0) break; }
            expr += c2;
            advance();
          }
          if (depth !== 0) error('字符串插值缺少 }', startLine, startCol);
          advance(); // 跳过 }
          parts.push({ kind: 'expr', value: expr.trim() });
          continue;
        }
        if (peek() === '\n') error('字符串不能跨行（用 \\n 表示换行）', startLine, startCol);
        buf += peek();
        advance();
      }

      if (atEnd()) error('字符串没有闭合的引号', startLine, startCol);
      advance(); // 跳过闭引号
      if (buf) parts.push({ kind: 'text', value: buf });

      // 没有插值 → 普通字符串；有插值 → 插值字符串
      const hasExpr = parts.some((p) => p.kind === 'expr');
      push(hasExpr ? 'interp' : 'string', hasExpr ? parts : parts.map((p) => p.value).join(''), startLine, startCol);
      continue;
    }

    // ── 标识符 / 关键字（含中文、藏文……）──
    if (isIdStart(ch)) {
      const startLine = line, startCol = col;
      let value = '';
      while (!atEnd() && isIdCont(peek())) {
        value += peek();
        advance();
      }
      push(KEYWORDS.has(value) ? 'keyword' : 'name', value, startLine, startCol);
      continue;
    }

    // ── 符号 / 运算符 ──
    let matched = null;
    for (const sym of SYMBOLS) {
      if (src.startsWith(sym, pos)) { matched = sym; break; }
    }
    if (matched) {
      push('symbol', matched);
      advance(matched.length);
      continue;
    }

    // ── 认不出来 ──
    const code = ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    error(`无法识别的字符 "${ch}" (U+${code})`);
  }

  push('eof', null);
  return tokens;
}

module.exports = { tokenize, isIdStart, isIdCont, KEYWORDS, SYMBOLS, TIBETAN_TSHEG };

});

// ─── src/parser.js ───────────────────────────────────────
__define("./parser", function (module, exports, require) {
/**
 * DingLang 语法分析器（Parser）
 * ------------------------------------------------------------
 * 把 token 列表变成语法树（AST）。
 *
 * 采用「递归下降 + 运算符优先级」的经典写法：
 *   每一层函数只负责一种优先级，层层往下调用。
 *
 * 优先级（从低到高）：
 *   赋值  =            右结合
 *   逻辑或 ||
 *   逻辑与 &&
 *   相等  == !=
 *   比较  < > <= >=
 *   范围  .. ..=
 *   加减  + -
 *   乘除  * / %
 *   一元  ! -
 *   后缀  () [] .
 *   原子  数字/字符串/名字/括号/列表/if
 */

const { tokenize } = require('./lexer');

/**
 * 字符串插值里的表达式要单独解析。
 * 不能直接调 parse()——那返回的是整个 Program 节点，
 * 所以用一个包装技巧把它取出来。
 */
function parseInterpExpr(src, file) {
  const trimmed = src.trim();
  if (!trimmed) {
    const e = new Error('字符串插值 { } 里是空的');
    e.dingError = { message: e.message, line: 1, col: 1, file };
    throw e;
  }
  const ast = parse(`let __插值__ = ${trimmed}`, `${file}(字符串插值)`);
  return ast.body[0].value;
}

function parse(src, file = '<输入>') {
  const tokens = tokenize(src, file);
  let pos = 0;

  const peek = (o = 0) => tokens[pos + o];
  const cur = () => tokens[pos];
  const atEnd = () => cur().type === 'eof';

  const next = () => tokens[pos++];

  const error = (msg, tok = cur()) => {
    const e = new Error(msg);
    e.dingError = { message: msg, line: tok.line, col: tok.col, file };
    throw e;
  };

  // 断言当前 token 是某个值，是就吃掉，否则报错
  const expect = (value, hint) => {
    if (cur().type === 'symbol' && cur().value === value) return next();
    if (cur().type === 'keyword' && cur().value === value) return next();
    error(`期望 "${value}"${hint ? `（${hint}）` : ''}，但看到的是 ${describe(cur())}`);
  };

  const isSym = (v) => cur().type === 'symbol' && cur().value === v;
  const isKw = (v) => cur().type === 'keyword' && cur().value === v;

  const eatSym = (v) => { if (isSym(v)) { next(); return true; } return false; };
  const eatKw = (v) => { if (isKw(v)) { next(); return true; } return false; };

  function describe(t) {
    if (t.type === 'eof') return '文件结尾';
    if (t.type === 'number') return `数字 ${t.value}`;
    if (t.type === 'string') return `字符串 ${JSON.stringify(t.value)}`;
    if (t.type === 'name') return `标识符 "${t.value}"`;
    return `"${t.value}"`;
  }

  // ─────────────────────────────────────────────
  // 语句
  // ─────────────────────────────────────────────

  function parseProgram() {
    const body = [];
    while (!atEnd()) body.push(parseStatement());
    return { type: 'Program', body, line: 1, col: 1 };
  }

  function parseStatement() {
    if (isKw('let')) return parseLet();
    if (isKw('fn')) return parseFnDecl();
    if (isKw('return')) return parseReturn();
    if (isKw('break')) { const t = next(); return { type: 'BreakStmt', line: t.line, col: t.col }; }
    if (isKw('continue')) { const t = next(); return { type: 'ContinueStmt', line: t.line, col: t.col }; }
    if (isKw('for')) return parseFor();
    if (isKw('while')) return parseWhile();
    if (isSym('{')) return parseBlock();

    // 其余按表达式处理
    const t = cur();
    const expr = parseExpression();
    return { type: 'ExprStmt', expr, line: t.line, col: t.col };
  }

  function parseLet() {
    const t = next(); // let
    if (cur().type !== 'name') error(`let 后面要跟变量名，但看到的是 ${describe(cur())}`);
    const name = next().value;
    expect('=', 'let 语句需要初始值');
    const value = parseExpression();
    return { type: 'LetStmt', name, value, line: t.line, col: t.col };
  }

  function parseFnDecl() {
    const t = next(); // fn
    if (cur().type !== 'name') error(`fn 后面要跟函数名，但看到的是 ${describe(cur())}`);
    const name = next().value;
    expect('(', '函数参数列表');
    const params = [];
    while (!isSym(')')) {
      if (cur().type !== 'name') error(`参数必须是标识符，但看到的是 ${describe(cur())}`);
      params.push(next().value);
      if (!eatSym(',')) break;
    }
    expect(')');

    // 两种写法：fn f(x) = 表达式   |   fn f(x) { 语句块 }
    if (eatSym('=')) {
      const body = parseExpression();
      return { type: 'FnDecl', name, params, body, exprBody: true, line: t.line, col: t.col };
    }
    if (isSym('{')) {
      const body = parseBlock();
      return { type: 'FnDecl', name, params, body, exprBody: false, line: t.line, col: t.col };
    }
    error('函数体要么是 "= 表达式"，要么是 "{ ... }"');
  }

  function parseReturn() {
    const t = next();
    if (isSym('}') || atEnd() || isSym(';')) return { type: 'ReturnStmt', value: null, line: t.line, col: t.col };
    const value = parseExpression();
    return { type: 'ReturnStmt', value, line: t.line, col: t.col };
  }

  function parseFor() {
    const t = next(); // for
    if (cur().type !== 'name') error(`for 后面要跟循环变量名，但看到的是 ${describe(cur())}`);
    const varName = next().value;
    if (!eatKw('in')) error('for 循环要写成 "for x in 范围 { ... }"');
    const iterable = parseExpression();
    const body = parseBlock('for 循环体');
    return { type: 'ForStmt', varName, iterable, body, line: t.line, col: t.col };
  }

  function parseWhile() {
    const t = next();
    const cond = parseExpression();
    const body = parseBlock('while 循环体');
    return { type: 'WhileStmt', cond, body, line: t.line, col: t.col };
  }

  function parseBlock(what = '代码块') {
    const t = cur();
    expect('{', what);
    const body = [];
    while (!isSym('}')) {
      if (atEnd()) error(`${what} 缺少闭合的 "}"`, t);
      body.push(parseStatement());
    }
    expect('}');
    return { type: 'Block', body, line: t.line, col: t.col };
  }

  // ─────────────────────────────────────────────
  // 表达式（按优先级从低到高）
  // ─────────────────────────────────────────────

  function parseExpression() {
    return parseAssign();
  }

  function parseAssign() {
    const left = parseOr();
    if (isSym('=')) {
      const t = next();
      if (left.type !== 'Name' && left.type !== 'Index') {
        error('赋值左边必须是变量或列表元素', t);
      }
      const value = parseAssign(); // 右结合
      return { type: 'Assign', target: left, value, line: t.line, col: t.col };
    }
    return left;
  }

  function binaryLevel(nextLevel, ops) {
    return () => {
      let left = nextLevel();
      while (cur().type === 'symbol' && ops.includes(cur().value)) {
        const t = next();
        const right = nextLevel();
        left = { type: 'Binary', op: t.value, left, right, line: t.line, col: t.col };
      }
      return left;
    };
  }

  const parseOr = binaryLevel(() => parseAnd(), ['||']);
  const parseAnd = binaryLevel(() => parseEquality(), ['&&']);
  const parseEquality = binaryLevel(() => parseComparison(), ['==', '!=']);
  const parseComparison = binaryLevel(() => parseRange(), ['<', '>', '<=', '>=']);
  const parseAdditive = binaryLevel(() => parseMultiplicative(), ['+', '-']);
  const parseMultiplicative = binaryLevel(() => parseUnary(), ['*', '/', '%']);

  function parseRange() {
    const left = parseAdditive();
    if (isSym('..') || isSym('..=')) {
      const t = next();
      const right = parseAdditive();
      return { type: 'Range', start: left, end: right, inclusive: t.value === '..=', line: t.line, col: t.col };
    }
    return left;
  }

  function parseUnary() {
    if (isSym('!') || isSym('-')) {
      const t = next();
      const operand = parseUnary();
      return { type: 'Unary', op: t.value, operand, line: t.line, col: t.col };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let node = parsePrimary();
    while (true) {
      if (isSym('(')) {
        const t = next();
        const args = [];
        while (!isSym(')')) {
          args.push(parseExpression());
          if (!eatSym(',')) break;
        }
        expect(')', '函数调用的参数列表');
        node = { type: 'Call', callee: node, args, line: t.line, col: t.col };
      } else if (isSym('[')) {
        const t = next();
        const index = parseExpression();
        expect(']', '索引');
        node = { type: 'Index', object: node, index, line: t.line, col: t.col };
      } else {
        break;
      }
    }
    return node;
  }

  function parsePrimary() {
    const t = cur();

    if (t.type === 'number') {
      next();
      return { type: 'NumberLit', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'string') {
      next();
      return { type: 'StringLit', value: t.value, line: t.line, col: t.col };
    }
    if (t.type === 'interp') {
      next();
      const parts = t.value.map((p) => p.kind === 'text'
        ? { kind: 'text', value: p.value }
        : { kind: 'expr', expr: parseInterpExpr(p.value, file) });
      return { type: 'InterpString', parts, line: t.line, col: t.col };
    }
    if (t.type === 'name') {
      next();
      return { type: 'Name', name: t.value, line: t.line, col: t.col };
    }
    if (isKw('true') || isKw('false')) {
      next();
      return { type: 'BoolLit', value: t.value === 'true', line: t.line, col: t.col };
    }
    if (isSym('(')) {
      next();
      const expr = parseExpression();
      expect(')', '括号表达式');
      return expr;
    }
    if (isSym('[')) {
      next();
      const items = [];
      while (!isSym(']')) {
        items.push(parseExpression());
        if (!eatSym(',')) break;
      }
      expect(']', '列表');
      return { type: 'ListLit', items, line: t.line, col: t.col };
    }
    if (isKw('if')) {
      return parseIf();
    }
    if (isKw('fn')) {
      return parseFnExpr();
    }

    error(`这里期望一个表达式，但看到的是 ${describe(t)}`);
  }

  function parseIf() {
    const t = next(); // if
    const cond = parseExpression();
    const then = parseBlock('if 分支');
    let alt = null;
    if (eatKw('else')) {
      alt = isKw('if') ? parseIf() : parseBlock('else 分支');
    }
    return { type: 'IfExpr', cond, then, else: alt, line: t.line, col: t.col };
  }

  function parseFnExpr() {
    const t = next(); // fn
    expect('(', '匿名函数参数列表');
    const params = [];
    while (!isSym(')')) {
      if (cur().type !== 'name') error(`参数必须是标识符，但看到的是 ${describe(cur())}`);
      params.push(next().value);
      if (!eatSym(',')) break;
    }
    expect(')');
    if (eatSym('=')) {
      return { type: 'FnExpr', params, body: parseExpression(), exprBody: true, line: t.line, col: t.col };
    }
    return { type: 'FnExpr', params, body: parseBlock('匿名函数体'), exprBody: false, line: t.line, col: t.col };
  }

  const ast = parseProgram();
  return ast;
}

module.exports = { parse };

});

// ─── src/checker.js ───────────────────────────────────────
__define("./checker", function (module, exports, require) {
/**
 * DingLang 语义检查器（Checker）
 * ------------------------------------------------------------
 * 语法对了不代表程序是对的。这一步抓的是「语法没错但逻辑有问题」的情况：
 *
 *   1. 改名冲突 —— 两个变量名只差 tsheg/下划线，生成 JS 后会撞车
 *   2. 参数重名 —— fn f(a, a)
 *   3. break/continue 不在循环里
 *   4. return 不在函数里
 */

const { mangle } = require('./codegen');

const TSHEG = '\u0F0B';

/** 收集 AST 里所有出现过的名字（变量、参数、函数名） */
function collectNames(ast) {
  const names = new Map(); // 名字 → 首次出现的位置

  const visitExpr = (n) => {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'LetStmt':
        if (!names.has(n.name)) names.set(n.name, { line: n.line, col: n.col });
        visitExpr(n.value);
        break;
      case 'FnDecl':
        if (!names.has(n.name)) names.set(n.name, { line: n.line, col: n.col });
        n.params.forEach((p) => { if (!names.has(p)) names.set(p, { line: n.line, col: n.col }); });
        visitExpr(n.body);
        break;
      case 'FnExpr':
        n.params.forEach((p) => { if (!names.has(p)) names.set(p, { line: n.line, col: n.col }); });
        visitExpr(n.body);
        break;
      case 'Name':
        if (!names.has(n.name)) names.set(n.name, { line: n.line, col: n.col });
        break;
      case 'Assign':
        if (n.target.type === 'Name' && !names.has(n.target.name)) names.set(n.target.name, { line: n.line, col: n.col });
        visitExpr(n.value);
        break;
      case 'Block':
      case 'Program':
        n.body.forEach(visitExpr);
        break;
      case 'IfExpr':
        visitExpr(n.cond); visitExpr(n.then); if (n.else) visitExpr(n.else);
        break;
      case 'ForStmt':
        if (!names.has(n.varName)) names.set(n.varName, { line: n.line, col: n.col });
        visitExpr(n.iterable); visitExpr(n.body);
        break;
      case 'WhileStmt':
        visitExpr(n.cond); visitExpr(n.body);
        break;
      case 'Binary':
      case 'Range':
        visitExpr(n.left || n.start); visitExpr(n.right || n.end);
        break;
      case 'Unary': visitExpr(n.operand); break;
      case 'Call': visitExpr(n.callee); n.args.forEach(visitExpr); break;
      case 'Index': visitExpr(n.object); visitExpr(n.index); break;
      case 'ListLit': n.items.forEach(visitExpr); break;
      case 'InterpString': n.parts.forEach((p) => p.kind === 'expr' && visitExpr(p.expr)); break;
      case 'ReturnStmt': if (n.value) visitExpr(n.value); break;
      default: break;
    }
  };

  visitExpr(ast);
  return names;
}

function check(ast, file = '<输入>') {
  const errors = [];
  const warnings = [];
  const add = (list, message, line, col) => list.push({ message, line, col, file });

  // ── 1. 改名冲突 ──
  const names = collectNames(ast);
  const byMangled = new Map();
  for (const [name, loc] of names) {
    const m = mangle(name);
    if (byMangled.has(m)) {
      const prev = byMangled.get(m);
      const why = (name.includes(TSHEG) || prev.name.includes(TSHEG))
        ? '藏文音节点 ་ 在生成 JS 时会变成下划线'
        : '生成 JS 后名字相同';
      add(errors,
        `变量名冲突："${prev.name}"（第 ${prev.line} 行）和 "${name}" 生成 JS 后会撞车\n` +
        `     原因：${why}，两者都会变成 "${m}"\n` +
        `     建议：改成不同的名字`,
        loc.line, loc.col);
    } else {
      byMangled.set(m, { name, line: loc.line, col: loc.col });
    }
  }

  // ── 2. 参数重名 / 3. 控制流位置 ──
  let loopDepth = 0;
  let fnDepth = 0;

  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    switch (n.type) {
      case 'FnDecl':
      case 'FnExpr': {
        const seen = new Set();
        for (const p of n.params) {
          if (seen.has(p)) add(errors, `参数重名：函数里有多个名为 "${p}" 的参数`, n.line, n.col);
          seen.add(p);
        }
        fnDepth++;
        walk(n.body);
        fnDepth--;
        break;
      }
      case 'ForStmt':
        loopDepth++; walk(n.iterable); walk(n.body); loopDepth--;
        break;
      case 'WhileStmt':
        loopDepth++; walk(n.cond); walk(n.body); loopDepth--;
        break;
      case 'BreakStmt':
        if (loopDepth === 0) add(errors, 'break 只能用在循环里', n.line, n.col);
        break;
      case 'ContinueStmt':
        if (loopDepth === 0) add(errors, 'continue 只能用在循环里', n.line, n.col);
        break;
      case 'ReturnStmt':
        if (fnDepth === 0) add(errors, 'return 只能用在函数里', n.line, n.col);
        if (n.value) walk(n.value);
        break;
      case 'Block':
      case 'Program':
        n.body.forEach(walk);
        break;
      case 'IfExpr':
        walk(n.cond); walk(n.then); if (n.else) walk(n.else);
        break;
      case 'LetStmt': walk(n.value); break;
      case 'Assign': walk(n.target); walk(n.value); break;
      case 'Binary': walk(n.left); walk(n.right); break;
      case 'Range': walk(n.start); walk(n.end); break;
      case 'Unary': walk(n.operand); break;
      case 'Call': walk(n.callee); n.args.forEach(walk); break;
      case 'Index': walk(n.object); walk(n.index); break;
      case 'ListLit': n.items.forEach(walk); break;
      case 'InterpString': n.parts.forEach((p) => p.kind === 'expr' && walk(p.expr)); break;
      default: break;
    }
  };
  walk(ast);

  return { errors, warnings, names };
}

module.exports = { check, collectNames };

});

// ─── src/codegen.js ───────────────────────────────────────
__define("./codegen", function (module, exports, require) {
/**
 * DingLang 代码生成器（Codegen）
 * ------------------------------------------------------------
 * 把语法树变成 JavaScript 代码。
 *
 * 核心难点：藏文标识符里有 tsheg（་ U+0F0B），
 * 它在 JS 里不是合法标识符字符，所以生成代码时要改名（mangle）：
 *
 *     DingLang           JavaScript
 *     ─────────────      ─────────────
 *     བོད་ཡིག        →   བོད_ཡིག          （tsheg 换成下划线）
 *     名字            →   名字                （中文本来就合法）
 *     class           →   _class              （避开 JS 保留字）
 *
 * 前提：DingLang 里不能同时存在两个"只差 tsheg/下划线"的变量名，
 *       这一条由 checker.js 负责检查。
 */

// JS 里不能直接当变量名的保留字
// 注意：不要把 print/len 这些内置函数加进来 —— 它们本身是合法的 JS 标识符，
//      加进来会被改名成 _print，反而找不到（这个坑踩过一次）。
const JS_RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function',
  'if', 'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch',
  'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'let', 'static', 'enum', 'await', 'implements', 'package', 'protected',
  'interface', 'private', 'public', 'null', 'true', 'false',
]);

const TSHEG = '\u0F0B';

/** 把 DingLang 标识符转成合法的 JS 标识符 */
function mangle(name) {
  let m = name.split(TSHEG).join('_');
  if (JS_RESERVED.has(m)) m = '_' + m;
  return m;
}

/** DingLang 源码里的名字 → 生成的 JS 名字的对照表 */
const nameMap = new Map();

function codegen(ast) {
  nameMap.clear();

  const lines = [];
  let indent = 0;
  let rangeSeq = 0;   // 范围循环的临时变量编号（避免嵌套时撞名）
  const pad = () => '  '.repeat(indent);
  const emit = (s) => lines.push(pad() + s);

  // 记录名字映射（供调试和报告用）
  const use = (name) => {
    const m = mangle(name);
    if (!nameMap.has(name)) nameMap.set(name, m);
    return m;
  };

  // ─────────────────────────────────────────────
  // 语句
  // ─────────────────────────────────────────────
  function genStatement(node) {
    switch (node.type) {
      case 'LetStmt':
        emit(`let ${use(node.name)} = ${genExpr(node.value)};`);
        break;
      case 'FnDecl': {
        const params = node.params.map(use).join(', ');
        if (node.exprBody) {
          emit(`let ${use(node.name)} = (${params}) => ${genExpr(node.body)};`);
        } else {
          emit(`let ${use(node.name)} = (${params}) => {`);
          indent++;
          genBlockBody(node.body);
          indent--;
          emit('};');
        }
        break;
      }
      case 'ReturnStmt':
        emit(node.value ? `return ${genExpr(node.value)};` : 'return;');
        break;
      case 'BreakStmt': emit('break;'); break;
      case 'ContinueStmt': emit('continue;'); break;
      case 'ForStmt': {
        const v = use(node.varName);
        const it = node.iterable;
        if (it.type === 'Range') {
          // 范围循环直接生成 for，不建数组。
          // ⚠️ 这里踩过坑：from/to 必须只求值一次并保存到临时变量，
          //    否则条件里出现 `a ? 1 : -1 > 0 ? ...` 这种写法，
          //    会被 JS 解析成 `a ? 1 : ((-1 > 0) ? ...)`，条件恒真 → 死循环。
          const a = `__a${rangeSeq}`, b = `__b${rangeSeq}`, s = `__s${rangeSeq}`;
          rangeSeq++;
          const from = genExpr(it.start);
          const to = genExpr(it.end);
          const lo = it.inclusive ? '<=' : '<';
          const hi = it.inclusive ? '>=' : '>';
          emit(`for (let ${a} = ${from}, ${b} = ${to}, ${s} = (${b} >= ${a} ? 1 : -1), ${v} = ${a};`);
          emit(`     ${s} > 0 ? (${v} ${lo} ${b}) : (${v} ${hi} ${b});`);
          emit(`     ${v} += ${s}) {`);
        } else {
          emit(`for (const ${v} of __iter(${genExpr(it)})) {`);
        }
        indent++;
        genBlockBody(node.body);
        indent--;
        emit('}');
        break;
      }
      case 'WhileStmt':
        emit(`while (${genExpr(node.cond)}) {`);
        indent++;
        genBlockBody(node.body);
        indent--;
        emit('}');
        break;
      case 'Block':
        emit('{');
        indent++;
        genBlockBody(node);
        indent--;
        emit('}');
        break;
      case 'ExprStmt':
        // ⚠️ if 当【语句】用时，必须生成真正的 if 语句。
        //    如果包成 IIFE，里面的 return 返回的是那个箭头函数，不是外层函数，
        //    函数会"提前返回失效" —— 这个坑踩过一次。
        if (node.expr.type === 'IfExpr') {
          genIfStatement(node.expr);
        } else {
          emit(`${genExpr(node.expr)};`);
        }
        break;
      default:
        throw new Error('未知语句类型: ' + node.type);
    }
  }

  function genBlockBody(block) {
    for (const st of block.body) genStatement(st);
  }

  /** 把 if 生成为真正的语句（不是 IIFE）——这样里面的 return 才属于外层函数
   *  returnLast=true 时，把分支里最后一个表达式 return 出去（用于 IIFE 取值） */
  function genIfStatement(node, returnLast = false) {
    let cur = node;
    const branch = (b) => {
      if (!returnLast) { genBlockBody(b); return; }
      // 最后一个语句是表达式 → 变成 return
      const body = b.body;
      for (let i = 0; i < body.length; i++) {
        const st = body[i];
        if (i === body.length - 1 && st.type === 'ExprStmt') {
          emit(`return ${genExpr(st.expr)};`);
        } else {
          genStatement(st);
        }
      }
      if (!body.length || body[body.length - 1].type !== 'ExprStmt') emit('return null;');
    };
    emit(`if (${genExpr(cur.cond)}) {`);
    indent++;
    branch(cur.then);
    indent--;
    while (cur.else && cur.else.type === 'IfExpr') {
      cur = cur.else;
      emit(`} else if (${genExpr(cur.cond)}) {`);
      indent++;
      branch(cur.then);
      indent--;
    }
    if (cur.else) {
      emit('} else {');
      indent++;
      branch(cur.else);
      indent--;
    }
    emit('}');
  }

  /** 尽量把 if 链变成三元表达式（生成代码更干净）；不行就返回 null */
  function ifToTernary(node) {
    const simple = (b) => b && b.type === 'Block' && b.body.length === 1 && b.body[0].type === 'ExprStmt';
    if (!simple(node.then)) return null;
    const t = genExpr(node.then.body[0].expr);
    let f;
    if (!node.else) f = 'null';
    else if (node.else.type === 'IfExpr') {
      const sub = ifToTernary(node.else);
      if (!sub) return null;
      f = sub;
    } else if (simple(node.else)) {
      f = genExpr(node.else.body[0].expr);
    } else return null;
    return `(${genExpr(node.cond)} ? ${t} : ${f})`;
  }

  // ─────────────────────────────────────────────
  // 表达式
  // ─────────────────────────────────────────────
  function genExpr(node) {
    switch (node.type) {
      case 'NumberLit': return node.value;
      case 'StringLit': return JSON.stringify(node.value);
      case 'BoolLit': return node.value ? 'true' : 'false';
      case 'Name': return use(node.name);

      case 'InterpString':
        return node.parts.map((p) =>
          p.kind === 'text'
            ? JSON.stringify(p.value)
            : `__show(${genExpr(p.expr)})`
        ).join(' + ') || '""';

      case 'ListLit':
        return `[${node.items.map(genExpr).join(', ')}]`;

      case 'Binary': {
        const l = genExpr(node.left);
        const r = genExpr(node.right);
        // 加号是多态的：数字相加、字符串拼接、列表接列表。
        // 不能直接用 JS 的 +，否则 [1] + [2] 会变成字符串 "12"（踩过这个坑）。
        if (node.op === '+') return `__add(${l}, ${r})`;
        return `(${l} ${node.op} ${r})`;
      }

      case 'Unary':
        return `(${node.op}${genExpr(node.operand)})`;

      case 'Range':
        return `__range(${genExpr(node.start)}, ${genExpr(node.end)}, ${node.inclusive})`;

      case 'Call':
        return `${genExpr(node.callee)}(${node.args.map(genExpr).join(', ')})`;

      case 'Index':
        return `${genExpr(node.object)}[${genExpr(node.index)}]`;

      case 'Assign':
        return `(${genExpr(node.target)} = ${genExpr(node.value)})`;

      case 'FnExpr': {
        const params = node.params.map(use).join(', ');
        if (node.exprBody) return `(${params}) => ${genExpr(node.body)}`;
        // 块体匿名函数：需要临时缓冲行
        const saved = indent;
        const savedLines = lines.length;
        // 用就地生成的方式
        const bodyLines = [];
        const oldEmit = lines.push.bind(lines);
        indent = saved + 1;
        const before = lines.length;
        genBlockBody(node.body);
        const captured = lines.splice(before);
        indent = saved;
        return `(${params}) => {\n${captured.join('\n')}\n${'  '.repeat(saved)}}`;
      }

      case 'IfExpr': {
        const t = ifToTernary(node);
        if (t) return t;
        // 否则用立即执行箭头函数（正确但丑）
        const oldIndent = indent;
        const before = lines.length;
        indent = oldIndent + 1;
        genIfStatement(node, /* returnLast */ true);
        const body = lines.splice(before);
        indent = oldIndent;
        return `(() => {\n${body.join('\n')}\n${pad()}})()`;
      }

      default:
        throw new Error('未知表达式类型: ' + node.type);
    }
  }

  // ─────────────────────────────────────────────
  // 生成
  // ─────────────────────────────────────────────
  for (const st of ast.body) genStatement(st);

  return {
    code: lines.join('\n'),
    nameMap: new Map(nameMap),
  };
}

/** 运行时前导代码：DingLang 的内置函数 */
const PRELUDE = `
// ── DingLang 运行时 ──
const __out = [];
function __show(v) {
  if (Array.isArray(v)) return '[' + v.map(__show).join(', ') + ']';
  if (v === null || v === undefined) return 'null';
  return String(v);
}
function print(...args) {
  const s = args.map(__show).join(' ');
  __out.push(s);
  if (typeof __quiet === 'undefined' || !__quiet) console.log(s);
}
function len(x) {
  if (Array.isArray(x) || typeof x === 'string') return x.length;
  throw new Error('len() 只支持列表和字符串');
}
function str(x) { return __show(x); }
/** 加号：数字相加 / 字符串拼接 / 列表接列表 */
function __add(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
  return a + b;
}
function num(x) { const n = Number(x); if (Number.isNaN(n)) throw new Error('无法把 ' + __show(x) + ' 转成数字'); return n; }
function __range(a, b, inclusive) {
  const out = [];
  if (a <= b) for (let i = a; inclusive ? i <= b : i < b; i++) out.push(i);
  else for (let i = a; inclusive ? i >= b : i > b; i--) out.push(i);
  return out;
}
function __iter(x) { return Array.isArray(x) ? x : __range(0, x, false); }
`.trim();

module.exports = { codegen, mangle, PRELUDE, nameMap };

});

  // ─── 对外接口 ───────────────────────────────────────────
  var _lexer = __require('./lexer');
  var _parser = __require('./parser');
  var _checker = __require('./checker');
  var _codegen = __require('./codegen');

  /** 编译：源码 → { code, ast, nameMap } */
  function compile(src, file) {
    var ast = _parser.parse(src, file || '<网页>');
    var res = _checker.check(ast, file || '<网页>');
    if (res.errors.length) {
      var e = new Error(res.errors[0].message);
      e.dingError = res.errors[0];
      throw e;
    }
    var out = _codegen.codegen(ast);
    return { code: out.code, ast: ast, nameMap: out.nameMap };
  }

  /** 只做词法分析（给编辑器做高亮/调试用） */
  function tokenize(src, file) { return _lexer.tokenize(src, file || '<网页>'); }

  /** 只做语法分析 */
  function parse(src, file) { return _parser.parse(src, file || '<网页>'); }

  var api = {
    compile: compile,
    tokenize: tokenize,
    parse: parse,
    PRELUDE: _codegen.PRELUDE,
    mangle: _codegen.mangle,
    version: '0.1.0',
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.DingLang = api;
})(typeof window !== 'undefined' ? window : globalThis);
