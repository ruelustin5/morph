# Your own LaTeX commands: a .sty file (chosen or dropped) becomes macros; typed commands; honest search fallback.
import asyncio, shutil
from playwright.async_api import async_playwright
BASE = 'http://localhost:8766/dist-webtest/index.html'
async def main():
    shutil.rmtree('/tmp/pw-ltx', ignore_errors=True)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context('/tmp/pw-ltx', executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], viewport={'width': 1400, 'height': 900})
        errs = []
        A = ctx.pages[0]
        A.on('pageerror', lambda e: errs.append(str(e)))
        ev = A.evaluate
        await A.goto(BASE + '?u=alice'); await A.wait_for_timeout(2500)
        await A.locator('.join-owner button').click(); await A.wait_for_timeout(4000)
        await A.click('text=Equation'); await A.wait_for_timeout(2500)
        async def render(tex):
            await A.fill('.eq-input', tex); await A.wait_for_timeout(1000)
            return await ev("(() => { const e = document.querySelector('.eq-err'); const i = document.querySelector('.eq-preview img'); return e ? 'ERR ' + e.textContent : i ? 'OK' : '?'; })()")
        print('before file, \\R:', await render('\\R + \\norm{x}'))
        print('before file, usepackage mymath:', await render('\\usepackage{mymath} x'))
        await A.click('.eq-pk-btn'); await A.wait_for_timeout(500)
        await A.locator('.pk-drop input[type=file]').set_input_files('/tmp/sty-test.sty'); await A.wait_for_timeout(4000)
        print('report:', await A.locator('.pk-report').inner_text())
        print('rows:', await A.locator('.pk-file').all_inner_texts())
        print('packages list:', await ev("window.__morph.controller.settings.latex.packages || 'default (all)'"))
        await A.screenshot(path='/tmp/ltx-panel.png')
        # dropping the same file again updates it
        await ev("""(async () => {
            const txt = '\\\\newcommand{\\\\R}{\\\\mathbf{R}}\\n\\\\newcommand{\\\\Q}{\\\\mathbb{Q}}';
            const dt = new DataTransfer(); dt.items.add(new File([txt], 'sty-test.sty', { type: 'text/plain' }));
            const el = document.querySelector('.pk-own');
            el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
            el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
        })()"""); await A.wait_for_timeout(3000)
        print('after drop of new version:', await A.locator('.pk-report').inner_text(), '|', await A.locator('.pk-file').all_inner_texts())
        # wrong type
        await A.locator('.pk-drop input[type=file]').set_input_files({'name': 'pic.png', 'mimeType': 'image/png', 'buffer': b'x'}); await A.wait_for_timeout(800)
        print('png:', await A.locator('.pk-report').inner_text())
        # typed commands
        await A.click('.pk-drop button:has-text("Type them")'); await A.wait_for_timeout(300)
        await A.fill('.pk-type textarea', '\\newcommand{\\half}{\\frac{1}{2}}\n\\newcommand{\\bad}{\\nosuchthing}'); await A.click('.pk-type button:has-text("Add commands")'); await A.wait_for_timeout(3000)
        print('typed:', await A.locator('.pk-report').inner_text())
        await A.click('.pk-drop button:has-text("Type them")'); await A.wait_for_timeout(300)
        await A.fill('.pk-type textarea', '\\newcommand{\\third}{\\frac{1}{3}}'); await A.click('.pk-type button:has-text("Add commands")'); await A.wait_for_timeout(3000)
        print('typed 2:', await A.locator('.pk-file').all_inner_texts())
        # search: by command, then unknown package
        await A.fill('.pk-panel .bp5-input-group input', 'dv'); await A.wait_for_timeout(300)
        print('search dv:', [x.split('\n')[0] for x in await A.locator('.pk-row').all_inner_texts()])
        await A.fill('.pk-panel .bp5-input-group input', 'tikz'); await A.wait_for_timeout(300)
        print('search tikz:', (await A.locator('.pk-missing').inner_text()).replace('\n', ' | '))
        print('ctan link:', await A.locator('.pk-missing a').get_attribute('href'))
        await A.click('.pk-missing button:has-text("Clear the search")'); await A.wait_for_timeout(200)
        await A.click('.pk-head button'); await A.wait_for_timeout(500)
        for tex in ['\\R + \\Q', '\\half + \\third', '\\usepackage{sty-test} \\R', '\\norm{x}']:
            print(repr(tex), await render(tex))
        # turn the file off -> its commands stop working
        await A.click('.eq-pk-btn'); await A.wait_for_timeout(400)
        await A.locator('.pk-file').first.locator('.bp5-switch').click(); await A.wait_for_timeout(300)
        await A.click('.pk-head button'); await A.wait_for_timeout(400)
        print('file off, \\Q:', await render('\\Q'))
        print('settings saved in project:', await ev("(() => { const l = window.__morph.controller.settings.latex; return l.files.map(f => [f.name, f.on, Object.keys(f.macros).length]); })()"))
        print('errors:', errs)
        await ctx.close()
asyncio.run(main())
