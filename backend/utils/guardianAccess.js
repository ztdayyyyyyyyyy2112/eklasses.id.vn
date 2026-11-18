const GuardianLink = require('../models/GuardianLink');

const hasVerifiedChild = (parentId, studentId, session) => {
  const query = GuardianLink.exists({ parent: parentId, student: studentId, status: 'verified' });
  return session ? query.session(session) : query;
};

module.exports = { hasVerifiedChild };
