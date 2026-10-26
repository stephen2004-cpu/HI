# LBD Focus

Ứng dụng quản lý thời gian bằng tiếng Việt cho **Lộc Boy Đảo**, xây dựng từ đầu với React 19, TypeScript và Vite. Giao diện than–kem–gold, responsive; không cần tài khoản, backend, API key hay dịch vụ trả phí.

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
- Dữ liệu gắn với trình duyệt và origin (domain + protocol + port), không đồng bộ thiết bị. Dùng một tab chạy timer để tránh các tab ghi đè cùng dữ liệu. Xóa dữ liệu trình duyệt sẽ xóa lịch sử. Khi LocalStorage bị chặn hoặc đầy, ứng dụng hiển thị cảnh báo và tiếp tục chạy trong bộ nhớ.

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
4. Không cần Environment Variables. Chọn **Deploy**.
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
