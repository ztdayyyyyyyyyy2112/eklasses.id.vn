const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
require('./helpers/jwtEnvironment');
const { startProgressLab } = require('./helpers/progressLab');
const User = require('../models/User');
const GuardianLink = require('../models/GuardianLink');
const Class = require('../models/Class');
const ClassSession = require('../models/ClassSession');
const Quiz = require('../models/Quiz');
const QuizSubmission = require('../models/QuizSubmission');
const TutorProfile = require('../models/TutorProfile');
const BookingRequest = require('../models/BookingRequest');

test('MongoDB QA: đặt/nhận buổi, nộp/chấm quiz, thống kê toàn bộ, giới hạn và truy cập chéo', { timeout: 90000 }, async (t) => {
  const lab = await startProgressLab(); t.after(lab.stop);
  await Promise.all([User.init(), GuardianLink.init(), Class.init(), ClassSession.init(), Quiz.init(), QuizSubmission.init(), TutorProfile.init(), BookingRequest.init()]);
  const users = {};
  for (const [key, role] of [['parent', 'parent'], ['other', 'parent'], ['pending', 'parent'], ['student', 'student'], ['unrelated', 'student'], ['teacher', 'teacher'], ['admin', 'admin']]) {
    users[key] = await User.create({ name: `QA ${key}`, email: `${key}@example.test`, password: lab.password, role, status: 'active',
      ...(role === 'teacher' ? { review: { reviewedAt: new Date() } } : {}) });
  }
  await GuardianLink.create([{ parent: users.parent._id, student: users.student._id, status: 'verified' },
    { parent: users.pending._id, student: users.student._id, status: 'pending' }]);
  const profile = await TutorProfile.create({ teacher: users.teacher._id, published: true, subjects: ['Toán'], grades: ['12'], modes: ['online'] });
  const app = express(); app.use(express.json());
  app.use('/api/guardians', require('../routes/guardians'));
  app.use('/api/bookings', require('../routes/bookings'));
  app.use('/api/quizzes', require('../routes/quizzes'));
  app.use('/api/sessions', require('../routes/sessions').sessionRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = async (actor, url, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method,
      headers: { Authorization: `Bearer ${jwt.sign({ userId: String(users[actor]._id), role: 'parent' }, process.env.JWT_SECRET)}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  const reportPath = `/guardians/children/${users.student._id}/progress`;
  const startsAt = new Date(Date.now() + 86400000); const endsAt = new Date(startsAt.getTime() + 3600000);
  const booking = await request('parent', '/bookings', { studentId: String(users.student._id), tutorProfileId: String(profile._id),
    subject: 'Toán', mode: 'online', startsAt, endsAt, idempotencyKey: crypto.randomUUID() });
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const accepted = await request('teacher', `/bookings/${booking.data.id}/decision`, { action: 'accept' });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const cls = await Class.findById(accepted.data.classId);
  let result = await request('parent', reportPath);
  assert.equal(result.status, 200); assert.equal(result.data.sessions[0].id, accepted.data.sessionId);
  assert.equal(result.data.summary.completedSessions, 0);
  assert.equal((await request('teacher', `/sessions/${accepted.data.sessionId}/status`, { status: 'completed' }, 'PUT')).status, 200);
  const quiz = await Quiz.create({ class: cls._id, teacher: users.teacher._id, title: 'Quiz thật QA', status: 'published', totalPoints: 10,
    questions: [{ type: 'essay', question: 'Giải thích định lý', points: 10 }] });
  const submission = await request('student', `/quizzes/${quiz._id}/submit`, { answers: [{ answer: 'Bài trả lời QA không công bố cho phụ huynh' }] });
  assert.equal(submission.status, 201, JSON.stringify(submission.data));
  result = await request('parent', reportPath);
  assert.equal(result.data.summary.pendingQuizzes, 1); assert.equal(result.data.quizzes[0].percentage, null);
  assert.equal(JSON.stringify(result.data).includes('Bài trả lời QA'), false);
  const grade = async (score) => request('teacher', `/quizzes/${quiz._id}/submission/${submission.data.submission._id}/grade`, { questionIndex: 0, score, feedback: 'Nhận xét QA' });
  assert.equal((await grade(8)).status, 200);
  result = await request('parent', reportPath);
  assert.equal(result.data.summary.completedSessions, 1); assert.equal(result.data.quizzes[0].percentage, 80);
  assert.equal(result.data.summary.averagePercentage, 80); assert.equal(result.data.quizzes[0].feedback, 'Nhận xét QA');
  assert.equal((await grade(9)).status, 200);
  result = await request('parent', reportPath); assert.equal(result.data.quizzes[0].percentage, 90);
  assert.equal(result.data.summary.averagePercentage, 90);
  for (const role of ['other', 'pending']) assert.equal((await request(role, reportPath)).status, 404);
  for (const role of ['student', 'teacher', 'admin']) assert.equal((await request(role, reportPath)).status, 403);
  await ClassSession.create({ class: cls._id, teacher: users.teacher._id, createdBy: users.teacher._id,
    title: 'BUỔI RIÊNG CỦA HỌC SINH KHÁC', startsAt, endsAt, attendances: [{ student: users.unrelated._id, note: 'PRIVATE_NOTE' }] });
  await QuizSubmission.create([{ quiz: quiz._id, class: cls._id, student: users.unrelated._id, status: 'graded', maxScore: 10, totalScore: 10 },
    { quiz: quiz._id, class: cls._id, student: users.student._id, status: 'in-progress', maxScore: 10, totalScore: 10 }]);
  result = await request('parent', reportPath); assert.equal(result.data.sessions.length, 1); assert.equal(result.data.quizzes.length, 1);
  assert.equal(JSON.stringify(result.data).includes('PRIVATE_NOTE'), false);
  // Tạo nhiều bản ghi QA để chứng minh summary không chỉ tính 50 bản ghi đầu.
  await QuizSubmission.insertMany(Array.from({ length: 55 }, (_, i) => ({ quiz: quiz._id, class: cls._id, student: users.student._id,
    status: 'graded', maxScore: 20, totalScore: 10, submittedAt: new Date(Date.now() + i * 1000) })));
  result = await request('parent', reportPath);
  assert.equal(result.data.quizzes.length, 50); assert.equal(result.data.summary.gradedQuizzes, 56);
  assert.equal(result.data.summary.averagePercentage, 50.71);
  assert.ok(result.data.quizzes.every((q, i, arr) => !i || q.submittedAt <= arr[i - 1].submittedAt));
  await ClassSession.insertMany(Array.from({ length: 55 }, (_, i) => ({ class: cls._id, teacher: users.teacher._id, createdBy: users.teacher._id,
    startsAt: new Date(startsAt.getTime() + i * 7200000), endsAt: new Date(endsAt.getTime() + i * 7200000), status: 'completed',
    attendances: [{ student: users.student._id, status: 'present', note: 'PRIVATE_NOTE' }, { student: users.unrelated._id, status: 'late' }] })));
  result = await request('parent', reportPath);
  assert.equal(result.data.sessions.length, 50); assert.equal(result.data.summary.completedSessions, 56);
  assert.ok(result.data.sessions.every((s) => s.attendance.status === 'present'));
  assert.equal(JSON.stringify(result.data).includes('PRIVATE_NOTE'), false);
  await QuizSubmission.create({ quiz: quiz._id, class: cls._id, student: users.student._id, status: 'graded', maxScore: 0, totalScore: 0 });
  result = await request('parent', reportPath);
  assert.equal(result.data.summary.gradedQuizzes, 57); assert.equal(result.data.summary.scoredQuizzes, 56);
  assert.equal(result.data.summary.averagePercentage, 50.71);
  await User.updateOne({ _id: users.student._id }, { isBlocked: true });
  assert.equal((await request('parent', reportPath)).status, 404);
  await User.updateOne({ _id: users.student._id }, { isBlocked: false });
  await GuardianLink.updateOne({ parent: users.parent._id }, { status: 'revoked' });
  assert.equal((await request('parent', reportPath)).status, 404);
});
