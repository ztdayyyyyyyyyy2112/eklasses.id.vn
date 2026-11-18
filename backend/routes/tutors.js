const express = require('express');
const mongoose = require('mongoose');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');
const TutorProfile = require('../models/TutorProfile');

const router = express.Router();
const activeTeacher = { role: 'teacher', status: 'active', deletedAt: null, isBlocked: false, 'review.reviewedAt': { $exists: true } };
const publicProfile = profile => ({
  id: profile._id, teacherId: profile.teacher._id, name: profile.teacher.name,
  avatar: profile.teacher.avatar, headline: profile.headline, introduction: profile.introduction,
  subjects: profile.subjects, grades: profile.grades, modes: profile.modes,
  hourlyRate: profile.hourlyRate, location: profile.location, availability: profile.availability,
});

router.get('/', async (req, res) => {
  const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
  const limit = Math.max(1, Math.min(24, Number.parseInt(req.query.limit, 10) || 12));
  const subject = typeof req.query.subject === 'string' ? req.query.subject.trim() : '';
  const grade = typeof req.query.grade === 'string' ? req.query.grade.trim() : '';
  const mode = typeof req.query.mode === 'string' ? req.query.mode.trim() : '';
  if (subject.length > 100 || grade.length > 100 || (mode && !['online', 'offline'].includes(mode))) {
    return res.status(400).json({ message: 'Bộ lọc không hợp lệ' });
  }
  const teacherIds = await User.find(activeTeacher).distinct('_id');
  const filter = { published: true, teacher: { $in: teacherIds } };
  if (subject) filter.subjects = subject;
  if (grade) filter.grades = grade;
  if (mode) filter.modes = mode;
  const [total, profiles] = await Promise.all([
    TutorProfile.countDocuments(filter),
    TutorProfile.find(filter).sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('teacher', 'name avatar').lean(),
  ]);
  return res.json({ data: profiles.filter(p => p.teacher).map(publicProfile), page, limit, total });
});

router.get('/me', authMiddleware, async (req, res) => {
  if (req.userRole !== 'teacher') return res.status(403).json({ message: 'Chỉ giáo viên được sửa hồ sơ gia sư' });
  const profile = await TutorProfile.findOne({ teacher: req.userId }).lean();
  return res.json(profile || null);
});

router.put('/me', authMiddleware, async (req, res) => {
  if (req.userRole !== 'teacher') return res.status(403).json({ message: 'Chỉ giáo viên được sửa hồ sơ gia sư' });
  const text = (value, max) => typeof value === 'string' && value.trim().length <= max ? value.trim() : null;
  const list = (value, max) => Array.isArray(value) && value.length <= 12 && value.every(v => typeof v === 'string' && !!v.trim() && v.trim().length <= max)
    ? [...new Set(value.map(v => v.trim()))] : null;
  const headline = text(req.body?.headline, 160);
  const introduction = text(req.body?.introduction, 2000);
  const location = text(req.body?.location, 120);
  const subjects = list(req.body?.subjects, 100);
  const grades = list(req.body?.grades, 100);
  const modes = list(req.body?.modes, 20);
  const availability = list(req.body?.availability, 120);
  const hourlyRate = Number(req.body?.hourlyRate);
  if ([headline, introduction, location, subjects, grades, modes, availability].includes(null)
      || modes.some(mode => !['online', 'offline'].includes(mode))
      || !Number.isFinite(hourlyRate) || hourlyRate < 0 || hourlyRate > 10000000
      || typeof req.body?.published !== 'boolean') {
    return res.status(400).json({ message: 'Hồ sơ gia sư không hợp lệ' });
  }
  if (req.body.published && (!subjects.length || !grades.length || !modes.length || !headline)) {
    return res.status(400).json({ message: 'Cần đủ môn, khối, hình thức và giới thiệu trước khi công khai' });
  }
  const profile = await TutorProfile.findOneAndUpdate({ teacher: req.userId },
    { $set: { headline, introduction, location, subjects, grades, modes, availability, hourlyRate, published: req.body.published } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true });
  return res.json(profile);
});

router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Mã gia sư không hợp lệ' });
  const profile = await TutorProfile.findById(req.params.id).populate('teacher', 'name avatar role status deletedAt isBlocked review').lean();
  const teacher = profile?.teacher;
  if (!profile?.published || !teacher || teacher.role !== 'teacher' || teacher.status !== 'active'
      || teacher.deletedAt || teacher.isBlocked || !teacher.review?.reviewedAt) {
    return res.status(404).json({ message: 'Không tìm thấy gia sư' });
  }
  return res.json(publicProfile(profile));
});

module.exports = router;
