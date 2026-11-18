import React from 'react';
import { createRoot } from 'react-dom/client';
import { act as legacyAct, Simulate } from 'react-dom/test-utils';
import GeometryLesson from './GeometryLesson';
import { createPrismScene } from './createPrismScene';
import { PRISM, prismMeasures, vertices, faces, edges } from './prism';

jest.mock('./createPrismScene', () => ({ createPrismScene: jest.fn() }));
const act = React.act || legacyAct;
let root;
let container;
let scene;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  scene = Object.fromEntries(['dispose', 'reset', 'zoom', 'rotate', 'selectFace', 'showLabels'].map((name) => [name, jest.fn()]));
  createPrismScene.mockReset().mockReturnValue(scene);
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const click = (name) => act(() => [...container.querySelectorAll('button')].find((button) => button.textContent === name).click());

test('công thức và cấu trúc mô hình đúng với lăng trụ 3–4–5 cao 6', () => {
  expect(prismMeasures(PRISM)).toEqual({ baseArea: 6, lateralArea: 72, surfaceArea: 84, volume: 36 });
  expect(vertices).toHaveLength(6); expect(faces).toHaveLength(5); expect(edges).toHaveLength(9);
  edges.forEach(([a, b]) => expect(vertices[a]).not.toEqual(vertices[b]));
});

test('điều khiển xoay/zoom, chọn mặt, bật nhãn và đặt lại; thu hồi khi rời bài', async () => {
  await act(async () => root.render(<GeometryLesson />));
  expect(container.textContent).toContain('Mô hình 3D sẵn sàng.');
  click('Xoay trái'); click('Xoay phải'); click('Phóng to'); click('Thu nhỏ');
  expect(scene.rotate.mock.calls).toEqual([[-1], [1]]);
  expect(scene.zoom.mock.calls).toEqual([[0.85], [1.15]]);
  click('Mặt bên ABB′A′');
  expect(scene.selectFace).toHaveBeenLastCalledWith(2);
  expect(container.textContent).toContain('diện tích 18 cm²');
  expect([...container.querySelectorAll('button')].find((button) => button.textContent === 'Mặt bên ABB′A′').getAttribute('aria-pressed')).toBe('true');
  act(() => Simulate.change(container.querySelector('input'), { target: { checked: false } }));
  expect(scene.showLabels).toHaveBeenLastCalledWith(false);
  click('Đặt lại'); expect(scene.reset).toHaveBeenCalledTimes(1);
  expect(scene.selectFace).toHaveBeenLastCalledWith(null);
  expect(scene.showLabels).toHaveBeenLastCalledWith(true);
  expect(container.textContent).toContain('84 cm²'); expect(container.textContent).toContain('36 cm³');
  act(() => root.render(null)); expect(scene.dispose).toHaveBeenCalledTimes(1);
});

test('WebGL thất bại vẫn có SVG và công thức, không cho điều khiển GPU', async () => {
  createPrismScene.mockImplementation(() => { throw new Error('GPU unavailable'); });
  await act(async () => root.render(<GeometryLesson />));
  expect(container.querySelector('svg[role="img"]')).not.toBeNull();
  expect(container.textContent).toContain('Không thể hiển thị WebGL');
  expect(container.querySelector('.geometry-controls button').disabled).toBe(true);
  expect(container.textContent).toContain('36 cm³');
  click('Đáy ABC'); expect(container.textContent).toContain('Tam giác vuông tại A');
});

test('mất context sau khi tải chuyển về 2D và thu hồi tài nguyên', async () => {
  await act(async () => root.render(<GeometryLesson />));
  act(() => createPrismScene.mock.calls[0][1]());
  expect(scene.dispose).toHaveBeenCalledTimes(1);
  expect(container.querySelector('svg')).not.toBeNull();
  act(() => root.render(null)); expect(scene.dispose).toHaveBeenCalledTimes(1);
});
