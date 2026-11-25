# "Export with speaker notes": the file shows a notes panel (S), says who presents each slide,
# and the panel can be moved and resized. The normal export shows none of it and has no names.
import asyncio, shutil, re, json
from playwright.async_api import async_playwright
from localfiles import serve_files

FAKE = open('test/e2e/fake-artifact.js').read()
URL = 'http://localhost:8766/dist/index.html?u=alice'
OUT = '/tmp/'

fails = []
def check(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (('  ' + str(extra)) if extra != '' else ''))
    if not ok: fails.append(name)


async def main():
    shutil.rmtree('/tmp/pw-expnotes', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-expnotes', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1280, 'height': 760})
        await serve_files(ctx)
        await ctx.add_init_script(FAKE)
        logs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: logs.append(f'[app] {e}'))
        await A.goto(URL); await A.wait_for_timeout(3500)
        ev = A.evaluate
        await ev("(() => { const c = window.__morph.controller; c.addSlide(1); c.addSlide(2); c.addSlide(3); })()"); await A.wait_for_timeout(800)
        await ev("""(() => { const c = window.__morph.controller; const s = c.project.slides;
          c.setNote(s[0].id, 'Bonjour ! <b>pas du HTML</b>\\n[Regarder qui lève la main.]\\nDeuxième ligne.');
          c.setNote(s[1].id, 'Texte de Justin, diapo 2.');
          c.setNote(s[2].id, 'Texte d\\'Antoine, diapo 3. ' + 'Une phrase longue pour remplir le panneau. '.repeat(20));
          c.setNote(s[3].id, '[Justin] Une ligne.\\n[Antoine] Une autre.');
          c.setOwner([s[0].id, s[1].id], { key: 'owner', name: 'Justin Ruel' });
          c.setOwner([s[2].id], { key: 'p-antoine', name: 'Antoine' });
        })()""")
        await A.wait_for_timeout(1200)

        plain = await ev("(async () => (await window.__morph.controller.exportHtml()).html)()")
        withn = await ev("(async () => { const r = await window.__morph.controller.exportHtml({ notes: true }); return { html: r.html, name: r.name }; })()")
        h = withn['html']
        data = lambda html: json.loads(re.search(r'<script id="deck-data" type="application/json">(.*?)</script>', html, re.S).group(1).replace('\\u003c', '<'))
        check('plain export has no notes data', 'notes' not in data(plain))
        me = await ev("window.__morph.controller.personName('owner')")
        body = lambda html: re.sub(r'<!--.*?-->', '', html, flags=re.S)  # notes are in comments in every export
        check('plain export has no names', me not in body(plain) and 'Antoine' not in body(plain), me)
        check('notes export file name', withn['name'].endswith('-notes.html'), withn['name'])
        dn = data(h)
        check('notes export has notes and names', [x['w'] for x in dn['notes']][:4] == [me, me, 'Antoine', ''], [x['w'] for x in dn['notes']])

        # --- open the plain file: no notes button, S does nothing
        P = await ctx.new_page(); P.on('pageerror', lambda e: logs.append(f'[plain] {e}'))
        await P.set_content(plain); await P.wait_for_timeout(1200)
        await P.keyboard.press('s'); await P.wait_for_timeout(300)
        check('plain file: no notes button or panel', await P.evaluate("!document.querySelector('[data-a=notes]') && !document.querySelector('.mp-notes')"))
        await P.close()

        # --- open the notes file
        F = await ctx.new_page(); F.on('pageerror', lambda e: logs.append(f'[notes] {e}'))
        await F.set_viewport_size({'width': 1280, 'height': 760})
        await F.set_content(h); await F.wait_for_timeout(1500)
        check('notes hidden at first', await F.evaluate("!document.querySelector('.mp-notes').classList.contains('is-open')"))
        await F.keyboard.press('s'); await F.wait_for_timeout(300)
        st = "(() => { const n = document.querySelector('.mp-notes'); const r = n.getBoundingClientRect(); return { open: n.classList.contains('is-open'), slide: n.querySelector('.mp-nslide').textContent, who: n.querySelector('.mp-nwho').textContent, isNew: n.querySelector('.mp-nwho').classList.contains('is-new'), next: n.querySelector('.mp-nnext').textContent, text: n.querySelector('.mp-ntext').textContent, html: n.querySelector('.mp-ntext').innerHTML, cues: n.querySelectorAll('.mp-cue').length, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), count: document.querySelector('.mp-count').textContent }; })()"
        s1 = await F.evaluate(st)
        check('S opens the notes', s1['open'], s1['slide'])
        check('says who presents', s1['who'] == me, s1['who'])
        check('says who comes next', 'Antoine' in s1['next'] and '3' in s1['next'], s1['next'])
        check('note text shown as text, not HTML', '<b>pas du HTML</b>' in s1['text'] and '<b>' not in s1['html'].replace('&lt;b&gt;', ''), s1['html'][:80])
        check('cue in brackets is highlighted', s1['cues'] == 1, s1['cues'])
        await F.screenshot(path=OUT + 'expnotes_1.png')
        # clicking inside the panel does not change slides
        await F.mouse.click(s1['x'] + 60, s1['y'] + s1['h'] - 30); await F.wait_for_timeout(400)
        check('click in the panel keeps the slide', (await F.evaluate(st))['count'].startswith('1 '))
        # next slide: same person, then the turn changes on slide 3
        await F.keyboard.press('ArrowRight'); await F.wait_for_timeout(900)
        s2 = await F.evaluate(st)
        check('slide 2 notes', s2['text'].startswith('Texte de Justin') and s2['who'] == me and not s2['isNew'], s2['who'])
        await F.keyboard.press('ArrowRight'); await F.wait_for_timeout(500)
        s3 = await F.evaluate(st)
        check('turn change is highlighted', s3['who'] == 'Antoine' and s3['isNew'], (s3['who'], s3['isNew']))
        await F.keyboard.press('ArrowRight'); await F.wait_for_timeout(900)
        s4 = await F.evaluate(st)
        check('shared slide: not assigned, labels highlighted', s4['cues'] == 2 and s4['who'] == 'Not assigned', (s4['who'], s4['cues']))
        # drag the header to the top-left
        hx, hy = s4['x'] + s4['w'] // 2, s4['y'] + 14
        await F.mouse.move(hx, hy); await F.mouse.down(); await F.mouse.move(hx - 300, 40, steps=8); await F.mouse.up(); await F.wait_for_timeout(300)
        s5 = await F.evaluate(st)
        check('panel moved', s5['y'] < s4['y'] - 100 and s5['x'] < s4['x'] - 100, (s4['x'], s4['y'], '→', s5['x'], s5['y']))
        check('dragging did not change slides', s5['count'].startswith('4 '), s5['count'])
        # resize from the corner
        rx, ry = s5['x'] + s5['w'] - 6, s5['y'] + s5['h'] - 6
        await F.mouse.move(rx, ry); await F.mouse.down(); await F.mouse.move(rx - 200, ry + 120, steps=8); await F.mouse.up(); await F.wait_for_timeout(300)
        s6 = await F.evaluate(st)
        check('panel resized', s6['w'] < s5['w'] - 150 and s6['h'] > s5['h'] + 80, (s5['w'], s5['h'], '→', s6['w'], s6['h']))
        await F.screenshot(path=OUT + 'expnotes_2.png')
        # the panel stays on screen when the window shrinks
        await F.set_viewport_size({'width': 700, 'height': 500}); await F.wait_for_timeout(400)
        s7 = await F.evaluate(st)
        check('panel stays inside a smaller window', s7['x'] >= 0 and s7['y'] >= 0 and s7['x'] + s7['w'] <= 700 and s7['y'] + s7['h'] <= 500, s7)
        await F.set_viewport_size({'width': 1280, 'height': 760}); await F.wait_for_timeout(300)
        # button hides it, double-click on the header puts it back
        await F.keyboard.press('s'); await F.wait_for_timeout(200)
        check('S hides the notes', not (await F.evaluate(st))['open'])
        await F.mouse.move(640, 380); await F.wait_for_timeout(200)
        await F.click('[data-a=notes]'); await F.wait_for_timeout(300)
        s8 = await F.evaluate(st)
        check('notes button shows them again', s8['open'] and s8['count'].startswith('4 '))
        await F.dblclick('.mp-nslide'); await F.wait_for_timeout(300)
        s9 = await F.evaluate(st)
        check('double-click puts the panel back at the bottom', s9['y'] > 400, (s9['x'], s9['y']))
        # help lists S
        await F.keyboard.press('?'); await F.wait_for_timeout(200)
        check('shortcuts list S', await F.evaluate("document.querySelector('.mp-help').textContent.includes('Speaker notes')"))
        await F.keyboard.press('?')
        # French file
        h_fr = h.replace('<html lang="en">', '<html lang="fr">')
        G = await ctx.new_page()
        await G.set_content(h_fr); await G.wait_for_timeout(1000)
        await G.keyboard.press('s'); await G.wait_for_timeout(300)
        fr = await G.evaluate("[document.querySelector('.mp-nslide').textContent, document.querySelector('.mp-nnext').textContent, document.querySelector('[data-a=notes]').title]")
        check('French labels', fr[0].startswith('Diapo 1') and fr[1].startswith('puis Antoine'), fr)
        await G.close()
        check('no page errors', not logs, logs[:5])
        await ctx.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)))

asyncio.run(main())
