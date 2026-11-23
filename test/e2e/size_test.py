# Slide size lives in the ⋯ menu (not the side panel); it resizes every slide and scales their content.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-size', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-size', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        tabs = await ev("Array.from(document.querySelectorAll('[class*=\"side-panel-tab\"]')).map(x => x.innerText.trim())")
        print('side tabs:', tabs, '| Size tab gone:', not any('Size' in x or 'Resize' in x for x in tabs))
        before = await ev("(() => { const c = window.__morph.controller; const p = c.project; const e = p.slides[1].page.children[0]; return { w: p.width, h: p.height, n: p.slides.length, el: [e.x, e.y, e.width, e.fontSize] }; })()")
        print('before:', before)
        await A.click('[data-tour="more"]'); await A.wait_for_timeout(400)
        await A.click('.bp5-menu-item:has-text("Slide size")'); await A.wait_for_timeout(600)
        print('dialog:', await A.locator('.size-dialog').count(), '|', (await A.locator('.size-note').inner_text()))
        print('apply disabled at same size:', await A.locator('.size-dialog button:has-text("Apply to all slides")').is_disabled())
        await A.click('.size-preset:has-text("Standard")'); await A.wait_for_timeout(200)
        await A.screenshot(path='/tmp/size-dialog.png')
        await A.click('.size-dialog button:has-text("Apply to all slides")'); await A.wait_for_timeout(1200)
        after = await ev("(() => { const c = window.__morph.controller; const p = c.project; const e = p.slides[1].page.children[0]; return { w: p.width, h: p.height, store: [window.__morph.store.width, window.__morph.store.height], dirty: c.dirty, el: [Math.round(e.x), Math.round(e.y), Math.round(e.width), e.fontSize && Math.round(e.fontSize)] }; })()")
        print('after Standard:', after)
        # inside the slide?
        out = await ev("(() => { const c = window.__morph.controller; const p = c.project; let bad = 0; for (const s of p.slides) for (const e of s.page.children) if (e.x < -1 || e.y < -1 || e.x + e.width > p.width + 1 || e.y + e.height > p.height + 1) bad++; return bad; })()")
        print('objects outside after fit:', out)
        # custom without fitting
        await A.click('[data-tour="more"]'); await A.wait_for_timeout(400)
        await A.click('.bp5-menu-item:has-text("Slide size")'); await A.wait_for_timeout(500)
        inputs = A.locator('.size-custom input')
        await inputs.nth(0).fill('1920'); await inputs.nth(0).press('Tab')
        await inputs.nth(1).fill('1080'); await inputs.nth(1).press('Tab')
        await A.locator('.size-dialog .bp5-switch').click(); await A.wait_for_timeout(200)
        print('warning shown:', await A.locator('.size-warn').count())
        await A.click('.size-dialog button:has-text("Apply to all slides")'); await A.wait_for_timeout(1000)
        print('after custom, no fit:', await ev("(() => { const c = window.__morph.controller; const p = c.project; const e = p.slides[1].page.children[0]; return { w: p.width, h: p.height, el: [Math.round(e.x), Math.round(e.y), Math.round(e.width)] }; })()"))
        print('errors:', errs)
        await ctx.close()
asyncio.run(main())
