import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import '../styles/TdtuDemo.css';

const TutorDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tutor, setTutor] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    axios.get(`/api/tutors/${id}`).then(({ data }) => { if (live) setTutor(data); })
      .catch(err => { if (live) setError(err.response?.data?.message || 'Không tải được hồ sơ gia sư.'); });
    return () => { live = false; };
  }, [id]);
  return <main className="main-content tdtu-page">
    <header className="tdtu-hero"><p>EKLASSES · HỒ SƠ GIA SƯ</p><h1>{tutor?.name || 'Gia sư'}</h1><span>{tutor?.headline || 'Tìm hiểu gia sư phù hợp với bạn'}</span></header>
    {error && <p className="tdtu-error" role="alert">{error}</p>}
    {!tutor && !error && <p role="status">Đang tải hồ sơ gia sư...</p>}
    {tutor && <section className="tdtu-panel">
      <h2>Giới thiệu</h2><p>{tutor.introduction}</p>
      <div className="tdtu-tags">{tutor.subjects.map(x => <span key={x}>{x}</span>)}{tutor.grades.map(x => <span key={x}>Khối {x}</span>)}</div>
      <p><strong>Hình thức:</strong> {tutor.modes.map(x => x === 'online' ? 'Online' : 'Trực tiếp').join(', ')}</p>
      <p><strong>Học phí tham khảo:</strong> {tutor.hourlyRate.toLocaleString('vi-VN')}đ/giờ</p>
      <p><strong>Khu vực:</strong> {tutor.location || 'Chưa cập nhật'}</p>
      <p><strong>Lịch trống tham khảo:</strong> {(tutor.availability || []).join(' · ') || 'Liên hệ để thống nhất'}</p>
      <div className="tdtu-actions"><button className="btn" onClick={() => navigate('/dashboard')}>Về danh sách</button>
        {localStorage.getItem('userRole') === 'parent' && <button className="btn btn-primary" onClick={() => navigate(`/dashboard?tutor=${tutor.id}`)}>Đặt buổi học</button>}
      </div>
    </section>}
  </main>;
};
export default TutorDetailPage;
