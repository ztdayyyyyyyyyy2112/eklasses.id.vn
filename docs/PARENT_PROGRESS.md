# Báo cáo tiến bộ phụ huynh — issue #5

Nhánh `feat/issue-5-parent-progress`, dựa trên `tdtu_innovation` tại `e129458`
(PR #9 cho #1–#4). Không đổi schema, không migration, không thêm dependency.
Không thay seed hay ghi dữ liệu thật từ API báo cáo.

## Luồng và contract

Phụ huynh mở **Học sinh đã liên kết → Xem tiến bộ** ở dashboard.
Màn hình `/children/:studentId/progress` chỉ dành cho parent; backend vẫn là nơi
quyết định quyền, không tin role/userId/fields truyền từ trình duyệt.

`GET /api/guardians/children/:studentId/progress` yêu cầu Bearer token:

- Role hiện tại trong DB phải là `parent`. Cần `GuardianLink.status = verified`
  cho đúng cặp parent/student và học sinh còn active, chưa bị khóa/xóa mềm.
- `400` ID sai; `401` thiếu/hết phiên; `403` sai role; `404` không có liên kết đã
  xác minh hoặc học sinh không hợp lệ; `500` lỗi chung, không lộ lỗi nội bộ.
- Response `Cache-Control: private, no-store`; không có endpoint ghi báo cáo.
- `student` chỉ có `id`, `name`. Metadata: `source = ClassSession / QuizSubmission`,
  `fetchedAt` là lúc lấy dữ liệu, **không phải thời điểm chỉnh sửa DB gần nhất**,
  `timeZone = Asia/Ho_Chi_Minh`, `limit = 50`.
- `sessions`: tối đa 50 buổi mới nhất theo `startsAt desc, _id desc`, chỉ những
  buổi có học sinh trong snapshot điểm danh. Chỉ trả title, tên lớp, giờ, trạng thái,
  updatedAt và trạng thái/giờ check-in của chính học sinh. Không trả location,
  roster, ghi chú điểm danh, người ghi hoặc thông tin nội bộ giáo viên.
- `quizzes`: tối đa 50 bài `submitted/graded`, theo `submittedAt desc, _id desc`.
  Có tên quiz/lớp, ngày nộp/chấm, trạng thái; không tải câu hỏi/đáp án/answers.
  `submitted` luôn có điểm và phần trăm `null`, feedback rỗng; graded mới hiển thị
  điểm snapshot và nhận xét giáo viên. Quiz/lớp đã xóa có nhãn dự phòng.
- `summary` tính **toàn bộ lịch sử**, không phải chiều dài danh sách giới hạn:
  `totalSessions`, `completedSessions`, `submittedQuizzes`, `pendingQuizzes`,
  `gradedQuizzes`, `scoredQuizzes`, `averagePercentage`.
- Trung bình cộng `(totalScore / maxScore) × 100` của từng bài graded hợp lệ,
  không phải trung bình điểm thô hoặc phần trăm gộp trọng số. Điểm 0 hợp lệ;
  maxScore 0/điểm sai loại/vượt thang không đưa vào trung bình. Làm tròn 2 chữ số;
  chưa có điểm hợp lệ trả `null`, không giả thành 0%.
- Hoàn thành buổi học không có nghĩa đã có mặt. Biểu đồ theo ngày nộp tăng dần,
  chỉ dùng các bài graded hợp lệ trong danh sách gần nhất; ngày hiển thị giờ Việt Nam.
  Không mô tả đây là AI/chẩn đoán lỗ hổng kiến thức.

API được cập nhật đồng bộ trong Swagger/OpenAPI, không đổi API cũ.

## Kiểm tra có thể chạy lại

```powershell
npm test --prefix backend
npm test --prefix frontend -- --watchAll=false --runInBand
npm run build --prefix frontend
# Dùng đường dẫn mongod cài sẵn trên máy, không truyền URI/tài khoản bên ngoài:
$env:MONGOD_BINARY='C:\path\to\mongod.exe'
npm run test:progress:integration --prefix backend
# Playwright đã cài ở bộ công cụ ngoài repo, Edge/Chromium có sẵn:
$env:BROWSER_TOOLS_DIR='C:\path\to\browser-tools'
$env:QA_ARTIFACT_DIR='C:\path\to\temporary-artifacts'
npm run test:progress:browser --prefix backend
```

Lab khởi tạo MongoDB replica set tại loopback/cổng ngẫu nhiên, DB `parent-progress-qa`
trong data-dir tạm mới; không đọc `.env`/DB production. Chỉ tạo tài khoản `example.test`,
khóa/mật khẩu sinh trong bộ nhớ; dừng process lab sau kiểm tra. Data-dir QA được giữ
trong thư mục tạm để chẩn đoán, không xóa dữ liệu ngoài lab.

## Bằng chứng lần triển khai

- 149 test backend, 122 test frontend đạt; production build thành công;
  1 test tích hợp MongoDB và browser smoke riêng đều đạt.
- Unit/HTTP: phép tính, allowlist, draft/pending, role DB thay vì token,
  từ chối trước query học tập, no-store, lỗi DB không lộ secret.
- MongoDB 8.3 replica set thật: parent đặt → teacher nhận → ClassSession xuất hiện;
  hoàn thành buổi; student nộp → parent thấy chờ chấm → teacher chấm 80% → sửa 90%
  → parent tải lại thấy đổi. Test phụ huynh khác/pending/revoked, role khác,
  học sinh khóa, dữ liệu học sinh khác, >50 bản ghi và thang điểm 0.
- Browser Edge headless trên production build/API/MongoDB thật: đăng nhập parent
  bằng UI, mở link từ danh sách con; xem rỗng/chờ chấm/80→90%, refresh giữ kết quả,
  parent khác nhận 404; không pageerror, không tràn ngang 320/390/768/1280px.
- Ảnh: [desktop](qa/issue5-progress-1280.png), [mobile giả lập](qa/issue5-progress-390.png).

Chưa nghiệm thu toàn bộ kịch bản UI #6 (browser smoke nộp/chấm qua HTTP thật,
không thao tác form học sinh/giáo viên), chưa kiểm tra điện thoại vật lý/production.
Không khẳng định #6 hoặc #8 đã hoàn thành chỉ vì #5 có test đạt.
