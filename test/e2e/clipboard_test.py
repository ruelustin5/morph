# Copy, cut and paste objects; pasting on the next slide keeps the ID (morph); theme titles have their own IDs.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-clip', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-clip', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        await ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        S = "window.__morph.store"; C = "window.__morph.controller"
        kids = lambda: ev(f"{S}.activePage.children.map(e => e.id)")
        async def select_last():
            await ev(f"(() => {{ const p = {S}.activePage; {S}.selectElements([p.children[p.children.length - 1].id]); }})()")
            await A.mouse.click(1000, 840); await A.wait_for_timeout(100)  # focus the canvas area (empty spot below the slide)
            await ev(f"(() => {{ const p = {S}.activePage; {S}.selectElements([p.children[p.children.length - 1].id]); }})()")
        await ev(f"{C}.selectSlide(0)"); await A.wait_for_timeout(800)
        await select_last()
        src = (await kids())[-1]
        srcEl = await ev(f"(() => {{ const e = {S}.getElementById('{src}'); return [Math.round(e.x), Math.round(e.y)]; }})()")
        await A.keyboard.press('Control+c'); await A.wait_for_timeout(200)
        sysclip = await ev("navigator.clipboard.readText().catch(e => 'ERR ' + e.message)")
        print('system clipboard text after copy:', repr(sysclip[:60]))
        await A.keyboard.press('Control+v'); await A.wait_for_timeout(700)
        k1 = await kids(); new1 = k1[-1]
        pos1 = await ev(f"(() => {{ const e = {S}.getElementById('{new1}'); return [Math.round(e.x), Math.round(e.y)]; }})()")
        print('same slide paste: count', len(k1), '| new id differs:', new1 != src, '| offset:', [pos1[0] - srcEl[0], pos1[1] - srcEl[1]], '| selected new:', await ev(f"{S}.selectedElementsIds.slice()") == [new1])
        await A.keyboard.press('Control+v'); await A.wait_for_timeout(700)
        print('paste again: count', len(await kids()))
        # next slide: same ID, same place, toast
        await ev(f"{C}.selectSlide(1)"); await A.wait_for_timeout(900)
        before2 = await kids()
        await A.mouse.click(1000, 840); await A.wait_for_timeout(100)
        await A.keyboard.press('Control+v'); await A.wait_for_timeout(900)
        k2 = await kids()
        added = [x for x in k2 if x not in before2]
        pos2 = await ev(f"(() => {{ const e = {S}.getElementById('{added[0]}'); return [Math.round(e.x), Math.round(e.y)]; }})()") if added else None
        print('slide 2 paste: added', added, '| same ID as slide 1:', added == [src], '| same place:', pos2 == srcEl)
        toast = await ev("Array.from(document.querySelectorAll('.bp5-toast')).map(x => x.innerText).join(' | ')")
        print('toast:', toast.replace('\n', ' '))
        await A.keyboard.press('Control+v'); await A.wait_for_timeout(700)
        k3 = await kids(); print('second paste on slide 2 gets a new ID:', k3[-1] not in (src,), len(k3) == len(k2) + 1)
        # Make separate from the toast
        btn = A.locator('.bp5-toast .bp5-button:has-text("Make separate")')
        if await btn.count():
            await btn.first.click(); await A.wait_for_timeout(600)
            print('after Make separate, slide 2 still has slide-1 ID:', src in await kids())
        # cut
        await select_last(); cut_id = (await kids())[-1]
        await A.keyboard.press('Control+x'); await A.wait_for_timeout(600)
        print('cut removed it:', cut_id not in await kids())
        # right-click menus
        await select_last()
        box = await ev(f"(() => {{ const e = {S}.selectedElements[0]; return [e.x + e.width / 2, e.y + e.height / 2]; }})()")
        cv = await A.locator('.raeditor-workspace-container canvas').first.bounding_box()
        sc = await ev(f"{S}.scale")
        # find the slide's top-left on screen via konva stage
        org = await ev("(() => { const st = window.__morph.Konva.stages[0]; const pg = st.findOne('.page-container') || st.children[0].children[0]; const r = st.container().getBoundingClientRect(); const tr = pg.getAbsoluteTransform().getTranslation(); return [r.left + tr.x, r.top + tr.y]; })()")
        await A.mouse.click(org[0] + box[0] * sc, org[1] + box[1] * sc, button='right'); await A.wait_for_timeout(500)
        print('object menu:', await ev("Array.from(document.querySelectorAll('.obj-menu > li')).map(x => x.innerText.replace(/\\n/g, ' ')).filter(Boolean)"))
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        await A.mouse.click(1000, 840, button='right'); await A.wait_for_timeout(500)
        print('empty spot menu:', await ev("Array.from(document.querySelectorAll('.obj-menu > li')).map(x => x.innerText.replace(/\\n/g, ' '))"), '| selection:', await ev(f"{S}.selectedElementsIds.length"))
        n = len(await kids())
        await A.click('.obj-menu li:has-text("Paste") a'); await A.wait_for_timeout(600)
        print('paste from menu added one:', len(await kids()) == n + 1)
        # text from another app
        await ev("navigator.clipboard.writeText('Hello from another app')"); await A.wait_for_timeout(100)
        await A.mouse.click(1000, 840); await ev(f"{S}.selectElements([])")
        await A.keyboard.press('Control+v'); await A.wait_for_timeout(700)
        last = await ev(f"(() => {{ const p = {S}.activePage; const e = p.children[p.children.length - 1]; return [e.type, e.text, e.fontFamily]; }})()")
        print('text from another app:', last)
        # typing in an input still pastes text there
        await ev("navigator.clipboard.writeText('ABC')")
        await select_last(); await A.wait_for_timeout(500)
        if not await A.locator('#obj-id').is_visible():
            await A.click('.topbar button:has-text("Animation")'); await A.wait_for_timeout(600)
        n = len(await kids())
        if await A.locator('#obj-id').count():
            await A.click('#obj-id'); await A.keyboard.press('Control+a'); await A.keyboard.press('Control+v'); await A.wait_for_timeout(300)
            print('paste in the ID field:', await A.locator('#obj-id').input_value(), '| no object added:', len(await kids()) == n)
            await A.keyboard.press('Escape')
        # themes: titles of two layouts have different IDs
        await ev(f"""(() => {{ const c = {C}; c.setTheme('coral'); const L = window.__morph.themeLayouts('coral');
            c.insertTemplate(L.find(x => x.name === 'Quote'), c.project.slides.length); c.insertTemplate(L.find(x => x.name === 'Title and points') || L[3], c.project.slides.length); }})()"""); await A.wait_for_timeout(1200)
        t = await ev(f"(() => {{ const c = {C}; const n = c.project.slides.length; const tx = (k) => c.project.slides[k].page.children.filter(e => e.type === 'text').map(e => e.id); const a = tx(n - 2), b = tx(n - 1); return {{ shared: a.filter(x => b.includes(x)), roleShapes: c.project.slides[n - 1].page.children.filter(e => /^th-/.test(e.id)).map(e => e.id) }}; }})()")
        print('text shared between two layouts:', t['shared'], '| shapes that still morph:', t['roleShapes'])
        # an older presentation with one title ID everywhere is fixed when opened
        r = await ev(f"""(() => {{ const c = {C}; const p = JSON.parse(JSON.stringify(c.project));
            const mk = (txt) => ({{ id: 'th-coral-title', type: 'text', text: txt, x: 100, y: 100, width: 800, height: 100, fontSize: 60 }});
            p.slides = p.slides.slice(0, 4);
            p.slides[0].page.children.push(mk('Intro')); p.slides[1].page.children.push(mk('Intro')); p.slides[2].page.children.push(mk('Results')); p.slides[3].page.children.push(mk('Intro'));
            p.slides[2].anim = {{ 'th-coral-title': {{ enter: {{ type: 'fade', duration: 1 }} }} }};
            p.objects['th-coral-title'] = {{ name: 'CORAL-TITLE' }};
            c.setProject(p, 0);
            return p.slides.map(s => s.page.children.filter(e => /title/i.test(e.id)).map(e => e.id + '=' + c.project.objects[e.id].name).join(','));
        }})()""")
        print('old titles after opening:', r)
        print('anim kept:', await ev(f"Object.keys({C}.project.slides[2].anim)"), '| old ID gone:', await ev(f"!{C}.project.objects['th-coral-title']"))
        await A.wait_for_timeout(300)
        print('marked to save:', await ev(f"{C}.dirty || {C}.status.kind"))
        print('errors:', errs)
        await ctx.close()
asyncio.run(main())
