const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const { hasVerifiedChild } = require('../utils/guardianAccess');
const TutorProfile = require('../models/TutorProfile');
const BookingRequest = require('../models/BookingRequest');
const Class = require('../models/Class');
const ClassSession = require('../models/ClassSession');

const router = express.Router();
router.use(authMiddleware);
const id = value => mongoose.isValidObjectId(value);
const sendBooking = booking => ({
  id: booking._id, parent: booking.parent, student: booking.student, teacher: booking.teacher,
  tutorProfile: booking.tutorProfile, subject: booking.subject, mode: booking.mode,
  startsAt: booking.startsAt, endsAt: booking.endsAt, status: booking.status,
  classId: booking.class, sessionId: booking.session, createdAt: booking.createdAt,
});
const availableTeacher = { role: 'teacher', status: 'active', deletedAt: null, isBlocked: false, 'review.reviewedAt': { $exists: true } };
const overlap = (startsAt, endsAt) => ({ startsAt: { $lt: endsAt }, endsAt: { $gt: startsAt } });
const sameRequest = (booking, input) => String(booking.student) === String(input.studentId)
  && String(booking.tutorProfile) === String(input.tutorProfileId)
  && booking.subject === input.subject.trim() && booking.mode === input.mode
  && booking.startsAt.getTime() === input.startsAt.getTime()
  && booking.endsAt.getTime() === input.endsAt.getTime();
const transactionError = (res, error) => {
  if (error.code === 11000 || error.hasErrorLabel?.('TransientTransactionError')) {
    return res.status(409).json({ message: 'Lịch hoặc yêu cầu đã thay đổi. Hãy tải lại và thử lại.' });
  }
  if (/Transaction numbers are only allowed|replica set|mongos/i.test(error.message || '')) {
    return res.status(503).json({ message: 'Đặt lịch cần MongoDB replica set để đảm bảo giao dịch an toàn.' });
  }
  console.error('Booking transaction failed:', error.message);
  return res.status(500).json({ message: 'Không thể xử lý yêu cầu đặt lịch' });
};

router.get('/', async (req, res) => {
  if (!['parent', 'teacher'].includes(req.userRole)) return res.status(403).json({ message: 'Không có quyền xem yêu cầu đặt lịch' });
  const filter = req.userRole === 'parent' ? { parent: req.userId } : { teacher: req.userId };
  const bookings = await BookingRequest.find(filter).sort({ createdAt: -1 }).limit(50)
    .populate('student', 'name').populate('teacher', 'name').populate('parent', 'name').lean();
  return res.json(bookings.map(sendBooking));
});

router.post('/', async (req, res) => {
  if (req.userRole !== 'parent') return res.status(403).json({ message: 'Chỉ phụ huynh được đặt lịch' });
  const { studentId, tutorProfileId, subject, mode, idempotencyKey } = req.body || {};
  const startsAt = new Date(req.body?.startsAt);
  const endsAt = new Date(req.body?.endsAt);
  if (!id(studentId) || !id(tutorProfileId) || typeof subject !== 'string' || !subject.trim()
      || subject.length > 100 || !['online', 'offline'].includes(mode)
      || typeof idempotencyKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(idempotencyKey)
      || !Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())
      || startsAt.getTime() < Date.now() + 5 * 60000
      || endsAt - startsAt < 30 * 60000 || endsAt - startsAt > 3 * 3600000) {
    return res.status(400).json({ message: 'Thông tin đặt lịch không hợp lệ' });
  }
  const existing = await BookingRequest.findOne({ parent: req.userId, idempotencyKey });
  const input = { studentId, tutorProfileId, subject, mode, startsAt, endsAt };
  if (existing) return sameRequest(existing, input) ? res.json(sendBooking(existing))
    : res.status(409).json({ message: 'Mã yêu cầu đã được dùng cho lịch khác' });
  const session = await mongoose.startSession();
  try {
    let booking;
    await session.withTransaction(async () => {
      const link = await hasVerifiedChild(req.userId, studentId, session);
      const student = await User.findOne({ _id: studentId, role: 'student', status: 'active', deletedAt: null, isBlocked: false }).session(session);
      if (!link || !student) throw Object.assign(new Error('Học sinh chưa liên kết với phụ huynh'), { httpStatus: 403 });
      const profile = await TutorProfile.findOne({ _id: tutorProfileId, published: true }).session(session);
      const teacher = profile && await User.findOne({ _id: profile.teacher, ...availableTeacher }).session(session);
      if (!teacher || !profile.subjects.includes(subject.trim()) || !profile.modes.includes(mode)) {
        throw Object.assign(new Error('Gia sư hiện không nhận môn hoặc hình thức này'), { httpStatus: 400 });
      }
      // Every booking for this tutor writes the same document in the transaction.
      // Concurrent overlapping requests cause a write conflict and must be retried by the client.
      await User.updateOne({ _id: teacher._id }, { $inc: { scheduleRevision: 1 } }, { session });
      const busy = await BookingRequest.exists({ teacher: teacher._id, status: { $in: ['pending', 'accepted'] }, ...overlap(startsAt, endsAt) }).session(session);
      const classBusy = await ClassSession.exists({ teacher: teacher._id, status: { $ne: 'cancelled' }, ...overlap(startsAt, endsAt) }).session(session);
      if (busy || classBusy) throw Object.assign(new Error('Gia sư đã có lịch trong khung giờ này'), { httpStatus: 409 });
      [booking] = await BookingRequest.create([{
        parent: req.userId, student: studentId, teacher: teacher._id, tutorProfile: profile._id,
        subject: subject.trim(), mode, startsAt, endsAt, idempotencyKey,
      }], { session });
    });
    return res.status(201).json(sendBooking(booking));
  } catch (error) {
    if (error.httpStatus) return res.status(error.httpStatus).json({ message: error.message });
    if (error.code === 11000) {
      const prior = await BookingRequest.findOne({ parent: req.userId, idempotencyKey });
      if (prior) return sameRequest(prior, input) ? res.json(sendBooking(prior))
        : res.status(409).json({ message: 'Mã yêu cầu đã được dùng cho lịch khác' });
    }
    return transactionError(res, error);
  } finally {
    await session.endSession();
  }
});

