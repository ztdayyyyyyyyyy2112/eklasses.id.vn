import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../styles/TdtuDemo.css';

const formatDate = value => new Date(value).toLocaleString('vi-VN');
const ParentDashboard = () => {
  const [children, setChildren] = useState([]);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tutorQuery = searchParams.get('tutor');
  const [tutors, setTutors] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [filters, setFilters] = useState({ subject: '', grade: '', mode: '' });
  const [page, setPage] = useState(1);
  const [totalTutors, setTotalTutors] = useState(0);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ studentId: '', subject: '', mode: 'online', startsAt: '', endsAt: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [loadingTutors, setLoadingTutors] = useState(true);

  const refresh = useCallback(async () => {
    const results = await Promise.allSettled([
      axios.get('/api/guardians/children'), axios.get('/api/bookings'),
    ]);
    if (results[0].status === 'fulfilled') setChildren(results[0].value.data);
    else setError('Không tải được học sinh đã liên kết.');
    if (results[1].status === 'fulfilled') setBookings(results[1].value.data);
    else setError('Không tải được yêu cầu đặt lịch.');
    setLoadingChildren(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    let live = true;
    setLoadingTutors(true);
    axios.get('/api/tutors', { params: { ...filters, page, limit: 12 } })
      .then(({ data }) => { if (live) { setTutors(data.data); setTotalTutors(data.total); setLoadingTutors(false); } })
      .catch(() => { if (live) { setError('Không tải được danh sách gia sư.'); setLoadingTutors(false); } });
    return () => { live = false; };
  }, [filters, page]);
  useEffect(() => {
    const tutor = tutors.find(item => item.id === tutorQuery);
    if (tutor && children.length) {
      setSelected(tutor);
      setForm({ studentId: children[0].id, subject: tutor.subjects[0] || '', mode: tutor.modes[0] || 'online', startsAt: '', endsAt: '' });
    }
  }, [tutors, children, tutorQuery]);

  const book = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await axios.post('/api/bookings', {
        ...form, tutorProfileId: selected.id,
        startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage('Đã gửi yêu cầu. Gia sư sẽ xác nhận buổi học.');
      setSelected(null); await refresh();
    } catch (err) { setError(err.response?.data?.message || 'Không thể gửi yêu cầu đặt lịch.'); }
    finally { setBusy(false); }
  };
  const cancel = async id => {
    setError('');
    try { await axios.post(`/api/bookings/${id}/decision`, { action: 'cancel' }); await refresh(); }
    catch (err) { setError(err.response?.data?.message || 'Không thể hủy yêu cầu.'); }
  };

  return <main className="main-content tdtu-page">
    <header className="tdtu-hero"><p>EKLASSES · DÀNH CHO PHỤ HUYNH</p><h1>Tìm gia sư phù hợp cho con</h1><span>Chọn gia sư, gửi lịch học và theo dõi xác nhận ngay tại đây.</span></header>
    {error && <p className="tdtu-error" role="alert">{error}</p>}
    {message && <p className="tdtu-success" role="status">{message}</p>}
    <section className="tdtu-panel"><h2>Học sinh đã liên kết</h2>
      {loadingChildren ? <p role="status">Đang tải học sinh...</p> : children.length ? <div className="tdtu-tags">{children.map(child => <span key={child.id}>{child.name}</span>)}</div>
        : <p>Chưa có học sinh liên kết được xác nhận. Liên hệ quản trị viên để được hỗ trợ.</p>}
    </section>
    <section className="tdtu-panel"><h2>Khám phá gia sư</h2>
      <div className="tdtu-filters">
        <input aria-label="Lọc theo môn" placeholder="Môn học, ví dụ Toán" value={filters.subject} onChange={e => { setPage(1); setFilters({ ...filters, subject: e.target.value }); }} />
        <input aria-label="Lọc theo khối" placeholder="Khối, ví dụ 12" value={filters.grade} onChange={e => { setPage(1); setFilters({ ...filters, grade: e.target.value }); }} />
        <select aria-label="Hình thức học" value={filters.mode} onChange={e => { setPage(1); setFilters({ ...filters, mode: e.target.value }); }}><option value="">Mọi hình thức</option><option value="online">Online</option><option value="offline">Trực tiếp</option></select>
      </div>
      {loadingTutors && <p role="status">Đang tìm gia sư...</p>}
      <div className="tdtu-grid">{tutors.map(tutor => <article className="tdtu-tutor" key={tutor.id}>
        <div className="tdtu-tutor-top"><div className="tdtu-initial">{tutor.name[0]}</div><div><h3>{tutor.name}</h3><p>{tutor.headline}</p></div></div>
        <p>{tutor.introduction}</p><div className="tdtu-tags">{tutor.subjects.map(x => <span key={x}>{x}</span>)}{tutor.grades.map(x => <span key={x}>Khối {x}</span>)}</div>
        <p>{tutor.modes.map(x => x === 'online' ? 'Online' : 'Trực tiếp').join(' · ')} · {tutor.hourlyRate.toLocaleString('vi-VN')}đ/giờ</p>
        <div className="tdtu-actions"><button className="btn" onClick={() => navigate(`/tutors/${tutor.id}`)}>Xem hồ sơ</button>
        <button className="btn btn-primary" disabled={!children.length} onClick={() => { setSelected(tutor); setForm({ studentId: children[0]?.id || '', subject: tutor.subjects[0] || '', mode: tutor.modes[0] || 'online', startsAt: '', endsAt: '' }); }}>Đặt buổi học</button></div>
      </article>)}</div>
      {!loadingTutors && !tutors.length && <p>Chưa có gia sư phù hợp với bộ lọc.</p>}
      {totalTutors > 12 && <div className="tdtu-actions"><button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page} / {Math.ceil(totalTutors / 12)}</span><button className="btn" disabled={page >= Math.ceil(totalTutors / 12)} onClick={() => setPage(page + 1)}>Trang sau</button></div>}
    </section>
    {selected && <section className="tdtu-panel"><h2>Đặt lịch với {selected.name}</h2><form className="tdtu-form" onSubmit={book}>
      <label>Học sinh<select required value={form.studentId} onChange={e => setForm({ ...form, studentId: e.target.value })}>{children.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      <label>Môn học<select required value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}>{selected.subjects.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <label>Hình thức<select required value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>{selected.modes.map(x => <option key={x} value={x}>{x === 'online' ? 'Online' : 'Trực tiếp'}</option>)}</select></label>
      <label>Bắt đầu<input required type="datetime-local" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
      <label>Kết thúc<input required type="datetime-local" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
      <div className="tdtu-actions"><button className="btn btn-primary" disabled={busy}>Gửi yêu cầu</button><button className="btn" type="button" onClick={() => setSelected(null)}>Đóng</button></div>
    </form></section>}
    <section className="tdtu-panel"><h2>Yêu cầu của tôi</h2>{bookings.map(item => <div className="tdtu-row" key={item.id}>
      <span><strong>{item.subject}</strong> · {item.teacher?.name} · {formatDate(item.startsAt)} · {item.status}</span>
      {item.status === 'pending' && <button className="btn" onClick={() => cancel(item.id)}>Hủy</button>}
    </div>)}{!bookings.length && <p>Chưa có yêu cầu đặt lịch.</p>}</section>
  </main>;
};

export default ParentDashboard;
