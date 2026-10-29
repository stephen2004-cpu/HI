# LBD Focus

Ứng dụng quản lý thời gian bằng tiếng Việt cho **Lộc Boy Đảo**, xây dựng từ đầu với React 19, TypeScript và Vite. Giao diện than–kem–gold, responsive. Timer khách không cần tài khoản; đăng nhập và đồng bộ nhiều thiết bị dùng Supabase khi được cấu hình.

## Chạy trên máy

Yêu cầu **Node.js 22.12+** (khuyến nghị Node 24 LTS), npm.

```bash
npm ci
npm run dev
```

Mở địa chỉ Vite in trong terminal (mặc định cổng 5173).

```bash
npm run build       # Kiểm tra TypeScript và tạo dist/
npm run preview     # Xem bản production
npm test            # Kiểm thử logic thời gian
```

### Kiểm thử trình duyệt

```bash
npx playwright install chromium
npm run test:e2e
```

Nếu máy có sẵn Chromium và không tải được trình duyệt:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

Playwright kiểm tra ở desktop 1440 × 1100 và mobile giả lập 390 × 844. Kết quả/ảnh chụp được tạo trong `test-results/` (không đưa lên Git). Bộ kiểm thử chạy các phiên **2 giây** thật: hoàn thành, chuyển phiên, lặp, bỏ qua, tạm dừng/tiếp tục, khởi động lại, dừng sớm, tải lại trang, xuất CSV và xóa lịch sử. Kiểm tra khôi phục quá hạn dùng dữ liệu LocalStorage với deadline đã hết. Đây là kiểm thử Chromium, không thay thế thử trên iPhone/Safari hay thiết bị vật lý.

## Sử dụng

- **Đếm ngược:** nhập giờ/phút/giây, chọn một trong 10 mốc nhanh, đặt tên rồi bắt đầu. Số lớn là **giờ:phút**, giây hiển thị riêng bên phải. Có tạm dừng, tiếp tục, khởi động lại, kết thúc và toàn màn hình (hoặc giao diện tập trung thay thế nếu Fullscreen API không khả dụng).
- **Học tập:** mặc định học 30 phút → nghỉ 5 phút → học 30 phút. Chỉnh tên, số phút, âm thanh; thêm hoặc xóa phiên, bật lặp chuỗi trước khi bắt đầu. Nhập số phút thập phân để thử phiên ngắn (ví dụ `0.05` = 3 giây). Tối đa 50 phiên, luôn giữ ít nhất 1 phiên. Thiết lập chuỗi bị khóa khi đang chạy; bỏ qua phiên khi tạm dừng vẫn giữ trạng thái tạm dừng.
- **Âm thanh:** chuông được tổng hợp bằng Web Audio, không dùng tệp âm thanh bên ngoài. Có âm lượng, tắt tiếng và nghe thử; mỗi phiên học/nghỉ có lựa chọn âm riêng, kể cả im lặng.
- **Thông báo:** thông báo trong trang luôn hoạt động. Bấm biểu tượng chuông ở góc trên để chủ động xin quyền thông báo hệ thống cho lần mở trang hiện tại. Trang không tự xin quyền khi tải.
- **Lịch sử:** lưu tên, loại, thời lượng đã đặt, bắt đầu/kết thúc và trạng thái. Dừng, khởi động lại hoặc bỏ qua ghi “Dừng sớm”; hoàn tất tự nhiên ghi “Hoàn thành”. Khi kết thúc chuỗi, chỉ phiên đã bắt đầu mới được ghi. CSV UTF-8 có BOM cho Excel, có xử lý ký tự trích dẫn và tiền tố công thức. Xóa lịch sử có xác nhận.

## Thời gian và lưu trữ

