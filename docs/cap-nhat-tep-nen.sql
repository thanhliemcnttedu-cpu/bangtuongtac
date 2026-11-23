-- Cho phép giáo viên đính kèm tệp nén (.zip, .rar, .7z) vào tài liệu. Học sinh / khách vẫn KHÔNG tải tệp nén lên được.
-- Chạy một lần trong Supabase -> SQL Editor. An toàn khi chạy lại.

-- 1) Thêm loại tệp nén vào danh sách kho chấp nhận.
update storage.buckets
set allowed_mime_types = (
  select array(select distinct unnest(allowed_mime_types || array['application/zip', 'application/vnd.rar', 'application/x-7z-compressed']))
)
where id = 'board-files';

-- 2) Chỉ chủ bảng / đồng quản lý được ghi tệp có đuôi .zip .rar .7z; khách và học sinh bị từ chối ở phía máy chủ.
drop policy if exists board_files_insert on storage.objects;
create policy board_files_insert on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'board-files'
    and public.can_upload_to_board((storage.foldername(name))[1])
    and (
      name !~* '\.(zip|rar|7z)$'
      or (auth.uid() is not null and public.is_board_manager(((storage.foldername(name))[1])::uuid))
    )
  );
