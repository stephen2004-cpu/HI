# Phạm vi sửa và xóa Task lặp

Bấm **Sửa**, đổi màu/tên/ghi chú/nhóm hoặc nội dung khác rồi **Lưu Task**: chọn **Chỉ lần này** hoặc **Toàn bộ chuỗi lặp**. Hủy lựa chọn giữ bản nháp, chưa ghi thay đổi. Chuyển nhóm qua menu hoặc kéo thẻ cũng hỏi phạm vi. Đánh dấu hoàn thành vẫn chỉ áp dụng cho lần đang chọn.

Ví dụ: “Ăn sáng” lặp T2–CN. Đổi hồng sang xanh và chọn toàn bộ → các lần hiện có và các lần sinh sau dùng màu xanh. Ghi chú riêng không vừa sửa, completion, Actual Output và tiến độ Checklist của từng ngày vẫn giữ. Chỉ các trường thực sự thay đổi kể từ lúc mở biểu mẫu được áp dụng chung. Checklist/tài liệu sửa trong biểu mẫu Task lặp là bản nháp đến khi chọn phạm vi và lưu. Không nhân bản file nhị phân. Các lần hoàn thành hoặc có Focus giữ Checklist và thời gian đã ghi; lịch chỉnh tay không bị ghi đè.

**Các lần tương lai** vẫn giữ cách dùng trước: chọn rõ phạm vi trong biểu mẫu để tạo phiên bản quy tắc mới, giữ hôm nay/quá khứ, lần hoàn thành, có Focus hoặc đã chỉnh riêng. Sửa toàn bộ không biến mọi lần bình thường thành một lần chỉnh riêng; chúng vẫn có thể nhận chỉnh sửa tương lai sau này.

Bấm **Xóa** trên thẻ hoặc **Xóa vĩnh viễn** trong biểu mẫu Task lặp:

- **Chỉ lần này**: xóa đúng ngày đã chọn, không sinh lại ngày đó; chuỗi vẫn tiếp tục.
- **Toàn bộ chuỗi lặp**: ẩn tất cả lần của chuỗi và ngừng sinh mới. Các Time Block liên kết, kể cả lịch thủ công của chuỗi, được hủy khỏi lịch. Task độc lập, Habit và lịch sử Focus giữ nguyên.

Xóa dùng dấu xóa bền vững (`deletedAt`), không xóa vật lý lịch sử. Root của chuỗi và các lần được giữ trong JSON/sao lưu để dữ liệu cũ không làm chuỗi xuất hiện lại. Giữ nguyên dấu xóa cũ của từng lần. Root gửi trước các lần; máy chủ hoàn tất xử lý chuỗi/lịch sau câu lệnh ghi để không xung đột với upsert nhiều Task trong cùng lượt. Cả payload cũ gửi root cuối cũng được bảo vệ. Không tạo hàng nghìn lượt đồng bộ riêng.

## Bảo vệ Supabase và bước còn lại trên project thật

Sửa màu/nội dung chung dùng API workspace hiện có. Xóa riêng dùng `lbd_task_repeat_capabilities()` phiên bản 1 hiện có. Xóa toàn bộ trên tài khoản yêu cầu **RPC mới** `lbd_task_series_deletion_capabilities()` trả về 1. Nếu chưa cài, UI báo chưa bật và **không sửa dữ liệu cục bộ**. Chế độ khách dùng dấu xóa cục bộ.

Installer đã chuẩn bị: [install_task_series_deletions_safe.sql](../supabase/manual/install_task_series_deletions_safe.sql). **Chưa chạy trên Supabase thật; chỉ áp dụng sau khi chủ tài khoản chấp thuận.** Không cần sửa Vercel Production hoặc xóa deployment cũ.

