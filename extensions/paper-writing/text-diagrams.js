'use strict';

function isBoxDiagram(source) {
  return (/^[ \t]*[┌╭┏╔][─━═]/m.test(source) && /^[ \t]*[│┃║├┣╠└╰┗╚]/m.test(source))
    || (/^[ \t]*\+[-=]{2,}.*\+/m.test(source) && /^[ \t]*\|.*\|/m.test(source));
}

function parseComparison(source) {
  const lines = source.trim().split(/\r?\n/).map(line => line.trim());
  const caption = /^┌─+\s+(.+?)\s+─+┐$/u.exec(lines[0]);
  if (!caption || !/^└─+┘$/u.test(lines.at(-1))) return;
  const groups = lines.slice(1, -1).join('\n').split(/^├─+┤$/mu);
  if (groups.length < 2) return;
  const sections = [];
  for (const group of groups) {
    const rows = group.trim().split('\n').map(row => /^│([^│]+)│$/u.exec(row)?.[1].trim());
    if (rows.length !== 3 || !rows.every(Boolean)) return;
    const [label, path, annotations] = rows;
    if (!annotations.startsWith('▲')) return;
    const steps = path.split(/\s*[─-]+[►▶>]\s*/u).map(node => /^\[([^\[\]]+)\]$/u.exec(node)?.[1].trim());
    const notes = annotations.slice(1).split(/\s+▲/u).map(note => note.trim());
    if (steps.length < 2 || steps.length !== notes.length || !steps.every(Boolean) || !notes.every(Boolean)) return;
    sections.push({ label, steps: steps.map((name, i) => ({ name, note: notes[i] })) });
  }
  return { caption: caption[1], sections };
}

function parseBoxTable(source) {
  const lines = source.trim().split(/\r?\n/).map(line => line.trim());
  const bottom = lines.at(-1);
  if (!/^└─+(?:┴─+)+┘$/u.test(bottom)) return;
  const columns = bottom.split('┴').length;
  const border = (left, joint, right) => left + '─' + (joint + '─').repeat(columns - 1) + right;
  const shape = line => line?.replace(/─+/gu, '─');
  const top = shape(lines[0]);
  let start = 1, caption = '';
  if (top === '┌─┐') {
    caption = /^│([^│]+)│$/u.exec(lines[1])?.[1].trim();
    if (!caption || shape(lines[2]) !== border('├', '┬', '┤')) return;
    start = 3;
  } else if (top !== border('┌', '┬', '┐')) return;

  const separator = border('├', '┼', '┤');
  const rows = [];
  let cells;
  for (const line of lines.slice(start, -1)) {
    if (shape(line) === separator) {
      if (!cells) return;
      rows.push(cells);
      cells = undefined;
      continue;
    }
    if (!line.startsWith('│') || !line.endsWith('│')) return;
    const parts = line.slice(1, -1).split('│');
    if (parts.length !== columns) return;
    if (!cells) cells = parts.map(() => []);
    parts.forEach((part, column) => cells[column].push(part.trim()));
  }
  if (!cells || !rows.length) return;
  rows.push(cells);
  const headers = rows.shift().map(cell => cell.join(' ').trim());
  if (!headers.every(Boolean)) return;
  return { caption, headers, rows };
}

function renderBoxTable(table, escape) {
  const headers = table.headers.map(header => '<th scope="col">' + escape(header) + '</th>').join('');
  const rows = table.rows.map(row => '<tr>' + row.map((lines, column) => {
    // Allow prose to reflow. References and individual checklist items retain their own lines.
    const content = lines.filter(Boolean).map((line, i) => {
      const newLine = /^[□☐☑✓•]/u.test(line) || (column === 0 && /^[(（]/u.test(line));
      return (i ? (newLine ? '<br>' : '\n') : '') + escape(line);
    }).join('');
    const tag = column === 0 ? 'th' : 'td';
    const attr = column === 0 ? ' scope="row"' : '';
    return '<' + tag + attr + '><span class="paper-cell-label" aria-hidden="true">'
      + escape(table.headers[column]) + '</span>' + content + '</' + tag + '>';
  }).join('') + '</tr>').join('');
  const caption = table.caption ? '<caption>' + escape(table.caption) + '</caption>' : '';
  return '<table>' + caption + '<thead><tr>' + headers + '</tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderComparison(comparison, escape) {
  const sections = comparison.sections.map(section => {
    const steps = section.steps.map(({ name, note }) =>
      '<li><strong>' + escape(name) + '</strong><span>' + escape(note) + '</span></li>'
    ).join('');
    return '<div class="paper-text-path"><b>' + escape(section.label) + '</b><ol>' + steps + '</ol></div>';
  }).join('');
  return '<figcaption>' + escape(comparison.caption) + '</figcaption>' + sections;
}

function extendTextDiagrams(md) {
  const nativeFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, index, options, env, renderer) => {
    const token = tokens[index];
    const native = () => nativeFence(tokens, index, options, env, renderer);
    if (!/^(?:text|txt|plaintext|ascii)?$/i.test(token.info.trim()) || !isBoxDiagram(token.content)) return native();

    const escape = md.utils.escapeHtml;
    const comparison = parseComparison(token.content);
    let content, className;
    if (comparison) {
      content = renderComparison(comparison, value => escape(value.replace(/\\\$/g, '$')));
      className = 'paper-text-comparison';
    } else {
      const table = parseBoxTable(token.content);
      if (!table) return '<div class="paper-text-diagram">' + native() + '</div>\n';
      content = renderBoxTable(table, escape);
      className = 'paper-box-table';
    }
    // Carry the native source-line anchor on the visible content for synchronized scrolling.
    return '<div' + renderer.renderAttrs(token) + '><figure class="' + className + '">' + content
      + '<details class="paper-text-diagram"><summary>查看字符原图</summary><pre><code>'
      + escape(token.content) + '</code></pre></details></figure></div>\n';
  };
  return md;
}

module.exports = { extendTextDiagrams };
