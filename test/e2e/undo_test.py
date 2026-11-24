# Ctrl+Z / Ctrl+Y undo and redo everything: object edits, slides deleted/added/duplicated/moved, layouts,
# theme, slide size, IDs, notes, paste. Automatic text fitting is not a step. Text fields keep their own undo.
import asyncio, shutil, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
ok_count = 0; fails = []
def check(name, cond, extra=''):
    global ok_count
    if cond: ok_count += 1
    else: fails.append(name)
    print(('OK  ' if cond else 'FAIL'), name, extra)
async def main():
    shutil.rmtree('/tmp/pw-undo', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-undo', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        C = "window.__morph.controller"; S = "window.__morph.store"
        state = lambda: ev(f"(() => {{ const c = {C}; return {{ ids: c.project.slides.map(s => s.id), active: c.active, n: c.project.slides.length, w: c.project.width, theme: (c.project.settings || {{}}).theme || null }}; }})()")
        async def key(k):
            await A.mouse.click(1000, 845); await A.wait_for_timeout(50)  # an empty spot of the editor (focus out of fields)
            await A.keyboard.press(k); await A.wait_for_timeout(500)
        async def settle(): await A.wait_for_timeout(500)
        print('can undo at start:', await ev(f"{C}.canUndo"))
        check('nothing to undo right after opening (text fitting is not a step)', not await ev(f"{C}.canUndo"))
        # 1. move an object
        el = await ev(f"(() => {{ const e = {S}.activePage.children[{S}.activePage.children.length - 1]; return [e.id, e.x]; }})()")
        await ev(f"{S}.getElementById('{el[0]}').set({{ x: {el[1]} + 300 }})"); await settle()
        await key('Control+z')
        check('object move undone', abs(await ev(f"{S}.getElementById('{el[0]}').x") - el[1]) < 0.5)
        await key('Control+y')
        check('object move redone', abs(await ev(f"{S}.getElementById('{el[0]}').x") - el[1] - 300) < 0.5)
        await key('Control+z')
        # 2. delete slide 2 from the slide list
        s0 = await state()
        content2 = await ev(f"JSON.stringify({C}.project.slides[1].page.children.map(e => e.id))")
        await ev(f"{C}.selectSlide(1)"); await settle()
        await ev(f"{C}.deleteSlide(1)"); await settle()
        check('slide deleted', (await state())['n'] == s0['n'] - 1)
        # focus in the slide list, like after using its menu
        await A.locator('.slide-item').first.click(); await A.wait_for_timeout(300)
        await A.keyboard.press('Control+z'); await A.wait_for_timeout(600)
        s1 = await state()
        check('Ctrl+Z (focus in the slide list) brings the slide back, same place', s1['ids'] == s0['ids'], str(s1['ids']))
        check('…with its objects', await ev(f"JSON.stringify({C}.project.slides[1].page.children.map(e => e.id))") == content2)
        check('…and shows it', s1['active'] == 1, str(s1['active']))
        await key('Control+Shift+z')
        check('Ctrl+Shift+Z deletes it again', (await state())['n'] == s0['n'] - 1)
        await key('Control+z')
        check('and back again', (await state())['ids'] == s0['ids'])
        # the toast's Undo button does the same
        await ev(f"{C}.deleteSlide(0)"); await settle()
        btn = A.locator('.bp5-toast:has-text("Slide 1 deleted") .bp5-button:has-text("Undo")')
        print('   toast buttons:', await btn.count())
        if await btn.count(): await btn.first.click(); await A.wait_for_timeout(600)
        check('toast Undo brings the slide back', (await state())['ids'] == s0['ids'])
        await key('Control+y')
        check('…and Ctrl+Y redoes the deletion', (await state())['n'] == s0['n'] - 1)
        await key('Control+z')
        # 3. add, duplicate, move
        await ev(f"{C}.addSlide(1)"); await settle()
        await key('Control+z'); check('added slide undone', (await state())['ids'] == s0['ids'])
        await ev(f"{C}.duplicateSlide(0)"); await settle()
        await key('Control+z'); check('duplicated slide undone', (await state())['ids'] == s0['ids'])
        await ev(f"{C}.moveSlide(0, 1)"); await settle()
        check('slides moved', (await state())['ids'] == [s0['ids'][1], s0['ids'][0]] + s0['ids'][2:])
        await key('Control+z'); check('move undone', (await state())['ids'] == s0['ids'])
        # 4. theme layout (sets the theme too) is one step
        await ev(f"(() => {{ const c = {C}; const L = window.__morph.themeLayouts('coral'); c.insertTemplate(L[0], 1); }})()"); await settle()
        check('layout added and theme set', (await state())['n'] == s0['n'] + 1 and (await state())['theme'] == 'coral')
        await key('Control+z')
        st = await state()
        check('one Ctrl+Z removes the layout and the theme', st['ids'] == s0['ids'] and st['theme'] is None, str(st))
        # 5. slide size
        await ev(f"{C}.setSlideSize(1440, 1080, true)"); await settle()
        await key('Control+z'); check('slide size undone', (await state())['w'] == s0['w'] and await ev(f"{S}.width") == s0['w'])
        # 6. rename an ID
        eid = await ev(f"{S}.activePage.children[0].id")
        old = await ev(f"{C}.project.objects['{eid}'].name")
        await ev(f"{C}.rename('{eid}', 'HELLOWORLD')"); await settle()
        await key('Control+z'); check('ID rename undone', await ev(f"{C}.project.objects['{eid}'].name") == old)
        # 7. notes: typing in the notes box uses the box's own undo; on the slide, Ctrl+Z undoes the note
        sid = await ev(f"{C}.activeSlideId()")
        n0 = await ev(f"{C}.noteOf('{sid}')")
        await ev(f"{C}.setNote('{sid}', 'A note to undo')"); await settle()
        await key('Control+z'); check('note change undone', await ev(f"{C}.noteOf('{sid}')") == n0)
        # 8. paste on another slide
        await ev(f"(() => {{ const p = {S}.activePage; {S}.selectElements([p.children[0].id]); }})()")
        await A.mouse.click(1000, 845); await ev(f"(() => {{ const p = {S}.activePage; {S}.selectElements([p.children[0].id]); }})()")
        await A.keyboard.press('Control+c'); await A.wait_for_timeout(200)
        await ev(f"{C}.selectSlide(1)"); await settle()
        cnt = await ev(f"{S}.activePage.children.length")
        await A.mouse.click(1000, 845); await A.keyboard.press('Control+v'); await A.wait_for_timeout(900)
        check('pasted', await ev(f"{S}.activePage.children.length") == cnt + 1)
        await key('Control+z'); check('paste undone', await ev(f"{S}.activePage.children.length") == cnt)
        # 9. undo from another slide goes to where the change is
        await ev(f"{C}.selectSlide(0)"); await settle()
        e0 = await ev(f"{S}.activePage.children[0].id")
        await ev(f"{S}.getElementById('{e0}').set({{ y: 5 }})"); await settle()
        await ev(f"{C}.selectSlide(1)"); await settle()
        await key('Control+z')
        check('undo of an edit on slide 1, from slide 2, shows slide 1', (await state())['active'] == 0)
        # 10. a text field keeps its own undo
        await A.click('.notes-bar'); await A.wait_for_timeout(300)
        ta = A.locator('.notes-bar textarea')
        if await ta.count():
            await ta.click(); await A.keyboard.type('abc'); await A.wait_for_timeout(200)
            past = await ev(f"{C}.history.past.length")
            await A.keyboard.press('Control+z'); await A.wait_for_timeout(300)
            check('Ctrl+Z in the notes box is the box’s own undo', await ev(f"{C}.history.past.length") >= past and await ev(f"(document.activeElement || {{}}).tagName") == 'TEXTAREA')
        # 11. toolbar buttons
        await A.mouse.click(1000, 845); await A.wait_for_timeout(100)
        await ev(f"{C}.checkpoint()")
        before = await ev(f"{C}.history.past.length")
        await ev(f"{C}.addSlide(0)"); await settle()
        await A.click('[aria-label="Undo"]'); await A.wait_for_timeout(500)
        check('toolbar Undo button works', await ev(f"{C}.history.past.length") == before)
        print('errors:', errs)
        print(f'\n{ok_count}/{ok_count + len(fails)} OK', fails)
        await ctx.close()
asyncio.run(main())
