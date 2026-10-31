# Khôi phục chức năng xóa Habit và Task lặp

## Trạng thái được xác nhận

Không có kết nối tới project Supabase thật trong môi trường làm việc này. Chưa chạy SQL cài đặt hay xóa GYM/`qwqr` thật. File SQL trong GitHub không chứng minh migration đã được áp dụng.

- Habit: theo chẩn đoán thật người dùng cung cấp trước đó, bảng nền đã có, nhưng ledger, capability RPC, trigger và workspace read có tombstone chưa được cài. Installer Habit hiện có vẫn được giữ nguyên.
- Task lặp: app không kiểm tra được capability RPC. Thông báo cũ chưa phân biệt thiếu RPC/cache, thiếu quyền, phiên hết hạn hay mạng; chưa đủ bằng chứng để khẳng định ledger/trigger trên project thật đều thiếu. SQL chỉ đọc dưới đây sẽ xác định từng thành phần.

| Hệ thống | Thành phần cần có trên cùng project với app |
| --- | --- |
| Habit | `lbd_habit_deletions`, RPC `lbd_habit_deletion_capabilities()`, trigger/function bảo vệ Habit và Calendar block, `lbd_read_workspace()` đọc ledger bền vững |
| Task lặp | `lbd_task_repeat_deletions`, RPC `lbd_task_repeat_capabilities()` và `lbd_read_task_deletions()`, trigger/function `guard_deleted_repeat_task` / `lbd_guard_deleted_repeat_task()` |
| Cả hai | Forced RLS, policy SELECT chỉ owner trên ledger, không cho client ghi/xóa ledger, authenticated có EXECUTE đúng RPC và anon không có quyền |

Task không cần thêm trigger Calendar: app loại các block của Task có tombstone, hủy block tự động và đồng bộ đọc thêm Task ledger, kể cả khi client cũ bỏ hàng Task khỏi snapshot. Habit có trigger block riêng theo migration hiện có.

## SQL chính xác, không tạo đối tượng trùng

1. **Chẩn đoán cả hai, chỉ đọc:** [deletion_readonly.sql](../supabase/diagnostics/deletion_readonly.sql). Không đọc tên Task, email, token hoặc payload cá nhân; chỉ metadata. Script trả chín cờ Habit, chín cờ Task, policy và quyền. Sau cài, mọi cờ chính/quyền phải true; policy chỉ SELECT của authenticated với `auth.uid() = user_id`.
2. **Habit:** [install_habit_deletions_safe.sql](../supabase/manual/install_habit_deletions_safe.sql), giữ installer đã có; không tạo migration Habit thứ hai.
3. **Task:** [install_task_repeat_deletions_safe.sql](../supabase/manual/install_task_repeat_deletions_safe.sql), wrapper an toàn cho đúng phần DDL của migration `202610310002_task_repeat_deletions.sql`. Vẫn dùng nguyên tên bảng/hàm/trigger, không tạo bộ thứ hai. Không chạy cả installer và migration gốc lần nữa.

Installer từ chối nếu đối tượng đã có hoặc cài dở, kể cả RPC trùng tên nhưng khác overload. Không dùng `IF NOT EXISTS` để che trạng thái cài dở, không DROP ledger/hàm và không nới RLS. Nếu chín cờ đã true và quyền/policy đúng, bỏ qua installer tương ứng, kiểm tra app/API thay vì cài lại.

Mỗi installer chạy **một transaction độc lập**, có timeout khóa 5 giây và câu lệnh 60 giây. Kiểm tra postgres role, Auth, sáu bảng/cột/kiểu/PK/FK, owner RLS/policy trước khi đổi schema. Khóa ghi ngắn, so số hàng/hash sáu bảng trước/sau; không cập nhật/xóa hàng Task, Habit, Calendar, Focus hoặc Review. Chỉ backfill các dấu xóa đã tồn tại vào ledger. Sai cấu trúc, dữ liệu marker hoặc postflight → rollback. SQL không in payload/hash của tài khoản.

Habit installer kiểm tra đúng body workspace RPC nền vì nó thay `lbd_read_workspace()` để hợp nhất ledger. Task installer không thay workspace RPC; chấp nhận signature/security phù hợp trước hoặc sau Habit installer. Đã thử cả hai thứ tự trên database tạm; khuyến nghị Habit trước, Task sau. Nếu Habit commit thành công nhưng Task lỗi, giữ bảo vệ Habit đã cài, kiểm tra Task riêng; không gỡ Habit.

## Thao tác trên Supabase thật — chỉ sau khi chủ project phê duyệt

