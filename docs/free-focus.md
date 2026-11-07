# Về Focus tự do và nhắc Task chưa hoàn thành

Trong Focus đang liên kết với Task, nút **Về Focus tự do** nằm dưới bộ chọn Task. Có thể dùng khi Timer đang chạy, tạm dừng, đang ở pha nghỉ Study, hoặc chưa bắt đầu.

- Phiên hiện tại kết thúc theo cơ chế ghi nhận `stopped` đã có. Giữ Actual Focus/Break, Task ID, Time Block ID và các pha Study đã kết thúc. Không tính thời gian tạm dừng thành Actual Time.
- Task chưa hoàn thành chuyển sang trạng thái `doing`; không tự tích Checklist, đổi Expected/Actual Output hay đánh dấu hoàn thành. Task đã hoàn thành không bị mở lại.
- Workspace về Countdown tự do mặc định 25 phút, không chọn Task/Time Block. Giữ âm lượng và tùy chọn tắt âm thanh. Có thể cấu hình Timer tự do hoặc chọn việc gấp khác.
- Mục **Task chưa hoàn thành** ở phía trên hiển thị các Task `doing` chưa hoàn thành, không gồm Task đang chọn/đã xóa. Giữ tên, ngày lần lặp và tiến độ Checklist.
- **Quay lại** mở cấu hình của Task để bắt đầu phiên mới; không tiếp tục đồng hồ cũ. Giữ liên kết với Time Block gần nhất nếu block đó còn hiển thị. Khi chưa có lịch sử và chỉ có một block của Task, dùng block đó; không đoán khi có nhiều block.
- Khi đang chạy phiên khác, nút Quay lại bị khóa và có giải thích; không âm thầm chuyển liên kết của phiên đang chạy.

## Lưu dữ liệu

Tái sử dụng Task `status: doing` và bổ sung metadata tùy chọn `timer.settings.focusSelection`. Lựa chọn Focus tự do được ghi rõ với `taskId: ''`, nên tải lại không tự chọn Task từ lịch sử. Dữ liệu cũ không có metadata vẫn dùng fallback cũ; metadata hỏng không làm mất lịch sử hợp lệ.

Task và Timer được ghi đồng bộ trong cùng thao tác bằng các cơ chế lưu hiện có; khi không lưu được thì không chuyển giao diện sang Focus tự do. Nếu ghi Timer thất bại sau ghi Task, thử khôi phục nguyên tài liệu Task. Thông báo lỗi giữ người dùng ở phiên hiện tại, không báo thành công giả.

Các trường nằm trong JSON đã được lưu/đồng bộ theo tài khoản. Không đổi schema, RPC, RLS, Auth hay quy tắc đồng bộ. Calendar, Habit, tài liệu Checklist, logo và dữ liệu lịch sử dùng cấu trúc hiện có; giữ giới hạn 1.000 bản ghi Timer như trước.

## Kiểm thử

Unit kiểm tra Countdown, Study chuyển pha/nghỉ, paused Actual Time, lựa chọn tự do/legacy, giữ tài liệu/lịch sử và rollback khi lỗi lưu. Playwright desktop/mobile kiểm tra rời Task, tải lại, quay lại, không tự hoàn thành, chuyển sang Timer độc lập/việc gấp và báo lỗi ghi dữ liệu. Integration dùng hai browser context với Auth/PostgREST/Postgres cục bộ để kiểm tra đồng bộ lựa chọn, tiến độ và lịch sử, giữ Calendar/Habit.

Các kiểm thử mobile là mô phỏng Chromium; chưa thay thế kiểm tra iPhone/Safari thật hay tài khoản trên Supabase thật.

Ảnh kiểm tra: [desktop](ui-preview/free-focus-desktop.png), [mobile](ui-preview/free-focus-mobile.png).

Kết quả: build đạt (còn cảnh báo bundle Vite trên 500 kB đã có); **130/130 unit**, **120/120 Playwright desktop/mobile Chromium**, **23/23 integration cục bộ** gồm kiểm tra đồng bộ hai browser context, hồi quy Auth/recovery, Task/Calendar, Checklist và Habit/Task deletion. Không dùng kết quả cục bộ để khẳng định đã kiểm thử trên tài khoản Supabase thật hay iPhone/Safari thật.