Installer chỉ mở rộng guard Task hiện có, thêm guard hoàn tất theo câu lệnh, guard Calendar và capability; dùng ledger hiện có. Không đổi bảng/owner/RLS/quyền của workspace; không thay thân `lbd_commit_workspace` đã sửa lỗi CPU (hash `3f50887f07c901afc81c32237eeb8a7e`). Không phát lại SQLSTATE 40001 gây vòng retry của PostgREST 14.18. Trước/sau cài so sánh số hàng/hash của 8 bảng app/ledger, sai lệch tự rollback. Bản guard/schema/quyền ngoài cấu hình đã kiểm tra sẽ bị từ chối. Cài lại cũng bị từ chối; dùng diagnostics trước khi xử lý.

Khi được chấp thuận:

1. Xuất sao lưu tài khoản trên thiết bị có dữ liệu mới nhất; dừng chỉnh sửa, đóng các tab app còn lại trên hai máy.
2. Đúng project `lbd-focus-db` (`vsfoytltixprwluxajyi`), SQL Editor role `postgres`, chạy **toàn bộ** installer một lần. Thông báo thành công phải là “Task series deletion protection installed. Existing app rows unchanged…”. Nếu lỗi, dừng và giữ nguyên app.
3. Chạy [task_series_readonly.sql](../supabase/diagnostics/task_series_readonly.sql): cả **9 cột true**. Đây chỉ là xác nhận cấu hình, chưa chứng minh đồng bộ tài khoản thật.
4. Mở cùng Preview mới trên hai thiết bị, cùng tài khoản; chờ Đã đồng bộ. Tạo một Task thử lặp 3 lần. Đổi màu cả chuỗi, kiểm tra trên máy kia. Xóa một lần, rồi xóa cả chuỗi còn lại; reload hai máy và kiểm tra không quay lại. Chỉ dùng với công việc thật sau khi thử đạt.

## Kiểm chứng cục bộ

- Unit: dấu xóa root chặn cả ngày chưa từng tải; giữ dấu xóa cũ; đổi chung chỉ các trường sửa; tiến độ/tài liệu riêng; lần đã Focus; chỉnh tương lai sau đổi màu chung; hủy lịch liên kết, không đụng Task khác.
- UI Chromium desktop/mobile: hỏi phạm vi trước khi ghi, hủy giữ bản nháp, đổi màu/tên/nhóm chung, xóa riêng/toàn bộ, reload; lỗi ghi Planner rollback toàn bộ Task/Calendar.
- Integration hai thiết bị trên Auth/PostgREST **14.18**/PostgreSQL cục bộ: đổi màu, chặn capability thiếu, xóa chuỗi và stale/offline peer; payload cũ ở revision mới cũng không phục hồi root, ngày mới hoặc Time Block.
- `python3 scripts/test-task-series.py`: 8 nhóm kiểm tra SQL trên database Docker tạm, gồm owner isolation, dữ liệu/RPC/RLS giữ nguyên khi cài, cascade, stale replay, malformed tombstone và rollback. Bài 1.000 Task/Time Block bổ sung dùng để kiểm tra cascade không quét Calendar một lượt cho mỗi Task; thời gian cục bộ không phải cam kết hiệu năng máy chủ thật.

Chưa xác nhận Preview của Vercel, iPhone/Safari thật hoặc Supabase thật đã chạy bản mới. Pipeline V2 hiện có thêm bài SQL mới; không thay workflow Production.

### Kết quả ngày 14/11/2026

Build/TypeScript đạt; **155/155 unit**, **126/126 UI desktop/mobile**, **30/30 integration tài khoản** trên backend cục bộ PostgREST 14.18, **30/30 smoke trên bản build Preview** (gồm lựa chọn phạm vi mới). **8/8 nhóm SQL series** và **4/4 nhóm kiểm tra bảo vệ vòng retry** đạt. Cả 9 cột diagnostics đều true trên database thử. Đã xem ảnh render lựa chọn trên màn hình 390 px. Các kết quả này không xác nhận deployment Vercel hoặc Supabase thật đã được cập nhật.
