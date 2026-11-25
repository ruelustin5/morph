"""Serve the repository's files to a Playwright browser context without running a web server.

    from localfiles import serve_files
    await serve_files(ctx)          # http://localhost:8766/... answered from disk
"""
import os, mimetypes

ROOT = os.getcwd()


async def serve_files(ctx, port=8766):
    prefix = f'http://localhost:{port}/'

    async def serve(route):
        path = route.request.url[len(prefix):].split('?')[0].split('#')[0]
        fp = os.path.normpath(os.path.join(ROOT, path))
        if not fp.startswith(ROOT) or not os.path.isfile(fp):
            return await route.fulfill(status=404, body='')
        await route.fulfill(path=fp, content_type=mimetypes.guess_type(fp)[0] or 'application/octet-stream')

    await ctx.route(prefix + '**', serve)
