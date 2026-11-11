# Giảm tải ghi workspace và quy trình khôi phục dịch vụ

**Cập nhật 11/11/2026:** đã tái hiện và chuẩn bị bản sửa vòng lặp retry SQLSTATE `40001` trên PostgREST 14.18. Chủ dự án đã chạy installer conflict protection, cung cấp diagnostics 5/5 true và báo app hoạt động bình thường trở lại. Xem [bản sửa conflict retry](workspace-conflict-retry.md). Chưa có số đo CPU mới hoặc kết quả kiểm thử xóa trên hai thiết bị thật.

## Bằng chứng và giới hạn

Ảnh Supabase thật do chủ dự án cung cấp cho thấy CPU cao, RPC đọc workspace trả HTTP 504, nhiều lượt `commit_workspace` hoạt động đồng thời và có thời điểm chờ khóa. Ảnh tiếp theo không còn root blocker; không đủ cơ sở hủy/terminate các PID. `running_seconds = 0` không chứng minh có truy vấn chạy lâu. Chưa có quyền kết nối Database thật trong phiên cloud này.

Code hiện tại của RPC `lbd_commit_workspace(bigint,jsonb)` xóa rồi chèn lại toàn bộ năm nhóm bản ghi của tài khoản trên mỗi lần lưu snapshot. Đây là thao tác trong transaction; không đồng nghĩa đã mất dữ liệu. Cách ghi này tạo tải thừa ngay cả khi phần lớn bản ghi không đổi.

## Bản sửa frontend

- So sánh nội dung chuẩn hóa trước khi gửi: thay đổi thứ tự bản ghi hoặc khóa JSON không tự tạo một lần upload mới. Thứ tự Checklist/Study Session vẫn có ý nghĩa và được giữ.
- Một snapshot vừa được chấp nhận không được gửi lại chỉ vì một sự kiện dirty lặp. Dấu xóa chỉ được coi là xác nhận sau server read-back như trước.
- Nếu lần tải đầu tiên thất bại, phải đọc lại máy chủ thành công trước khi tự ghi dữ liệu đang chờ gửi. Giữ bản cục bộ.
- Giãn retry tự động 6, 12, 24… tối đa 60 giây khi máy chủ liên tục lỗi. Nút retry cho phép thử chủ động; khi mạng thực sự kết nối lại, thử ngay để giữ trải nghiệm offline/reconnect.
- Không thay API, RLS, Auth hoặc schema phía frontend. CAS và cơ chế bảo vệ xung đột giữ nguyên.

## SQL đề xuất — chỉ áp dụng sau phê duyệt

[Installer](../supabase/manual/install_workspace_incremental_sync_safe.sql) thay **duy nhất định nghĩa RPC commit hiện có**, cùng chữ ký, quyền, `security invoker` và revision/CAS. Không thay đổi bản ghi ứng dụng trong lúc cài.

- Giữ kiểm tra payload và thêm từ chối ID trùng trước khi upsert.
- Kiểm tra revision cũ trước khi chờ khóa; vẫn khóa và kiểm tra lại revision để chống race.
- Chỉ xóa ID bị bỏ khỏi snapshot, chỉ thêm/sửa các bản ghi thay đổi. Calendar block vẫn chạy BEFORE INSERT guard vì bảo vệ block phụ thuộc ledger Habit ở bảng khác; bản ghi bằng nhau không được UPDATE lại.
- Giữ nguyên các trigger Habit/Task/Calendar và ledger. Không tắt RLS, không nâng quyền của client.
- Preflight chỉ chấp nhận đúng body RPC cũ đã review (`dcbb2c53e074c882117725609945812d`), schema/RLS nền đúng và guard đang bật. Dừng khi khác cấu trúc; không dùng DROP để vượt kiểm tra.
- Chụp hash/count tám bảng nền/ledger, khóa ghi ngắn với lock timeout 5 giây, thay function trong transaction và đối chiếu lại toàn bộ hash/count/quyền. Lỗi sẽ rollback. Không thực thi RPC ghi để thử trên tài khoản thật trong installer.

[Rollback function](../supabase/manual/rollback_workspace_incremental_sync_safe.sql) chỉ phục hồi định nghĩa cũ nếu đúng body mới; có cùng kiểm tra dữ liệu/quyền. Đây không phải restore dump hay đưa dữ liệu tài khoản về quá khứ. Backup dump chủ dự án đã có vẫn chưa được kiểm thử restore thật.

## Áp dụng và kiểm chứng thực tế

