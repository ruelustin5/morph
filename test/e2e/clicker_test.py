# The exported file must follow the keys classroom clickers send (PageDown/PageUp, arrows, B or ".", F5/Shift+F5, Esc).
import asyncio, shutil
from playwright.async_api import async_playwright
from localfiles import serve_files
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-click', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-click', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1280, 'height': 720})
        await serve_files(ctx)
        A = ctx.pages[0]
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await A.evaluate("(() => { const c = window.__morph.controller; c.duplicateSlide(1); c.duplicateSlide(2); })()"); await A.wait_for_timeout(500)
        html = await A.evaluate("(async () => (await window.__morph.controller.exportHtml()).html)()")
        open('/tmp/export.html', 'w').write(html)
        B = await ctx.new_page()
        errs = []
        B.on('pageerror', lambda e: errs.append(str(e)))
        await B.goto('file:///tmp/export.html'); await B.wait_for_timeout(1500)
        idx = lambda: B.evaluate("document.querySelector('.mp-count').textContent")
        res = {}
        res['start'] = await idx()
        await B.keyboard.press('PageDown'); await B.wait_for_timeout(1300); res['PageDown'] = await idx()
        await B.keyboard.press('PageDown'); await B.wait_for_timeout(1300); res['PageDown2'] = await idx()
        await B.keyboard.press('PageUp'); await B.wait_for_timeout(1300); res['PageUp'] = await idx()
        await B.keyboard.press('ArrowRight'); await B.wait_for_timeout(1300); res['Right'] = await idx()
        await B.keyboard.press('Period'); await B.wait_for_timeout(300); res['black'] = await B.evaluate("document.querySelector('.mp-veil').className")
        await B.keyboard.press('PageDown'); await B.wait_for_timeout(300); res['unblack'] = await B.evaluate("document.querySelector('.mp-veil').className") + ' ' + await idx()
        await B.keyboard.press('Shift+F5'); await B.wait_for_timeout(500); res['ShiftF5 (no reload)'] = await idx()
        await B.mouse.click(640, 300); await B.wait_for_timeout(1300); res['click'] = await idx()
        await B.keyboard.press('Home'); await B.wait_for_timeout(500); res['Home'] = await idx()
        import re as _re
        data = _re.search(r'<script id="deck-data" type="application/json">(.*?)</script>', html, _re.S)
        res['notes in slide data'] = bool(data) and ('"notes"' in data.group(1))
        res['notes shown on screen'] = await B.evaluate("document.body.innerText.toLowerCase().includes('speaker notes')")
        print(res, errs[:3])
        await ctx.close()
asyncio.run(main())
