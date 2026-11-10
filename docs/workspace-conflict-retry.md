# Workspace revision conflict và vòng lặp PostgREST 14.18

## Kết luận và bằng chứng

Hàm `lbd_commit_workspace` báo revision cũ bằng SQLSTATE `40001`. Đây là serialization failure của PostgreSQL, không nên dùng làm mã báo xung đột ứng dụng qua PostgREST 14.18. Phiên bản này dùng Hasql transaction tự retry lỗi đó. Vì `expected_revision` giữ nguyên, mỗi lần thử đều thất bại và lập lại transaction, giữ kết nối API ngay cả khi trình duyệt đã hủy yêu cầu.

Nguồn đã kiểm tra:

- [PostgREST 14.18 MainTx](https://github.com/PostgREST/postgrest/blob/v14.18/src/PostgREST/MainTx.hs) dùng `SQL.transaction`.
- [Hasql transaction 1.0.1](https://github.com/nikita-volkov/hasql-transaction/blob/1.0.1/library/Hasql/Transaction/Private/Sessions.hs) lặp lại khi gặp `40001`.
- [PostgREST 16.5 MainTx](https://github.com/PostgREST/postgrest/blob/v16.5/src/library/PostgREST/MainTx.hs) dùng `transactionNoRetry`. Test stack trước đây dùng bản này, nên bộ HTTP cũ không phát hiện vòng lặp trên 14.18.
- [PostgREST custom error tests](https://github.com/PostgREST/postgrest/blob/v14.18/test/spec/Feature/Query/RpcSpec.hs) xác nhận hỗ trợ exception `PGRST` với JSON message/detail.

Thông tin project thật do chủ dự án gửi ngày 10/11/2026: API trả HTTP 504 / `PGRST003`, CPU cao, nhiều kết nối `commit_workspace` không có blockers. Mẫu có timestamp cho thấy các query chỉ mới chạy 4–20ms trong các backend đã tồn tại nhiều giờ. Đặc điểm này phù hợp giao dịch ngắn lặp lại, không chứng minh một query SQL đang chạy liên tục hàng giờ.

Tái hiện trên Docker **đúng API 14.18**, một pool chỉ có một kết nối: gửi một request revision cũ, đóng kết nối HTTP sau 250ms, chờ rồi đọc workspace. Request đọc nhận **504 / PGRST003**, số transaction rollback tăng khoảng **4.600–5.000 trong vài giây**. Áp dụng bản sửa function ngay khi vòng lặp vẫn chạy giải phóng pool; read tiếp theo trả 200, dữ liệu giữ nguyên. Kiểm tra cả client còn chờ cũng nhận lỗi xung đột và kết thúc. Đây là số liệu local; chưa đo CPU/rate trực tiếp trên Supabase thật.

## Bản sửa tương thích Preview hiện tại

[Installer](../supabase/manual/fix_workspace_conflict_retry_safe.sql) chỉ thay cách báo lỗi tại **hai chỗ kiểm tra revision** của function incremental đã review. Chữ ký RPC, tham số, revision/CAS, RLS, trigger, logic ghi incremental, lịch sử và tombstone giữ nguyên.

- Tại Database dùng exception SQLSTATE `PGRST`, không nằm trong nhóm serialization retry.
- PostgREST trả **HTTP 409** và JSON `{code:"40001", message:"Workspace revision conflict", details:null, hint:null}`. Các Preview đang xử lý `error.code === '40001'` tiếp tục dùng luồng xung đột cũ; không cần sửa UI hoặc chuyển hostname chỉ để nhận bản sửa SQL này.
- Không đổi cơ chế xử lý serialization failure thật ở nơi khác và không thay cấu hình PostgREST.
- Không gọi function ghi để thử trên tài khoản thật trong lúc cài; không xóa hoặc chỉnh bản ghi ứng dụng. Chụp hash/count tám bảng và đối chiếu trong transaction.
- Preflight chỉ chấp nhận function incremental có body hash `668421235f9dc67cc75cf459a10d045d`, signature/security/permissions và cấu trúc/RLS/guards đúng. Bản khác hoặc chạy lại sẽ bị từ chối, không tự drop hay sửa rộng hơn.
- Lock timeout 5s và statement timeout 60s chỉ trong transaction cài. Owner, OID, ACL, search_path và dữ liệu được kiểm tra lại trước commit; lỗi rollback toàn bộ cài đặt.

Body hash sau sửa: **`3f50887f07c901afc81c32237eeb8a7e`**. [Diagnostics mới](../supabase/diagnostics/workspace_conflict_retry_readonly.sql) phải trả **5/5 true**. Diagnostics incremental đã cập nhật chấp nhận cả body trước/sau sửa, vẫn phải trả 11/11 true.

## Phạm vi kiểm thử và áp dụng

`python scripts/test-conflict-retry.py` chỉ tạo/xóa database `lbd_conflict_<random>` và API container `lbd-conflict-api-<random>` trong test stack Docker. Không đọc managed credentials hay kết nối project thật. `finally` luôn dừng container test để không để vòng lặp tái hiện tiếp tục chạy khi assertion lỗi.

Bốn nhóm kiểm tra: atomic install/data hashes/diagnostics/rerun, từ chối RLS/security/source lạ, chống khôi phục Habit/Task và owner RLS, cùng HTTP reproduction/closed client/in-flight client/giữ error contract/two-device CAS. Bản 16.5 cũng được kiểm tra tương thích bằng `LBD_POSTGREST_PROBE_IMAGE=postgrest/postgrest:v16.5 python scripts/test-conflict-retry.py` (không chạy bước tái hiện loop trên bản đó).

`scripts/local-auth-stack.mjs` nay dùng PostgREST 14.18 và tự áp dụng incremental + conflict protection trên database test cục bộ. Việc này bảo đảm integration tests đi qua cùng lớp transaction như production. Bản Postgres local vẫn là 15, chưa phải đúng PG17.11 của nguồn backup production; không khẳng định kết quả hiệu năng production từ local.

Kết quả bản sửa: **4/4 nhóm SQL/API** trên 14.18 và **4/4** nhóm tương thích trên 16.5; **145/145 unit**, **29/29 integration** trên stack mặc định 14.18; build thành công. Integration bao gồm signup/login, hai thiết bị, CAS, offline/reconnect, dữ liệu cục bộ khi timeout, Task/Checklist/Calendar/Focus History và xóa Habit/Task lặp. Giao diện không thay đổi nên không chạy lại bộ e2e UI riêng. Chưa kiểm tra Safari thật hoặc áp dụng/đo kết quả của SQL mới trên project thật.

Chỉ sau khi chủ dự án phê duyệt riêng installer này mới hướng dẫn áp dụng lên `lbd-focus-db`. Phê duyệt installer incremental hoặc restart trước đó không được hiểu thành phê duyệt bản sửa này.

Sau khi cài: chạy diagnostics chỉ đọc, xem pool/API và CPU hiện tại, rồi mở một thiết bị trên Preview hiện tại để thử read/sync trước. Nếu app hiện xung đột dữ liệu, phải giữ bản cục bộ và xem/backup các thay đổi trước khi chọn bản máy chủ hoặc bản thiết bị. Sau đó mới kiểm tra cùng tài khoản trên iPhone và xóa Habit/Task lặp tạm. Không đánh dấu hoàn tất khi chưa có kết quả thực tế.

Không restart lặp lại hoặc terminate PID cũ để thay cho sửa nguyên nhân. Không rollback về SQLSTATE `40001` vì sẽ khôi phục lỗi retry; file rollback incremental cũ sẽ từ chối body mới. Nếu cần hoàn nguyên phải review một phương án cụ thể và phê duyệt riêng, giữ dữ liệu tài khoản hiện tại, không tự restore dump.
