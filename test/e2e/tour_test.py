import asyncio, shutil, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
CHECK = """(() => {
  const card = document.querySelector('.tour-card'); if (!card) return null;
  const r = card.getBoundingClientRect();
  const ring = document.querySelector('.tour-ring');
  const h = ring ? { x: +ring.getAttribute('x'), y: +ring.getAttribute('y'), w: +ring.getAttribute('width'), h: +ring.getAttribute('height') } : null;
  const inside = r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  const ov = h ? Math.max(0, Math.min(r.right, h.x + h.w) - Math.max(r.left, h.x)) * Math.max(0, Math.min(r.bottom, h.y + h.h) - Math.max(r.top, h.y)) : 0;
  return { side: card.dataset.side, step: card.dataset.step, count: card.querySelector('.tour-count').textContent, title: card.querySelector('h3').textContent, inside, overlap: Math.round(ov / (r.width * r.height) * 100) };
})()"""
async def run(p, lang, vw, vh, guest=False):
    d = f'/tmp/pw-tour-{lang}-{vw}'
    shutil.rmtree(d, ignore_errors=True)
    ctx = await p.chromium.launch_persistent_context(d, executable_path='/usr/bin/google-chrome', args=['--no-sandbox', f'--lang={lang}'], locale=lang, viewport={'width': vw, 'height': vh})
    await ctx.add_init_script("window.__morphTour = true")
    errs = []
    A = ctx.pages[0]
    A.on('pageerror', lambda e: errs.append(str(e)))
    await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
    await A.locator('.join-owner button').click(); await A.wait_for_timeout(5000)
    started = await A.evaluate("window.__morph.controller.ui.tour")
    out = []
    for i in range(20):
        r = await A.evaluate(CHECK)
        if not r: break
        out.append(r)
        if vw == 1400 and lang == 'en-US': await A.screenshot(path=OUT + f"tour_{i}_{r['step']}.png")
        await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(450)
    seen = await A.evaluate("localStorage.getItem('morph-tour-seen')")
    # reload: should not start again
    await A.reload(); await A.wait_for_timeout(5000)
    again = await A.evaluate("window.__morph.controller.ui.tour")
    # restart from the menu
    await A.click('button[aria-label="More"], button[aria-label="Plus"]'); await A.wait_for_timeout(300)
    await A.click('.bp5-menu-item:has-text("tour"), .bp5-menu-item:has-text("visite")'); await A.wait_for_timeout(600)
    restarted = (await A.evaluate(CHECK) or {}).get('step')
    await ctx.close()
    print(f'{lang} {vw}x{vh}: auto={started} steps={len(out)} seen={seen} again={again} restart={restarted} errors={errs[:2]}')
    for r in out:
        flag = '' if r['inside'] and (r['overlap'] < 15 or r['side'] == 'inside') else '  <-- PROBLEM'
        print('   ', r['count'], r['step'], '|', r['title'], '| inside', r['inside'], 'overlap', r['overlap'], r['side'], flag)
async def main():
    async with async_playwright() as p:
        await run(p, 'en-US', 1400, 900)
        await run(p, 'fr-FR', 1024, 700)
        await run(p, 'en-US', 1280, 720)
asyncio.run(main())
