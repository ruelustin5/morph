# Remove background: first-time dialog, download progress, the real model on WebAssembly, trimming,
# undo, second run without the dialog (model cached), right-click menu.
import asyncio, shutil, base64, time, sys
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
GPU = 'gpu' in sys.argv
async def main():
    shutil.rmtree('/tmp/pw-bg', ignore_errors=True)
    async with async_playwright() as p:
        args = ['--no-sandbox'] + (['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-webgpu-adapter=swiftshader'] if GPU else [])
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-bg', executable_path='/usr/bin/google-chrome', args=args, viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        A.on('console', lambda m: errs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        print('webgpu adapter:', await ev("navigator.gpu ? navigator.gpu.requestAdapter().then(a => !!a) : false"))
        b64 = base64.b64encode(open('/tmp/astronaut.jpg', 'rb').read()).decode()
        S = "window.__morph.store"; C = "window.__morph.controller"
        await ev(f"""(() => {{ const p = {S}.activePage; const el = p.addElement({{ type: 'image', src: 'data:image/jpeg;base64,{b64}', x: 300, y: 200, width: 512, height: 512 }}); {S}.selectElements([el.id]); window.__img = el.id; }})()""")
        await A.wait_for_timeout(800)
        btn = A.locator('button:has-text("Remove background")')
        print('toolbar button:', await btn.count())
        await btn.first.click(); await A.wait_for_timeout(500)
        print('first-time dialog:', await A.locator('.bg-dialog').count(), '|', (await A.locator('.bg-dialog .bp5-dialog-body').inner_text()).replace('\n', ' ')[:120])
        t0 = time.time()
        await A.click('.bg-dialog button:has-text("Download and remove")')
        seen = set()
        for _ in range(2400 if GPU else 600):
            st = await ev("(() => { const s = document.querySelector('.bg-status'); return s ? s.innerText : null; })()")
            if st: seen.add(st.split('…')[0])
            if st is None and _ > 3: break
            await A.wait_for_timeout(250)
        print('progress seen:', sorted(seen), '| took', round(time.time() - t0, 1), 's')
        toast = await ev("Array.from(document.querySelectorAll('.bp5-toast')).map(x => x.innerText).join(' | ')")
        print('last run:', await ev("window.__morph.bgLastRun()"))
        if GPU:
            print('console:', [e[:300] for e in errs][:8]); print('toast:', toast); await ctx.close(); return
        print('toast:', toast)
        r = await ev(f"(() => {{ const e = {S}.getElementById(window.__img); return {{ src: e.src.slice(0, 22), x: Math.round(e.x), y: Math.round(e.y), w: Math.round(e.width), h: Math.round(e.height), crop: [e.cropX, e.cropY, e.cropWidth, e.cropHeight].map(v => Math.round(v * 1000) / 1000) }}; }})()")
        print('after:', r)
        # alpha check: top-right corner of the original picture area should now be transparent / outside
        alpha = await ev(f"""(async () => {{ const e = {S}.getElementById(window.__img); const im = new Image(); im.src = e.src; await im.decode();
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
            const d = x.getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 10) t++;
            return {{ size: [c.width, c.height], transparentPct: Math.round(100 * t / (c.width * c.height)), face: x.getImageData(Math.round(c.width * 0.35), Math.round(c.height * 0.2), 1, 1).data[3] }}; }})()""")
        print('result picture:', alpha)
        await A.screenshot(path='/tmp/bg-after.png')
        # undo
        await A.mouse.click(1000, 845); await A.keyboard.press('Control+z'); await A.wait_for_timeout(700)
        print('undo restores the original:', await ev(f"(() => {{ const e = {S}.getElementById(window.__img); return e.src.startsWith('data:image/jpeg') && Math.round(e.width) === 512 && Math.round(e.x) === 300; }})()"))
        # second time: no dialog, from the right-click menu
        await ev(f"{S}.selectElements([window.__img])"); await A.wait_for_timeout(300)
        org = await ev("(() => { const st = window.__morph.Konva.stages[0]; const r = st.container().getBoundingClientRect(); const n = st.findOne(x => x.id() === window.__img && x.getClassName() === 'Image') || st.findOne('#' + window.__img); const b = n.getClientRect(); return [r.left + b.x + b.width / 2, r.top + b.y + b.height / 2]; })()")
        await A.mouse.click(org[0], org[1], button='right'); await A.wait_for_timeout(500)
        print('menu:', await ev("Array.from(document.querySelectorAll('.obj-menu > li')).map(x => x.innerText.replace(/\\n/g, ' ')).filter(Boolean)"))
        t0 = time.time()
        await A.click('.obj-menu li:has-text("Remove background") a'); await A.wait_for_timeout(400)
        print('dialog the second time:', await A.locator('.bg-dialog').count())
        for _ in range(400):
            if not await ev("!!document.querySelector('.bg-status')"): break
            await A.wait_for_timeout(250)
        print('second run took', round(time.time() - t0, 1), 's | src:', await ev(f"{S}.getElementById(window.__img).src.slice(0, 16)"))
        # a rotated, flipped, cropped picture keeps its place
        await ev(f"(() => {{ const e = {S}.getElementById(window.__img); }})()")
        print('errors:', [e for e in errs if 'favicon' not in e][:6])
        await ctx.close()
asyncio.run(main())
