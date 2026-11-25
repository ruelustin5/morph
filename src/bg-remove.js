// Remove the background of a picture, in the browser: nothing is sent anywhere.
//
// The model (IS-Net general use, Apache 2.0, assets/bg/README.md) and ONNX Runtime Web are served
// from this site's bg/ folder and downloaded only the first time (about 90 MB + 15–30 MB). The model
// is kept in the browser's Cache Storage, so later uses start at once, even offline.
// WebGPU when the browser has it (about a second), otherwise WebAssembly (slower, 10–40 s).

const SIZE = 1024;
const CACHE = 'morph-bg-1';
const MODEL_FILE = 'isnet-fp16w.onnx';
const MODEL_BYTES = 90421742;

const base = () => new URL('bg/', document.baseURI).href;
const modelUrl = () => base() + MODEL_FILE;

let sessionP = null;
let ready = false;
let lastRun = null;
/** What the last run used (for tests and bug reports). */
export const bgLastRun = () => lastRun;

async function hasGpu() {
  try {
    return !!(navigator.gpu && (await navigator.gpu.requestAdapter()));
  } catch (e) {
    return false;
  }
}

/** Whether the model is already on this computer (no big download needed). */
export async function isDownloaded() {
  if (ready) return true;
  try {
    const cache = await caches.open(CACHE);
    return !!(await cache.match(modelUrl()));
  } catch (e) {
    return false;
  }
}

async function loadModel(onProgress) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (e) { /* private mode: no cache */ }
  const hit = cache && (await cache.match(modelUrl()));
  if (hit) { onProgress(1); return new Uint8Array(await hit.arrayBuffer()); }
  const res = await fetch(modelUrl());
  if (!res.ok) throw Object.assign(new Error('model ' + res.status), { code: 'download' });
  const total = Number(res.headers.get('content-length')) || MODEL_BYTES;
  const reader = res.body.getReader();
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    onProgress(Math.min(0.99, got / total));
  }
  const blob = new Blob(parts);
  if (cache) { try { await cache.put(modelUrl(), new Response(blob, { headers: { 'content-type': 'application/octet-stream' } })); } catch (e) { /* full: download again next time */ } }
  onProgress(1);
  return new Uint8Array(await blob.arrayBuffer());
}

function session(onProgress) {
  if (!sessionP) {
    sessionP = (async () => {
      const gpu = await hasGpu();
      // A file name in a variable, so the bundler leaves this import for the browser.
      const file = gpu ? 'ort.webgpu.min.mjs' : 'ort.wasm.min.mjs';
      const ort = await import(/* @vite-ignore */ base() + file);
      ort.env.wasm.wasmPaths = base();
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;
      // Without WebGPU the work runs in a background worker, so the editor stays usable meanwhile.
      if (!gpu) ort.env.wasm.proxy = true;
      const bytes = await loadModel(onProgress);
      let s = null, ep = 'wasm';
      if (gpu) {
        try { s = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'], graphOptimizationLevel: 'all' }); ep = 'webgpu'; } catch (e) { s = null; }
      }
      if (!s) s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      ready = true;
      // A second, WebAssembly session, made only if the GPU ever gives an unusable result.
      const cpu = () => ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      return { ort, s, ep, cpu };
    })().catch((e) => { sessionP = null; throw e; });
  }
  return sessionP;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!/^data:|^blob:/.test(src)) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(Object.assign(new Error('image'), { code: 'image' }));
    img.src = src;
  });
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * Remove the background of the picture at `src`.
 * Returns { src: data URL with transparency, box: { x, y, w, h } of the subject as fractions of
 * the picture (to trim the empty edges), empty: true when nothing was found }.
 * `onStep('download' | 'work', progress 0–1)` reports what is happening.
 */
export async function removeBackground(src, onStep = () => {}) {
  const img = await loadImage(src);
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!W || !H) throw Object.assign(new Error('image'), { code: 'image' });
  onStep(ready ? 'work' : 'download', 0);
  const sess = await session((p) => onStep('download', p));
  const { ort } = sess;
  onStep('work', 0);

  // 1024×1024, RGB 0–1 minus 0.5, channels first.
  const inC = canvas(SIZE, SIZE);
  const ix = inC.getContext('2d', { willReadFrequently: true });
  ix.drawImage(img, 0, 0, SIZE, SIZE);
  let px;
  try { px = ix.getImageData(0, 0, SIZE, SIZE).data; } catch (e) { throw Object.assign(new Error('tainted'), { code: 'tainted' }); }
  const N = SIZE * SIZE;
  const input = new Float32Array(3 * N);
  for (let i = 0; i < N; i++) {
    input[i] = px[i * 4] / 255 - 0.5;
    input[i + N] = px[i * 4 + 1] / 255 - 0.5;
    input[i + 2 * N] = px[i * 4 + 2] / 255 - 0.5;
  }
  const run = async (s) => {
    const out = await s.run({ input_image: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
    const t = out.output_image;
    const m = t.getData ? await t.getData() : t.data;
    let lo = Infinity, hi = -Infinity, bad = 0;
    for (let i = 0; i < N; i++) { const v = m[i]; if (!(v >= -1e3 && v <= 1e3)) { bad++; continue; } if (v < lo) lo = v; if (v > hi) hi = v; }
    return { m, lo, hi, bad };
  };
  const t0 = performance.now();
  let r = await run(sess.s);
  let ep = sess.ep;
  // A GPU driver can give garbage (NaN): then do it again on the processor.
  if (ep === 'webgpu' && (r.bad > 0 || !(r.hi - r.lo > 0.05))) {
    if (!sess.cpuSession) sess.cpuSession = await sess.cpu();
    r = await run(sess.cpuSession);
    ep = 'wasm (after webgpu)';
  }
  lastRun = { ep, lo: r.lo, hi: r.hi, bad: r.bad, ms: Math.round(performance.now() - t0) };
  const { m, lo, hi } = r;
  const span = hi - lo;
  if (r.bad > N / 100 || !(span > 0.05)) return { empty: true };

  // The mask as transparency, scaled back to the picture's size.
  const mC = canvas(SIZE, SIZE);
  const mx = mC.getContext('2d');
  const md = mx.createImageData(SIZE, SIZE);
  for (let i = 0; i < N; i++) { const v = (m[i] - lo) / span; md.data[i * 4 + 3] = v > 0 ? Math.round(Math.min(1, v) * 255) : 0; }
  mx.putImageData(md, 0, 0);
  const oC = canvas(W, H);
  const ox = oC.getContext('2d', { willReadFrequently: true });
  ox.drawImage(img, 0, 0);
  ox.globalCompositeOperation = 'destination-in';
  ox.imageSmoothingQuality = 'high';
  ox.drawImage(mC, 0, 0, W, H);

  // The subject's box (alpha above a small threshold), to trim empty edges.
  const a = ox.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (a[row + x * 4 + 3] > 10) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { empty: true };
  const pad = Math.round(Math.max(W, H) * 0.01);
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const cC = canvas(cw, ch);
  cC.getContext('2d').drawImage(oC, x0, y0, cw, ch, 0, 0, cw, ch);
  // WebP keeps transparency and is much smaller than PNG; browsers without it give PNG.
  let url = cC.toDataURL('image/webp', 0.9);
  if (!url.startsWith('data:image/webp')) url = cC.toDataURL('image/png');
  return { src: url, box: { x: x0 / W, y: y0 / H, w: cw / W, h: ch / H } };
}