1. Giữ JSON tài khoản, chuẩn bị thêm **Database backup/snapshot hoặc pg_dump có thể khôi phục** (bao gồm schema, policy, function và dữ liệu). JSON không thay được backup Database. Xác định đúng project/endpoint và phương án restore. Tạm ngừng sửa app trên MacBook/iPhone.
2. SQL Editor → đúng project, role postgres → chạy toàn bộ `deletion_readonly.sql`. Nếu trạng thái cài dở hoặc policy khác dự kiến, dừng để xem xét. Các cờ cơ bản chưa đủ thay cho preflight cấu trúc của installer.
3. Sau khi phê duyệt, chạy toàn bộ installer **Habit nếu chưa cài**, rồi toàn bộ installer **Task nếu chưa cài**. Không bôi đen chạy từng đoạn. Nếu lỗi, dừng; transaction không được báo là thành công. Nếu SQL Editor giữ transaction lỗi, chạy `ROLLBACK;` trước truy vấn tiếp theo, không bỏ precondition để thử lại.
4. Chạy lại chẩn đoán: chín cờ mỗi hệ thống và các cờ quyền đều true, policy đúng owner. Installer đã gửi `NOTIFY pgrst, 'reload schema'` khi commit. Nếu SQL đúng nhưng app vẫn PGRST202: kiểm tra app Preview đang dùng đúng `VITE_SUPABASE_URL`, đợi API cache, làm mới hai thiết bị. Khi đã xác nhận đúng project và có quyền, có thể gửi lại duy nhất `NOTIFY pgrst, 'reload schema';` trong SQL Editor. Không đổi key, tắt RLS hoặc tạo project mới để vượt lỗi. SQL metadata không tự chứng minh API cache đang nhận diện RPC.
5. Thử Habit tạm và Task lặp tạm trước, giữ lịch sử Habit mặc định. Đợi máy chủ xác nhận đồng bộ xóa, kiểm tra Calendar ngày/tuần/tháng, tải lại, đăng nhập lại và thiết bị còn lại sau reconnect. So Task độc lập, Focus History và Checklist với backup. Sau đó mới chủ động xóa GYM/`qwqr` theo ý bạn.

Không tự gỡ ledger để rollback sau khi đã xóa dữ liệu trong app: việc đó có thể cho thiết bị cũ khôi phục dữ liệu. Nếu cần restore Database sau một lần cài đã commit, dừng các client và đánh giá dữ liệu/tombstone phát sinh từ lúc backup; không restore mù toàn bộ project và không xóa cache/LocalStorage.

## Ý nghĩa trạng thái xóa

- RPC thiếu/quyền/mạng/phiên lỗi: giữ Task/Habit và báo **chưa xóa**; không có local marker giả để che lỗi.
- Sau capability hợp lệ và ghi được: đã ghi dấu xóa trên thiết bị, có thể còn chờ đồng bộ/xử lý xung đột.
- Chỉ phản hồi revision từ commit không đủ: sync đọc lại server, đối chiếu tombstone trước khi coi là đồng bộ thành công. Habit có bảng trạng thái xác nhận; Task thông báo chờ đồng bộ và dùng trạng thái sync hiện có.
- Thiết bị offline có thể còn thấy dữ liệu cũ cho đến khi nhận được tombstone; ledger ngăn dữ liệu đó khôi phục lên server khi reconnect.
- Xóa Task lặp hiện là **xóa riêng lần đang chọn**, không tự xóa toàn bộ chuỗi. Các lần khác cùng tên có thể vẫn tồn tại đúng quy tắc. Muốn dừng tương lai: sửa phạm vi tương lai → Không lặp. Đây không phải hiện tượng phục hồi lần đã xóa.
- Ledger giữ dấu xóa (và payload bảo vệ); không gọi đây là xóa vật lý toàn bộ dữ liệu cá nhân. Giữ mặc định lịch sử Habit, không xóa Task độc lập/Focus History.

## Kiểm thử và giới hạn

SQL tests chỉ chạy trên database ngẫu nhiên trong Docker local, không dùng URL/credentials của Supabase thật: cài cả hai thứ tự, kiểm tra chẩn đoán/quyền, backfill, stale writes, owner isolation, từ chối cài dở/overload/policy/cột/marker lạ, rollback khi lỗi cuối hoặc dữ liệu bị thay đổi trong quá trình cài. Các bài installer Habit và Task migration cũ vẫn chạy.

Unit/UI/API tests kiểm tra capability thiếu, phiên hết hạn, 403, lỗi server, phiên bản sai: thông báo Task rõ hơn, không hiển thị raw server message nhạy cảm và không đổi Task trước khi xác nhận. Bộ đồng bộ cục bộ kiểm tra stale/offline/reload và bảo toàn lịch sử. Không đồng nhất các kết quả này với việc đã sửa GYM/`qwqr` trên project thật hoặc đã thử iPhone/Safari thật.

### Kết quả lần cập nhật này

- `npm run build`: đạt; Vite vẫn cảnh báo bundle trên 500 kB.
- Unit: **120/120**, 18 file.
- Playwright desktop/mobile Chromium: **104/104**.
- Integration Auth/PostgREST/Postgres cục bộ: **21/21**, gồm mobile RPC 404/403/401/500 và capability phiên bản sai, không đổi Task trước xác nhận; stale/offline/reload, RLS, dữ liệu cũ và Focus History.
- SQL: **19/19** kịch bản: 8 Habit installer, 3 Task migration, 8 installer kết hợp/an toàn mới. Chỉ database tạm trong container local, không project thật.
- Chưa áp dụng installer trên Supabase thật, chưa chạy chẩn đoán project thật ở lần làm việc này, chưa xóa GYM/`qwqr` thật; chưa kiểm thử iPhone/Safari thật.
