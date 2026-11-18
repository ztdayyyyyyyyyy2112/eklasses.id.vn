import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/TdtuDemo.css';

const blank = { headline: '', introduction: '', subjects: '', grades: '', modes: ['online'], hourlyRate: 0, location: '', availability: '', published: false };
const TutorWorkspace = () => {
  const [form, setForm] = useState(blank);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [{ data: profile }, { data: requests }] = await Promise.all([axios.get('/api/tutors/me'), axios.get('/api/bookings')]);
    if (profile) setForm({ ...profile, subjects: profile.subjects.join(', '), grades: profile.grades.join(', '), availability: (profile.availability || []).join(', ') });
    setBookings(requests);
  }, []);
  useEffect(() => { refresh().catch(() => setError('Không tải được hồ sơ gia sư.')); }, [refresh]);
  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await axios.put('/api/tutors/me', {
        headline: form.headline, introduction: form.introduction,
        subjects: form.subjects.split(',').map(x => x.trim()).filter(Boolean),
        grades: form.grades.split(',').map(x => x.trim()).filter(Boolean),
        modes: form.modes, hourlyRate: Number(form.hourlyRate), location: form.location,
        availability: form.availability.split(',').map(x => x.trim()).filter(Boolean),
        published: form.published,
      });
      setMessage('Đã lưu hồ sơ gia sư.');
    } catch (err) { setError(err.response?.data?.message || 'Không lưu được hồ sơ.'); }
    finally { setBusy(false); }
  };
  const decide = async (id, action) => {
    setBusy(true); setError(''); setMessage('');
    try { await axios.post(`/api/bookings/${id}/decision`, { action }); await refresh(); setMessage(action === 'accept' ? 'Đã nhận lịch và tạo lớp học.' : 'Đã từ chối yêu cầu.'); }
    catch (err) { setError(err.response?.data?.message || 'Không xử lý được yêu cầu.'); }
    finally { setBusy(false); }
  };
  return <main className="main-content tdtu-page">
    <header className="tdtu-hero"><p>EKLASSES · DÀNH CHO GIA SƯ</p><h1>Hồ sơ và lịch dạy</h1><span>Giới thiệu năng lực của bạn và xác nhận yêu cầu từ phụ huynh.</span></header>
    {error && <p className="tdtu-error" role="alert">{error}</p>}{message && <p className="tdtu-success" role="status">{message}</p>}
    <section className="tdtu-panel"><h2>Hồ sơ công khai</h2><form className="tdtu-form" onSubmit={save}>
      <label>Tiêu đề<input required value={form.headline} maxLength="160" onChange={e => set('headline', e.target.value)} placeholder="Gia sư Toán THPT giàu kinh nghiệm" /></label>
      <label>Giới thiệu<textarea value={form.introduction} maxLength="2000" onChange={e => set('introduction', e.target.value)} /></label>
      <label>Môn học, cách nhau bằng dấu phẩy<input required value={form.subjects} onChange={e => set('subjects', e.target.value)} placeholder="Toán, Vật lý" /></label>
      <label>Khối lớp, cách nhau bằng dấu phẩy<input required value={form.grades} onChange={e => set('grades', e.target.value)} placeholder="10, 11, 12" /></label>
      <label>Học phí mỗi giờ (VND)<input type="number" min="0" max="10000000" value={form.hourlyRate} onChange={e => set('hourlyRate', e.target.value)} /></label>
      <label>Khu vực<input value={form.location} onChange={e => set('location', e.target.value)} /></label>
      <label>Lịch trống tham khảo, cách nhau bằng dấu phẩy<input value={form.availability} onChange={e => set('availability', e.target.value)} placeholder="Thứ 2 18:00–20:00, Thứ 7 09:00–11:00" /></label>
      <fieldset><legend>Hình thức</legend>{['online', 'offline'].map(mode => <label key={mode}><input type="checkbox" checked={form.modes.includes(mode)} onChange={e => set('modes', e.target.checked ? [...form.modes, mode] : form.modes.filter(x => x !== mode))} />{mode === 'online' ? 'Online' : 'Trực tiếp'}</label>)}</fieldset>
      <label className="tdtu-check"><input type="checkbox" checked={form.published} onChange={e => set('published', e.target.checked)} />Hiển thị hồ sơ với phụ huynh</label>
      <button className="btn btn-primary" disabled={busy}>Lưu hồ sơ</button>
    </form></section>
    <section className="tdtu-panel"><h2>Yêu cầu đặt lịch</h2>{bookings.map(item => <div className="tdtu-row" key={item.id}>
      <span><strong>{item.subject}</strong> · {item.student?.name} · {new Date(item.startsAt).toLocaleString('vi-VN')} · {item.mode === 'online' ? 'Online' : 'Trực tiếp'} · {item.status}</span>
      {item.status === 'pending' && <span className="tdtu-actions"><button className="btn btn-primary" disabled={busy} onClick={() => decide(item.id, 'accept')}>Nhận lịch</button><button className="btn" disabled={busy} onClick={() => decide(item.id, 'reject')}>Từ chối</button></span>}
    </div>)}{!bookings.length && <p>Chưa có yêu cầu đặt lịch.</p>}</section>
  </main>;
};
export default TutorWorkspace;