router.post('/:id/decision', async (req, res) => {
  if (!id(req.params.id)) return res.status(400).json({ message: 'Mã đặt lịch không hợp lệ' });
  const action = req.body?.action;
  if (!['accept', 'reject', 'cancel'].includes(action)) return res.status(400).json({ message: 'Quyết định không hợp lệ' });
  const booking = await BookingRequest.findById(req.params.id);
  if (!booking) return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
  if (action === 'cancel' ? (req.userRole !== 'parent' || String(booking.parent) !== req.userId)
    : (req.userRole !== 'teacher' || String(booking.teacher) !== req.userId)) {
    return res.status(403).json({ message: 'Không có quyền quyết định yêu cầu này' });
  }
  if (booking.status === 'accepted' && action === 'accept') return res.json(sendBooking(booking));
  if (booking.status !== 'pending') return res.status(409).json({ message: 'Yêu cầu đã được xử lý' });
  if (action !== 'accept') {
    const updated = await BookingRequest.findOneAndUpdate({ _id: booking._id, status: 'pending' },
      { $set: { status: action === 'cancel' ? 'cancelled' : 'rejected', decidedAt: new Date(), decidedBy: req.userId } }, { new: true });
    if (!updated) return res.status(409).json({ message: 'Yêu cầu đã được xử lý' });
    return res.json(sendBooking(updated));
  }
  const session = await mongoose.startSession();
  try {
    let accepted;
    await session.withTransaction(async () => {
      const current = await BookingRequest.findOne({ _id: booking._id, teacher: req.userId, status: 'pending' }).session(session);
      if (!current) throw Object.assign(new Error('Yêu cầu đã được xử lý'), { httpStatus: 409 });
      if (current.startsAt <= new Date()) throw Object.assign(new Error('Buổi học đã qua'), { httpStatus: 409 });
      const link = await hasVerifiedChild(current.parent, current.student, session);
      const parent = await User.exists({ _id: current.parent, role: 'parent', status: 'active', deletedAt: null, isBlocked: false }).session(session);
      const student = await User.exists({ _id: current.student, role: 'student', status: 'active', deletedAt: null, isBlocked: false }).session(session);
      const teacher = await User.findOne({ _id: req.userId, ...availableTeacher }).session(session);
      const profile = await TutorProfile.exists({ _id: current.tutorProfile, teacher: req.userId, published: true }).session(session);
      if (!link || !parent || !student || !teacher || !profile) throw Object.assign(new Error('Liên kết hoặc gia sư không còn hợp lệ'), { httpStatus: 403 });
      await User.updateOne({ _id: req.userId }, { $inc: { scheduleRevision: 1 } }, { session });
      const conflicting = await ClassSession.exists({ teacher: req.userId, status: { $ne: 'cancelled' }, ...overlap(current.startsAt, current.endsAt) }).session(session);
      if (conflicting) throw Object.assign(new Error('Gia sư đã có buổi học trùng giờ'), { httpStatus: 409 });
      const joinCode = crypto.randomBytes(8).toString('hex').toUpperCase();
      const [classData] = await Class.create([{
        name: `${current.subject} - Gia sư 1:1`, teacher: current.teacher, students: [current.student],
        subject: current.subject, capacity: 1, joinCode,
      }], { session });
      const [classSession] = await ClassSession.create([{
        class: classData._id, teacher: current.teacher, title: `Buổi học ${current.subject}`,
        location: current.mode === 'online' ? 'Online' : 'Trực tiếp',
        startsAt: current.startsAt, endsAt: current.endsAt, createdBy: current.teacher,
        attendances: [{ student: current.student }],
      }], { session });
      await User.updateOne({ _id: current.student }, { $addToSet: { enrolledClasses: classData._id } }, { session });
      accepted = await BookingRequest.findOneAndUpdate({ _id: current._id, status: 'pending' },
        { $set: { status: 'accepted', class: classData._id, session: classSession._id, decidedAt: new Date(), decidedBy: req.userId } },
        { new: true, session });
      if (!accepted) throw Object.assign(new Error('Yêu cầu đã được xử lý'), { httpStatus: 409 });
    });
    return res.json(sendBooking(accepted));
  } catch (error) {
    if (error.httpStatus) return res.status(error.httpStatus).json({ message: error.message });
    return transactionError(res, error);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
