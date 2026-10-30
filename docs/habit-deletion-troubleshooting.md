# Sửa lỗi Habit vẫn hiện sau khi xác nhận xóa

## Những gì xác nhận được

Code trước bản sửa chặn xóa tài khoản khi RPC `lbd_habit_deletion_capabilities` lỗi hoặc không trả về số `1`. Đây là cơ chế bảo vệ cần giữ: xóa cục bộ khi máy chủ chưa có ledger/triggers có thể bị thiết bị cũ ghi đè.

Nhưng nhánh lỗi đóng hộp xác nhận và hiển thị thông báo chung ở đầu trang, ngoài vùng người dùng đang xem. Vì vậy xác nhận xóa không có nghĩa là đã xóa: Habit còn nguyên là hành vi đúng khi kiểm tra RPC thất bại, nhưng phản hồi UI không rõ.

Ngoài ra, HabitTracker chỉ khởi tạo danh sách một lần, không theo dõi sự kiện `lbd-habits-updated`. Kiểm thử tái hiện cho thấy một dấu xóa từ writer khác trong app không cập nhật bảng đang mở; biểu mẫu chỉnh sửa cũ có thể ghi đè dấu xóa cục bộ. Bản sửa cập nhật bảng theo sự kiện và hợp nhất tombstone trước mọi lần lưu Habit. Luồng xác nhận xóa đọc lại dữ liệu sau khi chờ RPC, tránh ghi đè bằng snapshot trước yêu cầu mạng.

Chưa có quyền truy cập Supabase được quản lý của người dùng trong môi trường này. **Chưa xác nhận nguyên nhân cụ thể của Habit GYM thật là thiếu migration, quyền RPC, phiên đăng nhập, mạng hay dữ liệu cũ. Chưa áp dụng SQL nào lên dự án đó.** Không suy luận rằng migration đã được cài chỉ vì có file trong Git.

## Phản hồi sau bản sửa

- Lỗi hiện ngay trong hộp xác nhận và hộp vẫn mở để đọc, hủy hoặc thử lại.
- Phân biệt RPC thiếu/schema cache (PGRST202/42883/404), thiếu quyền (42501/403), phiên hết hạn (401/PGRST301/PGRST303), lỗi mạng, máy chủ và phiên bản capability không hỗ trợ.
- Yêu cầu bị treo có timeout 12 giây. Không bỏ qua kiểm tra và không in nội dung lỗi máy chủ/token ra log.
- Lỗi ghi LocalStorage hiện ngay trong hộp; dữ liệu cũ được giữ. Không xóa/reset LocalStorage.
- Sau lưu dấu xóa, Habit được ẩn ở tuần, tháng và danh sách lưu trữ; thông báo nói rõ đã lưu trên thiết bị và cần chờ trạng thái **Đã đồng bộ**. Không báo đã xóa trên mọi thiết bị khi mới chỉ ghi cục bộ.
- Ledger, RLS, CAS revision và cơ chế hợp nhất dấu xóa của sync giữ nguyên. Không thay schema trong bản sửa này.

## Kiểm tra Supabase an toàn (thực hiện thủ công)

