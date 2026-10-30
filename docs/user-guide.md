# Hướng dẫn sử dụng trong ứng dụng

Nút “Hướng dẫn sử dụng” ở bên phải Header mở bảng đọc từ cạnh phải. Có sáu mục: Bắt đầu, Task & Eisenhower, Calendar, Focus, Habit, Tài khoản & đồng bộ. Mỗi mục dùng danh sách bước có đánh số và có thể mở/thu gọn độc lập; mục đầu mở sẵn.

`src/components/UserGuide.tsx` chỉ chứa nội dung và trạng thái hiển thị của bảng. Không đọc/ghi workspace, gọi API, thay cấu hình tài khoản hoặc điều khiển Timer. Logo chim ưng và chữ thương hiệu được giữ nguyên.

Nội dung đã đối chiếu với TaskBoard, Calendar, HabitTracker, Focus Workspace, PlannerSettings và AccountApp: phân biệt Task/Habit, lịch lặp, Planned/Actual Time, dữ liệu khách, xác nhận nhập dữ liệu và xung đột đồng bộ. Không hứa tự hoàn thành Habit hay tự đồng bộ dữ liệu khách.

Bảng dùng HTML dialog dạng modal: nút đóng luôn ở phần đầu, Escape và nhấn nền ngoài bảng có thể đóng; focus quay về nút mở. Nội dung cuộn độc lập, màn hình nhỏ dùng toàn chiều ngang, hỗ trợ reduced motion. Không lưu trạng thái đọc vào LocalStorage.

## Kiểm chứng

- `npm run build`: đạt; còn cảnh báo kích thước bundle đã có trước thay đổi.
- `npm test`: 58/58 unit test đạt.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`: 64/64 kiểm thử desktop/mobile đạt (2,3 phút), bao gồm bốn lượt kiểm thử mới cho hướng dẫn.
- `e2e/user-guide.spec.ts`: đủ sáu mục trên cả bảy màn hình, mở/thu gọn/đóng/Escape, khôi phục focus, không đổi LocalStorage (bao gồm khóa V1), kích thước bảng, giữ logo, Timer vẫn chạy và reduced motion. Hai bài chạy trên cả desktop và mobile.
- Kiểm tra bổ sung trên Chromium ở 1440×1100, 390×844 và 320×700: nội dung không tràn ngang, Tab không đến các điều khiển nền, đóng bằng nền ngoài bảng trên desktop. Đã xem ảnh chụp giao diện desktop/mobile.

Không thay đổi Supabase/schema hoặc triển khai Production. Kiểm tra mobile dùng viewport Chromium mô phỏng, chưa kiểm tra trên iPhone vật lý/Safari.
