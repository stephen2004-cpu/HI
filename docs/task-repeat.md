# Task lặp — LBD Focus V2

## Sử dụng

Trong Tạo/Chỉnh sửa Task, **Không lặp** là mặc định. Chọn **Chọn ngày trong tuần**, ngày bắt đầu và các ngày T2–CN (có thể chọn cả 7), rồi chọn không giới hạn, sau N lần hoặc đến ngày cụ thể (bao gồm ngày kết thúc). Bản xem trước hiển thị các ngày tiếp theo. Ngày bắt đầu không khớp thứ đã chọn thì lần đầu là ngày phù hợp kế tiếp. Ngày bỏ lỡ vẫn tiêu thụ giới hạn; Timer không tự hoàn thành Task.

Mỗi ngày có Task riêng với completion/Checklist/Actual Output riêng. Checklist và metadata tài liệu được sao chép; không nhân bản file nhị phân hoặc đưa file vào LocalStorage. File giữ đường dẫn Storage và quyền tài khoản hiện có. Khi bật lặp trên Task cũ, giữ ID, tiến độ và tài liệu của lần gốc; các lần mới bắt đầu chưa hoàn thành. Calendar và Focus hiển thị ngày cạnh tên để phân biệt các lần. Task lặp có **Ngày giờ dự kiến** sẽ tự tạo Time Block. Nhập **Giờ kết thúc Task lặp** để chọn khung giờ cụ thể; nếu để trống, dùng tổng thời lượng Focus + nghỉ hiện có (không sửa Timer). Chưa có giờ bắt đầu thì không đoán giờ, không tạo block và hiển thị nhắc thiết lập giờ. Task không lặp giữ cách lên lịch thủ công.

Sửa một lần chỉ thay lần đó. **Các lần tương lai** tạo phiên bản quy tắc mới từ ngày tương lai đã chọn, hoặc ngày mai nếu chọn hôm nay/quá khứ; không viết lại hôm nay, lịch sử, lần đã hoàn thành, đã có Focus hoặc đã chỉnh riêng. Checklist/tài liệu trong biểu mẫu sửa tương lai là bản nháp đến khi bấm Lưu Task. Tắt lặp trong phạm vi tương lai ngừng các lần mới, giữ lịch sử. Giới hạn N là tổng số lần đã lên lịch của chuỗi qua các phiên bản; tăng từ 5 lên 10 cho phép tối đa tổng 10 lần. Quy tắc ngày mới có hiệu lực từ ngày hiển thị. Các lần cũ có tiến độ vẫn được giữ dù không còn nằm trong quy tắc mới.

## Dữ liệu và giới hạn

Quy tắc và template lưu trong JSON Task hiện có, không đổi bảng Task hoặc phiên bản LocalStorage. Bản ghi gốc của chuỗi được ẩn khỏi UI; các lần có `repeatSeriesId`, `repeatDate`, ID ổn định. Chuỗi hữu hạn có giờ được sinh đầy đủ ngay lúc lưu, kể cả ngoài tuần đang xem, theo các khoảng tối đa 61 ngày. Chuỗi không giới hạn chỉ sinh theo khoảng đang xem (tối đa 62 ngày), không tạo vô hạn ngay lúc lưu. Giới hạn bảo vệ: tối đa 10.000 lần/chuỗi hữu hạn và khoảng ngày tối đa 366.000 ngày; vượt giới hạn thì báo lỗi trước khi ghi dữ liệu. Preview tối đa 6 ngày trong 370 ngày tìm kiếm. Bản sao lưu JSON bao gồm template, các phiên bản quy tắc, lần xuất hiện và dấu xóa. Không xóa LocalStorage V1.

Xóa trong UI là **xóa riêng lần đang chọn**; các lần khác tiếp tục. Dấu `deletedAt` ngăn sinh lại ngày đó. Đây không phải cam kết xóa vật lý hoàn toàn dữ liệu cá nhân. Với tài khoản, phải có RPC/migration bảo vệ dưới đây trước khi cho phép xóa lần Task lặp. Khi thiếu RPC, app báo “Chưa xóa Task” và không tạo dấu xóa giả. Tạo/sửa/lặp vẫn dùng JSON Task hiện có. Guest dùng dấu xóa trên thiết bị; không có đồng bộ tài khoản khi ở chế độ khách.

Cần cập nhật ứng dụng trên cả hai thiết bị trước khi dùng Task lặp; phiên bản cũ chưa hiểu template/quy tắc mới. Không có thao tác xóa cả chuỗi trong bản này; chọn sửa tương lai → Không lặp để dừng chuỗi, giữ lịch sử.

## Supabase: hai thay đổi riêng biệt, đều chưa áp dụng trên project thật

### A. Habit GYM vẫn cần installer hiện có

Chẩn đoán người dùng cung cấp xác nhận thiếu ledger/RPC/guard. Sửa UI không thể cài SQL. File đúng: `supabase/manual/install_habit_deletions_safe.sql`; không chạy bản migration Habit thô thay installer.

