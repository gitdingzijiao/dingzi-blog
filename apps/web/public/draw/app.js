/* AI 智能绘图工具 - 前端逻辑 */
(() => {
  'use strict';

  const DRAWIO_ORIGIN = 'https://embed.diagrams.net';
  const iframe = document.getElementById('drawio');
  const overlay = document.getElementById('overlay');
  const chat = document.getElementById('chat');
  const composer = document.getElementById('composer');
  const input = document.getElementById('input');
  const sendBtn = document.getElementById('sendBtn');
  const statusEl = document.getElementById('status');
  const exportBtn = document.getElementById('exportBtn');

  let editorReady = false;
  let pendingXml = null;      // 编辑器未就绪时暂存待注入的 XML
  let currentXml = '';        // 当前画布上的图表 XML
  let busy = false;
  let exportResolve = null;

  const EMPTY_XML = `<mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /></root></mxGraphModel>`;

  // ── 与 draw.io 通信 ─────────────────────────────────
  function postToDrawio(msg) {
    if (!iframe.contentWindow) return;
    iframe.contentWindow.postMessage(JSON.stringify(msg), DRAWIO_ORIGIN);
  }

  function loadDiagram(xml) {
    currentXml = xml;
    if (!editorReady) { pendingXml = xml; return; }
    postToDrawio({ action: 'load', xml, autosave: 1, dark: 1 });
  }

  window.addEventListener('message', (evt) => {
    if (evt.origin !== DRAWIO_ORIGIN) return;
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }

    switch (msg.event) {
      case 'init':
        editorReady = true;
        overlay.classList.add('hidden');
        setStatus('编辑器就绪', 'ok');
        postToDrawio({ action: 'load', xml: pendingXml || currentXml || EMPTY_XML, autosave: 1, dark: 1 });
        pendingXml = null;
        break;
      case 'load':
        setStatus('图表已加载', 'ok');
        break;
      case 'autosave':
      case 'save':
        if (msg.xml) currentXml = msg.xml;
        break;
      case 'export':
        if (exportResolve) { exportResolve(msg); exportResolve = null; }
        break;
      case 'configure':
        postToDrawio({ action: 'configure', config: {} });
        break;
      default:
        break;
    }
  });

  // ── UI 辅助 ─────────────────────────────────────────
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = 'status' + (kind ? ' ' + kind : '');
  }

  function addMessage(role, text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);
    chat.appendChild(wrap);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  }

  function setBubble(bubble, text, isError) {
    bubble.textContent = text;
    if (isError) bubble.classList.add('error');
    chat.scrollTop = chat.scrollHeight;
  }

  // ── 生成图表 ────────────────────────────────────────
  async function generate(prompt) {
    if (busy) return;
    busy = true;
    sendBtn.disabled = true;
    setStatus('生成中…');

    addMessage('user', prompt);
    const reply = addMessage('ai', '正在调用 DeepSeek 生成图表…');

    try {
      const res = await fetch('/api/draw/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, currentXml: currentXml || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || ('HTTP ' + res.status));

      const xml = data.xml || '';
      if (!xml.includes('<mxGraphModel')) throw new Error('模型未返回有效 XML，请重试');

      loadDiagram(xml);
      const nodes = (xml.match(/vertex="1"/g) || []).length;
      const edges = (xml.match(/edge="1"/g) || []).length;
      setBubble(reply, `✅ 已生成图表（${nodes} 个节点 / ${edges} 条连线），可直接在右侧编辑。\n继续描述可以让我修改。`);
      setStatus('生成成功', 'ok');
    } catch (err) {
      setBubble(reply, '❌ ' + err.message, true);
      setStatus('生成失败', 'err');
    } finally {
      busy = false;
      sendBtn.disabled = false;
    }
  }

  // ── 导出 SVG ────────────────────────────────────────
  function exportSvg() {
    if (!editorReady) return;
    setStatus('导出中…');
    exportResolve = (msg) => {
      const data = msg.data || '';
      if (!data.startsWith('data:')) { setStatus('导出失败', 'err'); return; }
      const a = document.createElement('a');
      a.href = data;
      a.download = 'diagram-' + Date.now() + '.svg';
      a.click();
      setStatus('已导出 SVG', 'ok');
    };
    postToDrawio({ action: 'export', format: 'xmlsvg' });
  }

  // ── 事件绑定 ────────────────────────────────────────
  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    const prompt = input.value.trim();
    if (!prompt) return;
    input.value = '';
    generate(prompt);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  document.querySelectorAll('.quick button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const prompt = btn.dataset.prompt;
      if (prompt) generate(prompt);
    });
  });

  exportBtn.addEventListener('click', exportSvg);

  // 启动
  loadDiagram(EMPTY_XML);
  document.getElementById('engine').textContent = 'DeepSeek Flash';
})();
