# New text and shapes follow the theme, or a base style without one; colors read on the slide's background;
# "Apply theme to all slides" from no theme restyles text, shapes and white backgrounds.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-style', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-style', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await A.click('.raeditor-side-panel-tab:has-text("Text"), [class*="side-panel-tab"]:has-text("Text")'); await A.wait_for_timeout(600)
        async def add_all(tag):
            out = []
            for i in range(3):
                await A.click(f'.quick-text >> nth={i}'); await A.wait_for_timeout(300)
                await A.keyboard.press('Escape'); await A.wait_for_timeout(150)
                el = await ev("(() => { const ch = window.__morph.store.activePage.children; const e = ch[ch.length - 1]; return { font: e.fontFamily, weight: e.fontWeight, fill: e.fill, bg: window.__morph.store.activePage.background }; })()")
                out.append(el)
            print(tag, 'text:', out)
        # no theme, dark slide (the demo deck is dark)
        await add_all('no theme, dark slide ->')
        # no theme, white slide
        await ev("(() => { const c = window.__morph.controller; c.addSlide(c.project.slides.length, { background: '#ffffff' }); })()"); await A.wait_for_timeout(500)
        await add_all('no theme, white slide ->')
        await A.click('.raeditor-side-panel-tab:has-text("Elements"), [class*="side-panel-tab"]:has-text("Elements")'); await A.wait_for_timeout(800)
        shp = await ev("(() => { const b = Array.from(document.querySelectorAll('.raeditor-side-panel .bp5-tab-panel *, .raeditor-side-panel *')).find(x => x.tagName === 'svg' || x.tagName === 'IMG'); return !!b; })()")
        # add a shape through the panel's first figure tile
        tiles = A.locator('.raeditor-side-panel [draggable="true"]')
        n = await tiles.count()
        if n:
            await tiles.nth(min(5, n - 1)).click(); await A.wait_for_timeout(500)
        print('no theme, shape ->', await ev("(() => { const ch = window.__morph.store.activePage.children; const e = ch[ch.length - 1]; return { type: e.type, fill: e.fill, color: e.color }; })()"))
        # apply a theme to everything
        await A.click('.sorter-head button[data-tour="layouts"]'); await A.wait_for_timeout(1200)
        await A.click('.tpl-theme:has-text("Coral")'); await A.wait_for_timeout(800)
        btn = A.locator('.tpl-hint button')
        print('apply button:', await btn.inner_text() if await btn.count() else None)
        if await btn.count(): await btn.click(); await A.wait_for_timeout(1000)
        await ev("window.__morph.controller.setUi({ tplAt: null })"); await A.wait_for_timeout(500)
        r = await ev("""(() => { const c = window.__morph.controller; const last = c.project.slides[c.project.slides.length - 1];
          return { theme: c.settings.theme, bgs: c.project.slides.map(s => s.page.background), slide1: c.project.slides[0].page.children.map(e => [e.type, e.fontFamily || '', e.fill || e.color]), lastSlide: last.page.children.map(e => [e.type, e.fontFamily || '', e.fill || e.color]) }; })()""")
        print('after Apply Coral:', r)
        # with the theme: new text
        await ev("window.__morph.controller.selectSlide(window.__morph.controller.project.slides.length - 1)"); await A.wait_for_timeout(400)
        await A.click('.raeditor-side-panel-tab:has-text("Text"), [class*="side-panel-tab"]:has-text("Text")'); await A.wait_for_timeout(600)
        await add_all('Coral ->')
        print('hint:', await ev("Array.from(document.querySelectorAll('.offline-body .panel-hint')).map(x => x.textContent)"))
        print('errors:', errs[:3])
        await ctx.close()
asyncio.run(main())