Installer kiểm tra role postgres có quyền bypass RLS, Auth, đủ 6 bảng nền, cột/kiểu/PK/FK, forced RLS và owner policy, chữ ký/nội dung hai workspace RPC nền, không có cài đặt dở và dấu xóa hợp lệ. Toàn bộ chạy trong transaction, lock timeout 5 giây/statement timeout 60 giây; đối chiếu số dòng và hash 6 bảng trước/sau. Không xóa Habit hoặc sửa payload hiện có. Sai precondition thì rollback; không bỏ kiểm tra, drop ledger hoặc nới RLS để vượt lỗi. Chưa kiểm tra schema thực tế bằng quyền kết nối project của người dùng; 9 cờ trước đây chưa đủ chứng minh toàn bộ precondition.

Quy trình ngắn (chỉ chủ project thực hiện sau khi xem xét/chấp thuận):

1. Giữ JSON đã tải; chuẩn bị thêm **database backup/snapshot hoặc pg_dump** có thể khôi phục, ghi lại project và phương án restore. JSON tài khoản không thay được backup database. Tạm ngừng sửa app trên MacBook/iPhone.
2. SQL Editor của **đúng project** → role postgres → chạy toàn bộ `supabase/diagnostics/habit_deletion_readonly.sql`, kiểm tra trạng thái trước. Nếu có phần đã cài, dừng để xem xét.
3. Chạy **toàn bộ** `supabase/manual/install_habit_deletions_safe.sql` một lần. Nếu lỗi: dừng, không xóa bảng/chạy rời từng đoạn. Transaction thất bại không cài một phần; đóng transaction lỗi bằng ROLLBACK nếu SQL Editor giữ kết nối.
4. Chạy lại diagnostics: **cả 9 cờ phải true**, policy ledger chỉ SELECT của owner. Installer có yêu cầu reload API schema cache; nếu RPC còn chưa hiện, kiểm tra project/endpoint và chờ cache cập nhật, không bỏ qua RPC.
5. Tải lại Preview mới trên cả hai máy. Thử với Habit tạm trước, mặc định giữ lịch sử, đợi thông báo xác nhận từ server; kiểm tra tải lại/đăng nhập lại và lịch ngày/tuần/tháng trên cả hai máy. Sau đó mới xóa GYM theo ý bạn. Đối chiếu Task độc lập và Focus History với backup. Dấu xóa vẫn được giữ để chống khôi phục.

Không tuyên bố lỗi GYM trên project thật đã được sửa cho đến khi hoàn tất các bước trên. Sau khi có dấu xóa thật, không gỡ ledger để rollback; khôi phục cần đánh giá toàn bộ snapshot/thiết bị, tránh phục hồi dữ liệu đã xóa.

### B. Bảo vệ xóa Task lặp

Sau backup và xác nhận riêng, chạy toàn bộ `supabase/migrations/202610310002_task_repeat_deletions.sql` trong SQL Editor. Đây là migration bổ sung ledger/trigger và hai RPC có RLS owner; không đổi RPC workspace hay dữ liệu Task/Focus/Habit hiện có, không xóa dòng. Không chạy lại nếu đã/đang cài một phần. Chạy `supabase/diagnostics/task_repeat_readonly.sql` và yêu cầu tất cả cờ true, chỉ owner có SELECT ledger. Không chỉnh SQL để bỏ qua precondition.

Task ledger độc lập với Habit installer: đã kiểm thử cài Task trước rồi Habit trong database tạm. Đồng bộ đọc thêm ledger để giữ dấu xóa kể cả khi snapshot từ client cũ bỏ bản ghi Task. Client không có quyền sửa/xóa ledger hoặc đọc dấu xóa của tài khoản khác.

## Kiểm thử và phạm vi xác nhận

Unit: số lần 5/10/20, mọi thứ trong tuần, ngày lệch, ngày kết thúc, sửa tương lai, dữ liệu cũ/tài liệu, không trùng và dấu xóa. Playwright: desktop/mobile Chromium, form, tiến độ từng lần, sửa riêng/tương lai, draft tài liệu, reload, không tự tạo block khi thiếu giờ và tự lên lịch khi có giờ. Integration: backend Auth/PostgREST/Postgres **cục bộ**, hai browser context, offline/reconnect, thiếu RPC, xóa/đọc lại/legacy snapshot, RLS tài khoản. SQL tests dùng database tạm kiểm tra rollback, preconditions và tương thích Habit installer.

Không đồng nhất mô phỏng mobile Chromium với iPhone/Safari thật; không chứng minh đồng bộ trên Supabase thật khi chưa cài và thử migration ở đó. Không thay main, logo, hướng dẫn sử dụng hoặc Production.

## Kết quả phiên bản Task lặp ban đầu (trước tự lên lịch)

