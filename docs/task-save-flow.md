# Một lần lưu: Task → Eisenhower → Calendar

## Cách dùng

- Task một lần: chọn nhóm, nhập **Ngày giờ dự kiến** và **Phút mỗi phiên Focus**, rồi bấm Thêm Task/Lưu Task. Ví dụ 31/10/2026 09:00, 60 phút → một Task thuộc Làm ngay và một block 09:00–10:00, cùng Task ID. Với Study Mode, thời lượng Calendar dùng tổng Focus + nghỉ như thiết lập hiện có; không sửa logic Timer.
- Task lặp: dùng các điều khiển hiện có. Bắt đầu 31/10/2026, T3/T6, 4 lần, 15:00–17:15 → 03, 06, 10, 13/11/2026. Mỗi lần có Task ID/block riêng, completion riêng và mở Focus đúng Task. Không cần dấu + hoặc kéo vào lịch.
- Không nhập giờ: vẫn lưu Task, giữ nhóm và hiển thị backlog chưa lên lịch; không đoán giờ. Có thể sửa chính Task đó, thêm ngày giờ và lưu để lên lịch, không tạo Task thứ hai.
- Khi tạo Task có ngày giờ, bảng Task chuyển đến ngày tương ứng, bỏ bộ lọc trạng thái đang che Task mới và mở nhóm ưu tiên đó; không thay layout.
- Có lịch trùng khi tạo lịch mới: hiển thị cảnh báo, giữ cả hai block để người dùng xem và điều chỉnh; không xóa/ghi đè lịch khác.

## Bảo vệ dữ liệu

Task và Planner dùng chung `persistTaskCalendar`: hai ghi đồng bộ, rollback JSON Task nếu ghi Planner thất bại, chỉ báo thành công sau khi cả hai ghi đạt. Đồng bộ tài khoản vẫn dùng RPC workspace/transaction và kiểm tra revision hiện có. Không đổi schema, policy, Auth hoặc cấu hình Supabase.

Task một lần chỉ bắt đầu tự lên lịch khi người dùng lưu qua form Task. Việc mở Calendar không tự chuyển toàn bộ gợi ý giờ của dữ liệu cũ thành lịch. Nếu Task đã có block thủ công, nhiều block hoặc lịch trùng cũ, giữ nguyên các bản ghi đó; không thêm block tự động và không tự dọn/xóa lịch trùng. Có thể xem và sửa/xóa từng block trong Calendar theo ý người dùng.

Block tự động một lần có ID ổn định `task-block:<task-id>` và metadata JSON `automaticTaskId`. Kéo/resize/chỉnh màu hoặc chuyển Task trên Calendar ghi `taskOverride`; lần lưu Task sau giữ lịch đã chỉnh riêng. Xóa block trực tiếp trong Calendar giữ dấu hủy và override để không tự mọc lại. Xóa Task sẽ hủy block tự động liên quan, không xóa Timer/Focus History. Xóa ngày giờ trên Task hủy lịch tự động chưa chỉnh riêng; chọn lại giờ rồi lưu có thể lên lịch lại đúng block đó. Không tạo block mới cho Task lịch sử đã hoàn thành hoặc có Focus.

Task lặp giữ nguyên cơ chế phiên bản quy tắc, giới hạn hữu hạn/không giới hạn theo khoảng hiển thị, completion riêng, tombstone và bảo vệ xóa qua RPC của các phiên bản trước. Chỉnh riêng một lần không sửa chuỗi; sửa tương lai bảo vệ lịch sử và block đã tùy chỉnh. Không áp dụng SQL lên project thật trong thay đổi này. Nếu project chưa cài RPC bảo vệ xóa Task lặp, thao tác xóa tài khoản vẫn bị chặn an toàn như trước.

Logo, hướng dẫn sử dụng, Checklist/tài liệu, layout Eisenhower/Calendar và LocalStorage V1 không đổi. Làm mới phiên bản V2 trên cả hai thiết bị trước khi dùng luồng mới.

## Kiểm thử

Unit bổ sung: Task một lần có/không giờ; ngày gợi ý cũ; nhiều block cũ không bị sửa; xung đột; chỉnh tay/xóa/hủy rồi lên lịch lại; giữ Task đã hoàn thành/Focus; xóa Task giữ dấu hủy block. Các unit Task lặp trước đây vẫn chạy.

Playwright desktop/mobile bổ sung: một lần lưu tạo đúng nhóm và block, màu và Focus theo đúng ID; thiếu giờ rồi thêm giờ; giữ lịch tùy chỉnh/trùng cũ; ví dụ 4 lần T3/T6 15:00–17:15, trạng thái riêng và Focus đúng lần. Các bài giới hạn ngày, không giới hạn, tương lai, reload và dữ liệu cũ tiếp tục chạy.

Integration mới dùng Supabase Auth/PostgREST/Postgres cục bộ, hai browser context desktop/mobile: lưu Task đơn, đồng bộ Task/Calendar, đổi giờ từ mobile, chỉnh tay Calendar, đổi tên Task không ghi đè lịch đã chỉnh, reload giữ một Task/một block. Không coi kết quả này là kiểm thử trên Supabase thật hoặc iPhone/Safari thật.

### Kết quả thực tế

- Build đạt (Vite vẫn cảnh báo bundle trên 500 kB).
- Unit: **112/112**, 17 file. Bao gồm chuyển Task một lần có block tự động tương lai sang Task lặp: chuyển đúng block đầu sang ngày hợp lệ, không nhân đôi; block đã chỉnh riêng được giữ.
- Toàn bộ Playwright desktop/mobile Chromium: **104/104**. Sau rà soát cuối, chạy lại nhóm tự lên lịch và luồng lưu: **14/14**.
- Toàn bộ integration trên backend cục bộ: **20/20**. Sau rà soát cuối, chạy lại hai bài đồng bộ Task đơn/Task lặp: **2/2**.
- Không chạy SQL trên Database thật, không đổi Production. Chưa kiểm thử trên MacBook/iPhone thật hoặc Safari; các phiên mobile ở đây là Chromium có kích thước màn hình/cảm ứng mô phỏng.

Các block cũ đã trùng vẫn được giữ nguyên để người dùng quyết định; không tự gộp hay xóa dữ liệu. Task có completion/Focus History được bảo vệ, không tự viết lại lịch sử. Tự lên lịch Task đơn không yêu cầu migration mới; việc xóa Task lặp vẫn giữ điều kiện RPC bảo vệ hiện có.
