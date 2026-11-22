import asyncio, shutil, json
from playwright.async_api import async_playwright
FAKE = open('test/e2e/fake-artifact.js').read()
OUT = '/tmp/'
async def main():
    shutil.rmtree('/tmp/pw-profile5', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-profile5', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width':1500,'height':900})
        await ctx.add_init_script(FAKE)
        logs=[]
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[A pageerror] {e}'))
        A.on('console', lambda m: logs.append(f'[A {m.type}] {m.text}') if m.type in ('error','warning') else None)
        await A.goto('http://localhost:8766/dist/index.html?u=alice'); await A.wait_for_timeout(3500)
        ev = A.evaluate
        # --- A. versions: name, change, restore
        await ev("window.__morph.controller.nameCurrentVersion('First')"); await A.wait_for_timeout(1500)
        t0 = await ev("(() => { const s = window.__morph.store; const t = s.activePage.children.find(e=>e.type==='text'); const v = t.text; t.set({text: 'CHANGED'}); return v; })()")
        await A.wait_for_timeout(1500)
        await ev("(async () => { const c = window.__morph.controller; const e = c.saves.find(x => x.name === 'First'); await c.restoreVersion(e); })()"); await A.wait_for_timeout(2000)
        r = await ev("(() => { const c = window.__morph.controller; const t = c.project.slides[0].page.children.find(e=>e.type==='text'); return {text: t.text, saves: c.saves.map(s => (s.name||'') + ':' + (s.reason||'') + ':' + (s.auto?'a':'m'))}; })()")
        print('A. restore:', r['text'] == t0, r['saves'][:4])
        # --- B. IDs are case-insensitive
        r = await ev("""(() => { const c = window.__morph.controller; const kids = c.project.slides[0].page.children;
            const e1 = c.rename(kids[0].id, 'pig'); const e2 = c.rename(kids[1].id, 'Pig'); return [e1, e2, c.project.objects[kids[0].id].name]; })()""")
        print('B. ids:', r)
        # --- C. PIG / PIGGY merge: build 6 slides, 3 with PIG, 3 with PIGGY
        await ev("""(() => { const c = window.__morph.controller; const p = c.project;
            const mk = (id) => ({ id: 'pg' + Math.random().toString(36).slice(2,8), page: { id: 'x', children: [{ id, type: 'figure', subType: 'rect', x: 100, y: 100, width: 100, height: 100, fill: '#f0a' }], background: 'white' }, anim: {} });
            const sl = [mk('ID_PIG'), mk('ID_PIG'), mk('ID_PIG'), mk('ID_PIGGY'), mk('ID_PIGGY'), mk('ID_PIGGY')];
            sl.forEach(s => s.page.id = s.id);
            p.objects['ID_PIG'] = { name: 'PIGX' }; p.objects['ID_PIGGY'] = { name: 'PIGGYX' };
            p.slides.push(...sl); c.liveTouch(sl.map(s => s.id)); c.markDirty(); c.emitNow(); })()""")
        n = await ev("window.__morph.controller.project.slides.length")
        await ev(f"window.__morph.controller.selectSlide({n-6})"); await A.wait_for_timeout(500)
        r = await ev("(() => { const c = window.__morph.controller; return c.linkEverywhere('ID_PIG', 'piggyx'); })()"); await A.wait_for_timeout(500)
        ids = await ev("window.__morph.controller.project.slides.slice(-6).map(s => s.page.children[0].id)")
        print('C. link all:', r, all(i == 'ID_PIGGY' for i in ids))
        # this-slide-only variant
        await ev("""(() => { const c = window.__morph.controller; const p = c.project; const n = p.slides.length;
            for (let k = n - 6; k < n - 3; k++) { p.slides[k].page.children[0].id = 'ID_PIG2'; c.liveTouch([p.slides[k].id]); }
            p.objects['ID_PIG2'] = { name: 'PIG2' }; c.selectSlide(n - 6); })()"""); await A.wait_for_timeout(500)
        await ev("window.__morph.controller.linkTo('ID_PIG2', 'PIGGYX')"); await A.wait_for_timeout(500)
        ids = await ev("window.__morph.controller.project.slides.slice(-6).map(s => s.page.children[0].id)")
        print('C2. link this slide only:', ids)
        # --- D. duplicate unlinked / fresh flag
        await ev("window.__morph.controller.selectSlide(0)"); await A.wait_for_timeout(400)
        r = await ev("""(() => { const c = window.__morph.controller; const before = c.project.slides[0].page.children.map(e => e.id);
            c.duplicateSlide(0, { unlinked: true }); const after = c.project.slides[1].page.children.map(e => e.id);
            return { overlap: before.filter(x => after.includes(x)).length, n: after.length }; })()""")
        print('D1. unlinked duplicate shares', r['overlap'], 'of', r['n'])
        r = await ev("""(() => { const c = window.__morph.controller; const kids = c.project.slides[0].page.children; c.setFresh(kids[0].id, true);
            c.duplicateSlide(0); const after = c.project.slides[1].page.children.map(e => e.id);
            return { firstNew: !after.includes(kids[0].id), restSame: kids.slice(1).every(k => after.includes(k.id)), copyFresh: !!c.project.objects[after[0]].fresh }; })()""")
        print('D2. fresh object:', r)
        # --- E. templates
        await ev("window.__morph.controller.saveSlideAsTemplate(0, 'My template')"); await A.wait_for_timeout(1500)
        tl = await ev("(async () => { const c = window.__morph.controller; const t = await c.loadTemplates(); return t.map(x => x.name + ':' + x.page.children.length); })()")
        r = await ev("""(() => { const c = window.__morph.controller; const t = c.templates[0]; c.insertTemplate(t, 1); const s = c.project.slides[1];
            const orig = c.project.slides[0].page.children.map(e => e.id); return { n: s.page.children.length, shared: s.page.children.filter(e => orig.includes(e.id)).length, named: s.page.children.every(e => c.project.objects[e.id]) }; })()""")
        print('E. templates:', tl, r)
        await ev("window.__morph.controller.setUi({ tplAt: 2 })"); await A.wait_for_timeout(1200)
        await A.screenshot(path=OUT + 'ft_tpl.png')
        await ev("window.__morph.controller.setUi({ tplAt: null })"); await A.wait_for_timeout(300)
        # --- F. pasted image already used on another slide
        await ev("""(() => { const c = window.__morph.controller; const s = window.__morph.store;
            const big = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#123456"/>' + '<!--' + 'x'.repeat(200) + '--></svg>');
            s.activePage.addElement({ type: 'image', src: big, x: 50, y: 50, width: 100, height: 100 }); window.__big = big; })()"""); await A.wait_for_timeout(800)
        await ev("window.__morph.controller.selectSlide(2)"); await A.wait_for_timeout(500)
        await ev("window.__morph.store.activePage.addElement({ type: 'image', src: window.__big, x: 300, y: 50, width: 100, height: 100 })"); await A.wait_for_timeout(800)
        toast = await ev("Array.from(document.querySelectorAll('.bp5-toast')).map(t => t.textContent).join(' | ')")
        print('F. toast:', toast)
        btn = A.locator('.bp5-toast .bp5-button', has_text='Make it the same object')
        if await btn.count():
            await btn.first.click(); await A.wait_for_timeout(600)
            r = await ev("(() => { const c = window.__morph.controller; const ids = c.project.slides.flatMap(s => s.page.children.filter(e => e.src === window.__big).map(e => e.id)); return [ids.length, new Set(ids).size]; })()")
            print('F2. linked after click:', r)
        # --- G. Jump (cut) transition
        r = await ev("""(() => { const c = window.__morph.controller; const p = c.project;
            const s1 = { id: 'j1', page: { id: 'j1', background: 'white', children: [{ id: 'JMP', type: 'figure', subType: 'rect', x: 0, y: 0, width: 100, height: 100, fill: '#000' }] }, anim: {} };
            const s2 = { id: 'j2', page: { id: 'j2', background: 'white', children: [{ id: 'JMP', type: 'figure', subType: 'rect', x: 1000, y: 0, width: 100, height: 100, fill: '#000' }] }, anim: { JMP: { enter: { type: 'none', duration: 2, easing: 'linear', cut: true } } } };
            const st = document.createElement('div'); st.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;visibility:hidden'; document.body.appendChild(st);
            const { renderStatic } = window; window.__morph.controller; 
            const r1 = window.__morph.startTransition(st, s1, s1, c.ctx, () => {}); r1.finish();
            const run = window.__morph.startTransition(st, s1, s2, c.ctx, () => {});
            const node = st.querySelector('[data-id="JMP"]'); const box = node && node.getBoundingClientRect(); const x1 = box ? box.left : null; run.finish();
            s2.anim.JMP.enter.cut = false; const r3 = window.__morph.startTransition(st, s1, s1, c.ctx, () => {}); r3.finish();
            const run2 = window.__morph.startTransition(st, s1, s2, c.ctx, () => {}); const n2 = st.querySelector('[data-id="JMP"]'); const x2 = n2.getBoundingClientRect().left; run2.finish();
            st.remove(); return { jumpX: x1, morphX: x2 }; })()""")
        print('G. jump at t=0 x:', r)
        # --- H. presenter keys
        await ev("window.__morph.controller.selectSlide(0)"); await A.wait_for_timeout(300)
        await A.click('.present-btn'); await A.wait_for_timeout(800)
        i0 = await ev("document.querySelector('.mp-count').textContent")
        await A.keyboard.press('b'); await A.wait_for_timeout(200)
        black = await ev("document.querySelector('.mp-veil').className")
        await A.keyboard.press('PageDown'); await A.wait_for_timeout(200)
        after = await ev("[document.querySelector('.mp-veil').className, document.querySelector('.mp-count').textContent]")
        await A.keyboard.press('PageDown'); await A.wait_for_timeout(900)
        moved = await ev("document.querySelector('.mp-count').textContent")
        await A.keyboard.press('l'); await A.mouse.move(600, 400); await A.mouse.move(640, 420); await A.wait_for_timeout(200)
        laser = await ev("[document.querySelector('.mp-root').classList.contains('mp-laser-on'), getComputedStyle(document.querySelector('.mp-laser')).display]")
        await A.keyboard.press('?'); await A.wait_for_timeout(200)
        await A.screenshot(path=OUT + 'ft_present.png')
        helpo = await ev("document.querySelector('.mp-help').classList.contains('is-open')")
        await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        print('H. presenter:', i0, black, after, moved, laser, helpo, 'closed:', await ev("!document.querySelector('.mp-root')"))
        # --- I. equation
        await ev("window.__morph.store.openSidePanel('equation')"); await A.wait_for_timeout(4000)
        st = await ev("(() => ({ img: !!document.querySelector('.eq-preview img'), err: (document.querySelector('.eq-err')||{}).textContent || null }))()")
        print('I. equation preview:', st)
        await A.screenshot(path=OUT + 'ft_eq.png')
        await A.click('.eq-panel .bp5-intent-primary'); await A.wait_for_timeout(800)
        eq = await ev("(() => { const s = window.__morph.store; const e = s.activePage.children.find(x => x.custom && x.custom.latex); return e ? { id: e.id, w: Math.round(e.width), h: Math.round(e.height), latex: e.custom.latex, srcLen: e.src.length } : null; })()")
        print('I2. inserted:', eq)
        if eq:
            await ev(f"window.__morph.store.selectElements(['{eq['id']}'])"); await A.wait_for_timeout(400)
            await A.fill('.eq-input', '\\\\int_0^1 x^2\\\\,dx = \\\\frac{{1}}{{3}}'); await A.wait_for_timeout(700)
            await A.click('.eq-panel .bp5-intent-primary'); await A.wait_for_timeout(800)
            eq2 = await ev(f"(() => {{ const e = window.__morph.store.getElementById('{eq['id']}'); return {{ latex: e.custom.latex, w: Math.round(e.width), srcLen: e.src.length }}; }})()")
            print('I3. updated in place:', eq2)
            await A.fill('.eq-input', '\\\\frac{{a}{{b}'); await A.wait_for_timeout(900)
            print('I4. error shown:', await ev("(document.querySelector('.eq-err')||{}).textContent || null"))
            await A.screenshot(path=OUT + 'ft_eq2.png')
        await ev("window.__morph.store.openSidePanel('')"); await A.wait_for_timeout(300)
        # --- J. right-click menu → Animation
        await ev("window.__morph.controller.selectSlide(1)"); await A.wait_for_timeout(500)
        if await A.locator('.anim-toggle.bp5-active').count(): await A.click('.anim-toggle'); await A.wait_for_timeout(300)
        box = await ev("(() => { const s = window.__morph.store; const e = s.activePage.children[0]; s.selectElements([e.id]); const st = window.Konva.stages[0]; const n = st.findOne('#' + e.id); const r = n.getClientRect(); const c = st.container().getBoundingClientRect(); return { x: c.left + r.x + r.width / 2, y: c.top + r.y + r.height / 2 }; })()")
        await A.mouse.click(box['x'], box['y'], button='right'); await A.wait_for_timeout(500)
        menu = await ev("Array.from(document.querySelectorAll('.obj-menu .bp5-menu-item')).map(m => m.textContent).slice(0, 4)")
        await A.screenshot(path=OUT + 'ft_menu.png')
        await A.locator('.obj-menu .bp5-menu-item', has_text='Animation').first.click(); await A.wait_for_timeout(500)
        print('J. menu:', menu, '| panel open:', await A.locator('.anim-toggle.bp5-active').count() == 1)
        # --- K. anim panel: ID label, Jump pill
        await A.screenshot(path=OUT + 'ft_panel.png')
        k = await ev("(() => ({ label: (document.querySelector('.id-label')||{}).textContent, pills: Array.from(document.querySelectorAll('.phase .bp5-segmented-control')).map(x => x.textContent) }))()")
        print('K. panel:', k)
        await ev("(() => { const c = window.__morph.controller; for (let k = 1; k < c.project.slides.length; k++) { const prev = new Set(c.project.slides[k-1].page.children.map(e => e.id)); const e = c.project.slides[k].page.children.find(x => prev.has(x.id)); if (e) { c.selectSlide(k); setTimeout(() => window.__morph.store.selectElements([e.id]), 300); window.__mk = k; return; } } })()"); await A.wait_for_timeout(900)
        await A.screenshot(path=OUT + 'ft_panel2.png')
        print('K1. pills on morph object:', await ev("Array.from(document.querySelectorAll('.phase .bp5-segmented-control')).map(x => x.textContent)"))
        jb = A.locator('.phase').first.locator('button', has_text='Jump')
        if await jb.count():
            await jb.click(); await A.wait_for_timeout(400)
            print('K2. cut set:', await ev("(() => { const c = window.__morph.controller; const id = c.selectedLeafIds()[0]; return c.project.slides[window.__mk].anim[id]; })()"))
        await A.click('.obj-head button[aria-label=\"Link to another ID\"]'); await A.wait_for_timeout(400)
        await A.screenshot(path=OUT + 'ft_link.png')
        await A.keyboard.press('Escape')
        # --- L. guest name prompt
        G = await ctx.new_page()
        G.on('pageerror', lambda e: logs.append(f'[G pageerror] {e}'))
        await G.goto('http://localhost:8766/dist/index.html?u=guest'); await G.wait_for_timeout(3500)
        dlg = await G.evaluate("!!document.querySelector('.name-dialog')")
        await G.fill('.name-dialog input', 'Zoé'); await G.keyboard.press('Enter'); await G.wait_for_timeout(1500)
        await A.bring_to_front(); await A.wait_for_timeout(800)
        names = await ev("window.__morph.controller.othersIn(window.__morph.controller.projectId).map(x => window.__morph.controller.personOf(x).name)")
        print('L. guest dialog:', dlg, '| A sees:', names)
        print('\n'.join(logs[:30]))
        await ctx.close()
asyncio.run(main())
