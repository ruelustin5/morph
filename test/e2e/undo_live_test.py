# Undo with two people editing live: undo only reverts my own changes; a deleted slide comes back for both.
import asyncio, shutil
from playwright.async_api import async_playwright
FAKE = open('test/e2e/fake-artifact.js').read()
IDS = "window.__morph.controller.project.slides.map(s => s.id)"
async def main():
    shutil.rmtree('/tmp/pw-undolive', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-undolive', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        await ctx.add_init_script(FAKE)
        errs = []
        A = ctx.pages[0]; A.on('pageerror', lambda e: errs.append(f'A {e}'))
        await A.goto('http://localhost:8766/dist/index.html?u=alice'); await A.wait_for_timeout(3500)
        B = await ctx.new_page(); B.on('pageerror', lambda e: errs.append(f'B {e}'))
        await B.goto('http://localhost:8766/dist/index.html?u=bob'); await B.wait_for_timeout(3500)
        ids0 = await A.evaluate(IDS)
        print('same deck:', ids0 == await B.evaluate(IDS), len(ids0), 'slides')
        await A.evaluate("window.__morph.controller.addSlide(1)"); await A.wait_for_timeout(2500)
        ids1 = await A.evaluate(IDS)
        # A moves the figure on slide 1; then B changes its color
        await A.evaluate("window.__morph.controller.selectSlide(0)"); await B.evaluate("window.__morph.controller.selectSlide(0)"); await A.wait_for_timeout(500)
        fig = await A.evaluate("(() => { const e = window.__morph.store.activePage.children.find(e => e.type === 'figure'); return [e.id, e.x, e.fill]; })()")
        await A.evaluate(f"window.__morph.store.getElementById('{fig[0]}').set({{ x: {fig[1]} + 400 }})"); await A.wait_for_timeout(2500)
        await B.evaluate(f"window.__morph.store.getElementById('{fig[0]}').set({{ fill: '#00aa00' }})"); await B.wait_for_timeout(2500)
        print('A sees B color:', await A.evaluate(f"window.__morph.store.getElementById('{fig[0]}').fill"))
        # A deletes slide 3 (the one A added is slide 2); B edits a text on slide 1 meanwhile
        await A.evaluate("window.__morph.controller.deleteSlide(2)"); await A.wait_for_timeout(2500)
        await B.evaluate("(() => { const e = window.__morph.store.activePage.children.find(e => e.type === 'text'); e.set({ text: 'Bob was here' }); })()"); await B.wait_for_timeout(2500)
        print('B sees the deletion:', len(await B.evaluate(IDS)) == len(ids1) - 1)
        # A: Ctrl+Z -> slide 3 back, for both
        await A.bring_to_front(); await A.mouse.click(1000, 845); await A.keyboard.press('Control+z'); await A.wait_for_timeout(3000)
        print('undo 1, slide back for A:', await A.evaluate(IDS) == ids1, '| for B:', await B.evaluate(IDS) == ids1)
        print('   Bob’s text kept:', await A.evaluate("window.__morph.controller.project.slides[0].page.children.some(e => e.text === 'Bob was here')"))
        # A: Ctrl+Z -> figure position back, but Bob's color stays
        await A.keyboard.press('Control+z'); await A.wait_for_timeout(3000)
        a = await A.evaluate(f"(() => {{ const e = window.__morph.controller.project.slides[0].page.children.find(x => x.id === '{fig[0]}'); return [Math.round(e.x), e.fill]; }})()")
        b = await B.evaluate(f"(() => {{ const e = window.__morph.controller.project.slides[0].page.children.find(x => x.id === '{fig[0]}'); return [Math.round(e.x), e.fill]; }})()")
        print('undo 2, position back, B color kept:', a == [round(fig[1]), '#00aa00'], a, '| B same:', a == b)
        # A: Ctrl+Z -> added slide removed for both
        await A.keyboard.press('Control+z'); await A.wait_for_timeout(3000)
        print('undo 3, added slide gone for both:', await A.evaluate(IDS) == ids0, await B.evaluate(IDS) == ids0)
        # B never undoes A's work: B has nothing of its own except the color and the text
        await B.bring_to_front(); await B.mouse.click(1000, 845); await B.keyboard.press('Control+z'); await B.wait_for_timeout(2500)
        print('B undo reverts only B’s text:', await A.evaluate("!window.__morph.controller.project.slides[0].page.children.some(e => e.text === 'Bob was here')"), '| slides untouched:', await A.evaluate(IDS) == ids0)
        print('errors:', errs[:5])
        await ctx.close()
asyncio.run(main())
