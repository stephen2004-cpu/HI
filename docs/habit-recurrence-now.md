# Habit: xác nhận xóa, ngày/giới hạn lặp và Calendar Now Line

Phát triển tiếp từ `a54584c` trên `feature/lbd-focus-v2`. Không đổi logo, Header, Hướng dẫn sử dụng, Checklist tài liệu, Timer/Study Mode hoặc hệ thống Task lặp. Không chạy SQL trên managed Supabase, không deploy Production.

## 1. Xóa Habit: phần đã sửa và phần chưa xác nhận trên hệ thống thật

Người dùng đã cung cấp kết quả SQL trên Supabase thật: hai bảng nền có, nhưng ledger, capability RPC, RLS ledger, hai trigger và đọc tombstone đều chưa có. Vì vậy không thể sửa bằng cách chỉ tải lại schema cache hoặc bỏ qua kiểm tra RPC. Migration thực sự còn thiếu. Codex không có kết nối tới dự án thật và chưa tự áp dụng/xác minh schema tại đó.

UI giữ lỗi rõ trong hộp xác nhận nếu thiếu RPC/mạng/quyền. Khi ghi tombstone thành công, Habit bị bỏ khỏi **bảng Habit**, dừng sinh lịch, và tất cả block liên kết của Habit được bỏ khỏi Calendar ngày/tuần/tháng, bao gồm quá khứ. Các block lịch sử vẫn nằm trong dữ liệu lưu; Task độc lập và Focus History không bị xóa.

Phần trạng thái riêng phân biệt:

- **Xóa thất bại**: chưa lưu tombstone; không xóa/ẩn sai Habit đang hoạt động.
- **Đã ghi nhận trên thiết bị**: tombstone có trong LocalStorage, không phải chỉ thay UI. Khách không có đồng bộ máy chủ.
- **Chờ đồng bộ hoặc đồng bộ lỗi/xung đột**: vẫn giữ tombstone và nói rõ máy chủ chưa xác nhận.
- **Đã đồng bộ xóa thành công**: chỉ khi `lbd_read_workspace` trả lại đúng ID, `deletedAt` và trạng thái xóa lịch sử. `lbd_commit_workspace` trả revision thành công chưa đủ. Nếu đọc lại không có dấu xóa thì giữ pending và báo lỗi; nếu đang chờ đọc có chỉnh sửa mới thì giữ dirty để gửi lượt sau.

Xác nhận máy chủ được cache riêng theo tài khoản ở `lbd-account:<uid>:habit-deletion-ack` (chỉ ID/timestamp/cờ xóa lịch sử); không sửa workspace schema hay chứa token. Cache chỉ được tạo từ lần đọc máy chủ đã kiểm tra định dạng. Reload/login đọc lại xác nhận. Không auto-import/cache-reset dữ liệu gốc.

Mặc định giữ lịch sử đánh dấu trong tombstone; tùy chọn xóa cả lịch sử cần xác nhận lần hai. Ledger vẫn giữ ID, dữ liệu cần chống phục hồi và có thể giữ tên/logs tùy lựa chọn. **Không phải xóa vật lý toàn bộ dữ liệu cá nhân**. Dấu xóa server vẫn chống client cũ/offline ghi lại cùng ID; không tắt bảo vệ.

## 2. Ngày lặp và số lần

Tận dụng điều khiển chọn ngày cũ, hoàn thiện thành chip T2–CN màu gold khi chọn, có thể chọn một hoặc cả bảy ngày. Không tạo Habit thứ hai để biểu diễn các lần lặp.

Giới hạn là trường tùy chọn `Habit.recurrence.rules[].ending`:

- Không có trường: không giới hạn, tương thích Habit cũ.
- `{type:'count', count:N}`: số nguyên dương, tổng số lần được lên lịch của **cùng Habit**, không phải mục tiêu mỗi tuần hay số lần hoàn thành.
- `{type:'date', date:'YYYY-MM-DD'}`: ngày cuối cùng được tính **bao gồm ngày đó**.

