import { hashCode, uniqueIdGen } from './util.ts';

export default function pdfCropPlugin(md: import('markdown-it').default) {
  const defaultRender = md.renderer.rules.image;

  const pdfRE = /\.pdf$/i;

  // ![page=2&rect=39,295,178,422](doc.pdf)
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const src = token.attrGet('src');

    // если не PDF, рендерим как обычно
    if (!src || !pdfRE.test(src)) {
      return defaultRender
        ? defaultRender(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options);
    }

    const alt = token.content || '';
    const params = Object.fromEntries(new URLSearchParams(alt));

    const page = parseInt(params.page || '1', 10);

    let rect = { x1: 0, y1: 0, x2: 100, y2: 100 };
    if (params.rect) {
      const parts = params.rect.split(',').map(Number);
      if (parts.length === 4 && parts.every(n => !Number.isNaN(n))) {
        rect = { x1: parts[0], y1: parts[1], x2: parts[2], y2: parts[3] };
      }
    }

    const content = src + token.content;

    return `<div
              id="pdf-crop-${env.genId(hashCode(content))}"
              class="pdf-crop"
              data-pdf-url="${src}"
              data-page-num="${page}"
              data-rect='${JSON.stringify(rect)}'></div>`;
  };

  // Regex для формата ![[file.pdf#page=1&rect=39,295,178,422|подпись]]
  const pdfRegex = /!\[\[([^\]#|]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/;

  // Создаём правило для inline
  // ![[doc.pdf#page=1&rect=39,295,178,422|bebebeebe]]
  md.inline.ruler.before('emphasis', 'pdf_crop', (state, silent) => {
    const pos = state.pos;
    const src = state.src.slice(pos);

    const match = pdfRegex.exec(src);
    if (!match || match.index !== 0) return false; // совпадение только в начале

    if (silent) return true; // проверка без вставки

    const fullMatch = match[0];
    const file = match[1].trim();
    const hash = match[2] || '';
    const label = match[3] || '';

    // парсим page и rect из хэша
    let page = 1;
    let rect = null;
    let color = null; // NOTE: maybe позже обводку воткнуть, по кайфу в целом

    if (hash) {
      const params = new URLSearchParams(hash.replace(/&/g, '&'));
      if (params.has('page')) page = parseInt(params.get('page'), 10) || 1;
      if (params.has('rect')) {
        const r = params.get('rect').split(',').map(Number);
        if (r.length === 4) rect = { x1: r[0], y1: r[1], x2: r[2], y2: r[3] };
      }
      if (params.has('color')) {
        color = params.get('color');
      }
    }

    const content = file + hash; // TODO: передавать полностью content чтобы потом создать id немного аяй

    // создаём токен
    const token = state.push('pdf_crop', '', 0);
    token.meta = { file, page, rect, label, content, color };

    // передвигаем позицию
    state.pos += fullMatch.length;
    return true;
  });

  // Рендер
  md.renderer.rules.pdf_crop = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const { file, page, rect, label, content, color } = token.meta;

    const rectAttr = rect ? ` data-rect='${JSON.stringify(rect)}'` : '';
    const labelAttr = label ? ` data-label="${label}"` : '';

    return `<div
              id="pdf-crop-${env.genId(hashCode(content))}"
              class="pdf-crop"
              data-pdf-url="${file}"
              data-page-num="${page}"
              data-color="${color}"
              ${rectAttr}${labelAttr}></div>`;
  };
}

