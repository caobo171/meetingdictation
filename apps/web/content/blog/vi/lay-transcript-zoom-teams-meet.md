---
title: Lấy file transcript từ Zoom, Teams và Google Meet để luyện nghe
category: guides
publishedAt: 2026-11-15
excerpt: Bản ghi cuộc họp chỉ thành bài dictation khi có transcript đi kèm. Bài này giải thích file .vtt là gì và cách tìm transcript trên Zoom, Teams, Google Meet.
metaTitle: Lấy transcript .vtt từ Zoom, Teams, Google Meet
metaDescription: Cách tìm file transcript từ bản ghi Zoom, Microsoft Teams và Google Meet để luyện nghe chép chính tả, file .vtt và .srt là gì, và những điều cần lưu ý.
focusKeyword: lấy transcript zoom teams meet
tags:
  - transcript
  - zoom
  - microsoft teams
  - google meet
  - hướng dẫn
takeaways:
  - Bản ghi cuộc họp cần có transcript đi kèm thì mới chép chính tả được, và tính năng này phải được bật từ trước hoặc ngay trong cuộc họp.
  - Zoom tạo file .vtt cho cloud recording khi bật audio transcript; Teams và Meet tạo transcript khi bật tính năng ghi lời và tổ chức cho phép.
  - Menu và tùy chọn khác nhau theo gói dịch vụ và cài đặt của quản trị viên, nên hãy hỏi bộ phận IT nếu bạn không thấy.
---

Bản ghi một cuộc họp thật là bài nghe sát với công việc nhất mà bạn có thể tìm được: đúng giọng đồng nghiệp, đúng thuật ngữ dự án, đúng tốc độ mà bạn phải theo kịp mỗi tuần. Để biến bản ghi đó thành bài nghe chép chính tả, bạn cần thêm một thứ: file transcript có mốc thời gian, để từng câu chữ khớp với từng đoạn âm thanh.

Bài này giải thích file transcript là gì, tìm nó ở đâu trên Zoom, Microsoft Teams và Google Meet, và cần lưu ý gì trước khi dùng bản ghi công việc để luyện tập. Một lưu ý chung trước khi bắt đầu: các nền tảng này thay đổi giao diện khá thường xuyên, và tùy chọn bạn thấy phụ thuộc vào gói dịch vụ cũng như cài đặt của quản trị viên. Vì vậy bài này mô tả ở mức tổng quát, không đi theo từng cú nhấp chuột.

## File .vtt và .srt là gì

Cả hai đều là file văn bản chứa lời nói kèm mốc thời gian bắt đầu và kết thúc của từng câu. File `.vtt` mở đầu bằng chữ `WEBVTT`, sau đó là từng đoạn như sau:

| Mốc thời gian | Lời nói |
|---|---|
| 00:01:12.400 --> 00:01:15.900 | Let's circle back on the budget next week. |
| 00:01:16.100 --> 00:01:19.300 | Can everyone see my screen? |

Câu thứ nhất, *"Let's circle back on the budget next week."*: Tuần sau mình quay lại chuyện ngân sách nhé. Câu thứ hai, *"Can everyone see my screen?"*: Mọi người có thấy màn hình của mình không?

File `.srt` gần giống, chỉ khác ở cách đánh số từng đoạn và dấu phân cách phần nghìn giây. Nhờ mốc thời gian, MeetingDictation biết câu nào bắt đầu và kết thúc ở đâu để phát từng câu cho bạn chép. Trên website, bạn tải lên file video hoặc audio cùng file transcript `.vtt` hoặc `.srt`.

## Zoom

Trong ba nền tảng, Zoom là nơi cho ra file `.vtt` rõ ràng nhất.

- **Cloud recording có audio transcript**: khi cuộc họp được ghi lên đám mây và cài đặt *audio transcript* được bật, sau khi bản ghi xử lý xong, Zoom tạo thêm một file transcript `.vtt` bên cạnh video. Bạn thường tìm thấy nó trong phần quản lý bản ghi trên trang web Zoom, cùng chỗ tải video.
- **Cài đặt cần bật trước**: transcript được tạo khi bản ghi được xử lý, nên nếu lúc đó cài đặt chưa bật thì bản ghi thường không có transcript. Hãy bật cho các cuộc họp sau.
- **Gói dịch vụ**: cloud recording và transcript thường gắn với tài khoản trả phí, và quản trị viên có thể khóa hoặc mở cài đặt này cho cả tổ chức.
- **Bản ghi lưu trên máy (local recording)**: thường chỉ có file video và audio, không kèm transcript.

Khi có cả video (hoặc file audio) và file `.vtt`, bạn tải cả hai lên website MeetingDictation là xong.

## Microsoft Teams

Teams có tính năng ghi lời (transcription) trong cuộc họp. Khi được bật, lời nói được chuyển thành văn bản ngay trong lúc họp, gắn tên người nói và mốc thời gian.

- **Bật trong cuộc họp**: người tổ chức hoặc người có quyền thường bật ghi hình và ghi lời từ menu tùy chọn thêm của cuộc họp. Một số tổ chức cài đặt để ghi lời tự động bắt đầu cùng ghi hình.
- **Tổ chức phải cho phép**: quản trị viên có thể tắt transcription. Nếu bạn không thấy tùy chọn này, rất có thể chính sách công ty đang chặn, không phải do bạn tìm sai chỗ.
- **Sau cuộc họp**: transcript thường xuất hiện trong phần tóm tắt của cuộc họp hoặc trong khung trò chuyện của cuộc họp đó. Tùy phiên bản, bạn có thể tải transcript xuống dưới dạng file, trong đó có định dạng `.vtt`.