- Timer tính bằng `deadline - Date.now()`, không trừ dần theo số lần gọi `setInterval`. Interval 200 ms chỉ cập nhật giao diện; khi trở lại tab, tiến trình được đối chiếu ngay.
- Khi tải lại: phiên đang chạy tiếp tục theo deadline cũ; phiên tạm dừng giữ thời gian còn lại. Chuỗi đã quá hạn được chuyển qua đúng các phiên đã hoàn thành và ghi lại thời điểm kết thúc theo lịch.
- LocalStorage key: `lbd-focus-v1`, dữ liệu có phiên bản và kiểm tra cấu trúc khi đọc. Lưu thiết lập, bản sao chuỗi đang chạy và tối đa **1.000 bản ghi gần nhất**. Khi vắng mặt quá lâu trong chế độ lặp, các vòng ngoài cửa sổ lịch sử này được bỏ qua để tránh treo trình duyệt.
- Dữ liệu khách gắn với trình duyệt và origin (domain + protocol + port); dữ liệu tài khoản có thể đồng bộ qua Supabase đã cấu hình. Dùng một tab chạy timer để tránh các tab ghi đè cùng dữ liệu. Xóa dữ liệu trình duyệt sẽ xóa lịch sử. Khi LocalStorage bị chặn hoặc đầy, ứng dụng hiển thị cảnh báo và tiếp tục chạy trong bộ nhớ.

## Giới hạn trình duyệt

- Âm thanh chỉ được mở khóa sau thao tác bắt đầu/tiếp tục/nghe thử của người dùng. Sau tải lại, có thể cần bấm nghe thử hoặc tạm dừng rồi tiếp tục để kích hoạt âm thanh trở lại.
- Thông báo hệ thống cần quyền và môi trường hỗ trợ (thường HTTPS hoặc localhost). Một số trình duyệt mobile không hỗ trợ `new Notification`; thông báo trong trang là phương án dự phòng.
- **Không bảo đảm phát chuông khi trình duyệt đóng, máy ngủ hoặc hệ điều hành đóng băng tab.** Khi mở lại, ứng dụng tính lại thời gian và lịch sử; không phát lại mọi chuông đã bỏ lỡ.
- Không dùng Service Worker, tác vụ nền hoặc push server. Thay đổi giờ hệ thống thủ công có thể tác động timer vì dùng đồng hồ thực.
- Âm thanh nghe được trên thiết bị thật, quyền thông báo thực tế, Fullscreen trên Safari và hành vi khi thiết bị ngủ cần kiểm tra thủ công. Kiểm thử tự động không chứng minh những điều này.

## Cấu trúc và đổi thương hiệu

```text
src/
  App.tsx                      Điều phối phiên, bố cục và điều khiển
  engine.ts                    Logic deadline, chuyển phiên và ghi lịch sử
  engine.test.ts               Kiểm thử logic đồng hồ
  storage.ts                   Đọc, xác thực và lưu LocalStorage
  audio.ts                     Tổng hợp chuông và mở khóa âm thanh
  components/SessionEditor.tsx  Chỉnh chuỗi học/nghỉ
  components/History.tsx        Bảng lịch sử và xuất CSV
  main.tsx                     Điểm vào, font tự lưu trữ
  styles.css                   Giao diện, responsive, biến thương hiệu
  ...
e2e/app.spec.ts                 Kiểm thử tương tác trình duyệt
```

Các biến màu nằm ở `:root` trong `src/styles.css`: `--bg`, `--surface`, `--cream`, `--gold`, `--muted`, `--line`. Thay các biến này để áp dụng Brand Kit. Logo tạm là chữ **LBD FOCUS** và biểu tượng đồng hồ từ Lucide, có thể thay tại header trong `App.tsx`. Typography dùng Be Vietnam Pro và Manrope, đóng gói cục bộ bằng Fontsource; icon Lucide. Không sao chép mã, logo hoặc tài sản từ website tham khảo.

## Lưu lên GitHub

Mã được chuẩn bị tại repository `stephen2004-cpu/HI`. Kiểm tra thay đổi trước khi commit:

```bash
git status
git add .
git commit -m "Build LBD Focus timer and study app"
```

Repository ban đầu trống. Nếu muốn dùng `main` làm nhánh chính:

