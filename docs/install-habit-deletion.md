# Cài bảo vệ xóa Habit trên lbd-focus-db — một lần chạy SQL

Ngày 31/10/2026, người dùng xác nhận kiểm tra chỉ đọc trên `lbd-focus-db` có bốn cờ `deletion_ledger_exists`, `capability_rpc_exists`, `habit_guard_enabled`, `block_guard_enabled` đều false. Đây là lý do app V2 chặn xóa: thiếu bảo vệ chống phục hồi từ bản đồng bộ cũ. Codex không có kết nối tới dự án này, chưa tự xác minh schema thực tế và **chưa áp dụng SQL lên database đó**.

Không cần tạo thêm Supabase Project cho quy trình dưới đây. Đã kiểm thử SQL bằng database tạm trong Docker cục bộ; database đó không chứa dữ liệu thật và được dọn sau kiểm thử.

## Thao tác ngắn nhất

1. Giữ file **JSON sao lưu tài khoản đã tải**. Đợi các thiết bị báo **Đã đồng bộ**, rồi đóng app trên MacBook/iPhone trong lúc cài. Trong Supabase chọn đúng `lbd-focus-db`; đối chiếu Project URL với `VITE_SUPABASE_URL` của V2. SQL sẽ thay đổi schema của database được chọn, không deploy/thay website Production. Nếu V1/Production cũng dùng database này, cơ chế mới sẽ áp dụng cho cả các ứng dụng dùng cùng bảng; cần xác nhận đúng phạm vi trước khi tự nhấn Run.
2. Mở **SQL Editor → New query**. Mở [`install_habit_deletions_safe.sql`](../supabase/manual/install_habit_deletions_safe.sql), sao chép **toàn bộ nội dung**, chọn role `postgres` và nhấn **Run một lần**. Không chạy thêm migration gốc trước/sau file này. Kết quả mong đợi: `Habit deletion protection installed; existing app rows unchanged...`.
3. Chạy lại [`habit_deletion_readonly.sql`](../supabase/diagnostics/habit_deletion_readonly.sql). Cả chín cờ phải là `true`; policy là `owner_read`, SELECT, authenticated và điều kiện owner. Script cài đã yêu cầu PostgREST tải lại schema cache khi commit, thường không cần thao tác riêng. Gọi RPC trong SQL Editor không có JWT người dùng có thể trả `0`; điều đó không chứng minh lỗi cài đặt.
4. Mở lại V2 (code `b3af0ef` đã đủ), tải lại trang và xóa GYM qua giao diện. Giữ tùy chọn **“Xóa cả lịch sử đánh dấu” tắt** nếu muốn giữ lịch sử trong bản ghi tombstone. Đợi **Đã đồng bộ**, rồi mở/tải lại V2 trên iPhone cùng tài khoản. Kiểm tra tuần/tháng và “Hiện thói quen đã lưu trữ”: GYM không xuất hiện. Không xóa LocalStorage. Nếu muốn thử trước, có thể tạo/xóa một Habit thử nghiệm thay cho GYM.

Nếu hiện lỗi SQL: **dừng**, chạy riêng `ROLLBACK;` để kết thúc transaction lỗi nếu còn mở; không bỏ qua lỗi, không DROP đối tượng hoặc sửa RPC thành `return 1`. Giữ thông báo lỗi để đối chiếu (không chia sẻ token/mật khẩu/dữ liệu cá nhân). Nếu có timeout khóa, đợi các thiết bị ngừng ghi rồi thử lại toàn file. Nếu báo đã cài hoặc cài một phần, chạy lại SQL chỉ đọc thay vì chạy lặp installer.

## File SQL kiểm tra và thay đổi gì?

