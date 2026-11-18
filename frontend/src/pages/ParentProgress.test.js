import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axios from 'axios';
import ParentProgress, { progressDate } from './ParentProgress';
jest.mock('axios');
const act = React.act || legacyAct;
let root; let container;
const report = () => ({ student: { id: 'child-a', name: 'Con QA' }, source: 'ClassSession / QuizSubmission', fetchedAt: '2026-11-19T00:00:00Z', limit: 50,
  summary: { totalSessions: 2, completedSessions: 1, submittedQuizzes: 2, pendingQuizzes: 1, scoredQuizzes: 1, averagePercentage: 80 },
  sessions: [{ id: 's', title: 'Buổi học Toán', startsAt: '2026-11-18T00:00:00Z', endsAt: '2026-11-18T01:00:00Z', status: 'completed', attendance: { status: 'present' } }],
  quizzes: [{ id: 'q1', title: 'Quiz đã chấm', submittedAt: '2026-11-18T00:00:00Z', status: 'graded', totalScore: 8, maxScore: 10, percentage: 80, feedback: 'Tiến bộ tốt' },
    { id: 'q2', title: 'Quiz chờ chấm', submittedAt: '2026-11-19T00:00:00Z', status: 'submitted', totalScore: null, maxScore: null, percentage: null }] });
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; axios.get.mockReset(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = async () => act(async () => root.render(<MemoryRouter initialEntries={['/children/child-a/progress']}><Routes><Route path="/children/:studentId/progress" element={<ParentProgress />} /></Routes></MemoryRouter>));

test('tải dữ liệu thật từ API, có điểm/nhận xét/biểu đồ và tải lại cập nhật điểm', async () => {
  const data = report(); axios.get.mockResolvedValue({ data }); await render();
  expect(axios.get).toHaveBeenCalledWith('/api/guardians/children/child-a/progress');
  expect(container.textContent).toContain('Tiến bộ của Con QA'); expect(container.textContent).toContain('8 / 10 (80%)');
  expect(container.textContent).toContain('Tiến bộ tốt'); expect(container.textContent).toContain('Đã nộp — chờ chấm');
  expect(container.textContent).toContain('Hoàn thành'); expect(container.textContent).toContain('Có mặt');
  expect(container.querySelectorAll('circle')).toHaveLength(1);
  data.quizzes[0].totalScore = 9; data.quizzes[0].percentage = 90; data.summary.averagePercentage = 90;
  await act(async () => container.querySelector('button').click()); expect(container.textContent).toContain('9 / 10 (90%)');
});

test('loading/rỗng, không coi 0% là thiếu điểm', async () => {
  let resolve; axios.get.mockImplementation(() => new Promise((done) => { resolve = done; })); await render();
  expect(container.querySelector('[role="status"]').textContent).toContain('Đang tải'); expect(container.querySelector('button').disabled).toBe(true);
  const data = report(); data.sessions = []; data.quizzes = []; data.summary.averagePercentage = null;
  await act(async () => resolve({ data }));
  expect(container.textContent).toContain('Chưa có bài làm đã nộp'); expect(container.textContent).toContain('Chưa có buổi học');
  expect(container.textContent).toContain('Chưa có điểm đã chấm để vẽ biểu đồ');
  data.quizzes = [{ id: 'zero', title: 'Không điểm', status: 'graded', submittedAt: '2026-11-18T00:00:00Z', totalScore: 0, maxScore: 10, percentage: 0 }];
  axios.get.mockResolvedValue({ data }); await act(async () => container.querySelector('button').click());
  expect(container.textContent).toContain('0 / 10 (0%)'); expect(container.querySelectorAll('circle')).toHaveLength(1);
});

test.each([401, 403, 404, 500])('lỗi %s không hiển thị báo cáo cũ hoặc lỗi nội bộ, có thể thử lại', async (status) => {
  axios.get.mockResolvedValueOnce({ data: report() }); await render();
  axios.get.mockRejectedValueOnce({ response: { status, data: { message: 'private stacktrace' } } });
  await act(async () => container.querySelector('button').click());
  expect(container.querySelector('[role="alert"]')).not.toBeNull();
  expect(container.textContent).not.toContain('Tiến bộ của Con QA'); expect(container.textContent).not.toContain('private stacktrace');
  axios.get.mockResolvedValueOnce({ data: report() }); await act(async () => container.querySelector('button').click());
  expect(container.textContent).toContain('Tiến bộ của Con QA');
});

test('ngày hiển thị giờ Việt Nam thay vì múi giờ máy người dùng', () => {
  expect(progressDate('2026-11-19T00:00:00Z')).toContain('07:00:00');
  expect(progressDate(null)).toBe('Chưa ghi nhận');
});
