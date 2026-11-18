import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vertices, faces, edges, vertexNames } from './prism';

// Bộ dựng chỉ tồn tại khi mở bài học; trả API nhỏ để React điều khiển và thu hồi GPU.
export function createPrismScene(host, onContextLost) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  const resources = [];
  let controls;
  let observer;
  let disposed = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  const render = () => { if (!disposed) renderer.render(scene, camera); };
  const contextLost = (event) => { event.preventDefault(); onContextLost(); };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer?.disconnect();
    controls?.dispose();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    resources.forEach((item) => item.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  };
  try {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    const meshes = faces.map((face) => {
      const positions = [];
      for (let i = 1; i < face.indices.length - 1; i++) {
        [face.indices[0], face.indices[i], face.indices[i + 1]].forEach((index) => positions.push(...vertices[index]));
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const material = new THREE.MeshBasicMaterial({ color: face.color, side: THREE.DoubleSide });
      resources.push(geometry, material);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      return mesh;
    });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(edges.flatMap((edge) => edge.map((i) => new THREE.Vector3(...vertices[i]))));
    const lineMaterial = new THREE.LineBasicMaterial({ color: '#172b3a' });
    resources.push(lineGeometry, lineMaterial);
    scene.add(new THREE.LineSegments(lineGeometry, lineMaterial));
    const labels = vertices.map((vertex, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 64);
      ctx.fillStyle = '#172b3a'; ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(vertexNames[i], 64, 45);
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
      const sprite = new THREE.Sprite(material);
      sprite.position.set(...vertex.map((v) => v * 1.16));
      sprite.scale.set(1.2, 0.6, 1);
      resources.push(texture, material); scene.add(sprite);
      return sprite;
    });
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 9; controls.maxDistance = 28;
    controls.addEventListener('change', render);
    const reset = () => { camera.position.set(10, 8, 13); controls.target.set(0, 0, 0); controls.update(); render(); };
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height);
      camera.aspect = width / height; camera.updateProjectionMatrix(); render();
    };
    observer = new ResizeObserver(resize); observer.observe(host);
    reset(); resize();
    return {
      dispose, reset,
      zoom(factor) { camera.position.multiplyScalar(factor).clampLength(9, 28); controls.update(); render(); },
      rotate(direction) { camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), direction * Math.PI / 12); controls.update(); render(); },
      selectFace(index) {
        meshes.forEach((mesh, i) => mesh.material.color.set(index === null || index === i ? faces[i].color : '#cbd5df'));
        // Đưa mặt được chọn ra phía người xem, tránh tô một mặt đang bị che khuất.
        if (index !== null) {
          const [a, b, c] = faces[index].indices.map((i) => new THREE.Vector3(...vertices[i]));
          const normal = b.sub(a).cross(c.sub(a)).normalize();
          const distance = camera.position.length();
          camera.position.copy(normal.multiplyScalar(distance).add(new THREE.Vector3(2, 1, 2))).clampLength(9, 28);
          controls.update();
        }
        render();
      },
      showLabels(visible) { labels.forEach((label) => { label.visible = visible; }); render(); },
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
