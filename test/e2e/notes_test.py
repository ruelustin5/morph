import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-notes', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-notes', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        logs = []
        def hook(pg, tag):
            pg.on('pageerror', lambda e: logs.append(f'[{tag} pageerror] {e}'))
            pg.on('console', lambda m: logs.append(f'[{tag} {m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        A = ctx.pages[0]; hook(A, 'A')
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        ev = A.evaluate
        pid = await ev("window.__morph.controller.projectId")
        inv = await ev(f"window.__morph.controller.createInvite('{pid}', 'Bob')"); await A.wait_for_timeout(1500)
        await ev("window.__morph.controller.refreshPeople()"); await A.wait_for_timeout(800)
        print('people (owner view):', await ev("window.__morph.controller.people"))
        # notes on slide 1
        await A.click('.notes-toggle'); await A.wait_for_timeout(300)
        await A.fill('.notes-input', 'Say hello to the class.\nThen the plan.'); await A.wait_for_timeout(300)
        # assign slide 2 to Bob via the context menu
        await A.click('.slide-item:nth-child(2) .slide-thumb', button='right'); await A.wait_for_timeout(500)
        await A.hover('text=Assign to'); await A.wait_for_timeout(800)
        await A.screenshot(path=OUT + 'assign_menu.png')
        await A.click('.bp5-submenu .bp5-menu-item:has-text("Bob")'); await A.wait_for_timeout(1500)
        print('owners:', await ev("JSON.stringify(window.__morph.controller.project.owners)"), 'people setting:', await ev("JSON.stringify(window.__morph.controller.settings.people)"))
        link = await ev(f"location.origin + location.pathname + '#{inv['code']}'")
        B = await ctx.new_page(); hook(B, 'B')
        await B.goto(link.replace('index.html#', 'index.html?u=bob#')); await B.wait_for_timeout(5500)
        r = await B.evaluate("(() => { const c = window.__morph.controller; return { me: c.myKey(), notes: c.project.notes, owners: c.project.owners, names: Object.values(c.project.owners).map(k => c.personName(k)) }; })()")
        print('B sees:', r)
        await B.click('.sorter-head button[aria-label="Only the slides assigned to me"]'); await B.wait_for_timeout(500)
        print('B filtered visible slides:', await B.evaluate("Array.from(document.querySelectorAll('.slide-item')).filter(e => getComputedStyle(e).display !== 'none').map(e => e.dataset.index)"))
        await B.screenshot(path=OUT + 'bob_mine.png')
        # Bob writes a note on slide 2 while Alice edits slide 1's note
        await B.evaluate("window.__morph.controller.selectSlide(1)"); await B.wait_for_timeout(300)
        await B.evaluate("window.__morph.controller.setNote(window.__morph.controller.project.slides[1].id, 'Bob explains the graph')")
        await ev("window.__morph.controller.setNote(window.__morph.controller.project.slides[0].id, 'Alice changed this')")
        await A.wait_for_timeout(4000)
        print('A notes after both:', await ev("JSON.stringify(Object.values(window.__morph.controller.project.notes))"))
        print('B notes after both:', await B.evaluate("JSON.stringify(Object.values(window.__morph.controller.project.notes))"))
        # presenter notes
        await A.bring_to_front()
        await ev("window.__morph.controller.selectSlide(0)")
        await A.keyboard.press('Escape')
        await A.click('.topbar button:has-text("Present")') if await A.locator('.topbar button:has-text("Present")').count() else await A.click('button:has-text("Present")')
        await A.wait_for_timeout(1200)
        await A.keyboard.press('s'); await A.wait_for_timeout(500)
        await A.screenshot(path=OUT + 'present_notes.png')
        print('presenter notes text:', await ev("(document.querySelector('.pn-text')||{}).textContent"))
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        html = await ev("(async () => { const { buildExportHtml } = window.__morphExport || {}; return null; })()")
        h = await ev("(async () => { const c = window.__morph.controller; const r = await c.exportHtml(); return r.html || ''; })()")
        print('export contains notes:', ('Alice changed this' in (h or '')) or ('Bob explains' in (h or '')), 'export size', len(h or ''))
        print('\n'.join(logs[:20]))
        await ctx.close()
asyncio.run(main())
