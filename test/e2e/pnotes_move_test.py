# Presenter notes can be dragged anywhere and resized; the place is remembered; double-click puts them back.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-pnm', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-pnm', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await ev("(() => { const c = window.__morph.controller; c.setNote(c.project.slides[0].id, 'Say hello.\\nThen the morph.'); })()")
        await A.click('button:has-text("Present")'); await A.wait_for_timeout(1500)
        await A.keyboard.press('s'); await A.wait_for_timeout(500)
        rect = lambda: ev("(() => { const r = document.querySelector('.pn-panel').getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; })()")
        idx = lambda: ev("location.hash || document.querySelector('.presenter') && document.querySelector('.presenter').dataset.index || ''")
        r0 = await rect(); print('default:', r0)
        h = await A.locator('.pn-head').bounding_box()
        await A.mouse.move(h['x'] + 60, h['y'] + 10); await A.mouse.down()
        await A.mouse.move(200, 200, steps=8); await A.mouse.move(120, 90, steps=8); await A.mouse.up(); await A.wait_for_timeout(300)
        r1 = await rect(); print('after drag:', r1)
        print('slide still 1 (drag did not advance):', await ev("document.querySelector('.pn-slide').textContent"))
        g = await A.locator('.pn-resize').bounding_box()
        await A.mouse.move(g['x'] + 8, g['y'] + 8); await A.mouse.down()
        await A.mouse.move(g['x'] - 200, g['y'] + 250, steps=10); await A.mouse.up(); await A.wait_for_timeout(300)
        r2 = await rect(); print('after resize:', r2, '| textarea h:', await ev("Math.round(document.querySelector('.pn-text').getBoundingClientRect().height)"))
        # drag far outside: stays on screen
        h = await A.locator('.pn-head').bounding_box()
        await A.mouse.move(h['x'] + 60, h['y'] + 10); await A.mouse.down()
        await A.mouse.move(3000, 3000, steps=6); await A.mouse.up(); await A.wait_for_timeout(300)
        r3 = await rect(); print('dragged off screen ->', r3, '| inside:', r3[0] + r3[2] <= 1400 and r3[1] + r3[3] <= 900)
        await A.screenshot(path='/tmp/pnotes-moved.png')
        print('stored:', await ev("localStorage.getItem('morph-present-notes-box')"))
        # window resize keeps it inside
        await A.set_viewport_size({'width': 900, 'height': 600}); await A.wait_for_timeout(400)
        r4 = await rect(); print('small window ->', r4, '| inside:', r4[0] + r4[2] <= 900 and r4[1] + r4[3] <= 600)
        await A.set_viewport_size({'width': 1400, 'height': 900}); await A.wait_for_timeout(400)
        # leave and come back: remembered
        await A.keyboard.press('Escape'); await A.wait_for_timeout(800)
        await A.click('button:has-text("Present")'); await A.wait_for_timeout(1500)
        r5 = await rect(); print('presenting again ->', r5, '| same place:', r5 == r3)
        # typing still works; arrow keys inside the notes do not change the slide
        await A.click('.pn-text'); await A.keyboard.press('End'); await A.keyboard.type(' Smile.'); await A.wait_for_timeout(300)
        await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(500)
        print('note saved:', await ev("(() => { const c = window.__morph.controller; return c.noteOf(c.project.slides[0].id); })()"), '| still slide:', await ev("document.querySelector('.pn-slide').textContent"))
        await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
        # reset with double-click on the bar
        await A.dblclick('.pn-head .pn-slide'); await A.wait_for_timeout(300)
        r6 = await rect(); print('after double-click ->', r6, '| back to default:', r6 == r0, '| stored:', await ev("localStorage.getItem('morph-present-notes-box')"))
        print('errors:', errs)
        await ctx.close()
asyncio.run(main())
