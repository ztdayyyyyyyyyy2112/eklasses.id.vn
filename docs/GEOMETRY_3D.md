# Học cụ hình học 3D — issue #7

Prototype **một bài** về lăng trụ đứng tam giác vuông 3–4–5 cm, cao 6 cm.
Không có chấm bài, dữ liệu học sinh hay thư viện học cụ nhiều môn. Không cần API,
schema, seed hoặc các luồng phụ huynh/tìm gia sư/đặt lịch của #1–#4.

## Chạy và trình diễn

1. Cài dependency bằng `npm ci --prefix frontend`, chạy frontend/backend theo README.
2. Đăng nhập tài khoản QA được phép truy cập một lớp, mở chi tiết lớp.
3. Chọn **Học cụ 3D**. Bài minh họa tĩnh dùng chung cho các lớp; không phải nội dung giáo viên đã giao.
4. Kéo chuột/một ngón tay để xoay; cuộn/chụm hai ngón để zoom. Các nút hỗ trợ bàn phím.
5. Chọn từng mặt để tô nổi bật, xem mô tả. Tắt/bật tên đỉnh, bấm **Đặt lại**.
6. Đối chiếu 2 đáy, 3 mặt bên, 6 đỉnh, 9 cạnh; Sđ = 6, Sxq = 72,
   Stp = 84 cm² và V = 36 cm³.

Mô hình và SVG được dựng bằng code của dự án, không dùng asset bên ngoài.
Three.js có giấy phép MIT (xem `frontend/node_modules/three/LICENSE`). Three.js và
OrbitControls chỉ tải khi mở bài học, không gọi CDN/dịch vụ OCR/AI hoặc gửi dữ liệu ra ngoài.
Không có vòng lặp render liên tục; render khi tương tác/thay đổi kích thước.
Khi rời tab, thu hồi controls, observer, geometry, material, texture và renderer.

## Kiểm tra

- `npm test --prefix frontend -- --watchAll=false --runInBand`
- `npm run build --prefix frontend`
- Test tự động dùng mock bộ dựng GPU: công thức, cấu trúc mô hình, nút điều khiển,
  chú thích mặt, reset, lỗi khởi tạo, mất context và cleanup. Mock không thay thế test WebGL thật.
- Kiểm tra browser: 320/390/768/1280px, chuột, touch, Tab/Enter/Space; không tràn ngang.
- Tắt WebGL hoặc mô phỏng mất context: phải có SVG 2D, công thức và lời giải thích;
  nút 3D bị vô hiệu hóa. Kiểm tra Network: đăng nhập/tổng quan không tải chunk Three.js.
- Quay video ngắn: mở tab → xoay → zoom → chọn mặt → reset → công thức → mobile/2D.
  Không quay token, mật khẩu hoặc dữ liệu cá nhân thật.

Chưa có video kèm source; không coi checklist là bằng chứng đã kiểm tra
trên điện thoại thật hoặc production. Kết quả chạy thực tế được báo riêng khi bàn giao.

## Kết quả kiểm tra trong lần triển khai

- 102 test frontend đạt (16 suite); production build thành công.
- Edge headless chạy WebGL bằng SwiftShader trên production build với API QA giả
  tại loopback: mô hình tải được, chọn mặt/nút xoay/zoom hoạt động, không có runtime exception.
- Viewport 320/390/768/1280px không tràn ngang; đã gửi thao tác kéo cảm ứng mô phỏng.
- Ảnh kiểm tra: [desktop](qa/issue7-desktop.png), [mobile giả lập](qa/issue7-mobile.png).
- Chunk Three.js chưa tải ở tổng quan, chỉ tải sau khi mở học cụ.
- Mất WebGL context chuyển sang SVG và vô hiệu hóa nút 3D; rời/mở lại tab dựng được mô hình mới.
- Chưa kiểm chứng điện thoại vật lý, GPU thiết bị thật, pinch zoom trên thiết bị thật,
  môi trường production hoặc video ngắn. API giả chỉ phục vụ browser QA, không được thêm vào app.
- npm install báo 93 lỗ hổng trong cây dependency; chưa chạy audit fix hoặc nâng cấp
  các dependency ngoài Three.js trong issue này.
