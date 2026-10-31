# Checklist: tài liệu từng bước và kéo sắp xếp

Chỉ bổ sung trong Checklist của Task Setup và Focus Workspace. Không đổi logo, Header, Hướng dẫn sử dụng, Timer, Study Mode, Task/Calendar/Habit hoặc công thức thời gian.

## Cách dùng

- Bấm paperclip ở bên phải mỗi bước để mở **Tài liệu**; mặc định thu gọn, không thêm hàng khi đóng. Nhập tên hoặc tên file, thêm link http/https (Docs, YouTube, Notion, Figma…), rồi Thêm tài liệu. Một bước có thể có nhiều card; sửa/xóa từng card độc lập. Link mở ở tab riêng.
- Tài khoản đã đăng nhập và Task đã tạo có thể chọn file tối đa **20 MB**. File thật tải vào bucket private; Task chỉ chứa tên, dung lượng, MIME, bucket và object path. Không lưu bytes/base64/File/signed URL vào LocalStorage.
- Tài liệu và thứ tự Checklist của Task **đã tạo** tự lưu, kể cả khi đang ở Task Setup. Sửa nội dung/tích/thêm/xóa bước trong Task Setup vẫn là draft đến khi Lưu Task như trước; khi lưu tài liệu/thứ tự, bản Checklist đang chỉnh được lưu cùng. Trong Focus, mọi thay đổi Checklist vẫn tự lưu như trước. Các trường Task Setup khác giữ cách lưu cũ. Với Task mới chưa có ID, tên/link/thứ tự nằm trong draft đến khi bấm Thêm Task; cần tạo Task trước khi upload file.
- Desktop: kéo grip bằng chuột. Mobile: giữ grip khoảng 180 ms rồi kéo; cuộn nội dung ngoài grip vẫn bình thường. Grip nhận focus mà không cuộn về input trước đó. Các bước đổi vị trí có transition, hỗ trợ reduced motion.
- Bàn phím: **Alt + mũi tên lên/xuống** chuyển một vị trí và tự lưu, có thông báo cho screen reader. Cũng hỗ trợ Space/Enter để nhấc, mũi tên để kéo, Space/Enter để thả, Escape để hủy. Việc sắp xếp không thay trạng thái hoàn thành hoặc dữ liệu bước.

## Lưu trữ và đồng bộ

`Task.checklist[].documents?` là metadata tùy chọn trong JSON Task cũ, version vẫn là 1. Checklist cũ không có trường này vẫn hợp lệ; không chạy chuyển đổi hay xóa dữ liệu. Metadata và thứ tự đi qua LocalStorage theo user và `lbd_commit_workspace`/`lbd_read_workspace` cùng Task. Giữ cơ chế CAS/xung đột và tombstone hiện có. Nếu hai thiết bị sửa đồng thời, chọn bản theo giao diện đồng bộ hiện tại; không có merge từng ký tự hoặc từng tài liệu mới.

File có key `<user UUID>/<object UUID>` trong `lbd-checklist-files`, không đưa tên file cá nhân vào object path. Tên gốc nằm trong metadata. URL xem/tải được ký khi nhấn nút, hiệu lực 60 giây, không lưu lâu dài. Chỉ tài khoản sở hữu prefix được cấp quyền qua Storage RLS. File không tự chuyển sang chủ mới khi import JSON vào tài khoản khác; không vượt quyền để mở file cũ.

Xóa tài liệu/bước/Task chỉ bỏ **tham chiếu**: file đã lưu không tự bị xóa khỏi Storage để giữ khả năng đọc từ backup/thiết bị offline. File thay thế hoặc Task draft bị bỏ có thể để lại object không còn tham chiếu. Việc dọn file vật lý cần rà soát backup và thiết bị trước, không tự dọn trong bản nâng cấp này. Upload mới nhưng ghi metadata thất bại sẽ thử xóa đúng object mới; nếu cleanup lỗi, object riêng tư có thể còn và cần quản lý trong Storage.

Backup JSON chỉ chứa metadata, **không chứa file thật**. Cần sao lưu Storage riêng nếu muốn bản sao đầy đủ. Đăng xuất giữ dữ liệu; chế độ khách vẫn dùng tên/link và sắp xếp, không upload file.

## Cấu hình Supabase Storage — chưa áp dụng trên dự án thật

Codex không có kết nối quản trị tới managed Supabase; không xác nhận bucket/policy hiện tại và không áp dụng migration lên đó. Push nhánh V2 không tự tạo bucket.

