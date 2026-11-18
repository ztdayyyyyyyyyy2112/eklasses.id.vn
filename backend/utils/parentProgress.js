const mongoose = require('mongoose');
const ClassSession = require('../models/ClassSession');
const QuizSubmission = require('../models/QuizSubmission');

const REPORT_LIMIT = 50;
// Không coi điểm tự động tạm tính của bài chờ chấm là kết quả cuối cùng.
const percentageFor = (item) => item.status === 'graded'
  && Number.isFinite(item.totalScore) && Number.isFinite(item.maxScore)
  && item.maxScore > 0 && item.totalScore >= 0 && item.totalScore <= item.maxScore
  ? Math.round(item.totalScore / item.maxScore * 10000) / 100 : null;

// Allowlist lần cuối, kể cả khi projection/populate thay đổi trong tương lai.
const sessionForParent = (item) => ({
  id: item._id, title: item.title || '', className: item.className || '',
  startsAt: item.startsAt, endsAt: item.endsAt, status: item.status,
  attendance: item.attendance ? { status: item.attendance.status, checkedInAt: item.attendance.checkedInAt || null } : null,
  updatedAt: item.updatedAt || null,
});
const quizForParent = (item) => {
  const percentage = percentageFor(item);
  return { id: item._id, title: item.title || 'Bài kiểm tra không còn tồn tại', className: item.className || '',
    status: item.status, submittedAt: item.submittedAt || null, gradedAt: item.gradedAt || null,
    totalScore: percentage === null ? null : item.totalScore,
    maxScore: percentage === null ? null : item.maxScore, percentage,
    feedback: item.status === 'graded' ? item.feedback || '' : '' };
};

// Lookup sau limit, chỉ lấy tên hiển thị; tuyệt đối không tải đề/đáp án hoặc roster.
const nameLookup = (from, localField, alias, field) => [
  { $lookup: { from, localField, foreignField: '_id', pipeline: [{ $project: { [field]: 1 } }], as: alias } },
  { $set: { [alias]: { $ifNull: [{ $arrayElemAt: [`$${alias}.${field}`, 0] }, ''] } } },
];

async function loadParentProgress(studentId) {
  const student = new mongoose.Types.ObjectId(studentId);
  const validScore = { $and: [
    { $eq: ['$status', 'graded'] }, { $isNumber: '$totalScore' }, { $isNumber: '$maxScore' },
    { $gt: ['$maxScore', 0] }, { $lte: ['$maxScore', Number.MAX_VALUE] },
    { $gte: ['$totalScore', 0] }, { $lte: ['$totalScore', '$maxScore'] },
  ] };
  const [sessionResult, quizResult] = await Promise.all([
    ClassSession.aggregate([
      // Snapshot điểm danh, không lấy buổi của học sinh khác dù còn cùng lớp.
      { $match: { 'attendances.student': student } },
      { $facet: {
        data: [{ $sort: { startsAt: -1, _id: -1 } }, { $limit: REPORT_LIMIT },
          { $set: { attendance: { $arrayElemAt: [{ $filter: { input: '$attendances', as: 'entry', cond: { $eq: ['$$entry.student', student] } } }, 0] } } },
          ...nameLookup('classes', 'class', 'className', 'name'),
          { $project: { title: 1, className: 1, startsAt: 1, endsAt: 1, status: 1, updatedAt: 1,
            'attendance.status': 1, 'attendance.checkedInAt': 1 } }],
        summary: [{ $group: { _id: null, totalSessions: { $sum: 1 }, completedSessions: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } }],
      } },
    ]),
    QuizSubmission.aggregate([
      { $match: { student, status: { $in: ['submitted', 'graded'] } } },
      { $facet: {
        data: [{ $sort: { submittedAt: -1, _id: -1 } }, { $limit: REPORT_LIMIT },
          ...nameLookup('quizzes', 'quiz', 'title', 'title'),
          ...nameLookup('classes', 'class', 'className', 'name'),
          { $project: { title: 1, className: 1, status: 1, submittedAt: 1, gradedAt: 1, totalScore: 1, maxScore: 1, feedback: 1 } }],
        summary: [{ $group: { _id: null, submittedQuizzes: { $sum: 1 },
          pendingQuizzes: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
          gradedQuizzes: { $sum: { $cond: [{ $eq: ['$status', 'graded'] }, 1, 0] } },
          scoredQuizzes: { $sum: { $cond: [validScore, 1, 0] } },
          averagePercentage: { $avg: { $cond: [validScore, { $multiply: [{ $divide: ['$totalScore', '$maxScore'] }, 100] }, null] } },
        } }],
      } },
    ]),
  ]);
  const sessions = sessionResult[0] || {};
  const quizzes = quizResult[0] || {};
  const s = sessions.summary?.[0] || {};
  const q = quizzes.summary?.[0] || {};
  return {
    fetchedAt: new Date().toISOString(), source: 'ClassSession / QuizSubmission', timeZone: 'Asia/Ho_Chi_Minh',
    limit: REPORT_LIMIT,
    summary: { totalSessions: s.totalSessions || 0, completedSessions: s.completedSessions || 0,
      submittedQuizzes: q.submittedQuizzes || 0, gradedQuizzes: q.gradedQuizzes || 0,
      pendingQuizzes: q.pendingQuizzes || 0, scoredQuizzes: q.scoredQuizzes || 0,
      averagePercentage: Number.isFinite(q.averagePercentage) ? Math.round(q.averagePercentage * 100) / 100 : null },
    sessions: (sessions.data || []).map(sessionForParent), quizzes: (quizzes.data || []).map(quizForParent),
  };
}

module.exports = { loadParentProgress, percentageFor, sessionForParent, quizForParent, REPORT_LIMIT };
