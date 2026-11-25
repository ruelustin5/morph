# A project moves (shared, new key, made private) while the owner has it open in another tab.
# The other tab must follow it, keep the changes it had not sent yet, and never re-create the
# project in the old place.
import asyncio, shutil
from playwright.async_api import async_playwright
from localfiles import serve_files

FAKE = open('test/e2e/fake-artifact.js').read()
URL = 'http://localhost:8766/dist/index.html?roles=1&u=alice'


fails = []
def check(name, ok, extra=''):
    print(('PASS ' if ok else 'FAIL ') + name + (('  ' + str(extra)) if extra != '' else ''))
    if not ok: fails.append(name)


async def main():
    shutil.rmtree('/tmp/pw-move', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-move', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1300, 'height': 820})
        await serve_files(ctx)
        await ctx.add_init_script(FAKE)
        logs = []
        def hook(pg, tag):
            pg.on('pageerror', lambda e: logs.append(f'[{tag} pageerror] {e}'))
            pg.on('console', lambda m: logs.append(f'[{tag} {m.type}] {m.text}') if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        A = ctx.pages[0]; hook(A, 'A')
        await A.goto(URL); await A.wait_for_timeout(4000)
        B = await ctx.new_page(); hook(B, 'B')
        await B.goto(URL); await B.wait_for_timeout(4000)
        st = "(() => { const c = window.__morph.controller; return { id: c.projectId, place: c.projectShared ? 'sh:' + c.pbe.prefix.slice(3, -1) : 'p:' + (c.projectBase || ''), shared: c.projectShared, slides: c.project.slides.length }; })()"
        a0 = await A.evaluate(st); b0 = await B.evaluate(st)
        print('A', a0, 'B', b0)
        check('both tabs on the same project', a0['id'] == b0['id'] and a0['place'] == b0['place'])
        pid = a0['id']
        # need at least 3 slides
        for _ in range(3):
            await A.evaluate("window.__morph.controller.addSlide(1)")
        await A.wait_for_timeout(2500)
        sids = await A.evaluate("window.__morph.controller.project.slides.map(s => s.id)")
        await B.wait_for_timeout(500)
        note = lambda sid: f"window.__morph.controller.noteOf('{sid}')"

        # 1) A shares the project; B follows, then edits later.
        inv = await A.evaluate(f"window.__morph.controller.createInvite('{pid}', 'Bob')"); await A.wait_for_timeout(3500)
        a1 = await A.evaluate(st); b1 = await B.evaluate(st)
        check('A is on the shared place', a1['shared'] and a1['place'].startswith('sh:'), a1)
        check('B followed the share', b1['place'] == a1['place'], b1)
        await B.evaluate(f"window.__morph.controller.setNote('{sids[0]}', 'LATE-B')"); await B.wait_for_timeout(2500)
        check('A sees the note B wrote after the share', await A.evaluate(note(sids[0])) == 'LATE-B')
        await A.wait_for_timeout(4000)  # old place emptied after 5 s
        root = await A.evaluate("Object.keys(localStorage).filter(k => k.startsWith('fakedb:live/')).map(k => k.slice(7))")
        check('old private place holds only the moved marker', root == ['live/moved'], root)

        # 2) B has unsent changes when A changes the key: they reach the new place.
        await B.evaluate("(() => { const L = window.__morph.controller.live; L.flush = async () => {}; })()")
        await B.evaluate(f"window.__morph.controller.setNote('{sids[1]}', 'PENDING-B')")
        await B.wait_for_timeout(800)
        old_prefix = await A.evaluate("window.__morph.controller.pbe.prefix")
        # (what removing someone who joined does: copy everything under a new key)
        await A.evaluate(f"(async () => {{ const c = window.__morph.controller; await c._moveProject(c.projects.find(x => x.id === '{pid}'), 'rekey'); }})()"); await A.wait_for_timeout(6000)
        a2 = await A.evaluate(st); b2 = await B.evaluate(st)
        check('A moved to a new key', a2['place'] != a1['place'] and a2['shared'], a2)
        check('B followed the new key', b2['place'] == a2['place'], b2)
        check('A sees the change B had not sent yet', await A.evaluate(note(sids[1])) == 'PENDING-B')
        check('B kept its earlier note', await B.evaluate(note(sids[0])) == 'LATE-B')
        await A.wait_for_timeout(1500)
        left = await A.evaluate(f"Object.keys(localStorage).filter(k => k.startsWith('fakedb:{old_prefix}live/')).map(k => k.slice(7 + {len(old_prefix)}))")
        check('old shared place holds only the moved marker', left == ['live/moved'], left)

        # 3) B misses every notice (no list watch, no marker) and writes after the old place is gone.
        await B.evaluate("(() => { const c = window.__morph.controller; c.followMovedProject = () => {}; if (c.live.unsub) c.live.unsub(); })()")
        old_prefix = await A.evaluate("window.__morph.controller.pbe.prefix")
        await A.evaluate(f"window.__morph.controller.stopSharing('{pid}')"); await A.wait_for_timeout(7000)
        a3 = await A.evaluate(st)
        check('A made it private again', not a3['shared'] and a3['place'] == a0['place'], a3)
        b_before = await B.evaluate(st)
        check('B is still on the old place (it missed the notices)', b_before['place'] == a2['place'], b_before)
        await B.evaluate(f"window.__morph.controller.setNote('{sids[2]}', 'GUARD-B')"); await B.wait_for_timeout(5000)
        b3 = await B.evaluate(st)
        check('B found the project again', b3['place'] == a3['place'], b3)
        check('A sees the note B wrote on the vanished place', await A.evaluate(note(sids[2])) == 'GUARD-B')
        ghost = await A.evaluate(f"Object.keys(localStorage).filter(k => k.startsWith('fakedb:{old_prefix}live/')).map(k => k.slice(7 + {len(old_prefix)}))")
        check('nothing re-created in the old place', 'live/meta' not in ghost, ghost)
        check('no stale marker in the private place', await A.evaluate("localStorage.getItem('fakedb:live/moved') === null"))
        # A stays put (no reopen loop) and all notes are there
        await A.wait_for_timeout(3000)
        a4 = await A.evaluate(st)
        check('A is stable', a4['place'] == a3['place'] and a4['slides'] == a3['slides'], a4)
        allnotes = await A.evaluate(f"[{note(sids[0])}, {note(sids[1])}, {note(sids[2])}]")
        check('all three notes kept', allnotes == ['LATE-B', 'PENDING-B', 'GUARD-B'], allnotes)
        # 4) After a reload, both tabs open the same place with everything.
        await B.reload(); await B.wait_for_timeout(4000)
        b5 = await B.evaluate(st)
        allb = await B.evaluate(f"[{note(sids[0])}, {note(sids[1])}, {note(sids[2])}]")
        check('fresh tab sees everything', b5['place'] == a4['place'] and allb == allnotes, (b5, allb))
        errs = [l for l in logs if 'pageerror' in l]
        check('no page errors', not errs, errs[:5])
        await ctx.close()
    print('\n' + ('ALL PASS' if not fails else 'FAILED: ' + ', '.join(fails)))

asyncio.run(main())
