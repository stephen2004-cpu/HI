# Xóa trong biểu mẫu chỉnh sửa

- Habit: bấm bút sửa → **Xóa vĩnh viễn**. Không mở hộp xác nhận cho thao tác mặc định. Giữ lịch sử đánh dấu theo mặc định; tùy chọn xóa cả lịch sử cũ vẫn nằm trong mục thu gọn riêng và giữ xác nhận dành cho việc xóa lịch sử.
- Task: bấm **Sửa** → **Xóa vĩnh viễn**. Không cần xác nhận thêm; với Task lặp chỉ xóa lần đang chỉnh sửa, không xóa các lần khác. Nút Xóa ngoài thẻ Task vẫn giữ luồng xác nhận hiện có.
- Chỉ bỏ khỏi các màn hình đang dùng sau khi kiểm tra capability cần thiết và lưu được dấu xóa trên thiết bị. Trong lúc kiểm tra hiển thị “Đang xóa…” và ngăn bấm lặp; khi lỗi giữ nội dung và báo ngay trong form.
- Habit đã xóa không còn tên trong danh sách Habit, Task phát sinh từ Habit, Calendar hoặc bộ chọn Task của Focus. Task phát sinh (kể cả đã hoàn thành) được giữ trong dữ liệu gốc để không mất lịch sử khi lưu một Task khác. Timer/Focus History không bị xóa.
- Theo dõi trạng thái đồng bộ hiện có để biết khi nào thiết bị khác đã nhận được dấu xóa. Thiết bị offline chưa nhận đồng bộ có thể vẫn thấy dữ liệu cũ. Đây không phải xóa vật lý toàn bộ payload/ledger.

## Điều kiện máy chủ

Không bỏ qua capability RPC, ledger, trigger hoặc RLS. Nếu project thật chưa có migration, app tiếp tục báo chưa xóa và giữ dữ liệu. Cần cài các installer đã chuẩn bị sau khi được chủ dự án phê duyệt; xem [hướng dẫn Database](deletion-protections-install.md). Bản cập nhật giao diện này không thực thi SQL trên Supabase thật và không chứng minh GYM/Task thật đã được xóa.

## Kiểm thử

Các bài hồi quy kiểm tra đường xóa một lần trên desktop/mobile Chromium, lỗi ghi LocalStorage, thiếu RPC/quyền/phiên/mạng, timeout/retry, giữ dữ liệu cũ và lịch sử, đồng bộ hai browser context và chống khôi phục từ client cũ. Backend tích hợp là PostgreSQL/Auth/PostgREST cục bộ; không thay thế thử nghiệm trên Supabase thật hoặc iPhone/Safari thật.

Kết quả cập nhật: build đạt (còn cảnh báo kích thước bundle Vite đã có); **123/123 unit**, **112/112 Playwright desktop/mobile Chromium**, **7/7 integration liên quan đến xóa/đồng bộ**, **19/19 SQL local**. Chưa áp dụng SQL lên project thật; chưa xóa GYM/Task thật và chưa thử trên iPhone/Safari thật.
