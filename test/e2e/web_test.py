import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/'
async def main():
    shutil.rmtree('/tmp/pw-web', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-web', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 860})
        logs = []
        def hook(pg, tag):
            pg.on('pageerror', lambda e: logs.append(f'[{tag} pageerror] {e}'))
            pg.on('console', lambda m: logs.append(f'[{tag} {m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        A = ctx.pages[0]; hook(A, 'A')
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(3000)
        print('A first visit (unclaimed):', await A.evaluate("[!!document.querySelector('.join-screen'), document.querySelector('.join-card') && document.querySelector('.join-card').innerText.replace(/\\n+/g, ' | ')]"))
        await A.screenshot(path=OUT + 'web_claim.png')
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(5000)
        ev = A.evaluate
        print('A after claim:', await ev("(() => { const c = window.__morph.controller; return { owner: c.isOwner, live: c.liveMode, space: c.spaceName(), project: c.project && c.project.title, me: c.me && c.me.name }; })()"))
        await ev("window.__morph.store.activePage.addElement({type:'text', text:'PRIVATE-A', x:100, y:100, width:800, fontSize:80})"); await A.wait_for_timeout(1500)
        await ev("window.__morph.controller.newProject()"); await A.wait_for_timeout(2500)
        await ev("window.__morph.store.activePage.addElement({type:'text', text:'SHARED-B', x:100, y:300, width:800, fontSize:80})")
        await ev("window.__morph.controller.setTitle('Web shared deck')"); await A.wait_for_timeout(2000)
        pid = await ev("window.__morph.controller.projectId")
        inv = await ev(f"(async () => {{ const c = window.__morph.controller; const i = await c.createInvite('{pid}', 'Bob'); return i; }})()"); await A.wait_for_timeout(1000)
        link = await ev(f"(() => location.origin + location.pathname + '#' + '{inv['code']}')()")
        print('magic link:', link.replace('http://localhost:8766', ''))
        leak = await ev("Object.keys(localStorage).filter(k => k.startsWith('fbfs:sh/') && /SHARED-B|Web shared deck/.test(localStorage.getItem(k))).length")
        print('plaintext leaks in shared docs:', leak)
        # --- Bob opens the magic link (new tab, anonymous)
        B = await ctx.new_page(); hook(B, 'B')
        await B.goto(link.replace('index.html#', 'index.html?u=bob#')); await B.wait_for_timeout(5000)
        r = await B.evaluate("(() => { const c = window.__morph.controller; return { hash: location.hash, owner: c.isOwner, title: c.project && c.project.title, texts: c.project && c.project.slides.flatMap(s => s.page.children.map(e => e.text).filter(Boolean)), nick: c.myName(), needsName: !!c.needsName, space: c.spaceName() }; })()")
        print('B via link:', r)
        await B.evaluate("(() => { const s = window.__morph.store; const t = s.activePage.children.find(e => e.text === 'SHARED-B'); t.set({ text: 'BOB-EDIT' }); })()"); await B.wait_for_timeout(3000)
        print('A sees Bob edit:', await ev("window.__morph.controller.project.slides[0].page.children.some(e => e.text === 'BOB-EDIT')"))
        print('A sees Bob live:', await ev("window.__morph.controller.othersIn(window.__morph.controller.projectId).map(x => window.__morph.controller.personOf(x).name)"))
        print('B direct read of private list:', await B.evaluate("(async () => { const db = await window.claude.use('db'); try { await db.doc('meta/projects').get(); return 'READ!'; } catch (e) { return e.code; } })()"))
        print('B write to an unshared place:', await B.evaluate("(async () => { const db = await window.claude.use('db'); try { await db.doc('sh/notshared123/live/x').set({ a: 1 }); return 'WROTE!'; } catch (e) { return e.code; } })()"))
        print('B list shared places:', await B.evaluate("(async () => { const db = await window.claude.use('db'); try { const r = await db.collection('sh').get(); return 'LISTED ' + r.length; } catch (e) { return e.code; } })()"))
        print('B overwrite the space owner:', await B.evaluate("(async () => { const db = await window.claude.use('db'); try { await db.doc('pub/space').set({ owner: 'x' }); return 'WROTE!'; } catch (e) { return e.code; } })()"))
        print('B denied during normal use:', await B.evaluate("window.__fsDenied.slice(0, 6)"))
        # Bob reloads without the link: comes back to the project
        await B.goto(BASE + '?u=bob'); await B.wait_for_timeout(4500)
        print('B reload:', await B.evaluate("[window.__morph.controller.project && window.__morph.controller.project.title, !!document.querySelector('.join-screen')]"))
        await A.bring_to_front()
        await A.click('.share-chip'); await A.wait_for_timeout(1500)
        await A.screenshot(path=OUT + 'web_share.png')
        await A.keyboard.press('Escape')
        # remove Bob
        r = await ev(f"window.__morph.controller.removeInvite('{pid}', '{inv['id']}')"); await A.wait_for_timeout(6000)
        await B.bring_to_front(); await B.wait_for_timeout(1500)
        print('B after removal:', await B.evaluate("[!!document.querySelector('.join-screen'), window.__morph.controller.projects.length]"))
        await B.screenshot(path=OUT + 'web_removed.png')
        # owner reload stays owner
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(4500)
        print('A reload:', await A.evaluate("[window.__morph.controller.isOwner, window.__morph.controller.projects.map(x => x.title + (x.shared ? '*' : ''))]"))
        # another Google user can't take the space
        C = await ctx.new_page(); hook(C, 'C')
        await C.goto(BASE + '?u=carl'); await C.wait_for_timeout(3000)
        await C.locator('.join-owner button').click(); await C.wait_for_timeout(2500)
        print('C tries to claim:', await C.evaluate("[window.__morph.controller.isOwner, Array.from(document.querySelectorAll('.bp5-toast')).map(t => t.textContent).join('|')]"))
        print('\n'.join(logs[:25]))
        await ctx.close()
asyncio.run(main())
