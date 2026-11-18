const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
require('./helpers/jwtEnvironment');
const User = require('../models/User');
const GuardianLink = require('../models/GuardianLink');
const ClassSession = require('../models/ClassSession');
const QuizSubmission = require('../models/QuizSubmission');
const { percentageFor, sessionForParent, quizForParent } = require('../utils/parentProgress');
const ids = { parent: 'a'.repeat(24), child: 'b'.repeat(24), other: 'c'.repeat(24) };
const query = (value) => ({ select() { return this; }, lean: async () => value });

test('phần trăm chỉ tính bài graded hợp lệ, không lấy percentage cũ hoặc chia cho 0', () => {
  for (const item of [{ status: 'submitted', totalScore: 5, maxScore: 10 }, { status: 'in-progress', totalScore: 10, maxScore: 10 },
    { status: 'graded', totalScore: 0, maxScore: 0 }, { status: 'graded', totalScore: -1, maxScore: 10 },
    { status: 'graded', totalScore: 11, maxScore: 10 }, { status: 'graded', totalScore: 1, maxScore: Infinity }]) assert.equal(percentageFor(item), null);
  assert.equal(percentageFor({ status: 'graded', totalScore: 0, maxScore: 10 }), 0);
  assert.equal(percentageFor({ status: 'graded', totalScore: 2, maxScore: 3, percentage: 99 }), 66.67);
});

test('allowlist chặn ghi chú điểm danh, hồ sơ khác, đề/đáp án và điểm chờ chấm', () => {
  const row = { _id: 's', teacher: { email: 'private@example.test' }, attendances: [{ student: ids.other }],
    attendance: { status: 'late', note: 'Nội bộ', recordedBy: ids.parent }, answers: ['secret'], correctAnswer: 'secret',
    status: 'submitted', totalScore: 9, maxScore: 10, feedback: 'Chưa công bố', questions: ['secret'] };
  assert.deepEqual(sessionForParent(row).attendance, { status: 'late', checkedInAt: null });
  const quiz = quizForParent(row);
  assert.equal(quiz.totalScore, null); assert.equal(quiz.percentage, null); assert.equal(quiz.feedback, '');
  for (const dto of [quiz, sessionForParent(row)]) for (const key of ['teacher', 'answers', 'correctAnswer', 'questions', 'attendances']) assert.equal(key in dto, false);
});

async function fixture(t) {
  let role = 'parent'; let verified = true; let child = { name: 'Học sinh QA' }; let fail = false;
  let calls = 0;
  t.mock.method(User, 'findById', () => query({ role, status: 'active' }));
  t.mock.method(User, 'findOne', () => query(child));
  t.mock.method(GuardianLink, 'exists', async (filter) => {
    assert.deepEqual(filter, { parent: ids.parent, student: ids.child, status: 'verified' });
    return verified;
  });
  t.mock.method(ClassSession, 'aggregate', async (pipeline) => {
    calls++;
    assert.equal(String(pipeline[0].$match['attendances.student']), ids.child);
    assert.equal(pipeline[1].$facet.data[1].$limit, 50);
    if (fail) throw new Error('database URI secret');
    return [{ data: [], summary: [{ totalSessions: 60, completedSessions: 52 }] }];
  });
  t.mock.method(QuizSubmission, 'aggregate', async (pipeline) => {
    calls++;
    assert.equal(String(pipeline[0].$match.student), ids.child);
    assert.deepEqual(pipeline[0].$match.status, { $in: ['submitted', 'graded'] });
    assert.equal(pipeline[1].$facet.data[1].$limit, 50);
    return [{ data: [], summary: [] }];
  });
  const app = express(); app.use('/api/guardians', require('../routes/guardians'));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { role(value) { role = value; }, verified(value) { verified = value; }, child(value) { child = value; }, fail() { fail = true; }, calls: () => calls,
    async request({ id = ids.child, token = true, method = 'GET' } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/guardians/children/${id}/progress?role=parent&limit=999&fields=answers`, {
        method, headers: token ? { Authorization: `Bearer ${jwt.sign({ userId: ids.parent, role: 'parent' }, process.env.JWT_SECRET)}` } : {},
      });
      return { status: response.status, body: response.headers.get('content-type')?.includes('json') ? await response.json() : null,
        cache: response.headers.get('cache-control') };
    } };
}

test('HTTP chỉ parent đã xác minh được đọc; role DB thắng token, không query học tập khi bị chặn', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request({ token: false })).status, 401);
  for (const role of ['student', 'teacher', 'admin']) { f.role(role); assert.equal((await f.request()).status, 403); }
  f.role('parent'); f.verified(false); assert.equal((await f.request()).status, 404);
  f.verified(true); f.child(null); assert.equal((await f.request()).status, 404);
  assert.equal(f.calls(), 0);
  assert.equal((await f.request({ id: 'bad' })).status, 400);
  f.child({ name: 'Học sinh QA', email: 'private@example.test' });
  const result = await f.request();
  assert.equal(result.status, 200); assert.equal(result.cache, 'private, no-store');
  assert.deepEqual(result.body.student, { id: ids.child, name: 'Học sinh QA' });
  assert.equal(result.body.summary.completedSessions, 52); assert.equal(result.body.summary.averagePercentage, null);
  assert.equal(result.body.limit, 50); assert.equal(result.body.timeZone, 'Asia/Ho_Chi_Minh');
  assert.equal(f.calls(), 2);
  assert.equal((await f.request({ method: 'POST' })).status, 404);
});

test('HTTP báo lỗi chung, không lộ lỗi database hoặc dữ liệu bí mật', async (t) => {
  const f = await fixture(t); f.fail();
  const result = await f.request(); assert.equal(result.status, 500);
  assert.equal(JSON.stringify(result.body).includes('secret'), false);
});