Với Teams còn có một cách thuận tiện hơn. Bản ghi cuộc họp Teams thường được lưu trên OneDrive hoặc SharePoint và phát bằng Microsoft Stream. Tiện ích MeetingDictation chạy trực tiếp trên Microsoft Teams và Microsoft Stream trên SharePoint, đọc transcript có sẵn của trang và che nó đi. Nghĩa là nếu bản ghi đã có transcript, bạn có thể luyện ngay trên trang đó mà không cần tải file nào. Xem bài [cài và dùng tiện ích MeetingDictation](/blog/vi/cai-dat-tien-ich-meetingdictation) để biết cách bắt đầu.

## Google Meet

Google Meet cũng có tính năng transcript trên một số gói Google Workspace.

- **Bật trong cuộc họp**: khi tính năng có sẵn, người tổ chức hoặc người được phép có thể bật transcript từ menu công cụ trong cuộc họp. Người tham gia thường được thông báo khi transcript bắt đầu.
- **Kết quả là một tài liệu**: transcript của Meet thường được lưu thành một tài liệu Google Docs trong Google Drive của người tổ chức, và đường link thường được gửi qua email hoặc gắn vào sự kiện trên lịch. Bản ghi video, nếu có, cũng nằm trong Drive.
- **Tùy gói và quản trị viên**: tài khoản Gmail cá nhân thường không có tính năng này, và quản trị viên Workspace có thể bật hoặc tắt nó.

Điểm cần chú ý: tài liệu transcript của Meet là văn bản để đọc, không phải file `.vtt` hay `.srt`. Nếu bản ghi Meet của bạn có kèm file phụ đề `.vtt` hoặc `.srt`, hãy tải file đó lên cùng video. Nếu bạn mở bản ghi trong một trình phát có hiển thị phụ đề, có thể thử bấm nút tiện ích trên thanh công cụ trình duyệt, vì tiện ích chạy được trên bất kỳ tab nào khi bạn bấm vào nó và đọc phụ đề của trang. Còn nếu chỉ có văn bản thuần, bài [luyện dictation khi không có transcript chuẩn](/blog/vi/dictation-khi-khong-co-transcript) có vài hướng xử lý.

## Bảng tóm tắt

| Nền tảng | Transcript thường nằm ở đâu | Dùng với MeetingDictation |
|---|---|---|
| Zoom | File `.vtt` cạnh cloud recording, khi bật audio transcript | Tải video hoặc audio cùng file `.vtt` lên website |
| Microsoft Teams | Trong phần tóm tắt cuộc họp, có thể tải về; bản ghi phát qua Stream | Dùng tiện ích trên Teams hoặc Stream trên SharePoint, hoặc tải file lên website |
| Google Meet | Tài liệu Google Docs trong Drive của người tổ chức | Cần file `.vtt` hoặc `.srt`, hoặc trang có phụ đề để dùng tiện ích |

## Trước khi dùng bản ghi công việc để luyện tập

Bản ghi cuộc họp là tài liệu nội bộ. Vài nguyên tắc nên giữ:

1. **Chỉ dùng bản ghi bạn có quyền truy cập**. Đừng xin file của nhóm khác chỉ để luyện nghe.
2. **Đọc chính sách công ty**. Một số nơi không cho đưa dữ liệu cuộc họp lên dịch vụ bên ngoài. Nếu không chắc, hãy hỏi quản lý hoặc bộ phận IT, và dù dùng cách nào cũng làm theo quy định đó.
3. **Ưu tiên cuộc họp ít nhạy cảm**: buổi đào tạo, buổi chia sẻ kỹ thuật, all-hands, demo nội bộ. Đây cũng thường là những bản ghi có âm thanh rõ nhất.
4. **Báo trước khi ghi hình** nếu bạn là người tổ chức. Đó là phép lịch sự cơ bản, và nhiều nơi bắt buộc.

## Chọn đoạn nào để chép

Một cuộc họp dài một tiếng không cần chép hết. Hãy chọn:

- Phần mở đầu, khi mọi người chào hỏi và nêu chương trình. Nhiều câu ở đây tuần nào cũng gặp lại, như *"Let's get started."*: Mình bắt đầu nhé.
- Phần một người trình bày liền mạch 5-10 phút. Đoạn này dễ chép hơn đoạn nhiều người nói chen nhau.
- Phần chốt việc cuối buổi: *"So the action items are..."*: Vậy các việc cần làm là...

Bài [luyện nghe bằng bản ghi Zoom, Teams, Google Meet](/blog/vi/luyen-nghe-bang-ban-ghi-zoom-teams) đi sâu hơn vào cách tập với loại bài nghe này.

## Việc cần làm tuần này

- Kiểm tra xem công ty bạn dùng nền tảng nào và tính năng transcript có đang được bật không.
- Nếu bạn tổ chức họp trên Zoom có cloud recording, xem lại cài đặt audio transcript. Nếu dùng Teams, thử mở một bản ghi cũ xem đã có transcript chưa.
- Chọn một bản ghi ít nhạy cảm, lấy 10 phút đầu và chép thử. Nếu cần tải file lên website, bạn có thể [tạo tài khoản miễn phí](/signup).