Ngày bắt đầu và giờ đã có; nếu bắt đầu lệch ngày được chọn thì lần đầu là ngày được chọn kế tiếp. Ví dụ T2/T4/T6, bắt đầu 26/10/2026, tổng 6 lần: 26/10, 28/10, 30/10, 02/11, 04/11, 06/11. Không cần từng mở các tuần đó để số lần được tính đúng. Ngày bỏ lỡ vẫn tiêu thụ một lần. Tạm dừng theo khoảng thời gian không tạo lần xuất hiện nên không tiêu thụ quota; hủy một block đã thuộc quy tắc không đặt lại quota.

Quy tắc có phiên bản theo ngày hiệu lực. Sửa ngày hoặc giới hạn tiếp tục tính lịch sử của cùng Habit, không reset số lần. Nếu lần hôm nay đã bắt đầu/được ghi nhận, quy tắc mới có hiệu lực từ ngày mai; tránh viết lại lần đã xảy ra. Chỉ sửa trước giờ có thể áp dụng từ hôm nay. Giảm cap thấp hơn lịch đã xảy ra sẽ không tạo lần mới, không xóa tiến độ cũ; tăng cap sau khi hết sẽ cho phép những lần còn lại theo quy tắc mới.

Trạng thái lịch tự kết thúc khi hết quota/ngày, nhưng Habit vẫn tồn tại và có thể sửa cap/ngày để tiếp tục. Không đặt cờ xóa hoặc tự đánh dấu hoàn thành. Lịch đã kết thúc **thủ công** vẫn không tự bật lại. Logs cũ và các instance đã hoàn thành/đang có Focus được giữ; các block chưa hoàn thành trong tương lai không còn phù hợp quy tắc được lọc khỏi lịch, không xóa bản ghi gốc.

`trackingOnly?: true` trong recurrence dùng cho Habit không bật Calendar: vẫn theo dõi ngày/giới hạn nhưng không tự sinh Task/Time Block. Kết nối Calendar/Focus thủ công phải chọn một ngày còn thuộc quy tắc; không dùng fallback để vượt cap. Định danh instance vẫn `habit:<id>:<date>` và `habit-block:<id>:<date>`, giữ kiểm tra idempotence và exception xóa cũ.

Tất cả trường mới là JSON tùy chọn trong document Habit version 1, đi qua cơ chế account/CAS hiện tại; không cần migration schema cho ngày hoặc giới hạn. Không đổi Task hay tính năng Task lặp. Cần cập nhật **cả hai thiết bị và đóng tab V2 cũ** trước khi dùng finite rules: bản JS cũ không hiểu giới hạn mới. Xung đột các chỉnh sửa khác nhau vẫn dùng lựa chọn/backup đồng bộ đã có, không giả vờ merge tự động mọi thay đổi.

## 3. Now Line

Đường gold 1px, chấm 7px ở đầu, chỉ trong cột local **hôm nay** của lịch tuần/ngày. Vị trí `getHours()*60 + getMinutes()` pixel khớp grid 1px/phút; không dùng UTC để đặt đường. Tháng hoặc khoảng không có hôm nay không vẽ đường.

Cập nhật tại ranh giới phút; refresh khi focus, pageshow hoặc visibility thay đổi. Khi quay lại sau khi app bị treo nền, lấy Date hiện tại mới. Cuộn dọc một lần đến gần hiện tại cho mỗi lần mount Calendar có hôm nay; không liên tục theo giờ hoặc kéo người dùng khỏi vị trí đang đọc.

Đường `aria-hidden`, `pointer-events:none`, z-index thấp hơn Time Block; không che chữ/nút và không nhận click/drag/resize. Không thêm đồng hồ/countdown/âm thanh/thông báo. Hook không ghi Task/Planner hay thay timestamp của Time Block.

## 4. Những bước bắt buộc trên Supabase/thiết bị thật