1. Đối chiếu đúng dự án mà V2 Preview sử dụng. Đọc [`202610310001_checklist_storage.sql`](../supabase/migrations/202610310001_checklist_storage.sql) và xác nhận phạm vi trước khi quản trị viên áp dụng trong SQL Editor. File có BEGIN/COMMIT, không đổi bảng Task hoặc xóa file/dữ liệu. Nếu dùng chung database với Production, policy/bucket là thay đổi trên dịch vụ dùng chung; không tự áp dụng chỉ vì đang xem Vercel Preview.
2. Migration tạo bucket **private**, giới hạn 20 MB, và ba policy SELECT/INSERT/DELETE theo prefix owner. Không cấp UPDATE/upsert; upload dùng UUID mới. Không đổi public bucket khác, không tắt RLS hoặc dùng service-role key trên frontend.
3. Migration chủ động dừng nếu Storage chưa có, bucket trùng tên có cấu hình khác, policy checklist đã có/cài dở, hoặc Storage có policy khác cần rà soát quyền chồng lấn. Không DROP policy đang dùng để vượt kiểm tra. Với Storage đã sử dụng, cần xem các policy hiện có trước khi chuẩn bị SQL phù hợp, tránh policy rộng làm lộ bucket mới.
4. Nếu chấp thuận chạy file và thành công, đăng nhập V2, upload file thử, chờ **Đã đồng bộ**, mở cùng Task trên iPhone, xem/tải file và thử tài khoản khác. Nếu lỗi, giữ nguyên dữ liệu và xem thông báo; không reset LocalStorage. Quay lại không đồng nghĩa xóa bucket/tombstone: sau COMMIT cần sửa tiến có rà soát, không tự gỡ các policy hoặc xóa file.

Chưa cấu hình thì upload báo lỗi, **không thêm card hoặc báo file đã lưu**. Tên/link và kéo thả vẫn sử dụng bình thường mà không cần migration Task. File upload và URL ký thực tế trên managed Supabase là bước nghiệm thu còn phải thực hiện sau khi người dùng xác nhận cấu hình Storage.

## Kiểm thử và giới hạn

- Unit: legacy Task/metadata round-trip, URL an toàn, giới hạn file, ID tài liệu trùng, reorder giữ toàn bộ object và fingerprint phát hiện thứ tự mới.
- Playwright desktop/mobile Chromium: CRUD tài liệu, mặc định thu gọn, autosave/reload, chặn URL thực thi, guest upload bị khóa, kéo chuột/cảm ứng thật qua CDP, bàn phím/huỷ, lỗi quota, reduced motion và Focus Workspace.
- Tích hợp Auth/PostgREST/PostgreSQL localhost: hai phiên desktop/mobile độc lập đồng bộ tài liệu/thứ tự; giữ legacy Task, guest data và các phần workspace khác. Luồng file UI có ca thiếu Storage, rồi **mock** API upload/ký URL/xem/tải và đồng bộ metadata thật. Mock không chứng minh Storage API hoặc signed file trên Supabase thật đã chạy.
- `python3 scripts/test-checklist-storage.py`: chạy SQL migration thực trong database tạm cục bộ với schema Storage tối thiểu. Kiểm tra bucket private, owner insert/read/delete, chặn tài khoản khác/anon, chặn overwrite, giữ object bucket khác, từ chối policy chồng lấn, config sai, chạy lại và rollback. Không giả định test này đã chạy Storage server thật.
- Mobile dùng Chromium giả lập viewport/touch, chưa kiểm tra Safari/iPhone vật lý. Không xác nhận Vercel Preview mới đã build nếu chưa có URL/trạng thái từ Vercel.

Kết quả chạy thực tế: build đạt (còn cảnh báo bundle lớn đã có trước), **70/70 unit**, **74/74 Playwright desktop/mobile**, **16/16 integration localhost**, **4/4 SQL Storage policy tests** đạt. Đã kiểm tra thêm Focus desktop/mobile: thêm tài liệu và sửa nội dung, reload vẫn giữ tài liệu và trạng thái hoàn thành. Luồng upload/xem/tải trong integration dùng Storage API mô phỏng như mô tả ở trên; chưa nghiệm thu file thật trên managed Supabase và Safari/iPhone vật lý.

Ảnh chụp từ app với dữ liệu kiểm thử riêng: [desktop thu gọn](ui-preview/checklist-compact-desktop.png), [mobile thu gọn](ui-preview/checklist-compact-mobile.png), [desktop mở tài liệu](ui-preview/checklist-documents-desktop.png), [mobile mở tài liệu](ui-preview/checklist-documents-mobile.png). Không chèn dữ liệu mẫu vào app cho người dùng.

## Tệp trong thay đổi

| Nhóm | Tệp |
| --- | --- |
| Checklist UI | `src/components/Checklist.tsx`, `src/components/StepMaterials.tsx`, `src/components/TaskSetup.tsx`, `src/components/TaskBoard.tsx`, `src/interface.css` |
| Metadata/Storage client | `src/checklist.ts`, `src/checklistStorage.ts`, `src/tasks.ts` |
| Dependency kéo thả | `package.json`, `package-lock.json` (`@dnd-kit/core`, `sortable`, `utilities`) |
| Kiểm thử | `src/checklist.test.ts`, `e2e/checklist.spec.ts`, `e2e/workspace.spec.ts`, `integration/checklist.spec.ts`, `scripts/test-checklist-storage.py` |
| Cấu hình/tài liệu | `supabase/migrations/202610310001_checklist_storage.sql`, tài liệu này và bốn ảnh `docs/ui-preview/checklist-*.png` |
