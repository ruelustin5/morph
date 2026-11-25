# In-app presenting: notes can be typed while presenting (keys do not change slides), whose-turn indicator;
# thumbnails: presence avatars and the assigned person do not overlap; the exported file starts on slide 1.
import asyncio, shutil
from playwright.async_api import async_playwright
from localfiles import serve_files
BASE = 'http://localhost:8766/dist-webtest/index.html'
OUT = '/tmp/shots/'
async def main():
    shutil.rmtree('/tmp/pw-present', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-present', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        await serve_files(ctx)
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        ev = A.evaluate
        pid = await ev("window.__morph.controller.projectId")
        inv = await ev(f"window.__morph.controller.createInvite('{pid}', 'Bob Tremblay')"); await A.wait_for_timeout(1200)
        await ev("window.__morph.controller.refreshPeople()"); await A.wait_for_timeout(600)
        await ev("""(() => { const c = window.__morph.controller; c.duplicateSlide(1); c.duplicateSlide(2);
          const bob = c.people.find(x => x.name.startsWith('Bob')); const me = c.people.find(x => x.key === 'owner');
          const s = c.project.slides; c.setOwner([s[0].id, s[1].id], me); c.setOwner([s[2].id, s[3].id], bob);
          c.setNote(s[1].id, 'Slide two notes'); })()""")
        # Bob joins and sits on slide 3 so his avatar shows on that thumbnail
        link = await ev(f"location.origin + location.pathname + '?u=bob#{inv['code']}'")
        B = await ctx.new_page(); await B.goto(link); await B.wait_for_timeout(5500)
        await B.evaluate("window.__morph.controller.selectSlide(2)"); await A.wait_for_timeout(2500)
        await A.bring_to_front()
        geo = await ev("""(() => Array.from(document.querySelectorAll('.slide-item')).map(it => {
          const r = (sel) => { const e = it.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
          return { i: it.dataset.index, people: r('.slide-people'), owner: r('.owner-tag'), note: r('.note-tag'), morph: r('.morph-badge'), ownerText: (it.querySelector('.owner-tag') || {}).textContent };
        }))()""")
        def ov(a, b):
            return bool(a and b and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3])
        for g in geo:
            bad = [n for n, (x, y) in {'people/owner': ('people', 'owner'), 'people/note': ('people', 'note'), 'owner/morph': ('owner', 'morph'), 'note/morph': ('note', 'morph'), 'owner/note': ('owner', 'note')}.items() if ov(g[x], g[y])]
            print('thumb', g['i'], 'owner tag:', g['ownerText'], '| avatars:', bool(g['people']), '| overlaps:', bad or 'none')
        await A.screenshot(path=OUT + 'thumbs.png', clip={'x': 0, 'y': 50, 'width': 230, 'height': 560})
        # present from slide 1
        await ev("window.__morph.controller.selectSlide(0)")
        await A.click('.present-group button >> nth=0'); await A.wait_for_timeout(1500)
        turn = lambda: ev("(document.querySelector('.pt-turn') || {}).textContent || null")
        print('turn on slide 1:', await turn())
        await A.keyboard.press('s'); await A.wait_for_timeout(300)
        await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(1500)
        print('turn on slide 2:', await turn())
        await A.click('.pn-text'); await A.keyboard.type(' — add the bubble demo'); await A.wait_for_timeout(300)
        await A.keyboard.press('b'); await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(600)
        st = await ev("({ count: document.querySelector('.mp-count').textContent, veil: document.querySelector('.mp-veil').className, note: window.__morph.controller.noteOf(window.__morph.controller.project.slides[1].id) })")
        print('typing in notes (b, →) did not change slides:', st)
        await A.keyboard.press('Escape'); await A.wait_for_timeout(200)
        await A.keyboard.press('ArrowRight'); await A.wait_for_timeout(400)
        flash = await ev("(document.querySelector('.pt-flash') || {}).textContent || null")
        await A.screenshot(path=OUT + 'present_turn.png')
        await A.wait_for_timeout(1200)
        print('after Esc, → goes to slide 3:', await ev("document.querySelector('.mp-count').textContent"), '| flash:', flash, '| turn:', await turn())
        await A.keyboard.press('Escape'); await A.wait_for_timeout(600)
        # export: starts on slide 1 even with #3 in the address and after back/forward cache
        html = await ev("(async () => (await window.__morph.controller.exportHtml()).html)()")
        open('/tmp/export.html', 'w').write(html)
        E = await ctx.new_page()
        await E.goto('file:///tmp/export.html#3'); await E.wait_for_timeout(1200)
        first = await E.evaluate("document.querySelector('.mp-count').textContent + ' ' + location.hash")
        await E.keyboard.press('PageDown'); await E.keyboard.press('PageDown'); await E.wait_for_timeout(2500)
        mid = await E.evaluate("document.querySelector('.mp-count').textContent + ' ' + location.hash")
        await E.reload(); await E.wait_for_timeout(1200)
        rel = await E.evaluate("document.querySelector('.mp-count').textContent")
        await E.keyboard.press('PageDown'); await E.wait_for_timeout(1500)
        await E.goto('about:blank'); await E.go_back(); await E.wait_for_timeout(1200)
        back = await E.evaluate("document.querySelector('.mp-count').textContent")
        print('export: opened with #3 ->', first, '| after 2× PageDown ->', mid, '| after reload ->', rel, '| after back ->', back)
        print('errors:', errs[:3])
        await ctx.close()
asyncio.run(main())