1. **Trước khi áp dụng SQL:** chọn đúng `lbd-focus-db` mà V2 dùng; giữ JSON đã xuất, đồng thời chuẩn bị backup/snapshot Database phù hợp (Dashboard Backups hoặc dump bằng công cụ PostgreSQL trên máy tin cậy). JSON tài khoản không sao lưu toàn schema/Auth/tài khoản khác. Nếu chưa có phương án backup/restore Database thì chưa chạy migration. Không chia sẻ connection password/token. Nếu Production dùng chung database, thay đổi schema cũng tác động dịch vụ dùng chung; cần xác nhận rõ phạm vi trước khi chạy, không hứa database Production hoàn toàn không bị ảnh hưởng bởi thao tác thủ công đó.
2. Đợi đồng bộ, dừng chỉnh sửa trên cả hai thiết bị. Sau khi tự xem xét/chấp thuận, trong SQL Editor role `postgres`, chạy **toàn bộ** [`install_habit_deletions_safe.sql`](../supabase/manual/install_habit_deletions_safe.sql) một lần. File bao nguyên migration `202610300001_habit_deletions.sql`, preflight schema/RLS/RPC, transaction, lock timeout, kiểm tra dữ liệu trước/sau và reload API cache. Không chạy RPC giả chỉ trả 1.
3. Chạy lại [`habit_deletion_readonly.sql`](../supabase/diagnostics/habit_deletion_readonly.sql): chín cờ phải true và policy owner_read đúng owner. Nếu script dừng hoặc SQL lỗi: chạy `ROLLBACK;` nếu transaction lỗi còn mở, giữ backup và thông báo lỗi để rà soát; không DROP ledger hoặc tắt RLS. Nếu đã COMMIT, không tự gỡ migration/khôi phục JSON mù quáng: dừng ghi, kiểm tra để sửa tiến hoặc lập kế hoạch khôi phục snapshot có xét các thay đổi mới.
4. Mở Preview mới trên cả MacBook/iPhone, tải lại và đóng tab cũ. Có thể thử với một Habit thử nghiệm trước; sau đó xóa GYM bằng UI, giữ lịch sử mặc định nếu muốn. Đợi trạng thái **máy chủ đã xác nhận**, kiểm tra ngày/tuần/tháng, reload và logout/login. Không xóa LocalStorage. Thử ngày/giới hạn mới và Now Line trên iPhone/Safari thật; kiểm tra Task độc lập/Focus History vẫn còn.

Quy trình SQL và phương án rollback chi tiết: [install-habit-deletion.md](install-habit-deletion.md). Migration đã được kiểm thử trên database tạm localhost với schema nền tương thích; preflight vẫn cần chạy trên DB thật mới biết có khác biệt ngoài các cờ người dùng đã cung cấp. **Chưa xác nhận GYM thật đã xóa được hoặc migration đã áp dụng.** Không yêu cầu tạo Supabase Project mới.

## 5. Kiểm thử

Unit mới: 5/10/20 lần, một/bảy ngày, không giới hạn, ngày cuối inclusive, bắt đầu lệch thứ, thay lịch/cap, giữ logs, pause, số lần hết không xóa Habit, tracking-only, DST và không sửa instance đã bắt đầu hôm nay. Cache trạng thái xóa kiểm tra revision-only không đủ, đọc lỗi/thiếu marker không báo thành công.

Playwright mới: gold chips, cap/ngày kết thúc, không trùng ID qua reload, không bypass bằng kết nối thủ công, Now Line ở 09:00/12:30/14:45/23:59, qua nửa đêm, đổi múi giờ ngay trong context, không auto-scroll liên tục, return-to-app và sửa/resize block khi có đường.

Integration mới: Auth/PostgREST/PostgreSQL localhost, hai context desktop/mobile đồng bộ cap, sinh hữu hạn không trùng, giữ logs, chặn đọc xác nhận rồi phục hồi mạng để chuyển pending/error sang server-confirmed, giữ Task độc lập/Focus History. Có chạy lại suite xóa cũ: thiếu RPC, stale/offline device, chọn bản local, ledger RLS, reload/logout/login và tùy chọn purge logs.