```bash
git branch -M main
git push -u origin main
```

Nếu repository đã có thay đổi từ người khác, kiểm tra/fetch và tích hợp trước; không force push. `node_modules/`, `dist/`, dữ liệu test và cache không được commit.

## Triển khai Vercel

1. Đẩy mã lên GitHub theo hướng dẫn trên.
2. Trong Vercel chọn **Add New → Project**, kết nối GitHub và import `stephen2004-cpu/HI`.
3. Framework preset: **Vite**. Root Directory: gốc repository. Install Command: `npm ci`. Build Command: `npm run build`. Output Directory: `dist`. Chọn Node.js **24.x**.
4. Chế độ khách không cần biến môi trường. Auth cần `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` cùng migration trong hướng dẫn bên dưới. Chỉ tạo **Preview** cho `feature/lbd-focus-v2`, không promote Production.
5. Mở domain HTTPS được cấp, chạy một phiên 15 giây, kiểm tra âm thanh, khôi phục sau tải lại và CSV trên thiết bị của bạn.

Đây là ứng dụng tĩnh một trang, không có client-side routing nên không cần cấu hình rewrite. Có thể triển khai bằng gói miễn phí phù hợp điều kiện sử dụng của bạn; ứng dụng không phụ thuộc API Vercel. Việc triển khai/public URL chưa được thực hiện trong workspace này.

## LBD Focus V2 — giai đoạn 1

Task hỗ trợ tạo, sửa, xóa có xác nhận, hoàn thành và khôi phục sau tải lại.
Ma trận Eisenhower gồm Làm ngay (xanh lá), Lên lịch (vàng), Ủy quyền
(xanh dương), Loại bỏ (hồng). Kéo thả giữa các nhóm hoặc dùng danh sách
Chuyển nhóm trên từng thẻ (phù hợp bàn phím và thiết bị cảm ứng). Màu riêng
chỉ đổi viền thẻ, không đổi nhóm; Dùng màu nhóm khôi phục màu mặc định.

V2 chỉ đọc key `lbd-focus-v1` khi chưa có `lbd-focus-v2-timer`, sau đó ghi
thiết lập/timer/lịch sử vào `lbd-focus-v2-timer`. Key cũ không bị ghi đè hoặc
xóa. Task nằm riêng ở `lbd-focus-v2-tasks`. Không chuyển domain/origin nếu
muốn tiếp tục dùng dữ liệu trình duyệt hiện tại. Dữ liệu cũ giữ nguyên để
quay lại V1, nhưng các phiên tạo mới trong V2 không được đồng bộ về V1.
Nếu dữ liệu Task hỏng hoặc không đọc được, bảng khóa ghi để giữ nguyên dữ
liệu gốc; nếu không ghi được, báo lỗi và giữ nội dung nhập để thử lại.
Vẫn nên dùng một tab chỉnh sửa để tránh ghi đè giữa nhiều tab.

Calendar, liên kết Task–Timer, Planned/Actual Time và logo mới chưa thuộc
bản giai đoạn 1. Kiểm thử trình duyệt dùng Chromium desktop và mobile giả
lập; kéo thả cảm ứng trên thiết bị thật cần kiểm tra thủ công.

## Calendar-first workspace

Bảy màn hình riêng: Lịch (mặc định), Task, Thói quen, Focus, Tổng quan, Thống kê,
Cài đặt. Hash navigation giữ màn hình sau khi tải lại; timer vẫn chạy khi
chuyển màn hình. Tuần mặc định bắt đầu thứ Hai, có đủ bảy ngày, trục 24 giờ
cuộn được. Trên điện thoại cuộn ngang lịch tuần hoặc chọn Ngày; lịch tháng
nhỏ có thể mở/thu gọn để dành chỗ cho lịch chính.

