# Tries hard to break the tutorial: keys and clicks while a step explains something, skipping hands-on
# steps, doing the wrong thing (copying the wrong slide, deleting slides, changing slide 2 instead of 3,
# deleting SUN, inserting a theme slide), breaking the practice slides between steps, presenting in the
# middle, restarting it from the menu, leaving from the top bar. Every line should say OK.
import asyncio, shutil, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
results = []
def ok(name, cond, extra=''):
    results.append((bool(cond), name, extra))
    print(('OK   ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

async def main(lang='en-US'):
    shutil.rmtree('/tmp/pw-attack', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-attack', executable_path='/usr/bin/google-chrome', args=['--no-sandbox', f'--lang={lang}'], locale=lang, viewport={'width': 1400, 'height': 900})
        await ctx.add_init_script("window.__morphTour = true")
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        A.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(5000)
        own = await ev("(() => { const c = window.__morph.controller; return { id: c.projectId, n: c.project.slides.length }; })()")
        step = lambda: ev("(document.querySelector('.tour-card') || {}).dataset ? document.querySelector('.tour-card').dataset.step : null")
        state = lambda: ev("""(() => { const c = window.__morph.controller; return { n: c.project.slides.length, active: c.active, sel: (c.store.selectedElementsIds || []).join(','),
            ids: c.project.slides.map(s => s.page.children.map(e => e.id).join('|')).join(' / '), sun2: JSON.stringify(((c.project.slides[1] ? c.project.slides[1].page.children : []).find(e => e.id === 'tut-sun') || {}).x) }; })()""")
        task = lambda: ev("(document.querySelector('.tour-task') || {}).textContent || null")
        nxt_disabled = lambda: ev("(() => { const b = document.querySelector('.tour-card .tour-actions button[data-primary]'); return b ? b.disabled : null; })()")
        async def click_next():
            await A.locator('.tour-card .tour-actions button[data-primary]').click(); await A.wait_for_timeout(700)

        # --- the question --------------------------------------------------------------------------
        ok('asks on first visit', await step() == 'ask')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(500)
        toast = await ev("Array.from(document.querySelectorAll('.bp5-toast')).map(t => t.textContent).join(' | ')")
        pulse = await ev("!!document.querySelector('[data-tour=\"more\"].tour-pulse')")
        ok('"Not now" says where to find it later', '⋯' in toast and pulse, toast[:80])
        await A.click('[data-tour="more"]'); await A.wait_for_timeout(300)
        await A.click('.bp5-menu-item:has-text("Tutorial"), .bp5-menu-item:has-text("Tutoriel")'); await A.wait_for_timeout(500)
        await A.click('.tour-ask button[data-primary]'); await A.wait_for_timeout(1800)
        ok('starts the practice presentation', await ev("!!window.__morph.controller.tutorial") and await step() == 'ids')

        # --- an explaining step cannot be bypassed -------------------------------------------------
        before = await state()
        await A.mouse.click(700, 450); await A.wait_for_timeout(200)           # the canvas, under the shade
        await A.mouse.click(110, 260); await A.wait_for_timeout(200)           # a slide in the list
        await ev("document.activeElement && document.activeElement.blur()")
        for k in ['Delete', 'Backspace', 'Control+d', 'Control+z', 'ArrowDown', 'Enter', 'Control+a']:
            await A.keyboard.press(k); await A.wait_for_timeout(120)
        after = await state()
        ok('clicks and keys do nothing while a step explains', before['ids'] == after['ids'] and before['n'] == after['n'] and before['active'] == after['active'], f"{before['n']}→{after['n']} active {before['active']}→{after['active']}")
        ok('still on the same step', await step() == 'ids')
        await A.keyboard.press('Escape'); await A.wait_for_timeout(300)
        ok('Escape asks before leaving', await ev("!!Array.from(document.querySelectorAll('.tour-card h3')).find(h => /Leave|Quitter/.test(h.textContent))"))
        await A.locator('.tour-card button:has-text("Keep going"), .tour-card button:has-text("Continuer")').first.click(); await A.wait_for_timeout(300)
        await A.locator('.tour-card button:has-text("Stop"), .tour-card button:has-text("Arrêter")').first.click(); await A.wait_for_timeout(300)
        ok('Stop asks before leaving', await ev("!!Array.from(document.querySelectorAll('.tour-card h3')).find(h => /Leave|Quitter/.test(h.textContent))"))
        await A.locator('.tour-card button:has-text("Keep going"), .tour-card button:has-text("Continuer")').first.click(); await A.wait_for_timeout(300)
        ok('Keep going stays in the tutorial', await step() == 'ids' and await ev("!!window.__morph.controller.tutorial"))

        # --- the hands-on step "copy slide 2" ------------------------------------------------------
        while await step() not in ('dup', None): await click_next()
        ok('reached the copy step', await step() == 'dup')
        ok('Next is off until it is done', await nxt_disabled() is True)
        await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(300)
        ok('arrow key cannot skip it', await step() == 'dup')
        # wrong: copy slide 1
        await A.hover('.slide-item[data-index="0"] .slide-thumb'); await A.wait_for_timeout(200)
        await A.click('.slide-item[data-index="0"] .slide-actions .mini-btn'); await A.wait_for_timeout(700)
        t1 = await task()
        ok('copying slide 1 is caught', t1 and ('Put it back' in t1 or 'Remettre' in t1) and await nxt_disabled(), t1)
        await A.click('.tour-task button'); await A.wait_for_timeout(700)
        ok('"Put it back" restores the slides', (await state())['n'] == 2)
        # wrong: delete slide 2 with the keyboard in the slide list
        await A.click('.slide-item[data-index="1"] .slide-thumb'); await A.wait_for_timeout(300)
        await A.keyboard.press('Delete'); await A.wait_for_timeout(700)
        t2 = await task()
        ok('deleting slide 2 is caught', (await state())['n'] != 2 or (t2 and 'Put' in t2) or (t2 and 'Remettre' in t2), f"n={(await state())['n']} {t2}")
        if 'Put' in (t2 or '') or 'Remettre' in (t2 or ''):
            await A.click('.tour-task button'); await A.wait_for_timeout(700)
        ok('slides back to 2 after the fix', (await state())['n'] == 2)
        # wrong: a theme slide as slide 3
        await ev("(() => { const m = window.__morph; m.controller.insertTemplate(m.themeLayouts('ocean')[0], 2); })()"); await A.wait_for_timeout(700)
        t3 = await task()
        ok('a theme slide in place of the copy is caught', t3 and ('not a copy' in t3 or 'pas une copie' in t3), t3)
        await A.click('.tour-task button'); await A.wait_for_timeout(700)
        # wrong: change SUN on slide 2
        await ev("(() => { const c = window.__morph.controller; c.selectSlide(1); setTimeout(() => { const e = c.store.getElementById('tut-sun'); e.set({ x: 100 }); }, 100); })()"); await A.wait_for_timeout(900)
        t4 = await task()
        ok('changing slide 2 is caught', t4 and ('Put' in t4 or 'Remettre' in t4), t4)
        await A.click('.tour-task button'); await A.wait_for_timeout(700)
        ok('slide 2 is back to how it was', (await state())['sun2'] == '1180')
        # wrong: two copies
        await ev("(() => { const c = window.__morph.controller; c.duplicateSlide(1); c.duplicateSlide(1); })()"); await A.wait_for_timeout(700)
        t4b = await task()
        ok('two copies are caught', t4b and ('One copy' in t4b or 'Une seule' in t4b) and await nxt_disabled(), t4b)
        await A.click('.tour-task button'); await A.wait_for_timeout(700)
        # wrong: rename SUN
        await ev("window.__morph.controller.rename('tut-sun', 'MOON')"); await A.wait_for_timeout(600)
        t4c = await task()
        ok('renaming SUN is caught', t4c and 'SUN' in t4c, t4c)
        await A.click('.tour-task button'); await A.wait_for_timeout(700)
        ok('SUN has its name back', await ev("window.__morph.controller.project.objects['tut-sun'].name") == 'SUN')
        # "Show me" pressed twice quickly
        await ev("(() => { const b = document.querySelector('.tour-task button'); b.click(); setTimeout(() => { const b2 = document.querySelector('.tour-task button'); if (b2) b2.click(); }, 30); })()"); await A.wait_for_timeout(1200)
        ok('Show me twice still gives one copy', (await state())['n'] == 3 and await nxt_disabled() is False, str((await state())['n']))
        await ev("window.__morph.controller.deleteSlide(2)"); await A.wait_for_timeout(500)
        # right
        await A.hover('.slide-item[data-index="1"] .slide-thumb'); await A.wait_for_timeout(200)
        await A.click('.slide-item[data-index="1"] .slide-actions .mini-btn'); await A.wait_for_timeout(700)
        ok('copying slide 2 is accepted', await nxt_disabled() is False, await task())
        await click_next()

        # --- the hands-on step "change SUN on slide 3" ---------------------------------------------
        ok('reached the change step', await step() == 'change')
        ok('Next is off until it is done', await nxt_disabled() is True)
        await ev("(() => { const c = window.__morph.controller; c.selectSlide(1); setTimeout(() => { c.store.getElementById('tut-sun').set({ fill: '#000000' }); }, 100); })()"); await A.wait_for_timeout(900)
        t5 = await task()
        ok('changing slide 2 instead of 3 is caught', t5 and ('slide 2' in t5 or 'diapo 2' in t5), t5)
        await A.click('.tour-task button'); await A.wait_for_timeout(900)
        s5 = await state()
        ok('fix puts slide 2 back and keeps the copy', s5['n'] == 3 and s5['active'] == 2, str(s5))
        await ev("(() => { const c = window.__morph.controller; c.selectSlide(2); setTimeout(() => { c.store.selectElements(['tut-sun']); }, 100); })()"); await A.wait_for_timeout(400)
        await A.mouse.click(700, 120); await A.wait_for_timeout(100)  # (a click on the toolbar area keeps the selection)
        await ev("(() => { const s = window.__morph.store; s.deleteElements(['tut-sun']); })()"); await A.wait_for_timeout(700)
        t6 = await task()
        ok('deleting SUN on slide 3 is caught', t6 and ('SUN' in t6), t6)
        await A.click('.tour-task button'); await A.wait_for_timeout(900)
        # an extra object on slide 1
        await ev("(() => { const c = window.__morph.controller; c.selectSlide(0); setTimeout(() => { c.store.activePage.addElement({ type: 'text', text: 'hack', x: 10, y: 10, width: 200 }); }, 100); })()"); await A.wait_for_timeout(900)
        t6b = await task()
        ok('adding to slide 1 is caught', t6b and ('Slide 1' in t6b or 'diapo 1' in t6b), t6b)
        await A.click('.tour-task button'); await A.wait_for_timeout(900)
        await ev("window.__morph.controller.deleteSlide(2)"); await A.wait_for_timeout(700)
        t7 = await task()
        ok('deleting slide 3 is caught', t7 and ('gone' in t7 or 'existe plus' in t7), t7)
        await A.click('.tour-task button'); await A.wait_for_timeout(900)
        # present in the middle: the tutorial steps aside
        await A.click('.present-group button >> nth=0'); await A.wait_for_timeout(1200)
        ok('tutorial hides while presenting', await step() is None)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(900)
        ok('and comes back after', await step() == 'change')
        # top bar Leave (usable during a hands-on step) asks first
        await A.click('.practice-tag button'); await A.wait_for_timeout(400)
        ok('top bar Leave asks first', await ev("!!Array.from(document.querySelectorAll('.tour-card h3')).find(h => /Leave|Quitter/.test(h.textContent))"))
        await A.locator('.tour-card button:has-text("Keep going"), .tour-card button:has-text("Continuer")').first.click(); await A.wait_for_timeout(300)
        ok('Keep going returns to the step', await step() == 'change')
        # right
        await ev("(() => { const c = window.__morph.controller; c.selectSlide(2); setTimeout(() => { c.store.getElementById('tut-sun').set({ x: 250, y: 300 }); }, 100); })()"); await A.wait_for_timeout(900)
        ok('moving SUN on slide 3 is accepted', await nxt_disabled() is False, await task())
        await click_next()

        # --- breaking things between steps --------------------------------------------------------
        ok('reached the second demo', await step() == 'watch2')
        await A.wait_for_timeout(2500)
        ok('the demo played', await ev("(document.querySelector('.tour-demo .mp-count') || {}).textContent") == '2 / 2')
        await ev("window.__morph.controller.deleteSlide(2)"); await A.wait_for_timeout(500)   # someone breaks it anyway
        await click_next()
        notice = await ev("(document.querySelector('.tour-notice') || {}).textContent || null")
        s8 = await state()
        ok('the next step puts the slides back and says so', notice and s8['n'] == 3, f"{notice} n={s8['n']}")
        # restart from the menu in the middle
        await ev("window.__morph.controller.setUi({ tour: 'ask' })"); await A.wait_for_timeout(400)
        await A.click('.tour-ask button[data-primary]'); await A.wait_for_timeout(1500)
        ok('restarting from the menu goes back to step 1', await step() == 'ids')
        # go to the end
        for _ in range(30):
            st = await step()
            if st in ('done', None): break
            if await nxt_disabled():
                await A.click('.tour-task button'); await A.wait_for_timeout(900)
            await click_next()
        ok('reached the end', await step() == 'done')
        await A.screenshot(path=OUT + 'tut_end.png')
        await A.locator('.tour-card .tour-actions button[data-primary]').click(); await A.wait_for_timeout(2500)
        back = await ev("(() => { const c = window.__morph.controller; return { tut: !!c.tutorial, id: c.projectId, n: c.project.slides.length }; })()")
        ok('back to my own presentation, untouched', not back['tut'] and back['id'] == own['id'] and back['n'] == own['n'], str(back))
        ok('no errors on the page', not errs, '; '.join(errs[:3]))
        await ctx.close()
    bad = [r for r in results if not r[0]]
    print(f'\n{len(results) - len(bad)}/{len(results)} OK')

asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else 'en-US'))
