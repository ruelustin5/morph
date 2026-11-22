import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-eq', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-eq', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        logs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await A.click('text=Equation'); await A.wait_for_timeout(2500)
        async def try_tex(tex):
            await A.fill('.eq-input', tex); await A.wait_for_timeout(900)
            return await A.evaluate("(() => { const e = document.querySelector('.eq-err'); const i = document.querySelector('.eq-preview img'); return e ? 'ERR ' + e.textContent : i ? 'OK' : '?'; })()")
        print('ce on:', await try_tex('\\ce{H2O}'))
        print('pdv on:', await try_tex('\\pdv{f}{x}'))
        print('qty (siunitx off):', await try_tex('\\qty{9.81}{\\meter\\per\\second\\squared}'))
        await A.click('.eq-pk-btn'); await A.wait_for_timeout(500)
        await A.screenshot(path=OUT + 'packages.png')
        await A.click('.pk-row:has-text("siunitx") .bp5-switch'); await A.wait_for_timeout(300)
        await A.click('.pk-row:has-text("mhchem") .bp5-switch'); await A.wait_for_timeout(300)
        print('settings:', await A.evaluate("JSON.stringify(window.__morph.controller.settings.latex)"))
        await A.click('.pk-head button'); await A.wait_for_timeout(500)
        print('qty (siunitx on):', await try_tex('\\qty{9.81}{\\meter\\per\\second\\squared}'))
        print('ce (mhchem off):', await try_tex('\\ce{H2O}'))
        print('ce with usepackage:', await try_tex('\\usepackage{mhchem}\n\\ce{H2O}'))
        await A.screenshot(path=OUT + 'eq_offpk.png')
        print('unknown pkg:', await try_tex('\\usepackage{tikz}\nx'))
        print('\n'.join(logs[:20]))
        await ctx.close()
asyncio.run(main())