- Chạy trong `BEGIN ... COMMIT`, lock timeout 5 giây, mỗi statement tối đa 60 giây.
- Chỉ nhận schema nền đúng loại cột, khóa chính, FK Auth, owner policy/RLS; so sánh nội dung hai RPC workspace với migration nền trong repo, bỏ qua khác biệt khoảng trắng. Nếu database có sửa riêng, script dừng để kiểm tra, không tự ghi đè phần sửa đó.
- Dừng khi thấy ledger, hàm bảo vệ hoặc trigger đã tồn tại; không cố sửa cài đặt dở dang và không xóa đối tượng nào.
- Khóa ghi ngắn trên sáu bảng workspace để không có đồng bộ chen ngang lúc kiểm tra/cài; các lần ghi đang chạy có thể khiến script timeout và rollback. Các lượt ghi mới có thể phải chờ trong thời gian cài.
- Nhúng **nguyên văn** `202610300001_habit_deletions.sql`: tạo ledger, owner RLS, triggers, RPC capability và bổ sung ledger vào kết quả `lbd_read_workspace`. Không sửa Auth, `lbd_commit_workspace`, bảng Task/Focus/Review hoặc cấu hình Vercel.
- Sao chép các tombstone hợp lệ đã có sang ledger để không phục hồi chúng. Không tự đánh dấu/xóa Habit GYM; thao tác đó vẫn do người dùng xác nhận trong app.
- Đối chiếu số dòng và fingerprint dữ liệu của **cả sáu bảng hiện có** trước/sau. Nếu khác, rollback toàn bộ. Fingerprint chỉ nằm trong bảng tạm, không in payload cá nhân.
- Sau khi cài, ghi Habit/Calendar phải đi qua phiên đăng nhập owner hợp lệ; SQL/admin scripts cập nhật trực tiếp không có `auth.uid()` có thể bị trigger từ chối. Đây là bảo vệ, không nên vô hiệu hóa trigger để vượt qua.

## Sao lưu và khôi phục

JSON tài khoản giúp bảo vệ dữ liệu của **tài khoản đó**, không phải bản backup toàn database, schema, Auth hay các tài khoản khác. Nếu cần phương án khôi phục toàn database, lưu snapshot/backup database theo khả năng của Supabase trước khi chạy; không cần project mới để lưu backup. File SQL không thể tự xác nhận backup ngoài hệ thống đã có.

Trước COMMIT, bất kỳ lỗi nào đều hủy transaction: đối tượng mới và backfill ledger không được giữ, dữ liệu hiện có không bị sửa. Script đã kiểm thử cả lỗi xảy ra sau khi tạo xong các đối tượng để xác nhận rollback.

Sau COMMIT, **không chạy “down migration”, không bỏ tombstone/trigger, không nhập lại JSON một cách mù quáng**: các thiết bị có thể đã bắt đầu đồng bộ. Nếu có bất thường, dừng chỉnh sửa, giữ backup và chẩn đoán để sửa tiến; khôi phục toàn database cần kế hoạch riêng vì có thể mất các thay đổi sau thời điểm backup. Script không cung cấp đường tắt tắt bảo vệ.

## Kiểm thử

`python3 scripts/test-habit-installer.py` chỉ dùng container local `lbd-auth-pg`, tạo database tên ngẫu nhiên và dọn đúng database đó sau mỗi ca. Không đọc thông tin đăng nhập managed Supabase. Kiểm tra schema tương thích, dữ liệu giữ nguyên, backfill, xóa GYM giả, gửi lại workspace cũ, RLS owner, từ chối chạy lại/cài một phần, đổi RPC/schema/RLS, tombstone không hợp lệ và rollback sau lỗi muộn.

Phần việc còn lại trên hệ thống thật: người dùng chạy SQL, xác nhận chín cờ và kiểm tra GYM trên MacBook/iPhone. Chưa thể khẳng định đã sửa database thật hoặc xóa được GYM thật trước các bước này.

Kết quả chạy ngày 31/10/2026: 8/8 kiểm thử installer/rollback đạt, build đạt, 66/66 unit test đạt và 4/4 kiểm thử tích hợp xóa Habit/đồng bộ trên Supabase localhost đạt. Bộ tích hợp dùng backend thử đã có migration; bộ installer riêng cài từ schema nền và kiểm tra bảo vệ dữ liệu bằng chính SQL mới. Không chạy lại toàn bộ UI vì không thay mã giao diện, logic ứng dụng hoặc asset. Logo và Hướng dẫn sử dụng không đổi.
