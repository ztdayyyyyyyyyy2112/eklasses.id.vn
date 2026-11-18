require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Class = require('../models/Class');
const ClassSession = require('../models/ClassSession');
const Quiz = require('../models/Quiz');
const GuardianLink = require('../models/GuardianLink');
const TutorProfile = require('../models/TutorProfile');

async function main() {
  const uri = process.env.MONGODB_URI;
  const password = process.env.DEMO_PASSWORD;
  if (!uri || !password || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new Error('Cần MONGODB_URI và DEMO_PASSWORD hợp lệ trong môi trường local.');
  }
  const parsed = new URL(uri);
  if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)
      || parsed.pathname !== '/eklasses-tdtu-demo' || parsed.protocol !== 'mongodb:') {
    throw new Error('Seed chỉ được ghi vào MongoDB local /eklasses-tdtu-demo.');
  }
  await mongoose.connect(uri);
  try {
    const account = async (email, name, role, extra = {}) => {
      let user = await User.findOne({ email });
      if (!user) user = await User.create({ email, name, password, role, status: 'active', ...extra });
      return user;
    };
    const admin = await account('admin.demo@example.test', 'Quản trị Demo', 'admin');
    const teacherOne = await account('math.tutor@example.test', 'Nguyễn Minh Anh', 'teacher', { review: { reviewedBy: admin._id, reviewedAt: new Date() } });
    const teacherTwo = await account('english.tutor@example.test', 'Trần Quốc Bảo', 'teacher', { review: { reviewedBy: admin._id, reviewedAt: new Date() } });
    const student = await account('student.demo@example.test', 'Lê Gia Hân', 'student');
    const parent = await account('parent.demo@example.test', 'Lê Thanh Mai', 'parent');
    for (const [teacher, profile] of [
      [teacherOne, { headline: 'Gia sư Toán THPT và ôn thi', introduction: 'Học theo mục tiêu, giải thích từng bước và luyện đề thường xuyên.', subjects: ['Toán'], grades: ['10', '11', '12'], modes: ['online', 'offline'], hourlyRate: 180000, location: 'TP. Hồ Chí Minh', availability: ['Thứ 2 · 18:00–20:00', 'Thứ 7 · 09:00–11:00'] }],
      [teacherTwo, { headline: 'Gia sư Tiếng Anh giao tiếp', introduction: 'Luyện phản xạ tiếng Anh qua các tình huống thực tế và bài tập cá nhân.', subjects: ['Tiếng Anh'], grades: ['10', '11', '12'], modes: ['online'], hourlyRate: 200000, location: 'Online', availability: ['Thứ 4 · 19:00–21:00', 'Chủ nhật · 14:00–16:00'] }],
    ]) {
      await TutorProfile.findOneAndUpdate({ teacher: teacher._id }, { $set: { ...profile, published: true } }, { upsert: true, runValidators: true });
    }
    await GuardianLink.findOneAndUpdate({ parent: parent._id, student: student._id },
      { $set: { status: 'verified', verifiedBy: admin._id, verifiedAt: new Date() } }, { upsert: true });
    const classData = await Class.findOneAndUpdate({ joinCode: 'TDTUDEMO' }, {
      $setOnInsert: { name: 'Toán 12 - Lớp demo', subject: 'Toán', grade: '12', teacher: teacherOne._id, students: [student._id], capacity: 10, description: 'Lớp mẫu phục vụ trình diễn cuộc thi.' },
    }, { upsert: true, new: true, runValidators: true });
    await User.updateOne({ _id: student._id }, { $addToSet: { enrolledClasses: classData._id } });
    const startsAt = new Date(Date.now() + 2 * 86400000);
    startsAt.setHours(19, 0, 0, 0);
    if (!await ClassSession.exists({ class: classData._id, title: 'Buổi học demo' })) {
      await ClassSession.create({ class: classData._id, title: 'Buổi học demo', teacher: teacherOne._id,
        startsAt, endsAt: new Date(startsAt.getTime() + 3600000), createdBy: teacherOne._id,
        attendances: [{ student: student._id }] });
    }
    await Quiz.findOneAndUpdate({ class: classData._id, title: 'Kiểm tra nhanh Toán 12' }, {
      $setOnInsert: { teacher: teacherOne._id, status: 'published', totalPoints: 1, questions: [{ type: 'multiple-choice', question: '2 + 2 = ?', options: ['3', '4', '5'], correctAnswer: '1', points: 1 }] },
    }, { upsert: true, runValidators: true });
    console.log('Seed demo sẵn sàng: 1 admin, 2 gia sư, 1 phụ huynh, 1 học sinh, 1 lớp, 1 buổi, 1 quiz.');
    console.log('Email đăng nhập nằm trong scripts/seed-tdtu-demo.js; mật khẩu lấy từ DEMO_PASSWORD local.');
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