Kéo Task chưa lên lịch vào lịch để tạo block (mặc định 60 phút). Kéo block
để đổi ngày/giờ, kéo cạnh dưới để thay đổi thời lượng theo bước 15 phút.
Bấm block để chỉnh bằng ngày/giờ thủ công, chọn Task khác, màu riêng, xóa
có xác nhận hoặc mở Focus cho Task. Form cũng cho phép thêm nhiều block
cho cùng Task. Block chồng lấn hiển thị theo cột, block qua nửa đêm được
hiển thị ở các ngày liên quan. Màu block ưu tiên màu riêng, rồi màu Task,
rồi màu nhóm Eisenhower. Không đổi nhóm ưu tiên khi đổi màu hoặc giờ.

`lbd-focus-v2-planner` lưu block và tùy chọn tuần/thời lượng mặc định;
không ghi vào key V1. Dữ liệu lỗi được giữ nguyên và khóa sửa lịch.
Ngày giờ theo múi giờ trình duyệt, tuần thay đổi bằng lịch địa phương.
Lịch là lưới 24 giờ địa phương: vào ngày chuyển DST, giờ lặp không có hàng
riêng; dùng form để kiểm tra thời điểm. Chưa có lặp lịch hoặc đồng bộ lịch
Google/Apple, chưa có đồng bộ nhiều tab/thiết bị.

Focus có thể chạy độc lập hoặc liên kết một Task. Nhiều phiên có thể gắn
cùng Task. Không đổi Task giữa phiên đang chạy. Actual mới đo từ thời lượng
đã tiêu thụ, loại trừ tạm dừng và phiên nghỉ; dừng sớm, bỏ qua, khởi động lại
vẫn ghi đúng phần đã tập trung. Dữ liệu timer cũ không bị đoán Actual.
Planned cộng thời lượng tất cả block, kể cả block chồng lấn. Thống kê Actual
chỉ tính phiên đã vào lịch sử, tối đa 1.000 bản ghi đang được giữ, không gồm
phiên đang chạy hoặc các vòng vắng mặt bị bỏ qua theo giới hạn engine cũ.
Xóa Task giữ lại block và lịch sử liên quan, hiển thị tên Task đã lưu/đã xóa.
Xóa lịch sử Focus cũng xóa số đo Actual tương ứng; nên xuất sao lưu JSON ở
Cài đặt trước khi xóa. Chưa có chức năng nhập lại JSON.

Validation: `npm run build`, `npm test`,
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.
Các test bao gồm Task CRUD, điều hướng riêng, lên lịch thủ công, kéo Task,
chuyển/resize block, màu, nhiều block chồng lấn/qua ngày, Planned/Actual,
khôi phục sau reload và hồi quy hai chế độ timer trên desktop/mobile giả lập.
Safari, cảm ứng trên thiết bị thật, âm thanh nền vẫn cần kiểm tra thủ công.

## Task Setup & Focus Workspace (master specification)

Task mở rộng bằng các trường tùy chọn nên dữ liệu V2 đã có không cần ghi đè
để chuyển đổi: checklist, Expected Output, Actual Output, cấu hình Countdown/
Study (phút Focus, số phiên, phút nghỉ), ngày giờ mong muốn và trạng thái.
Ngày giờ trong Task chỉ gợi ý lúc mở form Calendar; thao tác lưu Time Block
mới đặt lịch thật. Study tạo nghỉ giữa hai phiên Focus, không tự thêm nghỉ cuối.
Màu nhóm dùng #4ADE80, #FBBF24, #60A5FA, #F472B6; màu riêng không đổi tag.

Nhấn Time Block mở Focus Workspace với Task ID, Block ID, cấu hình đúng và
không tự chạy. Nút ✎ trên lịch ngày/tuần dùng để sửa block. Calendar cảnh báo
trùng giờ nhưng vẫn cho phép giữ lịch. Block ngắn hơn cấu hình Focus + nghỉ
có cảnh báo trong form và Workspace. Desktop chia hai cột 40/60, mobile xếp
Timer trước nội dung Task. Notes, checklist, Actual Output lưu độc lập và
không reset Run. Timer độc lập và lịch sử cũ vẫn hoạt động.

