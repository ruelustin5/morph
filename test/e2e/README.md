# End-to-end tests

Browser tests with Playwright (Python) against local builds. From the repository root:

```bash
node build.mjs && node build.mjs webtest
python3 -m http.server 8765 &          # serves dist/ and dist-webtest/
python3 test/e2e/web_test.py           # website version, fake Firebase (test/fake-firebase/)
python3 test/e2e/live_test.py          # artifact version, two people editing live (fake-artifact.js)
python3 test/e2e/share_test.py         # artifact version, owner / guests / encrypted sharing
python3 test/e2e/feature_test.py       # versions, IDs, templates, equations, presenter keys…
python3 test/e2e/move_test.py          # a project shared / re-keyed / made private while open in another tab
```

`move_test`, `share_test`, `live_test` and `undo_live_test` answer `http://localhost:8766/` from the files on
disk themselves (`localfiles.py`), so they need no web server.

The scripts expect Chrome at `/usr/bin/google-chrome`.
