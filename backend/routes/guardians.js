const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const GuardianLink = require('../models/GuardianLink');
const User = require('../models/User');
const { hasVerifiedChild } = require('../utils/guardianAccess');
const { loadParentProgress } = require('../utils/parentProgress');

const router = express.Router();
// Báo cáo chỉ đọc: kiểm tra quan hệ từ DB trước mọi truy vấn dữ liệu học tập.
router.get('/children/:studentId/progress', authMiddleware, async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  if (req.userRole !== 'parent') return res.status(403).json({ message: 'Chỉ phụ huynh được xem báo cáo này' });
  const { studentId } = req.params;
  if (!/^[a-f\d]{24}$/i.test(studentId)) return res.status(400).json({ message: 'Mã học sinh không hợp lệ' });
  try {
    // Cùng thông báo cho chưa liên kết/đã thu hồi/học sinh không hợp lệ, không dò hồ sơ.
    if (!await hasVerifiedChild(req.userId, studentId)) return res.status(404).json({ message: 'Không tìm thấy học sinh đã liên kết' });
    const child = await User.findOne({ _id: studentId, role: 'student', status: 'active', deletedAt: null, isBlocked: false })
      .select('name').lean();
    if (!child) return res.status(404).json({ message: 'Không tìm thấy học sinh đã liên kết' });
    const report = await loadParentProgress(studentId);
    return res.json({ student: { id: studentId, name: child.name }, ...report });
  } catch {
    return res.status(500).json({ message: 'Không tải được tiến bộ học tập. Vui lòng thử lại.' });
  }
});
router.get('/children', authMiddleware, async (req, res) => {
  if (req.userRole !== 'parent') return res.status(403).json({ message: 'Chỉ phụ huynh được xem học sinh liên kết' });
  const links = await GuardianLink.find({ parent: req.userId, status: 'verified' })
    .populate({ path: 'student', match: { role: 'student', status: 'active', deletedAt: null, isBlocked: false }, select: 'name avatar' })
    .select('student verifiedAt').lean();
  return res.json(links.filter(link => link.student).map(link => ({
    id: link.student._id, name: link.student.name, avatar: link.student.avatar, verifiedAt: link.verifiedAt,
  })));
});
module.exports = router;
