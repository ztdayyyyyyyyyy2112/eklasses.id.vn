import React, { useEffect, useRef, useState } from 'react';
import { faces, PRISM, prismMeasures } from './prism';
import './GeometryLesson.css';

// SVG do dự án tự vẽ, luôn có chú thích và không phụ thuộc GPU hay tài sản bên ngoài.
function PrismDiagram() {
  return <svg viewBox="0 0 400 320" role="img" aria-label="Lăng trụ đứng ABC A phẩy B phẩy C phẩy: đáy tam giác vuông 3–4–5 cm, chiều cao 6 cm">
    <path d="M80 235L220 235L80 105Z M180 175L320 175L180 45Z" fill="#fbe0e2" stroke="#e63946" strokeWidth="3" />
    <path d="M80 235L180 175L320 175L220 235Z" fill="#d9edf4" stroke="#172b3a" strokeWidth="2" />
    <path d="M220 235L320 175L180 45L80 105Z" fill="#f8eacb" stroke="#172b3a" strokeWidth="2" />
    <path d="M80 235L180 175L180 45 M80 235L80 105" fill="none" stroke="#172b3a" strokeWidth="2" strokeDasharray="6 4" />
    <g fill="#172b3a" fontSize="18" fontFamily="sans-serif">
      <text x="58" y="258">A</text><text x="220" y="258">B</text><text x="55" y="100">C</text>
      <text x="158" y="168">A′</text><text x="326" y="179">B′</text><text x="170" y="32">C′</text>
      <text x="125" y="265">3 cm</text><text x="10" y="180">4 cm</text><text x="250" y="102">5 cm</text><text x="263" y="228">6 cm</text>
    </g>
  </svg>;
}

export default function GeometryLesson() {
  const host = useRef(null);
  const scene = useRef(null);
  const [status, setStatus] = useState('loading');
  const [selected, setSelected] = useState(null);
  const [labels, setLabels] = useState(true);
  const measures = prismMeasures(PRISM);
  useEffect(() => {
    let cancelled = false;
    // Lỗi tải thư viện/GPU/context đều chuyển về nội dung 2D thay vì chặn bài học.
    const fallback = () => {
      if (cancelled) return;
      scene.current?.dispose(); scene.current = null;
      setStatus('fallback');
    };
    import('./createPrismScene').then(({ createPrismScene }) => {
      if (cancelled) return;
      try { scene.current = createPrismScene(host.current, fallback); setStatus('ready'); }
      catch { fallback(); }
    }).catch(fallback);
    return () => { cancelled = true; scene.current?.dispose(); scene.current = null; };
  }, []);
  const chooseFace = (index) => { setSelected(index); scene.current?.selectFace(index); };
  const reset = () => {
    scene.current?.reset(); chooseFace(null); setLabels(true); scene.current?.showLabels(true);
  };
  return <section className="geometry-lesson" aria-labelledby="geometry-title">
    <header><p className="geometry-eyebrow">HỌC CỤ TƯƠNG TÁC · PROTOTYPE MỘT BÀI</p>
      <h3 id="geometry-title">Khám phá lăng trụ đứng tam giác</h3>
      <p>Quan sát hai đáy song song, ba mặt bên và chín cạnh. Mô hình minh họa có kích thước cố định, không phải bài kiểm tra.</p>
    </header>
    <div className="geometry-layout">
      <div className="card geometry-viewer">
        <p role="status">{status === 'loading' ? 'Đang khởi tạo mô hình 3D...' : status === 'ready' ? 'Mô hình 3D sẵn sàng.' : 'Không thể hiển thị WebGL. Bạn vẫn có thể học với hình 2D bên dưới.'}</p>
        <div className="geometry-canvas" ref={host} hidden={status === 'fallback'} />
        {status === 'fallback' && <PrismDiagram />}
        <p id="geometry-help">Kéo một ngón tay hoặc chuột để xoay; chụm hai ngón hoặc cuộn để thu/phóng. Cũng có thể dùng các nút bên dưới bằng bàn phím.</p>
        <div className="geometry-controls" role="group" aria-label="Điều khiển mô hình 3D" aria-describedby="geometry-help">
          <button type="button" disabled={status !== 'ready'} onClick={() => scene.current?.rotate(-1)}>Xoay trái</button>
          <button type="button" disabled={status !== 'ready'} onClick={() => scene.current?.rotate(1)}>Xoay phải</button>
          <button type="button" disabled={status !== 'ready'} onClick={() => scene.current?.zoom(0.85)}>Phóng to</button>
          <button type="button" disabled={status !== 'ready'} onClick={() => scene.current?.zoom(1.15)}>Thu nhỏ</button>
          <button type="button" disabled={status !== 'ready'} onClick={reset}>Đặt lại</button>
        </div>
        <label className="geometry-label-toggle"><input type="checkbox" checked={labels} disabled={status !== 'ready'} onChange={(event) => {
          setLabels(event.target.checked); scene.current?.showLabels(event.target.checked);
        }} /> Hiện tên đỉnh và đầu mút cạnh</label>
      </div>
      <div className="geometry-details">
        <section className="card"><h4>Quan sát các mặt</h4><p>Chọn mặt để tô nổi bật trên mô hình 3D.</p>
          <div className="geometry-faces" role="group" aria-label="Chọn mặt lăng trụ">
            <button type="button" aria-pressed={selected === null} onClick={() => chooseFace(null)}>Tất cả các mặt</button>
            {faces.map((face, index) => <button key={face.name} type="button" aria-pressed={selected === index} onClick={() => chooseFace(index)}>{face.name}</button>)}
          </div>
          <p aria-live="polite">{selected === null ? '2 đáy tam giác, 3 mặt bên hình chữ nhật, 6 đỉnh và 9 cạnh.' : faces[selected].description}</p>
          <p><strong>Cạnh đáy:</strong> AB = A′B′ = 3 cm; AC = A′C′ = 4 cm; BC = B′C′ = 5 cm.</p>
          <p><strong>Cạnh bên:</strong> AA′ = BB′ = CC′ = h = 6 cm, vuông góc với hai đáy.</p>
        </section>
        <section className="card"><h4>Từ hình vẽ đến công thức</h4>
          <dl className="geometry-formulas">
            <dt>Diện tích đáy</dt><dd>Sđ = ½ × 3 × 4 = {measures.baseArea} cm²</dd>
            <dt>Diện tích xung quanh</dt><dd>Sxq = (3 + 4 + 5) × 6 = {measures.lateralArea} cm²</dd>
            <dt>Diện tích toàn phần</dt><dd>Stp = Sxq + 2Sđ = {measures.surfaceArea} cm²</dd>
            <dt>Thể tích</dt><dd>V = Sđ × h = {measures.volume} cm³</dd>
          </dl>
        </section>
      </div>
    </div>
    <p className="geometry-source">Nguồn: mô hình và hình 2D dựng bằng mã nguồn của EKLASSES; Three.js (MIT). Đây là prototype một bài, chưa có chấm điểm hoặc thư viện nhiều môn.</p>
  </section>;
}
