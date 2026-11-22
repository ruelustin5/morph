import asyncio, shutil, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-theme', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-theme', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        logs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        ev = A.evaluate
        # + without theme adds a blank slide
        n0 = await ev("window.__morph.controller.project.slides.length")
        await A.click('.sorter-head button[aria-label="New slide"]'); await A.wait_for_timeout(500)
        print('plus without theme adds slide:', await ev("window.__morph.controller.project.slides.length") == n0 + 1, 'gallery open:', await ev("window.__morph.controller.ui.tplAt != null"))
        await A.click('.sorter-head button[aria-label="New slide from a layout"]'); await A.wait_for_timeout(2500)
        await A.screenshot(path=OUT + 'gallery_classic.png')
        for th in sys.argv[1:] or ['coral']:
            await A.click(f'.tpl-theme:has-text("{th}")'); await A.wait_for_timeout(1800)
            await A.screenshot(path=OUT + f'gallery_{th}.png')
        # insert title then section from the current view
        await A.click('.tpl-tile:has-text("Title")'); await A.wait_for_timeout(800)
        print('theme now:', await ev("window.__morph.controller.settings.theme"))
        await A.click('.sorter-head button[aria-label="New slide"]'); await A.wait_for_timeout(1000)
        print('plus with theme opens gallery:', await ev("window.__morph.controller.ui.tplAt"))
        await A.click('.tpl-tile:has-text("Points")'); await A.wait_for_timeout(800)
        r = await ev("(() => { const c = window.__morph.controller; const p = c.project; const a = p.slides[c.active - 1], b = p.slides[c.active]; const ids = s => s.page.children.map(e => e.id); return { shared: ids(a).filter(i => ids(b).includes(i)), names: ids(b).filter(i => i.startsWith('th-')).map(i => p.objects[i] && p.objects[i].name) }; })()")
        print('morphing ids between title and points:', r)
        await A.screenshot(path=OUT + 'editor_points.png')
        # restyle
        await A.click('.sorter-head button[aria-label="New slide from a layout"]'); await A.wait_for_timeout(800)
        await A.click('.tpl-theme:has-text("Terminal")'); await A.wait_for_timeout(1200)
        await A.screenshot(path=OUT + 'gallery_switch.png')
        btn = A.locator('.tpl-hint button')
        print('switch button:', await btn.inner_text() if await btn.count() else None)
        if await btn.count():
            await btn.click(); await A.wait_for_timeout(1200)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(600)
        print('after restyle:', await ev("(() => { const c = window.__morph.controller; return { theme: c.settings.theme, bgs: c.project.slides.map(s => s.page.background), ids: c.project.slides.map(s => s.page.children.filter(e => e.id.startsWith('th-')).length) }; })()"))
        await A.screenshot(path=OUT + 'editor_restyled.png')
        print('\n'.join(logs[:20]))
        await ctx.close()
asyncio.run(main())
