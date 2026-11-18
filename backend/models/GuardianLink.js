const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['pending', 'verified', 'revoked'], default: 'pending' },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
}, { timestamps: true });

schema.index({ parent: 1, student: 1 }, { unique: true });
schema.index({ student: 1, status: 1 });

module.exports = mongoose.model('GuardianLink', schema);
