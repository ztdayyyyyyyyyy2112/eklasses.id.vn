// QA dùng MongoDB riêng và browser tools đã có, không thêm dependency hoặc nạp .env.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const { startProgressLab } = require('../tests/helpers/progressLab');
const User = require('../models/User');
const Class = require('../models/Class');
const ClassSession = require('../models/ClassSession');
const GuardianLink = require('../models/GuardianLink');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');
let phase = 'Khởi tạo lab';

async function main() {
  if (!process.env.BROWSER_TOOLS_DIR || !process.env.QA_ARTIFACT_DIR) throw new Error('Cần BROWSER_TOOLS_DIR và QA_ARTIFACT_DIR cho lab');
  const { chromium } = require(require.resolve('playwright', { paths: [process.env.BROWSER_TOOLS_DIR] }));
  process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
  const lab = await startProgressLab();
  let browser; let server;
  try {
    fs.mkdirSync(process.env.QA_ARTIFACT_DIR, { recursive: true });
    const users = {};
    for (const [key, role] of [['parent', 'parent'], ['other', 'parent'], ['teacher', 'teacher'], ['student', 'student']]) {
      users[key] = await User.create({ name: `QA ${key}`, email: `${key}@example.test`, password: lab.password, role, status: 'active' });
    }
    await GuardianLink.create({ parent: users.parent._id, student: users.student._id, status: 'verified' });
    const cls = await Class.create({ name: 'Lớp QA riêng', subject: 'Toán', teacher: users.teacher._id, students: [users.student._id] });
    await ClassSession.create({ class: cls._id, teacher: users.teacher._id, createdBy: users.teacher._id, title: 'Buổi học QA', status: 'completed',
      startsAt: new Date('2026-11-18T00:00:00Z'), endsAt: new Date('2026-11-18T01:00:00Z'), attendances: [{ student: users.student._id, status: 'present', note: 'INTERNAL_QA_NOTE' }] });
    const quiz = await Quiz.create({ title: 'Quiz tự luận QA', class: cls._id, teacher: users.teacher._id, status: 'published', totalPoints: 10,
      questions: [{ type: 'essay', question: 'Giải thích định lý', points: 10 }] });
    const app = express(); app.use(express.json());
    for (const [prefix, file] of [['auth', 'auth'], ['guardians', 'guardians'], ['classes', 'classes'], ['quizzes', 'quizzes'], ['tutors', 'tutors'], ['bookings', 'bookings']]) app.use(`/api/${prefix}`, require(`../routes/${file}`));
    app.use(express.static(path.resolve(__dirname, '../../frontend/build')));
    app.get('*', (req, res) => res.sendFile(path.resolve(__dirname, '../../frontend/build/index.html')));
    server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
    const baseURL = `http://127.0.0.1:${server.address().port}`;
    phase = 'Khởi động Edge';
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
    const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
    // Chặn toàn bộ mạng ngoài trước khi nhập credential QA.
    await context.route('**/*', (route) => new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    phase = 'Đăng nhập giao diện';
    await page.goto('/login');
    await page.getByPlaceholder('Nhập email của bạn', { exact: true }).fill('parent@example.test');
    await page.getByPlaceholder('Nhập mật khẩu', { exact: true }).fill(lab.password);
    await page.getByRole('button', { name: 'Đăng Nhập', exact: true }).click();
    await page.waitForURL('**/dashboard');
    phase = 'Mở link báo cáo';
    await page.getByRole('link', { name: 'Xem tiến bộ' }).click();
    await page.getByRole('heading', { name: 'Tiến bộ của QA student' }).waitFor();
    await page.getByText('Chưa có bài làm đã nộp.', { exact: true }).waitFor();
    const login = async (key) => {
      const response = await context.request.post('/api/auth/login', { data: { email: `${key}@example.test`, password: lab.password } });
      assert.equal(response.status(), 200); return (await response.json()).token;
    };
    phase = 'Nộp bài qua HTTP';
    const studentToken = await login('student'); const teacherToken = await login('teacher'); const otherToken = await login('other');
    const response = await context.request.post(`/api/quizzes/${quiz._id}/submit`, { headers: { Authorization: `Bearer ${studentToken}` }, data: { answers: [{ answer: 'QA essay' }] } });
    assert.equal(response.status(), 201); const submission = (await response.json()).submission;
    await page.getByRole('button', { name: 'Tải lại báo cáo' }).click();
    await page.getByText('Đã nộp — chờ chấm', { exact: true }).waitFor();
    phase = 'Chấm điểm và tải lại';
    for (const score of [8, 9]) {
      const grade = await context.request.post(`/api/quizzes/${quiz._id}/submission/${submission._id}/grade`, { headers: { Authorization: `Bearer ${teacherToken}` }, data: { questionIndex: 0, score, feedback: 'Nhận xét QA từ giáo viên' } });
      assert.equal(grade.status(), 200);
      await page.getByRole('button', { name: 'Tải lại báo cáo' }).click();
      await page.getByText(`Điểm: ${score} / 10 (${score * 10}%)`, { exact: true }).waitFor();
    }
    const forbidden = await context.request.get(`/api/guardians/children/${users.student._id}/progress`, { headers: { Authorization: `Bearer ${otherToken}` } });
    assert.equal(forbidden.status(), 404);
    const text = await page.locator('body').innerText(); assert.ok(!text.includes('INTERNAL_QA_NOTE')); assert.ok(!text.includes('QA essay'));
    phase = 'Responsive và ảnh';
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      assert.equal(overflow, false, `overflow ${width}`);
      if ([390, 1280].includes(width)) await page.screenshot({ path: path.join(process.env.QA_ARTIFACT_DIR, `progress-${width}.png`), fullPage: true });
    }
    // Đổi dữ liệu qua DB chỉ ở phần fixture QA; ứng dụng vẫn tải lại qua API thật.
    assert.equal(await QuizSubmission.countDocuments({ student: users.student._id }), 1);
    await page.reload(); await page.getByText('Điểm: 9 / 10 (90%)', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS browser QA: login thật, link danh sách con, rỗng/chờ chấm/80→90%, refresh bền vững, phụ huynh khác 404, 320/390/768/1280px, không pageerror.');
    await context.close();
  } finally { await browser?.close(); if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } await lab.stop(); }
}
main().catch((error) => { console.error(`FAIL progress browser QA (${phase}, ${error.name}); không in request/config để tránh lộ credential.`); process.exitCode = 1; });
