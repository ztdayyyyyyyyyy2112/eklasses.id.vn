// Browser QA riêng cho học cụ tĩnh. API mô phỏng chỉ trong server loopback của test.
// Cần Playwright/FFmpeg đã cài bên ngoài; không thêm dependency vào ứng dụng.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
async function main() {
  if (!process.env.BROWSER_TOOLS_DIR || !process.env.FFMPEG_BINARY || !process.env.QA_ARTIFACT_DIR) throw new Error('Cần BROWSER_TOOLS_DIR, FFMPEG_BINARY, QA_ARTIFACT_DIR');
  const { chromium } = require(require.resolve('playwright', { paths: [process.env.BROWSER_TOOLS_DIR] }));
  const build = path.resolve(__dirname, '../build');
  const artifacts = process.env.QA_ARTIFACT_DIR;
  fs.mkdirSync(artifacts, { recursive: true });
  const temporaryRoot = path.join(process.env.TEMP || os.tmpdir(), 'opencode');
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const frames = fs.mkdtempSync(path.join(temporaryRoot, 'geometry-frames-'));
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(req.url.endsWith('/content-summary') ? { videos: 0, documents: 0, quizzes: 0, assignments: 0 }
        : req.url === '/api/classes/qa-class' ? { _id: 'qa-class', name: 'Lớp QA — dữ liệu mô phỏng', subject: 'Toán', students: [], capacity: 20 } : [])); return;
    }
    let file = path.resolve(build, '.' + req.url.split('?')[0]);
    if (!file.startsWith(build + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(build, 'index.html');
    res.setHeader('Content-Type', ({ '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png' })[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling'] });
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 1100 } });
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    await context.addInitScript(() => { localStorage.setItem('token', 'synthetic-qa-only'); localStorage.setItem('userRole', 'student'); });
    const page = await context.newPage(); const errors = []; const requests = [];
    page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => requests.push(request.url()));
    await page.goto('/class/qa-class'); await page.getByRole('button', { name: 'Học cụ 3D', exact: true }).waitFor();
    const initialChunks = requests.filter((url) => url.includes('/static/js/')).length;
    await page.getByRole('button', { name: 'Học cụ 3D', exact: true }).click();
    await page.getByText('Mô hình 3D sẵn sàng.', { exact: true }).waitFor();
    assert.ok(requests.filter((url) => url.includes('/static/js/')).length > initialChunks);
    let frame = 0;
    const capture = async () => {
      await page.screenshot({ path: path.join(frames, `${String(frame++).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 85 });
    };
    await capture();
    const canvas = page.locator('.geometry-canvas canvas');
    const beforeDrag = await canvas.screenshot(); const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 30, { steps: 8 }); await page.mouse.up();
    assert.ok(!beforeDrag.equals(await canvas.screenshot()), 'Mouse drag must change model');
    for (const action of ['Đặt lại', ...Array(8).fill('Xoay trái'), ...Array(3).fill('Phóng to'), 'Thu nhỏ', 'Đáy ABC', 'Mặt bên ABB′A′', 'Mặt bên BCC′B′', 'Tất cả các mặt', 'Đặt lại']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      for (let i = 0; i < 3; i++) await capture();
    }
    await page.screenshot({ path: path.join(artifacts, 'issue7-desktop.png'), fullPage: true });
    const frameData = Buffer.concat(fs.readdirSync(frames).sort().map((name) => fs.readFileSync(path.join(frames, name))));
    const ffmpeg = spawnSync(process.env.FFMPEG_BINARY, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-framerate', '6', '-i', 'pipe:0',
      '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuv420p', path.join(artifacts, 'issue7-prism.webm')], { encoding: 'utf8', input: frameData });
    assert.equal(ffmpeg.status, 0, `FFmpeg must encode actual browser frames: ${ffmpeg.stderr}`);
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow ${width}`);
    }
    const mobile = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await mobile.addInitScript(() => { localStorage.setItem('token', 'synthetic-qa-only'); localStorage.setItem('userRole', 'student'); });
    await mobile.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const phone = await mobile.newPage(); await phone.goto('/class/qa-class'); await phone.getByRole('button', { name: 'Học cụ 3D', exact: true }).click();
    await phone.getByText('Mô hình 3D sẵn sàng.', { exact: true }).waitFor();
    const phoneCanvas = phone.locator('canvas'); await phoneCanvas.scrollIntoViewIfNeeded();
    const phoneBefore = await phoneCanvas.screenshot(); const rect = await phoneCanvas.boundingBox();
    const cdp = await mobile.newCDPSession(phone);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: rect.x + 100, y: rect.y + 100 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: rect.x + 160, y: rect.y + 130 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.ok(!phoneBefore.equals(await phoneCanvas.screenshot()), 'Touch drag must change model');
    await phone.getByRole('button', { name: 'Mặt bên ABB′A′', exact: true }).click();
    await phone.screenshot({ path: path.join(artifacts, 'issue7-mobile.png'), fullPage: true });
    await phoneCanvas.evaluate((element) => element.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await phone.locator('.geometry-viewer svg').waitFor();
    assert.equal(await phone.getByRole('button', { name: 'Phóng to', exact: true }).isDisabled(), true);
    await phone.getByRole('button', { name: 'Tổng Quan', exact: true }).click(); await phone.getByRole('button', { name: 'Học cụ 3D', exact: true }).click();
    await phone.getByText('Mô hình 3D sẵn sàng.', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await mobile.close(); await context.close();
    console.log('PASS geometry QA: mouse/touch đổi mô hình, zoom/chọn mặt/reset, lazy-load, 4 viewport, mất context/fallback/reopen. Video WebM từ khung hình browser thực.');
  } finally { await browser?.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