1. Xác định đúng dự án dùng bởi bản **Vercel Preview**. Đối chiếu Project URL với biến public `VITE_SUPABASE_URL` của Preview; không gửi access token, mật khẩu hoặc service-role key qua chat. Không thay cấu hình Production/V1. Nếu Preview và Production dùng chung một Supabase project, migration cũng tác động backend Production: không áp dụng lên project chung trong phạm vi yêu cầu này; dùng database development riêng để kiểm chứng trước.
2. Trong SQL Editor, chạy nguyên file [`habit_deletion_readonly.sql`](../supabase/diagnostics/habit_deletion_readonly.sql). Đây chỉ là transaction đọc metadata, kết thúc bằng ROLLBACK, không đọc/xóa Habit thật. Tất cả cờ dòng đầu phải là `true`; dòng policy cần `owner_read`, SELECT, authenticated và điều kiện owner. Đây là kiểm tra cài đặt, không tự chứng minh toàn bộ RLS an toàn nếu DB có sửa tùy ý ngoài migration.
3. Nếu `base_*` thiếu, kiểm tra migration nền `202610270001_auth_workspace.sql` trước; không chạy lại mù quáng lên database đã có cấu trúc.
4. Nếu **toàn bộ phần bảo vệ xóa chưa có**, sao lưu/snapshot database theo quy trình của bạn, thử trên development project riêng, rồi xem xét áp dụng **nguyên file** [`202610300001_habit_deletions.sql`](../supabase/migrations/202610300001_habit_deletions.sql). File này là SQL chính xác đã có trong repo, không thay bằng một RPC giả chỉ trả về `1`. Bọc toàn bộ nội dung file trong `BEGIN;` và `COMMIT;` để tránh cài nửa chừng; khi lỗi dùng ROLLBACK. Migration không xóa các dòng Habit/Task/Focus hiện có; có tạo ledger và nhận các tombstone đã tồn tại. Quyền/trigger mới ảnh hưởng những lần ghi tiếp theo nên cần thử trên database riêng trước.
5. Nếu **chỉ thiếu một phần**, hoặc báo relation/function/trigger đã tồn tại, dừng để rà soát cấu trúc và lịch sử migration. Không DROP bảng, không xóa ledger, không chạy lại toàn file và bỏ qua lỗi. Cần bản sửa SQL phù hợp chính trạng thái DB đó.
6. Chạy lại SQL kiểm tra. Nếu SQL đủ nhưng REST vẫn báo PGRST202, có thể yêu cầu tải lại schema cache bằng `NOTIFY pgrst, 'reload schema';` sau khi đã xem xét và cho phép thao tác trên đúng dự án. Đây là thao tác tùy chọn của quản trị viên; bản sửa chưa thực hiện trên Supabase thật.
7. Trong Preview đã đăng nhập, thử xóa **Habit thử nghiệm mới**, xem Network response của RPC: HTTP 200, JSON number `1`. SQL Editor thông thường không có JWT người dùng, nên gọi RPC trực tiếp ở đó trả `0` không đồng nghĩa migration thiếu. Lỗi 401 cần đăng nhập lại; lỗi 403 cần kiểm tra GRANT EXECUTE trong migration. Không nới RLS hoặc dùng service-role key trên frontend.
8. Chờ **Đã đồng bộ**, tải lại Preview và đăng nhập cùng tài khoản trên iPhone. Xem tuần/tháng và bật danh sách lưu trữ: Habit thử đã xóa không hiện lại. Kiểm tra Task độc lập, lịch sử Habit còn giữ trong backup, Focus History, logo chim ưng và Hướng dẫn sử dụng. Chỉ sau kiểm chứng này mới quyết định có thao tác với GYM thật.

## Phạm vi kiểm thử

Dùng database Auth/PostgREST/PostgreSQL cô lập ở localhost, tài khoản ngẫu nhiên và dữ liệu giả; không gửi email ngoài, không xóa dữ liệu Supabase thật. Có kiểm thử hai browser context desktop/mobile, điện thoại offline rồi kết nối lại, xung đột chọn bản thiết bị, reload/logout/login, stale snapshot cùng revision mới, ledger RLS, giữ lịch sử mặc định và tùy chọn xóa lịch sử.

Các bài mới kiểm tra lỗi RPC ngay trong hộp xác nhận trên mobile, giữ nguyên bản dữ liệu khi thất bại, thử lại thành công, lỗi dung lượng LocalStorage, tombstone cập nhật bảng đang mở và biểu mẫu cũ không phục hồi dấu xóa. Mobile dùng Chromium mô phỏng, chưa phải Safari/iPhone vật lý. Kết quả chạy cụ thể được ghi trong báo cáo bàn giao.

## Kết quả chạy tại bản sửa

- Build đạt; còn cảnh báo bundle trên 500 kB đã có trước bản sửa.
- Unit: 66/66 đạt.
- Playwright desktop/mobile: 68/68 đạt, gồm logo và bảng hướng dẫn.
- Tích hợp Supabase localhost: bộ đầy đủ 13/13 đạt; sau đó thêm và chạy riêng bài timeout/đọc lại dữ liệu khi chờ RPC, 1/1 đạt. Tổng 14 ca tích hợp khác nhau đạt.
- SQL chẩn đoán chạy trên database thử localhost: cả chín cờ đều true, đúng policy owner_read. Chưa chạy trên Supabase được quản lý.
- Xem ảnh chụp mobile xác nhận lỗi hiển thị trong hộp và có thể thử lại. Không xóa Habit GYM thật hoặc thay đổi dữ liệu tài khoản thật.
