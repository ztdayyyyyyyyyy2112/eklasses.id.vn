import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct } from 'react-dom/test-utils';
import App from './App';

jest.mock('./config/api', () => ({}));
jest.mock('./components/Navbar', () => () => <nav aria-label="Điều hướng chính">Navbar kiểm thử</nav>);
jest.mock('./pages/ProfilePage', () => () => <h1>Hồ sơ chính chủ kiểm thử</h1>);
jest.mock('./pages/LoginPage', () => () => <h1>Đăng nhập kiểm thử</h1>);
jest.mock('./pages/AdminModeration', () => () => <h1>Quản trị tài khoản kiểm thử</h1>);
jest.mock('./pages/AdminAccounts', () => () => <h1>Danh sách vai trò kiểm thử</h1>);
jest.mock('./pages/Dashboard', () => () => <h1>Trang chủ kiểm thử</h1>);
jest.mock('./pages/ParentDashboard', () => () => <h1>Trang phụ huynh kiểm thử</h1>);
jest.mock('./pages/ParentProgress', () => () => <h1>Báo cáo con kiểm thử</h1>);
jest.mock('./pages/TutorWorkspace', () => () => <h1>Không gian gia sư kiểm thử</h1>);
const act = React.act || legacyAct;
let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  window.history.replaceState({}, '', '/profile');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

test.each(['admin', 'teacher', 'student', 'parent'])('vai trò %s đã đăng nhập được mở hồ sơ chính chủ', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', role);
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Hồ sơ chính chủ kiểm thử');
  expect(window.location.pathname).toBe('/profile');
});

test('phụ huynh vào đúng dashboard của mình', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'parent');
  window.history.replaceState({}, '', '/dashboard');
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Trang phụ huynh kiểm thử');
  expect(container.textContent).not.toContain('Trang chủ kiểm thử');
});

test.each(['parent', 'student', 'teacher', 'admin'])('chỉ parent mở được báo cáo con, kiểm tra role %s', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token'); localStorage.setItem('userRole', role);
  window.history.replaceState({}, '', '/children/child-a/progress');
  await act(async () => root.render(<App />));
  expect(container.textContent.includes('Báo cáo con kiểm thử')).toBe(role === 'parent');
});

test('phụ huynh không mở được màn hình gia sư', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'parent');
  window.history.replaceState({}, '', '/tutor-workspace');
  await act(async () => root.render(<App />));
  expect(window.location.pathname).toBe('/dashboard');
  expect(container.textContent).toContain('Trang phụ huynh kiểm thử');
});

test('không có phiên đăng nhập vẫn bị chuyển khỏi hồ sơ sang đăng nhập', async () => {
  localStorage.setItem('userRole', 'admin');
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Đăng nhập kiểm thử');
  expect(container.textContent).not.toContain('Hồ sơ chính chủ kiểm thử');
  expect(window.location.pathname).toBe('/login');
});

test.each(['student', 'teacher'])('vai trò %s không mở được trang xóa tài khoản học sinh', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', role);
  window.history.replaceState({}, '', '/admin/moderation');
  await act(async () => root.render(<App />));
  expect(window.location.pathname).toBe('/dashboard');
  expect(container.textContent).not.toContain('Quản trị tài khoản kiểm thử');
});

test.each(['/login', '/register', '/login/?next=profile'])('ẩn navbar trên trang xác thực %s', async (path) => {
  window.history.replaceState({}, '', path);
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).toBeNull();
});

test('ẩn navbar trên trang đăng nhập cả khi phiên cũ còn trong storage', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'student');
  window.history.replaceState({}, '', '/login');
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).toBeNull();
});

test('navbar vẫn hiện trên trang khác', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'student');
  await act(async () => root.render(<App />));
  expect(container.querySelector('nav[aria-label="Điều hướng chính"]')).not.toBeNull();
});

test.each(['student', 'teacher'])('%s không mở được quản lý tài khoản', async (role) => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', role);
  window.history.replaceState({}, '', '/admin/accounts');
  await act(async () => root.render(<App />));
  expect(window.location.pathname).toBe('/dashboard');
  expect(container.textContent).not.toContain('Danh sách vai trò kiểm thử');
});

test('admin mở được trang quản lý tài khoản', async () => {
  localStorage.setItem('token', 'synthetic-route-test-token');
  localStorage.setItem('userRole', 'admin');
  window.history.replaceState({}, '', '/admin/accounts');
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Danh sách vai trò kiểm thử');
});
