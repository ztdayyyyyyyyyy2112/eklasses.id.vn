import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from 'axios';
import '../styles/TdtuDemo.css';
import '../styles/ParentProgress.css';

const sessionLabels = { scheduled: 'Đã lên lịch', ongoing: 'Đang học', completed: 'Hoàn thành', cancelled: 'Đã hủy' };
const attendanceLabels = { present: 'Có mặt', absent: 'Vắng', late: 'Đi muộn', excused: 'Vắng có phép' };
export const progressDate = (value) => value && Number.isFinite(new Date(value).getTime())
  ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';

// SVG nhẹ kèm bảng số liệu: không tải thêm thư viện, không suy diễn năng lực/AI.
function ScoreChart({ quizzes }) {
  const points = quizzes.filter((item) => item.status === 'graded' && Number.isFinite(item.percentage)
    && item.submittedAt && Number.isFinite(new Date(item.submittedAt).getTime()))
    .slice().sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
  if (!points.length) return <p>Chưa có điểm đã chấm để vẽ biểu đồ.</p>;
  const dates = points.map((item) => new Date(item.submittedAt).getTime());
  const first = Math.min(...dates); const span = Math.max(...dates) - first;
  const coordinates = points.map((item, i) => ({
    x: span ? 45 + (dates[i] - first) / span * 500 : 295,
    y: 190 - item.percentage / 100 * 160, item,
  }));
  return <figure className="progress-chart">
    <svg viewBox="0 0 600 235" role="img" aria-label="Biểu đồ phần trăm điểm quiz theo ngày nộp; dữ liệu chi tiết ở danh sách bên dưới">
      {[0, 50, 100].map((n) => <g key={n}><line x1="45" x2="560" y1={190 - n * 1.6} y2={190 - n * 1.6} stroke="#cbd5e1" /><text x="4" y={195 - n * 1.6}>{n}%</text></g>)}
      <polyline points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} fill="none" stroke="#a51d29" strokeWidth="3" />
      {coordinates.map(({ x, y, item }) => <circle key={item.id} cx={x} cy={y} r="5" fill="#a51d29"><title>{item.title}: {item.percentage}% — {progressDate(item.submittedAt)}</title></circle>)}
      <text x="45" y="220">{new Date(first).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</text>
      <text x="555" y="220" textAnchor="end">{new Date(Math.max(...dates)).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</text>
    </svg>
    <figcaption>Điểm đã chấm, chuẩn hóa về %. Trục ngang là ngày nộp (giờ Việt Nam). Chỉ biểu diễn các bài trong danh sách gần nhất.</figcaption>
  </figure>;
}

export default function ParentProgress() {
  const { studentId } = useParams();
  const [state, setState] = useState({ id: studentId, report: null, loading: true, error: '' });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    // Xóa báo cáo cũ ngay khi tải; lỗi/đổi học sinh không để sót thông tin người trước.
    setState({ id: studentId, report: null, loading: true, error: '' });
    axios.get(`/api/guardians/children/${encodeURIComponent(studentId)}/progress`)
      .then(({ data }) => { if (live) setState({ id: studentId, report: data, loading: false, error: '' }); })
      .catch((error) => {
        const status = error.response?.status;
        const message = status === 401 ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
          : status === 403 || status === 404 ? 'Bạn không có quyền xem học sinh này hoặc liên kết không còn hiệu lực.'
            : 'Không tải được tiến bộ học tập. Vui lòng thử lại.';
        if (live) setState({ id: studentId, report: null, loading: false, error: message });
      });
    return () => { live = false; };
  }, [studentId, revision]);
  const current = state.id === studentId ? state : { loading: true };
  const report = current.report;
  return <main className="main-content tdtu-page parent-progress">
    <Link to="/dashboard">← Về trang phụ huynh</Link>
    <header className="tdtu-hero"><p>EKLASSES · TIẾN BỘ HỌC TẬP</p><h1>{report ? `Tiến bộ của ${report.student.name}` : 'Tiến bộ học tập'}</h1>
      <span>Buổi học và kết quả quiz được lưu trong hệ thống.</span></header>
    <button className="btn" type="button" disabled={current.loading} onClick={() => setRevision((v) => v + 1)}>Tải lại báo cáo</button>
    {current.loading && <p role="status">Đang tải tiến bộ học tập...</p>}
    {current.error && <p className="tdtu-error" role="alert">{current.error} <Link to="/login">Đăng nhập</Link></p>}
    {report && <>
      <p className="progress-source">Nguồn: {report.source}. Lấy dữ liệu lúc {progressDate(report.fetchedAt)} (giờ Việt Nam). Nhấn tải lại để lấy điểm mới.</p>
      <section className="tdtu-panel"><h2>Tổng quan</h2><dl className="progress-stats">
        <div><dt>Buổi hoàn thành</dt><dd>{report.summary.completedSessions} / {report.summary.totalSessions}</dd></div>
        <div><dt>Quiz đã nộp</dt><dd>{report.summary.submittedQuizzes}</dd></div>
        <div><dt>Đang chờ chấm</dt><dd>{report.summary.pendingQuizzes}</dd></div>
        <div><dt>Điểm trung bình</dt><dd>{report.summary.averagePercentage === null ? 'Chưa có' : `${report.summary.averagePercentage}%`}</dd></div>
      </dl><p>Thống kê trên toàn bộ lịch sử. Trung bình cộng phần trăm của {report.summary.scoredQuizzes} bài đã chấm có thang điểm hợp lệ; không tính bài nháp hoặc chờ chấm.</p></section>
      <section className="tdtu-panel"><h2>Điểm quiz theo thời gian</h2><ScoreChart quizzes={report.quizzes} /></section>
      <section className="tdtu-panel"><h2>Buổi học gần nhất</h2><p>Hiển thị tối đa {report.limit} buổi mới nhất theo thời gian bắt đầu; hoàn thành không đồng nghĩa có mặt.</p>
        {!report.sessions.length && <p>Chưa có buổi học được ghi nhận cho học sinh này.</p>}
        <div className="progress-list">{report.sessions.map((item) => <article key={item.id} className="progress-item">
          <h3>{item.title || 'Buổi học'}</h3><p>{item.className || 'Lớp không còn tồn tại'}</p>
          <p>{progressDate(item.startsAt)} → {progressDate(item.endsAt)}</p>
          <p>Trạng thái: <strong>{sessionLabels[item.status] || 'Chưa ghi nhận'}</strong></p>
          <p>Điểm danh: {attendanceLabels[item.attendance?.status] || 'Chưa ghi nhận'}</p>
        </article>)}</div>
      </section>
      <section className="tdtu-panel"><h2>Bài quiz đã nộp</h2><p>Tối đa {report.limit} bài mới nhất theo ngày nộp. Điểm chỉ công bố khi đã chấm xong.</p>
        {!report.quizzes.length && <p>Chưa có bài làm đã nộp.</p>}
        <div className="progress-list">{report.quizzes.map((item) => <article key={item.id} className="progress-item">
          <h3>{item.title}</h3><p>{item.className}</p><p>Nộp: {progressDate(item.submittedAt)}</p>
          <p>{item.status === 'submitted' ? 'Đã nộp — chờ chấm' : item.percentage === null ? 'Đã chấm — chưa có thang điểm hợp lệ' : `Điểm: ${item.totalScore} / ${item.maxScore} (${item.percentage}%)`}</p>
          {item.gradedAt && <p>Chấm: {progressDate(item.gradedAt)}</p>}
          {item.feedback && <p className="progress-feedback"><strong>Nhận xét giáo viên:</strong> {item.feedback}</p>}
        </article>)}</div>
      </section>
    </>}
  </main>;
}