Các ca desktop/mobile dùng Chromium emulation/touch; không tương đương nghiệm thu trên iPhone/Safari vật lý. Không truy cập, xóa GYM thật hoặc áp dụng migration managed Supabase trong kiểm thử. Kết quả cụ thể được cập nhật sau khi chạy đủ bộ.

Ảnh thực tế từ app với dữ liệu minh họa trong browser context riêng: [Habit desktop](ui-preview/habit-limit-desktop.png), [Habit mobile](ui-preview/habit-limit-mobile.png), [Now Line desktop](ui-preview/now-line-desktop.png), [Now Line mobile](ui-preview/now-line-mobile.png). Không ghi dữ liệu mẫu vào tài khoản người dùng.

## 6. Tệp trong thay đổi

| Phần | Tệp |
| --- | --- |
| Mô hình/quy tắc Habit | `src/habits.ts`, `src/habitLimits.ts`, `src/recurrence.ts`, `src/App.tsx` (chỉ chặn kết nối Habit ngoài quy tắc) |
| UI | `src/components/HabitTracker.tsx`, `src/components/Calendar.tsx`, `src/interface.css` |
| Xác nhận xóa | `src/sync.ts`, `src/habitDeletionStatus.ts` |
| Đồng hồ chỉ báo | `src/currentTime.ts`, `src/useCurrentTime.ts` |
| Unit | `src/habitLimits.test.ts`, `src/currentTime.test.ts`, `src/account.test.ts`, `src/recurrence.test.ts` |
| UI/integration | `e2e/habit-limits.spec.ts`, `e2e/now-line.spec.ts`, `integration/habit-limits.spec.ts`, `integration/auth.spec.ts` (fixture chọn ngày hợp lệ) |
| Tài liệu | Tài liệu này và bốn ảnh `docs/ui-preview/habit-limit-*.png`, `now-line-*.png` |

Không tạo migration mới cho giới hạn hay Now Line. SQL xóa Habit có sẵn được tái sử dụng, không giả định đã áp dụng trên Supabase thật.

## 7. Kết quả chạy thực tế

- `npm run build`: đạt, còn cảnh báo bundle lớn đã có trước thay đổi.
- `npm test`: **88/88** unit test, 15 file, đạt.
- Playwright: **86/86** desktop/mobile Chromium, đạt (2,8 phút), gồm regression Timer/Study, Checklist tài liệu, logo và Hướng dẫn sử dụng.
- Integration localhost: **17/17**, đạt (2,4 phút), có hai context độc lập desktop/mobile, Auth/RLS, đồng bộ, phục hồi mật khẩu và xác nhận xóa bằng server read-back.
- `python3 scripts/test-habit-installer.py`: **8/8** tình huống cài/rollback đạt. SQL guard từ chối DB khác schema/RLS/RPC, cài dở, marker lỗi, chạy lại; giữ dữ liệu và ledger chống stale writes.
- Đã xem ảnh thực tế Calendar/Habit desktop/mobile; form Habit chụp lại từ bản production build chạy cục bộ, không deploy.

Những lần chạy ban đầu có lỗi thiết lập test timezone (CDP xung đột với timezone fixture) và fixture Auth dùng ngày hôm nay ngoài các thứ chọn. Đã sửa các fixture, giữ kiểm tra hành vi, chạy lại đầy đủ và có kết quả xanh nêu trên. Không bỏ test hoặc coi các lỗi đó là đã đạt trước khi chạy lại.

**Chưa đạt nghiệm thu hệ thống thật:** chưa áp dụng migration `lbd-focus-db`, chưa thử xóa GYM thật, chưa thử iPhone/Safari vật lý hoặc xác minh URL Vercel Preview mới. Không dùng kết quả localhost để khẳng định các bước này hoàn tất.