Run mới có focusRunId, blockId và bản chụp Planned Focus/Break/Calendar;
record mới có Actual Focus và Actual Break, loại trừ tạm dừng. Kết quả phiên
lưu riêng tại `lbd-focus-v2-reviews`, khóa ghi nếu dữ liệu hỏng. Mỗi runId chỉ
có một review, lưu lại sẽ cập nhật cùng review. Task không tự hoàn thành khi
hết giờ: người dùng xác nhận riêng. Expected Output không tự chép sang Actual
Output. Kết quả có ghi nhận đạt Expected Output và lý do chênh lệch.

Thống kê Task cộng các record duy nhất, dùng Planned của lượt đo đầu tiên
(theo thời điểm bắt đầu) làm mốc Task. Time Block có mốc riêng từ lượt đầu
của block. Sửa cấu hình sau đó không sửa các record cũ. Task chưa có số đo
không được đánh giá hoàn thành sớm. Lọc ngày/tuần lấy record kết thúc trong
khoảng chọn; block giao khoảng được cộng toàn bộ, chưa chia nhỏ qua ranh giới
ngày. Không kết luận mức độ đạt kết quả chỉ từ thời lượng.

Gợi ý là quy tắc tham khảo, không phải AI: trung vị 3–5 review cùng Task đã
hoàn thành và được xác nhận đạt Expected Output, loại các lượt mất tập trung/
gián đoạn khỏi tập số liệu gợi ý. Nếu lý do mới nhất là mất tập trung, không
đề xuất tăng thời lượng bằng số. Người dùng có thể giữ thời gian hoặc áp dụng
gợi ý (chuyển sang Countdown cho tổng thời gian gợi ý) cho lượt sau, không
sửa lịch sử. Có thể tự nhập cấu hình khác tại Task Setup. Tính so sánh chỉ
theo cùng Task, chưa tự phân loại loại công việc hoặc kiểm chứng độ tin cậy
thống kê. Báo cáo vẫn giới hạn 1.000 record; review đã lưu được giữ riêng,
không tự xóa khi xóa lịch sử. Xóa lịch sử sẽ mất khả năng tính tổng Actual
Task/block tương ứng, nên xuất sao lưu trước khi xóa.

Logo gốc hiển thị trong chat nhưng không được cung cấp thành tệp ảnh có thể
đọc trong workspace. Theo yêu cầu giữ nguyên logo cũ và favicon; không tự
thiết kế lại. Cần cung cấp tệp PNG/SVG gốc để thay Header/favicon/mobile icon.
Safari/iPhone thật và ngày DST cần kiểm tra thủ công. Chưa có đồng bộ nhiều
tab vẫn cần kiểm tra thủ công. Các phần nhập JSON, lịch lặp và backend đã được bổ sung trong những mục cập nhật phía dưới.

## Focus visual refresh & Habit Tracker

Focus giữ timer bên trái, checklist/Notes/Expected Output/Actual Output bên
phải. Các thẻ có khoảng cách rõ, tương phản chữ cao hơn, tiến độ checklist,
icon thống nhất và hai ô kết quả cạnh nhau trên desktop. Nền núi trong timer
là trang trí CSS, không phải logo hoặc dữ liệu người dùng. Không thêm thao tác
đổi theme, tài khoản hoặc nút giả chỉ để giống ảnh concept. Các điều khiển
Countdown/Study, âm thanh, lịch sử, kết quả và gợi ý vẫn dùng logic hiện tại.

Trang **Thói quen** có mục riêng trên Header. Tạo tên, nhóm, ngày lặp trong
tuần, mục tiêu số lần/tuần và thời lượng khi kết nối Focus. Bảng tuần/tháng
hiển thị Chưa nhập (—), Đã làm (✓), Tạm nghỉ (trăng); bấm ô theo vòng ba trạng
thái. Không coi chưa nhập là thất bại, không cho đánh dấu ngày tương lai hoặc
ngày ngoài lịch lặp. Có thể sửa thói quen, lưu trữ/khôi phục mà không xóa dấu.
Không có thói quen mẫu tự được tạo cho người dùng.