- `npm run build`: đạt (còn cảnh báo bundle trên 500 kB, không phải lỗi build).
- `npm test`: 16 file, **97/97** bài đạt.
- `npx playwright test`: **90/90** bài đạt trên desktop/mobile Chromium; bao gồm Timer, Study Mode, branding và hướng dẫn sử dụng.
- `npx playwright test --config playwright.auth.config.ts`: **18/18** bài đạt trên Supabase Auth/PostgREST/Postgres cục bộ, gồm đồng bộ hai context, thiếu RPC và stale/offline deletion.
- `python scripts/test-task-repeat-db.py`: **3/3** kịch bản SQL đạt.
- `python scripts/test-habit-installer.py`: **8/8** kịch bản SQL đạt.
- Xem ảnh điều khiển thực tế: [Desktop](ui-preview/task-repeat-desktop.png), [Mobile](ui-preview/task-repeat-mobile.png); không thấy tràn ngang tại 1440px/390px.

Chưa kiểm thử trên iPhone/Safari thật hoặc Supabase project thật. Chưa áp dụng migration, chưa thử xóa GYM thật. Không xác nhận Vercel Preview mới đã build nếu chưa có kết quả deployment của Vercel.


## Bổ sung tự lên lịch Time Block

Ví dụ đã kiểm thử: bắt đầu 31/10/2026, T3/T6, 4 lần, 09:00–11:15 → đúng 03, 06, 10, 13/11/2026. Không cần dấu +; số lần đã bỏ lỡ vẫn tính trong giới hạn. Sửa riêng thay đúng một block tự động; sửa tương lai cập nhật các block tự động đủ điều kiện, giữ quá khứ, Task hoàn thành/đã Focus và block đã kéo/resize/chỉnh riêng. Tắt lặp hủy các block tự động tương lai; dấu hủy được lưu để không tự tạo lại. Xóa một lần Task giữ tombstone và loại block liên quan khỏi lịch.

Thời gian và metadata nguồn lặp lưu trong JSON Task/Time Block hiện có (`repeatSchedule`, `plannedEndTime`, `recurringTaskId`, `taskOverride`), không đổi schema Supabase và không áp dụng SQL thật. ID block ổn định theo ID Task; nếu Task đã có bất kỳ block thủ công hoặc block hủy, không tạo thêm block tự động. Chỉnh Calendar vẫn giữ nguyên thao tác kéo/resize. Các block trùng lịch được giữ và hiển thị cảnh báo, không ghi đè block khác.

Task lặp cũ: nếu lần gốc đã có ngày giờ dự kiến, dùng giờ đó và thời lượng Focus/nghỉ đã lưu để lên lịch các lần còn thiếu. Không suy đoán giờ từ một block đã kéo riêng; không ghi đè block thủ công, block có nhiều lịch hoặc block đã hủy. Nếu trước đây chỉ chọn thứ, mở Chỉnh sửa → Các lần tương lai → chọn ngày giờ dự kiến/giờ kết thúc → Lưu Task. Lần đã hoàn thành hoặc đã Focus được giữ nguyên.

Task và Calendar được ghi cùng lượt đồng bộ; nếu ghi Planner lỗi, phục hồi JSON Task trước thao tác và không báo thành công. Dữ liệu LocalStorage V1 không bị thay đổi. Việc xóa Task lặp tài khoản vẫn yêu cầu RPC bảo vệ đã mô tả ở trên; bản bổ sung này không bỏ qua RPC và không tự cài migration.

### Kiểm chứng bản tự lên lịch

- Build đạt; còn cảnh báo bundle lớn hơn 500 kB của Vite.
- Unit **106/106** (17 file): lịch 4 lần, ngày kết thúc, không giới hạn, đổi thứ tương lai, completion riêng, lịch cũ, xóa/dừng, chống trùng, trùng lịch, lỗi lưu Planner và thời lượng Focus qua đêm.
- Toàn bộ Playwright desktop/mobile Chromium **96/96**; chạy lại riêng **6/6** bài tự lên lịch sau rà soát cuối.
- Toàn bộ integration trên Auth/PostgREST/Postgres cục bộ **19/19**; bài mới tạo 4 block qua UI, đồng bộ hai context desktop/mobile, sửa một lần, xóa và reload; chạy lại riêng bài này sau rà soát cuối.
- Không thay đổi/chạy migration trên Supabase thật; không sửa cấu hình Auth. Chưa kiểm thử iPhone/Safari hoặc project Supabase thật. Các thử nghiệm đồng bộ trên đây là backend cục bộ, không phải xác nhận trên tài khoản thật của người dùng.
- Ảnh render thực tế ví dụ Học VNR: [Desktop](ui-preview/task-auto-calendar-desktop.png), [Mobile](ui-preview/task-auto-calendar-mobile.png). Không tràn ngang ở 1440px/390px. Calendar không được thiết kế lại.

Ô giờ kết thúc là giờ trong cùng ngày, phải sau giờ bắt đầu. Nếu để trống, thời lượng Focus/nghỉ hiện có vẫn được dùng, kể cả khi kéo dài sang ngày sau. Chỉ một số nguyên dương hữu hạn trong giới hạn bảo vệ được vật chất hóa toàn bộ; không giới hạn vẫn sinh theo khoảng hiển thị. Nếu Supabase thật chưa có RPC bảo vệ xóa Task lặp của phiên bản trước, thao tác xóa tài khoản vẫn bị chặn an toàn; tự lên lịch không cần migration mới.
