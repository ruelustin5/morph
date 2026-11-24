# Text typed past the bottom of a text box must stay visible: the box grows to fit.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-fit', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-fit', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await ev("""(async () => { const c = window.__morph.controller; const { themeLayouts } = window.__morph; c.setTheme('coral');
            const L = (window.__morph.themeLayouts ? window.__morph.themeLayouts('coral') : null); return !!L; })()""")
        has = await ev("!!window.__morph.themeLayouts")
        if not has:
            # open the gallery and pick the Quote layout
            await ev("window.__morph.controller.setUi({ tplAt: window.__morph.controller.project.slides.length })"); await A.wait_for_timeout(800)
            await A.click('.tpl-tile:has-text("Quote")'); await A.wait_for_timeout(1500)
        else:
            await ev("(() => { const c = window.__morph.controller; const tp = window.__morph.themeLayouts('coral').find(x => x.name === 'Quote'); c.insertTemplate(tp, c.project.slides.length); })()"); await A.wait_for_timeout(1500)
        q = "(() => { const s = window.__morph.store; const e = s.activePage.children.filter(x => x.type === 'text').sort((a, b) => b.text.length - a.text.length)[0]; return e; })()"
        info = lambda: ev(f"(() => {{ const e = {q}; return {{ id: e.id, h: Math.round(e.height), text: e.text }}; }})()")
        a = await info(); print('quote text before:', a)
        shown = lambda: ev(f"""(() => {{ const e = {q}; for (const s of window.__morph.Konva.stages) {{ const n = s.findOne(x => x.getClassName() === 'Text' && x.id() === e.id); if (n) return n.textArr.map(l => l.text).join(' / '); }} return null; }})()""")
        print('canvas shows the whole layout sentence:', (await shown()).endswith('room.'), '|', await shown())
        # Edit it like a person: double-click, go to the end, type more, click away
        await ev(f"(() => {{ const e = {q}; window.__morph.store.selectElements([e.id]); }})()"); await A.wait_for_timeout(300)
        await ev(f"(() => {{ const e = {q}; e.toggleEditMode(true); }})()"); await A.wait_for_timeout(500)
        await A.keyboard.press('Control+End'); await A.keyboard.type(' of the room, even with a long extra sentence.'); await A.wait_for_timeout(400)
        mid = await info(); print('while typing:', mid)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        await ev("window.__morph.store.selectElements([])"); await A.wait_for_timeout(600)
        b = await info(); print('after editing:', b)
        need = await ev(f"""(() => {{ const e = {q}; const K = window.__morph.Konva || null; const st = (K ? K.stages : []);
            let n = null; for (const s of st) {{ n = s.findOne(x => x.getClassName() === 'Text' && x.id() === e.id); if (n) break; }}
            return n ? {{ lines: n.textArr.length, drawnH: Math.round(n.height()), shownText: n.textArr.map(l => l.text).join(' / ') }} : 'no konva global'; }})()""")
        print('canvas text:', need)
        print('grew:', b['h'] > a['h'])
        await A.screenshot(path='/tmp/textfit.png')
        # bigger font -> grows again
        await ev(f"(() => {{ const e = {q}; e.set({{ fontSize: e.fontSize * 1.3 }}); }})()"); await A.wait_for_timeout(600)
        c2 = await info(); print('after bigger font:', c2['h'], '> ', b['h'], c2['h'] > b['h'])
        # never shrinks a roomy box
        await ev(f"(() => {{ const e = {q}; e.set({{ height: 700 }}); }})()"); await A.wait_for_timeout(600)
        print('roomy box kept:', (await info())['h'])
        # undo works and does not loop
        await ev(f"(() => {{ const e = {q}; e.set({{ height: 60, fontSize: e.fontSize / 1.3 }}); }})()"); await A.wait_for_timeout(600)
        d = await info(); print('squeezed to 60 -> refit to', d['h'])
        await A.wait_for_timeout(1500)
        print('stable (no loop):', (await info())['h'] == d['h'])
        print('saved in project:', await ev(f"(() => {{ const c = window.__morph.controller; const e = {q}; const sl = c.project.slides[c.active]; const x = sl.page.children.find(y => y.id === e.id); return x && Math.round(x.height); }})()"))
        print('errors:', errs)
        await ctx.close()
asyncio.run(main())
