const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const GuardianLink = require('../models/GuardianLink');

const router = express.Router();
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
