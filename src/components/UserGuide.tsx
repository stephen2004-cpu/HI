import { useRef, useState } from 'react';
import { BookOpen, ChevronDown, X } from 'lucide-react';

const sections = [
  {
    title: 'Bắt đầu',
    steps: [
      'Dùng thanh điều hướng để mở từng màn hình. Lịch là màn hình mặc định; bạn có thể mở Focus và dùng Timer ngay ở chế độ khách.',
      'Tạo Task, chọn nhóm ưu tiên, đưa việc vào Lịch rồi mở Focus khi bắt đầu làm. Bạn cũng có thể dùng Timer mà không chọn Task.',
      'Mở Tổng quan để xem tình hình chung và Thống kê để xem thời gian đã ghi nhận. Vào Cài đặt để xuất bản sao lưu JSON trước những thay đổi quan trọng.',
    ],
  },
  {
    title: 'Task & Eisenhower',
    steps: [
      'Mở Task, nhấn Tạo Task, nhập nội dung và lưu. Bạn có thể sửa, xóa hoặc tích hoàn thành trên thẻ Task.',
      'Chọn nhóm: Làm ngay (xanh lá), Lên lịch (vàng), Ủy quyền (xanh dương), Loại bỏ (hồng). Kéo thẻ giữa các nhóm hoặc dùng mục Chuyển nhóm. Màu tùy chỉnh không đổi nhóm ưu tiên.',
      'Chọn Ngày, Tuần hoặc Tháng và bộ lọc trạng thái để tìm việc. Task chưa có lịch nằm ở phần Task chưa lên lịch; kiểm tra thêm phần quá hạn để tránh bỏ sót.',
      'Dùng thao tác lên lịch trên thẻ hoặc mở Lịch để sắp xếp thời gian. Một Task có thể có nhiều Time Block.',
    ],
  },
  {
    title: 'Calendar',
    steps: [
      'Mở Lịch, chọn chế độ ngày, tuần hoặc tháng. Dùng lịch nhỏ và các nút chuyển thời gian để đến ngày cần xem; cuộn trục giờ để xem đủ 24 giờ.',
      'Kéo Task chưa lên lịch vào ô giờ để tạo Time Block. Trên điện thoại, dùng biểu mẫu Time Block để chọn Task và nhập ngày, giờ bắt đầu, kết thúc rồi lưu.',
      'Kéo Time Block để đổi ngày hoặc giờ; kéo cạnh dưới để đổi thời lượng. Bạn cũng có thể nhấn nút sửa trên block để nhập thời gian chính xác.',
      'Nhấn Time Block của Task để mở Focus cho việc đó. Planned Time được tính từ thời lượng đã lên lịch; màu của block theo Task.',
    ],
  },
  {
    title: 'Focus',
    steps: [
      'Chọn Task nếu muốn liên kết phiên làm việc, hoặc dùng Timer độc lập. Chọn Đồng hồ đếm ngược hay Chế độ học tập và thiết lập thời gian trước khi bắt đầu.',
      'Nhấn Bắt đầu tập trung. Dùng các nút tạm dừng, tiếp tục hoặc kết thúc theo nhu cầu. Actual Time chỉ ghi thời gian làm thực tế, không gồm thời gian tạm dừng hoặc nghỉ.',
      'Trong workspace, Timer ở bên trái; checklist, ghi chú, đầu ra cần đạt và kết quả thực tế ở bên phải. Trên điện thoại, các phần xếp theo chiều dọc.',
      'Tự cập nhật checklist và kết quả khi làm việc. Timer kết thúc không tự đánh dấu Habit hoàn thành. Điều chỉnh âm lượng tại Focus và dùng Tắt chuông khi báo hết giờ.',
    ],
  },
  {
    title: 'Habit',
    steps: [
      'Mở Thói quen, nhập tên, nhóm, ngày lặp lại, mục tiêu mỗi tuần và số phút khi kết nối Focus. Habit là việc duy trì lặp lại; Task là việc cần hoàn thành một kết quả cụ thể.',
      'Nếu muốn có lịch tự động, bật Lịch lặp tự động trên Calendar, chọn ngày bắt đầu và giờ bắt đầu rồi lưu. Thời lượng lấy từ Phút khi kết nối Focus; lịch lặp theo các ngày đã chọn qua các tuần.',
      'Xem theo tuần hoặc tháng và tự đánh dấu ngày đã làm. Chưa nhập dữ liệu không có nghĩa là thất bại; bạn có thể ghi nhận tạm nghỉ và xem tiến độ, mục tiêu, chuỗi ngày.',
      'Dùng các thao tác kết nối Lịch hoặc Focus khi cần. Có thể tạm dừng, tiếp tục hoặc kết thúc lịch lặp; lịch sử đã hoàn thành được giữ. Hết giờ Timer không tự hoàn thành Habit.',
    ],
  },
  {
    title: 'Tài khoản & đồng bộ',
    steps: [
      'Mở khu vực tài khoản ở đầu trang để đăng ký hoặc đăng nhập bằng email. Xác nhận email nếu được yêu cầu. Nếu quên mật khẩu, chọn Quên mật khẩu và mở liên kết mới nhất trong email.',
      'Đăng nhập cùng tài khoản trên MacBook và iPhone để tải dữ liệu tài khoản khi Supabase được cấu hình và có mạng. Theo dõi trạng thái đồng bộ; nên dùng một tab chỉnh sửa và đợi đồng bộ trước khi đổi thiết bị.',
      'Dữ liệu khách chỉ nằm trên trình duyệt đang dùng và không tự nhập vào tài khoản. Sau khi đăng nhập, sao lưu dữ liệu khách, đọc xác nhận rồi chọn nhập nếu muốn chuyển dữ liệu vào tài khoản.',
      'Nếu có xung đột, xuất bản sao lưu và kiểm tra trước khi chọn bản máy chủ hay bản thiết bị. Đăng xuất không xóa dữ liệu đã lưu; Timer vẫn dùng được ở chế độ khách.',
    ],
  },
];

export default function UserGuide() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="button guide-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="user-guide"
        onClick={() => {
          dialog.current?.showModal();
          setOpen(true);
        }}
      >
        <BookOpen size={17} aria-hidden="true" />
        <span>Hướng dẫn sử dụng</span>
      </button>
      <dialog
        ref={dialog}
        id="user-guide"
        className="user-guide"
        aria-labelledby="user-guide-title"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <div className="guide-panel">
          <div className="guide-heading">
            <div>
              <p className="guide-eyebrow">LBD FOCUS · CÙNG BẮT ĐẦU</p>
              <h2 id="user-guide-title">Hướng dẫn sử dụng</h2>
            </div>
            <button
              type="button"
              className="button guide-close"
              aria-label="Đóng hướng dẫn"
              autoFocus
              onClick={() => dialog.current?.close()}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="guide-content">
            <p className="guide-intro">
              Đi từng bước, theo nhịp của bạn. Mở một mục bên dưới để xem cách
              dùng.
            </p>
            {sections.map((section, index) => (
              <details
                key={section.title}
                open={index === 0 ? true : undefined}
              >
                <summary>
                  <span className="guide-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{section.title}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <ol>
                  {section.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </details>
            ))}
            <p className="guide-footnote">
              Bảng hướng dẫn chỉ để đọc; mở hoặc đóng bảng không thay đổi dữ
              liệu hay dừng Timer.
            </p>
          </div>
        </div>
      </dialog>
    </>
  );
}
