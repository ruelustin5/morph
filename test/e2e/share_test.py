import asyncio, shutil, json
from playwright.async_api import async_playwright
from localfiles import serve_files
FAKE = open('test/e2e/fake-artifact.js').read()
OUT = '/tmp/'
URL = 'http://localhost:8766/dist/index.html?roles=1&u='
async def main():
    shutil.rmtree('/tmp/pw-share', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-share', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width':1400,'height':860})
        await serve_files(ctx)
        await ctx.add_init_script(FAKE)
        logs = []
        def hook(pg, tag):
            pg.on('pageerror', lambda e: logs.append(f'[{tag} pageerror] {e}'))
            pg.on('console', lambda m: logs.append(f'[{tag} {m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        A = ctx.pages[0]; hook(A, 'A')
        await A.goto(URL + 'alice'); await A.wait_for_timeout(4000)
        ev = A.evaluate
        print('A owner:', await ev("[window.__morph.controller.isOwner, window.__morph.controller.spaceName(), window.__morph.controller.canShare]"))
        await ev("window.__morph.store.activePage.addElement({type:'text', text:'SECRET-A', x:100, y:100, width:800, fontSize:80})"); await A.wait_for_timeout(1500)
        await ev("window.__morph.controller.newProject()"); await A.wait_for_timeout(2500)
        await ev("window.__morph.store.activePage.addElement({type:'text', text:'SHARED-B', x:100, y:300, width:800, fontSize:80})")
        await ev("window.__morph.controller.setTitle('Shared deck')"); await A.wait_for_timeout(2000)
        pid = await ev("window.__morph.controller.projectId")
        inv1 = await ev(f"window.__morph.controller.createInvite('{pid}', 'Bob')"); await A.wait_for_timeout(1500)
        inv2 = await ev(f"window.__morph.controller.createInvite('{pid}', 'Zoé')"); await A.wait_for_timeout(800)
        sh = await ev("(() => { const c = window.__morph.controller; return [c.projectShared, c.pbe.prefix]; })()")
        print('shared:', sh, inv1['code'], inv2['code'])
        leak = await ev("Object.keys(localStorage).filter(k => k.startsWith('fakedb:sh/') && /SHARED-B|Shared deck/.test(localStorage.getItem(k))).length")
        enc = await ev("Object.keys(localStorage).filter(k => k.startsWith('fakedb:sh/')).length")
        oldPriv = await ev(f"Object.keys(localStorage).filter(k => k.startsWith('fakedb:proj/{pid}/')).length")
        print('encrypted docs:', enc, 'plaintext leaks:', leak, 'private copy docs left:', oldPriv)
        await ev(f"window.__morph.controller.setUi({{}})")
        # share dialog screenshot
        await A.click('.share-chip'); await A.wait_for_timeout(1200)
        await A.screenshot(path=OUT + 'sh_dialog.png')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        # --- Bob
        B = await ctx.new_page(); hook(B, 'B')
        await B.goto(URL + 'bob'); await B.wait_for_timeout(4000)
        print('B join screen:', await B.evaluate("[!!document.querySelector('.join-screen'), document.querySelector('.join-card h1') && document.querySelector('.join-card h1').textContent]"))
        await B.screenshot(path=OUT + 'sh_join.png')
        await B.fill('.join-input input', inv1['code'].lower().replace('-', ' ')); await B.click('.join-card button[type=submit]'); await B.wait_for_timeout(3500)
        r = await B.evaluate("(() => { const c = window.__morph.controller; return { title: c.project && c.project.title, texts: c.project && c.project.slides.flatMap(s => s.page.children.filter(e => e.type==='text').map(e => e.text)), projects: c.projects.map(x => x.title), space: c.spaceName(), nick: c.myName() }; })()")
        print('B joined:', r)
        # live edit both ways
        await B.evaluate("(() => { const s = window.__morph.store; const t = s.activePage.children.find(e => e.text === 'SHARED-B'); t.set({ text: 'EDITED-BY-BOB' }); })()"); await B.wait_for_timeout(2500)
        print('A sees Bob edit:', await ev("window.__morph.controller.project.slides[0].page.children.some(e => e.text === 'EDITED-BY-BOB')"))
        print('A sees Bob avatar:', await ev("window.__morph.controller.othersIn(window.__morph.controller.projectId).map(x => window.__morph.controller.personOf(x).name)"))
        # --- guest with named code
        G = await ctx.new_page(); hook(G, 'G')
        await G.goto(URL + 'guest'); await G.wait_for_timeout(4000)
        r = await G.evaluate(f"window.__morph.controller.joinWithCode('{inv2['code']}')"); await G.wait_for_timeout(2500)
        print('G joined:', r, await G.evaluate("[window.__morph.controller.myName(), !!document.querySelector('.name-dialog'), window.__morph.controller.project && window.__morph.controller.project.title]"))
        await G.screenshot(path=OUT + 'sh_guest.png')
        # A share info shows joined
        info = await ev(f"window.__morph.controller.shareInfo('{pid}')")
        print('share info:', [(x['name'], bool(x['joined'])) for x in info['invites']])
        # --- remove Bob → rekey
        old_prefix = await ev("window.__morph.controller.pbe.prefix")
        r = await ev(f"window.__morph.controller.removeInvite('{pid}', '{inv1['id']}')"); await A.wait_for_timeout(5000)
        print('removed bob:', r)
        print('A after rekey:', await ev("[window.__morph.controller.pbe.prefix, window.__morph.controller.project.title]"), 'old:', old_prefix)
        await B.bring_to_front(); await B.wait_for_timeout(1500)
        print('B after removal:', await B.evaluate("[!!document.querySelector('.join-screen'), window.__morph.controller.projects.length, Array.from(document.querySelectorAll('.bp5-toast')).map(t => t.textContent).join('|')]"))
        await G.bring_to_front(); await G.wait_for_timeout(1500)
        print('G still in:', await G.evaluate("[window.__morph.controller.pbe && window.__morph.controller.pbe.prefix, window.__morph.controller.project && window.__morph.controller.project.slides[0].page.children.map(e => e.text).filter(Boolean)]"))
        await A.wait_for_timeout(4000)
        left = await ev(f"Object.keys(localStorage).filter(k => k.startsWith('fakedb:{old_prefix}')).map(k => k.slice(7 + {len(old_prefix)}))")
        print('old scope left:', left)
        # guest edit at new scope reaches A
        await G.evaluate("(() => { const s = window.__morph.store; const t = s.activePage.children.find(e => e.type === 'text'); t.set({ text: 'ZOE-WAS-HERE' }); })()"); await G.wait_for_timeout(2500)
        print('A sees Zoé edit:', await ev("window.__morph.controller.project.slides[0].page.children.some(e => e.text === 'ZOE-WAS-HERE')"))
        # guests never touched private paths
        for pg, tag in ((B, 'B'), (G, 'G')):
            print(tag, 'denied paths:', await pg.evaluate("(window.__deniedPaths || []).slice(0, 8)"))
        # direct attempt: guest reading the owner's project list is refused
        print('G direct read meta/projects:', await G.evaluate("(async () => { try { const db = await window.claude.use('db'); await db.doc('meta/projects').get(); return 'READ!'; } catch (e) { return e.code; } })()"))
        # --- stop sharing
        await ev(f"window.__morph.controller.stopSharing('{pid}')"); await A.wait_for_timeout(5000)
        print('A private again:', await ev("[window.__morph.controller.projectShared, window.__morph.controller.pbe.prefix || 'root', window.__morph.controller.projectBase]"))
        await G.bring_to_front(); await G.wait_for_timeout(1500)
        print('G after stop:', await G.evaluate("[!!document.querySelector('.join-screen'), window.__morph.controller.projects.length]"))
        # A: projects dialog
        await A.bring_to_front(); print('A overlays:', await ev("Array.from(document.querySelectorAll('.bp5-overlay-open')).map(o => o.textContent.slice(0, 120))")); await A.keyboard.press('Escape'); await A.wait_for_timeout(400); await A.click('.projects-btn', force=True); await A.wait_for_timeout(1000)
        await A.screenshot(path=OUT + 'sh_projects.png')
        print('\n'.join(logs[:30]))
        await ctx.close()
asyncio.run(main())
