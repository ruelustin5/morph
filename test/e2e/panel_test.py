import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-panel', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-panel', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        logs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        ev = A.evaluate
        await A.screenshot(path=OUT + 'anim_empty.png')
        # select first object on slide 2
        await ev("window.__morph.controller.selectSlide(1)"); await A.wait_for_timeout(500)
        await ev("(() => { const s = window.__morph.store; s.selectElements([s.activePage.children[0].id]); })()"); await A.wait_for_timeout(800)
        await A.screenshot(path=OUT + 'anim_obj.png')
        # select a text and check the font size control
        await ev("(() => { const s = window.__morph.store; const t = s.activePage.children.find(e => e.type === 'text'); s.selectElements([t.id]); })()"); await A.wait_for_timeout(600)
        before = await ev("window.__morph.store.selectedElements[0].fontSize")
        await A.click('.fs-step[aria-label="Bigger"]'); await A.wait_for_timeout(200)
        after = await ev("window.__morph.store.selectedElements[0].fontSize")
        await A.click('.fs-input'); await A.keyboard.type('77'); await A.keyboard.press('Enter'); await A.wait_for_timeout(200)
        typed = await ev("window.__morph.store.selectedElements[0].fontSize")
        print('font size', before, '->', after, 'typed ->', typed)
        await A.screenshot(path=OUT + 'toolbar.png', clip={'x': 200, 'y': 50, 'width': 1000, 'height': 80})
        print('\n'.join(logs[:20]))
        await ctx.close()
asyncio.run(main())
