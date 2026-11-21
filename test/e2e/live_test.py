import asyncio, shutil, json
from playwright.async_api import async_playwright
FAKE = open('test/e2e/fake-artifact.js').read()
STATE = """(() => { const c = window.__morph.controller; return { pid: c.projectId, slides: c.project.slides.map(s => s.id + ':' + s.page.children.map(e => e.id.slice(0,4) + '@' + Math.round(e.x) + (e.fill ? '/' + e.fill : '') + (e.text ? '/' + e.text.slice(0, 8) : '')).join(',')), title: c.project.title, live: c.liveStatus }; })()"""
async def main():
    shutil.rmtree('/tmp/pw-profile4', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-profile4', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width':1500,'height':900})
        await ctx.add_init_script(FAKE)
        logs=[]
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[A pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[A {m.type}] {m.text}') if m.type == 'error' else None)
        await A.goto('http://localhost:8765/dist/index.html?u=alice'); await A.wait_for_timeout(3500)
        B = await ctx.new_page()
        B.on('pageerror', lambda e: logs.append(f'[B pageerror] {e}'))
        B.on('console', lambda m: logs.append(f'[B {m.type}] {m.text}') if m.type == 'error' else None)
        await B.goto('http://localhost:8765/dist/index.html?u=bob'); await B.wait_for_timeout(3500)
        a0 = await A.evaluate(STATE); b0 = await B.evaluate(STATE)
        print('1. same project & content:', a0['pid'] == b0['pid'], a0['slides'] == b0['slides'])
        # 2. concurrent edits on the same slide, different objects
        await A.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='figure').set({x: 700, fill: '#ff0000'}); })()")
        await B.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='text').set({text: 'Hello from Bob'}); })()")
        await A.wait_for_timeout(3000)
        a1 = await A.evaluate(STATE); b1 = await B.evaluate(STATE)
        print('2. both edits on both screens:', a1['slides'] == b1['slides'], a1['slides'][0])
        # 3. same object, same attribute at the same time -> converge
        await A.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='figure').set({x: 111}); })()")
        await B.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='figure').set({x: 222}); })()")
        await A.wait_for_timeout(3500)
        a2 = await A.evaluate(STATE); b2 = await B.evaluate(STATE)
        print('3. converged on same attribute:', a2['slides'] == b2['slides'], a2['slides'][0])
        # 4. slide list: A adds a slide after 1, B deletes slide 2 at the same time
        await A.evaluate("window.__morph.controller.addSlide(1)")
        await B.evaluate("window.__morph.controller.deleteSlide(1)")
        await A.wait_for_timeout(3500)
        a3 = await A.evaluate(STATE); b3 = await B.evaluate(STATE)
        print('4. slide list converged:', [x.split(':')[0] for x in a3['slides']] == [x.split(':')[0] for x in b3['slides']], len(a3['slides']), 'slides')
        # 5. image upload on A shows on B
        await A.evaluate("window.__morph.controller.selectSlide(0)"); await A.wait_for_timeout(300)
        await A.evaluate("window.__morph.store.openSidePanel('upload')"); await A.wait_for_timeout(400)
        await A.set_input_files('.raeditor-panel-container input[type=file]', '/tmp/test.png'); await A.wait_for_timeout(1200)
        await A.click('.raeditor-panel-container img'); await A.wait_for_timeout(500)
        await A.evaluate("window.__morph.store.openSidePanel('')")
        await A.wait_for_timeout(3500)
        bimg = await B.evaluate("(() => { const c = window.__morph.controller; const im = c.project.slides[0].page.children.find(e => e.type === 'image'); return im ? im.src.slice(0, 22) + ' len=' + im.src.length : null; })()")
        print('5. image arrived on B:', bimg)
        # 6. undo on A after B changed something else on the same slide must keep B's change
        await B.evaluate("window.__morph.controller.selectSlide(0)"); await B.wait_for_timeout(500)
        await A.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='figure').set({x: 500}); })()"); await A.wait_for_timeout(2500)
        await B.evaluate("(() => { const s = window.__morph.store; s.activePage.children.find(e => e.type==='text').set({fill: '#00ff00'}); })()"); await B.wait_for_timeout(3000)
        await A.evaluate("window.__morph.store.history.undo()"); await A.wait_for_timeout(3000)
        a5 = await A.evaluate("(() => { const p = window.__morph.controller.project.slides[0].page; const t = p.children.find(e=>e.type==='text'); const f = p.children.find(e=>e.type==='figure'); return {textFill: t.fill, figX: f.x}; })()")
        b5 = await B.evaluate("(() => { const p = window.__morph.controller.project.slides[0].page; const t = p.children.find(e=>e.type==='text'); const f = p.children.find(e=>e.type==='figure'); return {textFill: t.fill, figX: f.x}; })()")
        print('6. undo kept collaborator change:', a5, b5)
        # 7. animation settings + rename + title
        await A.evaluate("(() => { const c = window.__morph.controller; const f = c.project.slides[1].page.children[0]; if (f) c.setAnim(1, [f.id], 'enter', {duration: 1.7, easing: 'bounce'}); const t = c.project.slides[0].page.children.find(e=>e.type==='text'); c.rename(t.id, 'Headline'); c.setTitle('Team deck'); })()")
        await A.wait_for_timeout(3000)
        b6 = await B.evaluate("(() => { const c = window.__morph.controller; const f = c.project.slides[1].page.children[0]; const t = c.project.slides[0].page.children.find(e=>e.type==='text'); return {anim: f ? c.project.slides[1].anim[f.id] : null, name: c.project.objects[t.id], title: c.project.title}; })()")
        print('7. anim/name/title on B:', b6)
        # 8. presence: cursor + selection overlay on B
        await A.evaluate("(() => { const s = window.__morph.store; const f = s.activePage.children.find(e=>e.type==='figure'); s.selectElements([f.id]); })()")
        await A.bring_to_front(); await A.mouse.move(700, 450); await A.mouse.move(720, 460); await A.wait_for_timeout(800)
        await B.bring_to_front(); await B.wait_for_timeout(800)
        await B.screenshot(path='/tmp/lv1.png')
        print('8. overlay on B:', await B.evaluate("({cursor: !!document.querySelector('.collab-cursor'), tag: document.querySelector('.collab-tag') && document.querySelector('.collab-tag').textContent})"))
        # 9. reload B -> state persists
        await B.reload(); await B.wait_for_timeout(4000)
        a8 = await A.evaluate(STATE); b8 = await B.evaluate(STATE)
        print('9. after reload equal:', a8['slides'] == b8['slides'], a8['title'], b8['title'])
        # 10. save version + statuses
        await A.evaluate("window.__morph.controller.save()"); await A.wait_for_timeout(2500)
        print('10. status A:', await A.evaluate("document.querySelector('.save-status').textContent"), '| versions', await A.evaluate("window.__morph.controller.saves.length"))
        await A.screenshot(path='/tmp/lv2.png')
        print('writes', await A.evaluate('window.__writes'), await B.evaluate('window.__writes'))
        print('\n'.join(logs[:30]))
        await ctx.close()
asyncio.run(main())