Habit lưu riêng tại `lbd-focus-v2-habits`, có phiên bản và kiểm tra cấu trúc;
dữ liệu lỗi khóa ghi và giữ nguyên bản gốc. Xuất JSON trong Cài đặt đã bao gồm
Habit. Không chuyển đổi hoặc ghi đè dữ liệu V1/V2 cũ để thêm Habit. Mục tiêu
tuần là số lần đã làm / mục tiêu; tiến độ tháng là số ngày đã làm / số ngày
trong tháng thuộc lịch lặp. Chuỗi đếm các lần theo lịch liên tiếp; tạm nghỉ
không phá chuỗi, ngày theo lịch đã qua chưa nhập làm ngắt chuỗi. Hôm nay chưa
nhập chưa làm ngắt chuỗi. Khi sửa lịch lặp, tiến độ/chuỗi được tính lại theo
lịch mới; dấu cũ vẫn giữ. Chưa có lịch sử phiên bản lịch lặp.

Habit khác Task: Habit theo dõi việc lặp lại, Task có kết quả cần hoàn thành.
Chỉ khi bấm Lên lịch hoặc Focus, ứng dụng tạo Task cho một lần thực hiện theo
ngày (khóa định danh theo Habit + ngày để không tạo trùng). Lên lịch tạo một
block lúc 09:00, có thể kéo/sửa giờ bằng Calendar. Thời lượng dùng thiết lập
Habit. Focus không tự chạy và không tự đánh dấu Habit, kể cả khi hoàn thành
Task hoặc timer. Chọn cùng ngày/lần thực hiện sẽ tái sử dụng Task và block,
không reset timer đang chạy. Nếu lưu lịch thất bại sau khi tạo Task, Task được
giữ và thao tác có thể thử lại mà không tạo trùng. Tên Task lần thực hiện đã
tạo không tự đổi khi sửa tên Habit.

Tài liệu `docs/design-references/` chưa xuất hiện trên remote main hoặc nhánh
feature tại lúc kiểm tra; GitHub và raw README đều trả 404. Chưa đọc được
README/ảnh gốc trong thư mục này, nên đối chiếu ảnh đã gửi trong chat. Logo
Header/favicon giữ nguyên cho đến khi truy cập được file logo chính thức;
không vẽ lại từ ảnh màn hình. Preview cần kiểm tra deployment của nhánh feature,
không chọn Promote to Production.

## Habit — lịch lặp tự động

Habit mới mặc định bật “Lịch lặp tự động trên Calendar”. Chọn ngày trong tuần,
ngày bắt đầu, giờ bắt đầu và số phút. Habit cũ chưa có cấu hình lặp vẫn giữ
chế độ đánh dấu/thao tác thủ công, không bị tự chuyển đổi. Có thể bật lịch
cho Habit cũ bằng Sửa thói quen. Calendar tạo các lần thực hiện theo khoảng
ngày/tuần/tháng đang xem, không giới hạn vào một tuần hay tạo trước vô hạn.
Task và block dùng ID theo Habit + ngày để tái sử dụng sau reload/đổi tuần.
Những block đã từng tạo có thể nằm trong cache dù không đang xem tuần đó.
Đây là lịch trong ứng dụng, không phải tác vụ nền khi trình duyệt đóng.

Quy tắc lặp lưu trong cùng bản ghi Habit, có các bản sửa theo ngày hiệu lực,
nhật ký tạm dừng và thời điểm kết thúc. Đổi giờ/ngày/thời lượng chỉ cập nhật
các lần tương lai chưa thực hiện và chưa chỉnh riêng. Các Task có Focus
history hoặc phiên đang chạy và các ngày Habit đã đánh dấu giữ nguyên. Dữ
liệu cấu hình lỗi khóa tự sinh lịch; dữ liệu gốc không bị ghi đè.

