const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tutorProfile: { type: mongoose.Schema.Types.ObjectId, ref: 'TutorProfile', required: true },
  subject: { type: String, required: true, trim: true, maxlength: 100 },
  mode: { type: String, enum: ['online', 'offline'], required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected', 'cancelled'], default: 'pending' },
  idempotencyKey: { type: String, required: true, maxlength: 100 },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  session: { type: mongoose.Schema.Types.ObjectId, ref: 'ClassSession' },
  decidedAt: Date,
  decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

schema.index({ parent: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ teacher: 1, startsAt: 1, endsAt: 1, status: 1 });
schema.index({ parent: 1, createdAt: -1 });
module.exports = mongoose.model('BookingRequest', schema);
