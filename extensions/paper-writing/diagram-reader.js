/* Local SVG reader: reuse Mermaid's vector output, never rewrite the manuscript. */
(() => {
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const readableScale = fontSize => clamp(20 / (Number(fontSize) || 16), 1, 2);
  const fitScale = (width, height, viewportWidth, viewportHeight) =>
    clamp(Math.min((viewportWidth - 48) / width, (viewportHeight - 48) / height, 1.25), 0.02, 5);
  if (typeof module !== 'undefined') module.exports = { readableScale, fitScale };
  if (typeof document === 'undefined') return;

  window.__paperDiagramReader?.dispose();
  const lifetime = new AbortController();
  const bars = new Map();
  let closeReader = null, frame = 0;
  function button(label, title, action) {
    const result = document.createElement('button');
    result.type = 'button'; result.textContent = label; result.title = title;
    result.addEventListener('click', action);
    return result;
  }
  function openReader(wrapper, opener) {
    const svg = wrapper.querySelector('svg');
    const box = svg?.viewBox?.baseVal;
    if (!svg || !box || box.width <= 0 || box.height <= 0) return;
    closeReader?.();
    const width = box.width, height = box.height;
    const font = parseFloat(getComputedStyle(svg.querySelector('.nodeLabel, text') || svg).fontSize);
    const clearScale = readableScale(font);
    const originalStyle = svg.getAttribute('style');
    const anchor = document.createComment('paper-diagram-original-position');
    svg.before(anchor);
    const dialog = document.createElement('dialog');
    dialog.className = 'paper-diagram-dialog'; dialog.setAttribute('aria-label', '图表放大阅读');
    const toolbar = document.createElement('div'); toolbar.className = 'paper-diagram-toolbar';
    const title = document.createElement('strong'); title.textContent = '图表阅读';
    const percent = document.createElement('output'); percent.setAttribute('aria-label', '缩放比例');
    const viewport = document.createElement('div'); viewport.className = 'paper-diagram-viewport';
    viewport.tabIndex = 0; viewport.setAttribute('aria-label', '图表：拖动平移，滚轮缩放，方向键移动');
    const canvas = document.createElement('div'); canvas.className = 'mermaid paper-diagram-canvas';
    const hint = document.createElement('div'); hint.className = 'paper-diagram-hint';
    hint.textContent = '拖动平移 · 滚轮缩放 · 方向键移动 · Esc 返回正文';
    let scale = clearScale, drag = null;
    function size() {
      svg.style.setProperty('width', `${width * scale}px`, 'important');
      svg.style.setProperty('height', `${height * scale}px`, 'important');
      svg.style.setProperty('max-width', 'none', 'important');
      svg.style.setProperty('margin', '0', 'important');
      percent.textContent = `${Math.round(scale * 100)}%`;
    }
    function zoom(next) {
      const rect = svg.getBoundingClientRect(), port = viewport.getBoundingClientRect();
      const x = port.left + viewport.clientWidth / 2, y = port.top + viewport.clientHeight / 2;
      const px = (x - rect.left) / scale, py = (y - rect.top) / scale;
      scale = clamp(next, 0.02, 5); size();
      const updated = svg.getBoundingClientRect();
      viewport.scrollLeft += updated.left + px * scale - x;
      viewport.scrollTop += updated.top + py * scale - y;
    }
    function reset(next) { scale = next; size(); viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    function close() {
      if (closeReader !== close) return;
      closeReader = null;
      if (originalStyle === null) svg.removeAttribute('style'); else svg.setAttribute('style', originalStyle);
      if (anchor.isConnected) anchor.replaceWith(svg);
      dialog.close(); dialog.remove();
      if (opener.isConnected) opener.focus({ preventScroll: true });
    }
    closeReader = close;
    toolbar.append(title,
      button('−', '缩小', () => zoom(scale / 1.25)), percent,
      button('+', '放大', () => zoom(scale * 1.25)),
      button('全图', '缩放到窗口内，查看完整关系', () => reset(fitScale(width, height, viewport.clientWidth, viewport.clientHeight))),
      button('清晰字号', '恢复可读字号，从图的左上方开始', () => reset(clearScale)),
      button('关闭 ×', '返回原来的阅读位置（Esc）', close));
    canvas.append(svg); viewport.append(canvas); dialog.append(toolbar, viewport, hint);
    document.body.append(dialog); dialog.showModal(); size(); viewport.focus({ preventScroll: true });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(scale * 1.25); }
      if (event.key === '-') { event.preventDefault(); zoom(scale / 1.25); }
    });
    viewport.addEventListener('wheel', event => {
      event.preventDefault(); zoom(scale * Math.exp(-clamp(event.deltaY, -100, 100) * 0.003));
    }, { passive: false });
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); viewport.focus({ preventScroll: true });
      drag = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.setPointerCapture(event.pointerId); viewport.classList.add('is-dragging');
    });
    viewport.addEventListener('pointermove', event => {
      if (!drag) return;
      viewport.scrollLeft = drag.left + drag.x - event.clientX;
      viewport.scrollTop = drag.top + drag.y - event.clientY;
    });
    const stopDrag = () => { drag = null; viewport.classList.remove('is-dragging'); };
    viewport.addEventListener('pointerup', stopDrag);
    viewport.addEventListener('pointercancel', stopDrag);
    viewport.addEventListener('lostpointercapture', stopDrag);
    // Mermaid links are for the original preview, not navigation from a modal.
    viewport.addEventListener('click', event => event.preventDefault());
  }
  function scan() {
    frame = 0;
    for (const [wrapper, bar] of bars) {
      if (!wrapper.isConnected) { bar.remove(); bars.delete(wrapper); }
    }
    for (const wrapper of document.querySelectorAll('.mermaid-wrapper')) {
      if (bars.has(wrapper) || !wrapper.querySelector('svg')) continue;
      const bar = document.createElement('div'); bar.className = 'paper-diagram-actions';
      const hint = document.createElement('span'); hint.textContent = '文字太小？按清晰字号查看';
      const open = button('放大阅读 ↗', '打开矢量大图；拖动平移、滚轮缩放', () => openReader(wrapper, open));
      bar.append(hint, open); wrapper.before(bar); bars.set(wrapper, bar);
    }
  }
  const observer = new MutationObserver(() => { if (!frame) frame = requestAnimationFrame(scan); });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('vscode.markdown.updateContent', () => closeReader?.(), { capture: true, signal: lifetime.signal });
  window.__paperDiagramReader = { dispose() {
    lifetime.abort(); observer.disconnect(); cancelAnimationFrame(frame); closeReader?.();
    for (const bar of bars.values()) bar.remove(); bars.clear();
  } };
  scan();
})();
