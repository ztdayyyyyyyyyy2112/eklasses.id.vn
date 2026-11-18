const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  headline: { type: String, trim: true, maxlength: 160, default: '' },
  introduction: { type: String, trim: true, maxlength: 2000, default: '' },
  subjects: { type: [String], default: [] },
  grades: { type: [String], default: [] },
  modes: { type: [String], enum: ['online', 'offline'], default: [] },
  hourlyRate: { type: Number, min: 0, max: 10000000, default: 0 },
  location: { type: String, trim: true, maxlength: 120, default: '' },
  availability: { type: [String], default: [] },
  published: { type: Boolean, default: false },
}, { timestamps: true });

schema.index({ published: 1, subjects: 1 });
schema.index({ published: 1, grades: 1 });
schema.index({ published: 1, modes: 1 });
module.exports = mongoose.model('TutorProfile', schema);