1. Chủ dự án duyệt installer và rollback; tạm đóng tab/app LBD trên các thiết bị để ngừng phát sinh lượt ghi cũ. Không xóa deployment, cache hoặc LocalStorage.
2. Chủ dự án chạy **toàn bộ** installer đúng project trong SQL Editor với role postgres. Chưa có kết nối để Codex tự thực hiện ở đây. Nếu lỗi preflight/lock timeout, dừng và gửi kết quả; không bỏ guard hoặc drop đối tượng.
3. Chạy [kiểm chứng chỉ đọc](../supabase/diagnostics/workspace_incremental_sync_readonly.sql), các cờ phải true. Body mới: `668421235f9dc67cc75cf459a10d045d`. Chạy thêm diagnostics deletion đã có nếu cần đối chiếu toàn bộ quyền/policy.
4. Mở một Preview V2 mới nhất trên Mac, đợi đồng bộ; kiểm tra đọc/ghi Task tạm và giữ Task/Checklist/Focus History cũ. Sau đó mở cùng URL trên iPhone, kiểm tra nhận thay đổi, reload và xóa Habit/Task lặp tạm. Chỉ thử trên dữ liệu thật cần xóa khi chủ tài khoản chủ động chọn.
5. Đối chiếu API logs xem RPC đọc còn 504 và CPU/ghi còn dồn hàng hay không. Cảnh báo CPU là số liệu theo cửa sổ thời gian, không phải bằng chứng tức thời để tuyên bố đã phục hồi. Dùng một URL nhánh ổn định sau khi xác nhận để tránh đổi origin/cold cache giữa các deployment.

Không tuyên bố đã mở lại dịch vụ thật hoặc sửa dứt điểm 504 chỉ dựa vào kiểm thử local.

## Kiểm thử cục bộ

`python scripts/test-incremental-sync.py` chỉ tạo/xóa database tên ngẫu nhiên trong container test `lbd-auth-pg`, không truy cập project thật. Bảy nhóm kiểm tra gồm không-op, ghi đúng phần thay đổi, rollback function, lỗi payload/revision, chống phục hồi Habit/Task, guard block, RLS owner, từ chối schema lạ, rollback lỗi cài đặt và từ chối revision cũ khi có khóa đang giữ.

Với fixture 1.007 bản ghi con không đổi: hàm cũ tạo **1.007 DELETE + 1.007 INSERT**; bản mới tạo **0 DELETE + 0 INSERT + 0 UPDATE** trên các bảng con. Header workspace vẫn giữ quy tắc tăng revision đã có. Đây là số lần ghi đo ở local, không phải số đo phần trăm CPU hay latency của project thật.

Kết quả ở commit `0deb73f`: build thành công, **142/142 unit**, **120/120 kiểm thử giao diện**, **27/27 kiểm thử tích hợp Auth/sync** và **7/7 nhóm SQL** đạt. Bộ tích hợp chạy với RPC incremental đã cài trong backend Docker cục bộ; gồm đồng bộ hai tài khoản/thiết bị, offline/reconnect và bảo vệ xóa Habit/Task. Truy vấn kiểm chứng chỉ đọc trả **11/11 cờ true** tại backend này. Các kiểm thử trình duyệt dùng Chromium desktop/mobile; chưa kiểm tra Safari/iPhone thật hoặc độ trễ/CPU Supabase thật.

## Cập nhật vận hành và sửa trạng thái retry — 08/11/2026

Chủ dự án đã phê duyệt, chạy installer incremental và cung cấp kết quả thành công cùng hai ảnh diagnostics đủ **11/11 cờ true** trên project thật. Sau đó API vẫn trả `PGRST002`; log PostgREST còn có `PGRST003` (timeout chờ kết nối từ pool). Chủ dự án phê duyệt và thực hiện restart project, Dashboard trở lại Healthy nhưng ảnh vẫn hiển thị CPU 100%. Healthy không xác nhận mọi API đã phục hồi. Không có kết nối trực tiếp từ phiên cloud để đo độc lập.

Ảnh app sau restart tiếp tục đứng ở “Đang thử kết nối lại…”. Tái hiện cục bộ tìm thấy một lỗi frontend độc lập: `retry()` đặt trạng thái loading nhưng nhánh đọc thành công cùng revision chỉ hoàn tất nếu trạng thái trước đó là error. Vì vậy một yêu cầu đã thành công vẫn có thể để nút bị khóa. Sửa nhánh này để hoàn tất loading khi đọc thành công, đồng thời kiểm tra dirty mới phát sinh trong lúc đọc và giữ trạng thái pending cho chỉnh sửa đó. Không thay SQL, API hoặc giao diện chức năng.

Ba regression unit thất bại trên code cũ và đạt sau sửa. Bản sửa đạt **145/145 unit**, build và **6/6 kiểm thử tích hợp startup/retry** với backend incremental Docker, trên Chromium desktop/mobile. Bộ tích hợp kiểm tra retry dữ liệu cùng revision, lỗi 503 tạm thời rồi phục hồi, không ghi thừa hoặc tăng revision, giữ Task cũ và bảo vệ cache/chỉnh sửa trong lúc tải. Không chạy lại toàn bộ bộ giao diện/tích hợp; các số ở commit trước vẫn là kết quả trước đó.

Chưa xác nhận sync, CPU hoặc xóa trên môi trường thật sau restart. Khi mở Preview mới để kiểm tra, giữ tab/origin cũ và bản cục bộ có thay đổi chưa đồng bộ; LocalStorage không tự chuyển giữa các hostname deployment.
