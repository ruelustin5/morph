import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-fr', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-fr', executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--lang=fr-FR'], locale='fr-FR', viewport={'width': 1400, 'height': 900})
        await ctx.add_init_script("window.__morphI18nDebug = true")
        logs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if (m.type == 'error' and 'Failed to load resource' not in m.text) or '[i18n]' in m.text or 'Missing translation' in m.text else None)
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.screenshot(path=OUT + 'fr_welcome.png')
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await A.screenshot(path=OUT + 'fr_editor.png')
        await A.click('.sorter-head button[aria-label="Nouvelle diapo à partir d’une mise en page"]'); await A.wait_for_timeout(2000)
        await A.screenshot(path=OUT + 'fr_gallery.png')
        await A.click('.tpl-tile:has-text("Titre")'); await A.wait_for_timeout(800)
        await A.evaluate("(() => { const s = window.__morph.store; s.selectElements([s.activePage.children[s.activePage.children.length-1].id]); })()"); await A.wait_for_timeout(800)
        await A.screenshot(path=OUT + 'fr_anim.png')
        await A.click('text=Équation'); await A.wait_for_timeout(1500)
        await A.click('.eq-pk-btn'); await A.wait_for_timeout(500)
        await A.screenshot(path=OUT + 'fr_packages.png')
        print('\n'.join(sorted(set(logs))[:60]))
        await ctx.close()
asyncio.run(main())
