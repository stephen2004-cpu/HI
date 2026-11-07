# Mở workspace và đồng bộ khi mạng chậm

## Điều xác nhận từ code

Màn hình “Đang mở vùng dữ liệu…” là trạng thái chờ mở workspace sau nhận diện tài khoản. Trước bản sửa, lần đọc workspace/RPC dấu xóa không có deadline do ứng dụng đặt; request bị treo có thể chặn việc mở app. Máy đã có bản lưu hợp lệ cũng chờ request đầu tiên trước khi mở workspace. Các tab nền sạch tiếp tục đọc toàn workspace mỗi 3 giây.

Số deployment cũ trong Vercel không đồng nghĩa nhiều bản app chạy cùng lúc trên điện thoại. Các tab thực sự đang mở mới gửi yêu cầu. URL Preview có mã deployment là một phiên bản cụ thể; dùng cùng Preview mới trên hai thiết bị để kiểm tra, hoặc dùng URL nhánh V2 cố định có trong Vercel. LocalStorage/Auth session thuộc từng origin, nên lần đầu chuyển sang tên miền Preview khác cần tải/đăng nhập lại.

Không có network trace của iPhone hay số đo Supabase thật ở phiên làm việc này. Các điểm code trên được xác nhận; chưa kết luận chúng là toàn bộ nguyên nhân độ trễ trên thiết bị thật. Safari/iOS có thể tạm dừng tab nền, việc đồng bộ tiếp tục khi trở lại app.

## Thay đổi

- Mở ngay cache **đủ năm tài liệu, đúng tài khoản và hợp lệ**; không dùng dữ liệu khách hoặc bản ghi đang áp dụng dở. Vẫn kiểm tra bản máy chủ trong nền.
- Lần đầu chưa có dữ liệu: khóa workspace/import cho đến khi đọc được bản máy chủ; hiển thị lỗi rõ và nút **Thử tải lại dữ liệu** khi không tải được.
- Deadline đọc là 12 giây cho cả workspace và Task ledger; deadline ghi là 20 giây. Hủy request khi timeout/đăng xuất/đổi tài khoản. Response cũ sau khi hủy không được áp dụng hoặc xác nhận dấu xóa.
- Đọc lại dirty metadata sau lần đọc đầu tiên, giữ các thay đổi tạo trong lúc mạng chậm. Giữ CAS, dấu xóa bền vững, phát hiện xung đột và lựa chọn bản dữ liệu hiện có. Không thay snapshot của Timer đang chạy hoặc form đang được chỉnh bằng bản máy chủ khác.
- Cache trùng nội dung không bị ghi lại/remount app chỉ vì vừa kiểm tra xong.
- Tab nền không có dữ liệu chờ gửi bỏ qua lượt polling; dữ liệu bẩn vẫn được gửi theo chu kỳ. Kiểm tra ngay khi trở lại tab hoặc có mạng. Một engine không chạy nhiều lượt đồng bộ song song.

Không đổi Supabase schema, RPC/RLS hay cấu trúc snapshot, không xóa dữ liệu trình duyệt. Không yêu cầu thêm SQL hoặc xóa deployment cũ.

## Kiểm thử

Unit dùng request treo và đồng hồ giả để kiểm tra timeout, response muộn, retry, giữ dirty state, ghi đang chờ, tránh remount cache giống nhau, bản cache sai/thiếu và polling nền/visibility. Integration desktop/mobile Chromium với Auth/PostgREST/Postgres local kiểm tra mạng treo ở lần tải đầu tiên, retry, mở cache trước response, giữ công việc tạo khi đang chờ và tránh ghi đè từ thiết bị khác.

Kết quả mô phỏng không thay thế kiểm tra trên iPhone/Safari hoặc latency mạng/Supabase thật.

Kết quả cập nhật: build đạt (cảnh báo bundle Vite trên 500 kB đã có); **138/138 unit**, **120/120 Playwright desktop/mobile Chromium**, **27/27 integration cục bộ**. Bốn trường hợp startup mới cũng chạy riêng, gồm kiểm tra hiển thị lỗi và không tràn ngang trên mobile. Chưa đo tốc độ Supabase thật hoặc kiểm thử iPhone/Safari thật; không sửa Database hay Vercel Production.
