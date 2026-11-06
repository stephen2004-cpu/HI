# Kéo chọn để tạo Task trên Calendar

Trong lịch ngày/tuần, dùng nút chuột trái kéo dọc từ một vùng giờ trống. Vùng chọn màu gold hiển thị giờ bắt đầu/kết thúc, làm tròn 15 phút. Kéo ngược được chuẩn hóa thành khoảng thời gian tăng dần. Chỉ nhấp hoặc di chuyển nhẹ không tạo Task; thao tác click lên lịch block có sẵn được giữ. Month view không có chọn trên trục giờ.

Thả chuột mở Setup Task hiện có trong native dialog. Ngày giờ bắt đầu, ngày giờ kết thúc và thời lượng điền sẵn. Có thể sửa tiêu đề, nhóm, màu, Checklist/tài liệu, giờ, thời lượng và quy tắc lặp như form Task. Sửa giờ kết thúc cập nhật thời lượng Focus; với Study Mode, giữ số phiên và thời gian nghỉ khi tính lại Focus. Không chấp nhận tổng thời lượng <=0 hoặc >24 giờ. Lựa chọn đến 24:00 có giờ kết thúc ở 00:00 ngày kế tiếp.

Lưu đi qua **chính submit của TaskBoard**, dùng `scheduleTaskRepeats` và `persistTaskCalendar`. Không có Task store, API hay schema riêng. Task và Time Block có cùng liên kết ID như luồng lưu Task hiện có, group/color/completion/Focus và Supabase sync không bị thay thế. Lặp không giới hạn tiếp tục sinh theo khoảng hiển thị; Calendar phản ứng khi quy tắc mới được lưu.

Hủy/Escape trong dialog chỉ bỏ bản nháp. Escape khi đang giữ chuột, pointer cancel hoặc mất focus cửa sổ bỏ vùng chọn, không mở form. Mở/Hủy form không gọi materialization range của TaskBoard và không ghi Task/Planner. Lazy autosave Timer của app vẫn hoạt động độc lập. Đã có block trùng: cho phép lưu và hiển thị cảnh báo theo cơ chế cũ, không ghi đè block khác.

Chỉ bắt đầu ở nền/hour slot, không bắt đầu trên Time Block/nút resize/nút sửa. Click, drag/drop và resize block cũ tiếp tục dùng xử lý riêng. Không thêm ảnh/logo tham khảo; giữ logo chim ưng và giao diện hiện có. Vùng chọn không chặn pointer trên block, Now Line hoặc các nút.

Tương tác mới dùng chuột; touch được bỏ qua để giữ thao tác cuộn và kéo/resize hiện có trên điện thoại. Không triển khai long-press tạo Task bằng ngón tay trong bản này. Test ở kích thước mobile dùng chuột mô phỏng, không đại diện kiểm thử Safari/iPhone thật. Dialog dùng focus trap/Escape của trình duyệt, trường tên được focus khi mở.

Không có migration hoặc thao tác trên Supabase thật. Xóa Habit/Task vẫn giữ điều kiện RPC/ledger của bản trước; không tắt bảo vệ để phục vụ tính năng mới.

## Kết quả kiểm thử

- Build đạt; còn cảnh báo bundle trên 500 kB của Vite.
- Unit **122/122** (19 file), gồm làm tròn, kéo ngược và ranh giới ngày.
- Playwright desktop/mobile Chromium **110/110**: Friday 06/11 09:00–10:30, vùng chọn và điền form, sửa giờ kết thúc, Save/reload/Eisenhower, Cancel/Escape trước và sau mở form, click không tạo Task, xung đột không ghi đè block. Các bài drag/drop/resize cũ, hai Timer, Habit, Checklist và logo vẫn đạt.
- Integration Supabase Auth/PostgREST/Postgres **cục bộ 22/22**. Bài mới tạo Task từ Calendar ở desktop và kiểm tra cùng Task/block ở context mobile sau đăng nhập và reload. Không truy cập Database thật.
- Đã xem ảnh render thực tế của vùng chọn và Setup desktop. Mobile test là viewport/cảm ứng mô phỏng với thao tác chuột; chưa thử Safari/iPhone thật. Không xác nhận Vercel deployment nếu chưa có kết quả từ Vercel.
