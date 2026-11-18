// Lăng trụ đứng có đáy tam giác vuông 3–4–5, chiều cao 6 cm.
// Cùng một bộ đỉnh phục vụ mô hình, cạnh và test để hình vẽ khớp công thức.
export const PRISM = { a: 3, b: 4, c: 5, height: 6 };
export const vertices = [
  [-1.5, -2, -3], [1.5, -2, -3], [-1.5, 2, -3],
  [-1.5, -2, 3], [1.5, -2, 3], [-1.5, 2, 3],
];
export const faces = [
  { name: 'Đáy ABC', indices: [0, 2, 1], color: '#e63946', description: 'Tam giác vuông tại A, hai cạnh góc vuông 3 cm và 4 cm.' },
  { name: "Đáy A′B′C′", indices: [3, 4, 5], color: '#e63946', description: 'Song song và bằng đáy ABC; khoảng cách hai đáy là 6 cm.' },
  { name: 'Mặt bên ABB′A′', indices: [0, 1, 4, 3], color: '#287fa3', description: 'Hình chữ nhật 3 × 6 cm, diện tích 18 cm².' },
  { name: 'Mặt bên BCC′B′', indices: [1, 2, 5, 4], color: '#d79518', description: 'Hình chữ nhật 5 × 6 cm, diện tích 30 cm².' },
  { name: 'Mặt bên CAA′C′', indices: [2, 0, 3, 5], color: '#298267', description: 'Hình chữ nhật 4 × 6 cm, diện tích 24 cm².' },
];
export const edges = [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3], [0, 3], [1, 4], [2, 5]];
export const vertexNames = ['A', 'B', 'C', 'A′', 'B′', 'C′'];
export function prismMeasures({ a, b, c, height }) {
  const baseArea = a * b / 2;
  const lateralArea = (a + b + c) * height;
  return { baseArea, lateralArea, surfaceArea: lateralArea + 2 * baseArea, volume: baseArea * height };
}
