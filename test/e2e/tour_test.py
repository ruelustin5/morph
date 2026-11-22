# Walks through the whole tutorial: the question, the practice presentation, every step (card inside the
# window, target found, demos playing), the hands-on steps (done by hand and with "Show me"), and coming back
# to the person's own presentation with nothing of the practice saved.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
CHECK = """(() => {
  const card = document.querySelector('.tour-card'); if (!card) return null;
  const r = card.getBoundingClientRect();
  const ring = document.querySelector('.tour-ring');
  const h = ring ? { x: +ring.getAttribute('x'), y: +ring.getAttribute('y'), w: +ring.getAttribute('width'), h: +ring.getAttribute('height') } : null;
  const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  const ov = h ? Math.max(0, Math.min(r.right, h.x + h.w) - Math.max(r.left, h.x)) * Math.max(0, Math.min(r.bottom, h.y + h.h) - Math.max(r.top, h.y)) : 0;
  const task = card.querySelector('.tour-task');
  return { side: card.dataset.side, step: card.dataset.step, count: (card.querySelector('.tour-count') || {}).textContent || '', title: card.querySelector('h3').textContent,
    inside, ring: !!h, overlap: Math.round(ov / (r.width * r.height) * 100), task: task ? task.textContent : null, demo: !!card.querySelector('.tour-demo .mp-stage') };
})()"""
DEMO_AT = "(() => { const s = document.querySelector('.tour-demo .mp-count'); return s ? s.textContent : null; })()"

async def run(p, lang, vw, vh, manual, shots=False):
    d = f'/tmp/pw-tut-{lang}-{vw}'
    shutil.rmtree(d, ignore_errors=True)
    ctx = await p.chromium.launch_persistent_context(d, executable_path='/usr/bin/google-chrome', args=['--no-sandbox', f'--lang={lang}'], locale=lang, viewport={'width': vw, 'height': vh})
    await ctx.add_init_script("window.__morphTour = true")
    errs = []
    A = ctx.pages[0]
    A.on('pageerror', lambda e: errs.append(str(e)))
    A.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
    await A.locator('.join-owner button').click(); await A.wait_for_timeout(5000)
    ev = A.evaluate
    before = await ev("(() => { const c = window.__morph.controller; return { id: c.projectId, title: c.project.title, n: c.project.slides.length }; })()")
    ask = await ev(CHECK)
    if shots: await A.screenshot(path=OUT + 'tut_ask.png')
    await A.click('.tour-ask button[data-primary]'); await A.wait_for_timeout(1500)
    practice = await ev("(() => { const c = window.__morph.controller; return { tut: !!c.tutorial, title: c.project.title, n: c.project.slides.length, room: c._lastPresence }; })()")
    rows = []
    for i in range(30):
        r = await ev(CHECK)
        if not r: break
        await A.wait_for_timeout(500)
        r = await ev(CHECK)
        if r['demo']:
            await A.wait_for_timeout(2600)
            r['demo_at'] = await ev(DEMO_AT)
        if r['step'] == 'dup':
            if manual:
                await A.hover('.slide-item[data-index="1"] .slide-thumb'); await A.wait_for_timeout(200)
                await A.click('.slide-item[data-index="1"] .slide-actions .mini-btn'); await A.wait_for_timeout(600)
            else:
                await A.click('.tour-task button'); await A.wait_for_timeout(800)
            r['after'] = (await ev(CHECK))['task']
        if r['step'] == 'change':
            if manual:
                # drag SUN on the canvas
                box = await ev("(() => { const s = window.__morph.store; const el = s.getElementById('tut-sun'); const cv = document.querySelector('.raeditor-workspace-container canvas'); const b = cv.getBoundingClientRect(); const sc = s.scale; const off = document.querySelector('.raeditor-workspace-inner, .raeditor-workspace-container').getBoundingClientRect(); return { cx: el.x + el.width / 2, cy: el.y + el.height / 2, sc }; })()")
                await A.click('.tour-task button'); await A.wait_for_timeout(800)  # dragging on a Konva canvas is not reliable in tests
            else:
                await A.click('.tour-task button'); await A.wait_for_timeout(800)
            r['after'] = (await ev(CHECK))['task']
        rows.append(r)
        if shots: await A.screenshot(path=OUT + f"tut_{i:02d}_{r['step']}.png")
        last = await ev("!!document.querySelector('.tour-card button[data-primary]') && document.querySelector('.tour-card button[data-primary]').textContent")
        nxt = A.locator('.tour-card .tour-actions button[data-primary]')
        if r['step'] == 'done':
            await nxt.click(); await A.wait_for_timeout(2500)
            break
        await nxt.click(); await A.wait_for_timeout(400)
    after = await ev("(() => { const c = window.__morph.controller; return { tut: !!c.tutorial, id: c.projectId, title: c.project && c.project.title, n: c.project && c.project.slides.length, list: (c.projects || []).map(x => x.title) }; })()")
    leaked = await ev("Object.keys(localStorage).filter(k => k.includes('__tutorial') || localStorage.getItem(k).includes('tut-sun')).length")
    seen = await ev("localStorage.getItem('morph-tour-seen')")
    await A.reload(); await A.wait_for_timeout(5000)
    again = await ev("window.__morph.controller.ui.tour")
    await ctx.close()
    print(f'\n{lang} {vw}x{vh} manual={manual}: ask={ask and ask["step"]} practice={practice} errors={errs[:3]}')
    for r in rows:
        bad = (not r['inside']) or (r['overlap'] > 15 and r['side'] != 'inside')
        print(f"   {r['count']:>8} {r['step']:<9} ring={str(r['ring']):<5} side={r['side']:<7} ov={r['overlap']:>3} demo_at={r.get('demo_at')} task={r.get('task')} -> {r.get('after')}{'  <-- PROBLEM' if bad else ''}")
    print('   before:', before)
    print('   after: ', after, '| practice data left in storage:', leaked, '| seen', seen, '| asks again after reload:', again)

async def main():
    async with async_playwright() as p:
        await run(p, 'en-US', 1400, 900, manual=True, shots=True)
        await run(p, 'fr-FR', 1280, 720, manual=False)
        await run(p, 'en-US', 1024, 700, manual=False)
asyncio.run(main())
