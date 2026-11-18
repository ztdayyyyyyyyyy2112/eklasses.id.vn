require('dotenv').config();
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const axios = require('axios');
const mongoose = require('mongoose');
const User = require('../models/User');
const BookingRequest = require('../models/BookingRequest');
const ClassSession = require('../models/ClassSession');
const GuardianLink = require('../models/GuardianLink');

const api = axios.create({ baseURL: 'http://127.0.0.1:5000/api', validateStatus: () => true });
const auth = token => ({ headers: { Authorization: `Bearer ${token}` } });
const login = async email => {
  const response = await api.post('/auth/login', { email, password: process.env.DEMO_PASSWORD });
  assert.equal(response.status, 200, `login ${email}: ${response.data.message}`);
  return response.data;
};

async function main() {
  const parsed = new URL(process.env.MONGODB_URI || '');
  assert.equal(parsed.pathname, '/eklasses-tdtu-demo');
  assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname));
  await mongoose.connect(process.env.MONGODB_URI);
  const qaEmail = `qa-parent-${crypto.randomBytes(6).toString('hex')}@example.test`;
  let qaId;
  try {
    const health = await api.get('/health'); assert.equal(health.status, 200);
    const parent = await login('parent.demo@example.test');
    const student = await login('student.demo@example.test');
    const math = await login('math.tutor@example.test');
    const english = await login('english.tutor@example.test');
    const register = await api.post('/auth/register', { name: 'QA Parent', email: qaEmail,
      password: process.env.DEMO_PASSWORD, role: 'parent', acceptedPolicies: true });
    assert.equal(register.status, 201, JSON.stringify(register.data));
    qaId = register.data.user.id;
    const qa = register.data;
    const children = await api.get('/guardians/children', auth(parent.token));
    assert.equal(children.status, 200);
    assert.equal(children.data.length, 1);
    const studentId = String(children.data[0].id);
    const qaChildren = await api.get('/guardians/children', auth(qa.token));
    assert.deepEqual(qaChildren.data, []);
    await GuardianLink.create({ parent: qaId, student: children.data[0].id, status: 'pending' });
    assert.deepEqual((await api.get('/guardians/children', auth(qa.token))).data, []);
    assert.equal((await api.get('/guardians/children', auth(student.token))).status, 403);
    const tutors = await api.get('/tutors', { params: { subject: 'Toán', grade: '12', mode: 'online' } });
    assert.equal(tutors.status, 200);
    assert.equal(tutors.data.total, 1);
    assert.ok(!('email' in tutors.data.data[0]) && !('phone' in tutors.data.data[0]));
    const profile = tutors.data.data[0];
    const tutorDetail = await api.get(`/tutors/${profile.id}`);
    assert.equal(tutorDetail.status, 200);
    assert.ok(!('email' in tutorDetail.data) && !('review' in tutorDetail.data));
    const secondPage = await api.get('/tutors', { params: { page: 2, limit: 1 } });
    assert.equal(secondPage.data.total, 2);
    assert.equal(secondPage.data.data.length, 1);
    assert.equal((await api.put('/tutors/me', {}, auth(parent.token))).status, 403);
    assert.notEqual((await api.get('/tutors/me', auth(math.token))).data.teacher,
      (await api.get('/tutors/me', auth(english.token))).data.teacher);
    const lastSession = await ClassSession.findOne({ teacher: math.user.id }).sort({ endsAt: -1 }).select('endsAt').lean();
    const startsAt = new Date(Math.max(Date.now() + 5 * 86400000, lastSession?.endsAt?.getTime() || 0) + 2 * 86400000);
    const endsAt = new Date(startsAt.getTime() + 3600000);
    const payload = { studentId, tutorProfileId: profile.id, subject: 'Toán', mode: 'online',
      startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), idempotencyKey: crypto.randomUUID() };
    const forbidden = await api.post('/bookings', payload, auth(qa.token));
    assert.equal(forbidden.status, 403, JSON.stringify(forbidden.data));
    const created = await api.post('/bookings', payload, auth(parent.token));
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const same = await api.post('/bookings', payload, auth(parent.token));
    assert.equal(same.status, 200);
    assert.equal(same.data.id, created.data.id);
    const overlap = await api.post('/bookings', { ...payload, idempotencyKey: crypto.randomUUID() }, auth(parent.token));
    assert.equal(overlap.status, 409);
    assert.equal((await api.get('/bookings', auth(student.token))).status, 403);
    assert.equal((await api.post(`/bookings/${created.data.id}/decision`, { action: 'cancel' }, auth(qa.token))).status, 403);
    assert.equal((await api.post(`/bookings/${created.data.id}/decision`, { action: 'accept' }, auth(english.token))).status, 403);
    const accepted = await api.post(`/bookings/${created.data.id}/decision`, { action: 'accept' }, auth(math.token));
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.status, 'accepted');
    assert.ok(accepted.data.classId && accepted.data.sessionId);
    assert.equal((await api.get(`/classes/${accepted.data.classId}`, auth(parent.token))).status, 403);
    assert.equal((await api.get(`/users/${studentId}`, auth(parent.token))).status, 403);
    const session = await ClassSession.findById(accepted.data.sessionId);
    assert.ok(session);
    assert.equal(String(session.class), String(accepted.data.classId));
    const studentAfter = await User.findById(studentId);
    assert.ok(studentAfter.enrolledClasses.some(id => String(id) === String(accepted.data.classId)));
    assert.equal((await api.post(`/bookings/${created.data.id}/decision`, { action: 'accept' }, auth(math.token))).data.classId, accepted.data.classId);
    const englishProfile = (await api.get('/tutors', { params: { subject: 'Tiếng Anh' } })).data.data[0];
    const another = await api.post('/bookings', { ...payload, tutorProfileId: englishProfile.id,
      subject: 'Tiếng Anh', idempotencyKey: crypto.randomUUID() }, auth(parent.token));
    assert.equal(another.status, 201);
    const rejected = await api.post(`/bookings/${another.data.id}/decision`, { action: 'reject' }, auth(english.token));
    assert.equal(rejected.data.status, 'rejected');
    assert.ok(!rejected.data.classId && !rejected.data.sessionId);
    const cancelledRequest = await api.post('/bookings', { ...payload, tutorProfileId: englishProfile.id,
      subject: 'Tiếng Anh', idempotencyKey: crypto.randomUUID() }, auth(parent.token));
    assert.equal(cancelledRequest.status, 201);
    const cancelled = await api.post(`/bookings/${cancelledRequest.data.id}/decision`, { action: 'cancel' }, auth(parent.token));
    assert.equal(cancelled.data.status, 'cancelled');
    assert.equal(await BookingRequest.countDocuments({ _id: { $in: [another.data.id, cancelledRequest.data.id] }, class: { $exists: true } }), 0);
    console.log('PASS: health, login, verified/pending parent isolation, tutor privacy/filter/pagination, booking overlap/idempotency, role checks, acceptance/rejection/cancellation.');
  } finally {
    // Only the disposable test parent is removed. Keep the accepted booking for the demo.
    if (qaId) {
      await GuardianLink.deleteMany({ parent: qaId });
      await User.deleteOne({ _id: qaId, email: qaEmail, role: 'parent' });
    }
    await mongoose.disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
