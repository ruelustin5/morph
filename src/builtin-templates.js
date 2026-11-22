// Fitting template pages (drawn at one size) into a project of another size.
/** Fit a page made for w×h into W×H (same proportions kept, centred). */
export function fitPage(page, w, h, W, H) {
  if (w === W && h === H) return page;
  const s = Math.min(W / w, H / h);
  const dx = (W - w * s) / 2, dy = (H - h * s) / 2;
  const walk = (el) => {
    const o = { ...el, x: (el.x || 0) * s + dx, y: (el.y || 0) * s + dy, width: (el.width || 0) * s, height: (el.height || 0) * s };
    for (const k of ['fontSize', 'strokeWidth', 'cornerRadius']) if (typeof el[k] === 'number') o[k] = el[k] * s;
    if (Array.isArray(el.children)) o.children = el.children.map((c) => ({ ...walk(c), x: (c.x || 0) * s, y: (c.y || 0) * s }));
    return o;
  };
  return { ...page, children: (page.children || []).map(walk) };
}