Tạm dừng lịch không xóa block/Task đã tạo; các lần tương lai bị ẩn và không
sinh thêm. Bật lại không tạo bù khoảng đã tạm dừng. Kết thúc là dừng lịch
vĩnh viễn từ thời điểm xác nhận, không có nút bật lại chuỗi đã kết thúc; có
thể tạo Habit mới. Các dấu Habit và lịch sử Focus vẫn được giữ. Các nút mở
Focus/lên lịch thủ công vẫn là thao tác chủ động cho một lần thực hiện,
không tự chạy hoặc tự đánh dấu Habit. Lưu trữ Habit cũng tạm dừng lịch;
khôi phục chỉ tiếp tục nếu lịch đang hoạt động trước lúc lưu trữ. Nếu người
dùng đã tạm dừng từ trước, khôi phục vẫn giữ tạm dừng; lịch đã kết thúc không
bị bật lại.

Kéo/resize/sửa block tự động tạo ngoại lệ chỉ cho lần đó. Xóa một lần từ
Calendar lưu ngoại lệ hủy, nên lần đó không xuất hiện lại sau reload; tuần
sau vẫn lặp bình thường. Các ngoại lệ và bản ghi ẩn được giữ trong Planner,
báo cáo chỉ dùng block đang hiển thị/hợp lệ. Không xóa history hoặc run khi
đổi trạng thái lịch. Nếu ghi Task thành công nhưng ghi Planner thất bại,
Task được giữ để có thể thử lại mà không tạo trùng; đổi tuần hoặc mở lại
Calendar sẽ thử đồng bộ khoảng xem lần nữa.

Giờ lặp theo múi giờ trình duyệt. Ngày chuyển DST dùng cách xử lý ngày/giờ
địa phương của JavaScript (giờ không tồn tại có thể được đẩy tới giờ hợp lệ);
chưa có lựa chọn riêng cho giờ lặp do DST. Các tuần và tháng được tính bằng
ngày lịch, không cộng cố định 24 giờ để tránh lệch ngày.

Logo đính kèm vẫn chỉ có dạng ảnh hiển thị trong hội thoại; workspace không
có tệp PNG/SVG gốc và repository sau fetch cũng không có docs/design-references.
Header/favicon giữ logo cũ, không tạo lại logo hoặc thay bằng ảnh minh họa.
Không có manifest PWA hay cấu hình icon màn hình chính trong repository.

## Supabase Auth — V2

Có đăng ký/đăng nhập email và đăng xuất theo thiết bị. Timer khách vẫn hoạt
động; dữ liệu khách/V1 không tự nhập vào tài khoản. Mỗi tài khoản dùng vùng
cache riêng, các bảng máy chủ có User ID và RLS. Đồng bộ định kỳ có kiểm tra
phiên bản để tránh ghi đè khi hai thiết bị sửa cùng lúc. Nhập dữ liệu khách
hoặc tệp sao lưu JSON cần xác nhận và giữ bản gốc.

Cần cấu hình Supabase Preview và chạy migration trước khi dùng đồng bộ thật.
Xem [hướng dẫn Auth, RLS, dữ liệu cũ và kiểm thử](docs/supabase-auth.md).
Không dùng service_role trong frontend; không tự cập nhật Production.

## Habit, Calendar và chuông báo V2

Habit hỗ trợ xóa vĩnh viễn với xác nhận, giữ lịch sử mặc định và dấu xóa chống
khôi phục từ thiết bị offline. Calendar đánh dấu Task hoàn thành ở mọi chế độ;
chuông Timer lặp đến khi bấm **Tắt chuông**, theo thiết lập âm lượng/tắt tiếng.

Xóa Habit trong tài khoản cần migration bổ sung
`supabase/migrations/202610300001_habit_deletions.sql` trên cơ sở dữ liệu Preview.
Xem [thiết kế dữ liệu, giới hạn và kiểm tra thủ công](docs/v2-habit-calendar-alarm.md).
Không tự chạy migration hoặc triển khai lên Production.
