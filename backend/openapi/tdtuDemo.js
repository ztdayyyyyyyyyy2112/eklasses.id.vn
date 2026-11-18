const { ref, string, integer, number, boolean, date, array, object, enumeration, body, query, operation } = require('./helpers');
const paths = {};
const add = (method, path, tag, summary, schema, options = {}) => {
  paths[path] = { ...paths[path], [method]: operation(method, path, tag, summary, schema, options) };
};
const modes = enumeration(['online', 'offline']);
const bookingStatus = enumeration(['pending', 'accepted', 'rejected', 'cancelled']);
const schemas = {
  TdtuChild: object({ id: ref('ObjectId'), name: string(), avatar: string({ nullable: true }), verifiedAt: date() }),
  TdtuTutor: object({ id: ref('ObjectId'), teacherId: ref('ObjectId'), name: string(), avatar: string({ nullable: true }),
    headline: string(), introduction: string(), subjects: array(string()), grades: array(string()), modes: array(modes),
    hourlyRate: number(), location: string(), availability: array(string()) }),
  TdtuBooking: object({ id: ref('ObjectId'), parent: ref('ObjectId'), student: ref('ObjectId'), teacher: ref('ObjectId'),
    tutorProfile: ref('ObjectId'), subject: string(), mode: modes, startsAt: date(), endsAt: date(), status: bookingStatus,
    classId: ref('ObjectId'), sessionId: ref('ObjectId'), createdAt: date() }),
};
const tutorInput = object({ headline: string({ maxLength: 160 }), introduction: string({ maxLength: 2000 }),
  subjects: array(string()), grades: array(string()), modes: array(modes), hourlyRate: number({ minimum: 0 }),
  location: string({ maxLength: 120 }), availability: array(string()), published: boolean() },
['headline', 'introduction', 'subjects', 'grades', 'modes', 'hourlyRate', 'location', 'availability', 'published']);

add('get', '/api/guardians/children', 'Guardians', 'List only verified linked children', array(ref('TdtuChild')), { roles: ['parent'] });

add('get', '/api/tutors', 'Tutors', 'Search approved public tutors',
  object({ data: array(ref('TdtuTutor')), page: integer(), limit: integer(), total: integer() }),
  { public: true, parameters: [query('subject', string(), 'Exact subject'), query('grade', string(), 'Exact grade'),
    query('mode', modes, 'Online or offline'), query('page', integer(), 'Page number'), query('limit', integer(), 'Page size, maximum 24')] });
add('get', '/api/tutors/me', 'Tutors', 'Read own tutor profile', { ...tutorInput, nullable: true }, { roles: ['teacher'] });
add('put', '/api/tutors/me', 'Tutors', 'Create or update own tutor profile', tutorInput,
  { roles: ['teacher'], requestBody: body(tutorInput, { headline: 'Gia sư Toán THPT', introduction: 'Học theo mục tiêu', subjects: ['Toán'], grades: ['12'], modes: ['online'], hourlyRate: 180000, location: 'Online', availability: ['Thứ 2 18:00–20:00'], published: true }) });
add('get', '/api/tutors/{id}', 'Tutors', 'Read a public tutor profile', ref('TdtuTutor'), { public: true });

add('get', '/api/bookings', 'Bookings', 'List own booking requests', array(ref('TdtuBooking')), { roles: ['parent', 'teacher'] });
add('post', '/api/bookings', 'Bookings', 'Request a lesson for a verified child', ref('TdtuBooking'), {
  roles: ['parent'], status: 201, errors: [400, 401, 403, 409, 500, 503],
  requestBody: body(object({ studentId: ref('ObjectId'), tutorProfileId: ref('ObjectId'), subject: string(), mode: modes,
    startsAt: date(), endsAt: date(), idempotencyKey: string({ minLength: 8, maxLength: 100 }) },
  ['studentId', 'tutorProfileId', 'subject', 'mode', 'startsAt', 'endsAt', 'idempotencyKey']),
  { studentId: '507f1f77bcf86cd799439011', tutorProfileId: '507f1f77bcf86cd799439012', subject: 'Toán', mode: 'online', startsAt: '2026-11-20T12:00:00.000Z', endsAt: '2026-11-20T13:00:00.000Z', idempotencyKey: 'booking-demo-001' }),
});
add('post', '/api/bookings/{id}/decision', 'Bookings', 'Accept, reject or cancel a pending request', ref('TdtuBooking'), {
  roles: ['parent', 'teacher'], errors: [400, 401, 403, 404, 409, 500, 503],
  description: 'Only the owner parent may cancel; only the targeted tutor may accept/reject. Accepting atomically creates a class and session and enrolls the student.',
  requestBody: body(object({ action: enumeration(['accept', 'reject', 'cancel']) }, ['action']), { action: 'accept' }),
});
module.exports = { paths, schemas };
