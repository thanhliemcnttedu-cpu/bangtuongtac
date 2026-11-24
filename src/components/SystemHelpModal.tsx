import { useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, HelpCircle, Loader2, RefreshCw } from 'lucide-react';
import { runSystemCheck } from '../lib/systemCheck';
import type { CheckItem } from '../lib/systemCheck';
import { ModalShell } from './ModalShell';

interface Props {
  /** true = đang dùng Supabase thật (kiểm tra được); false = bản mẫu. */
  isReal: boolean;
  initialTab?: 'check' | 'guide';
  /** Báo kết quả kiểm tra lên App (để hiện biểu ngữ khi còn thiếu). */
  onResult?: (missing: number) => void;
  onClose: () => void;
}

const GUIDE: { who: string; steps: string[] }[] = [
  { who: 'Giáo viên dạy lớp', steps: [
    'Bấm “Tạo bảng” → chọn Một lớp / Cả khối / Một bài học → đặt tên.',
    'Bấm “Danh sách” để dán danh sách học sinh (mỗi dòng một em, có thể kèm tổ hoặc lớp).',
    'Bấm “Giao bài tập / yêu cầu”, đặt hạn nộp.',
    'Bấm “Chia sẻ & QR”: chiếu mã QR hoặc gửi link vào nhóm lớp. Học sinh không cần tài khoản.',
    'Xem tiến độ ở thẻ số liệu và trang “Báo cáo”; duyệt, chấm, nhận xét ngay trên bài.' ] },
  { who: 'Tổ trưởng / người giao việc', steps: [
    'Tạo bảng loại “Tổ / nhóm công tác”, dán danh sách: Họ tên, Vai trò, Gmail.',
    'Bấm “Giao việc”: chọn Cần minh chứng hoặc Chỉ đọc, đính kèm tài liệu / link khảo sát, đặt hạn, chọn lặp hằng tuần / tháng nếu cần.',
    'Mỗi việc có “Link & QR” riêng: chép tin nhắn mẫu gửi Zalo.',
    'Bấm “Báo cáo” của việc: xem ai đã nộp, ai chưa, bấm “Nhắc”, tải ZIP minh chứng, in PDF.',
    'Cuối tuần / tháng: “Tổng hợp tuần / tháng”. Giao việc cho riêng một người: “Việc của tôi” → “Giao việc cho đồng nghiệp”.' ] },
  { who: 'Học sinh', steps: [
    'Mở link hoặc quét mã QR cô gửi.',
    'Bấm nút “Nộp bài”, gõ tên và tổ, đính kèm ảnh hoặc bài làm rồi bấm Nộp.',
    'Nhớ tên đã ghi: muốn sửa hoặc nộp lại thì bấm “Sửa bài đã nộp” rồi gõ đúng tên đó.',
    'Xem khối “Bài của tôi” để biết bài đã tới bước nào.' ] },
  { who: 'Thành viên trong tổ', steps: [
    'Mở link tổ trưởng gửi (đã vào đúng việc), chọn tên của mình trong danh sách.',
    'Việc cần minh chứng: chụp hoặc chọn ảnh / tệp rồi bấm “Nộp minh chứng”. Việc chỉ đọc: bấm “Tôi đã đọc”.',
    'Giờ nộp do hệ thống tự ghi. Nộp lại cùng việc thì bản mới thay bản cũ.' ] },
];

/** Kiểm tra hệ thống (đã chạy đủ các phần cập nhật chưa) và hướng dẫn nhanh một trang cho từng vai trò. */
export function SystemHelpModal({ isReal, initialTab = 'check', onResult, onClose }: Props) {
  const [tab, setTab] = useState<'check' | 'guide'>(initialTab);
  const [items, setItems] = useState<CheckItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true);
    const r = await runSystemCheck();
    setItems(r); setBusy(false);
    onResult?.(r.filter((x) => x.state === 'missing').length);
  };
  useEffect(() => { if (isReal) void run(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const missing = items?.filter((x) => x.state === 'missing') ?? [];
  const upgrade = items?.filter((x) => x.state === 'upgrade') ?? [];
  return (
    <ModalShell title="Hỗ trợ sử dụng" onClose={onClose} maxWidth="max-w-3xl">
      <div className="space-y-3">
        <div className="flex gap-1 border-b border-brand-100" role="tablist" aria-label="Hỗ trợ">
          {([['check', 'Kiểm tra hệ thống', HelpCircle], ['guide', 'Hướng dẫn nhanh', BookOpen]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`-mb-px flex items-center gap-1.5 border-b-[3px] px-3 py-2 text-sm font-extrabold ${tab === id ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-2 hover:text-ink'}`}><Icon className="h-4 w-4" aria-hidden /> {label}</button>
          ))}
        </div>

        {tab === 'check' && (
          <section aria-label="Kiểm tra hệ thống" className="space-y-2">
            {!isReal && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Đang chạy bằng <b>dữ liệu mẫu</b> (chưa nối Supabase) nên không có gì để kiểm tra. Khi đã nối Supabase và đăng nhập Gmail, mở lại mục này.</p>}
            {isReal && busy && !items && <p role="status" className="flex items-center gap-2 text-sm text-ink-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang kiểm tra…</p>}
            {items && (
              <>
                <p role="status" className={`rounded-xl px-3 py-2 text-sm font-bold ${missing.length > 0 ? 'bg-rose-50 text-rose-800' : upgrade.length > 0 ? 'bg-amber-50 text-amber-900' : 'bg-emerald-50 text-emerald-900'}`}>
                  {missing.length === 0 ? (upgrade.length === 0 ? 'Hệ thống đã đủ các phần cập nhật.' : 'Các phần bắt buộc đã đủ. Có 1 mục nên nâng cấp (không bắt buộc), xem bên dưới.') : `Còn thiếu ${missing.length} phần: các tính năng liên quan chưa hoạt động đúng cho đến khi bổ sung.`}
                </p>
                <ul className="space-y-1.5">
                  {items.map((it) => (
                    <li key={it.key} className="flex items-start gap-2 rounded-xl border border-brand-100 bg-white px-3 py-2 text-sm">
                      {it.state === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Đạt" /> : <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${it.state === 'missing' ? 'text-rose-600' : 'text-amber-600'}`} aria-label={it.state === 'missing' ? 'Thiếu' : it.state === 'upgrade' ? 'Nên nâng cấp' : 'Chưa kiểm được'} />}
                      <span className="min-w-0"><b className="block font-semibold">{it.label}</b>{it.state !== 'ok' && <span className="block text-xs text-ink-2">{it.state === 'missing' || it.state === 'upgrade' ? it.fix : 'Chưa kiểm được (mất mạng hoặc chưa đăng nhập). Thử lại sau.'}</span>}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {isReal && <button type="button" onClick={() => void run()} disabled={busy} className="btn-ghost btn-sm"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Kiểm tra lại</button>}
          </section>
        )}

        {tab === 'guide' && (
          <section aria-label="Hướng dẫn nhanh" className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {GUIDE.map((g) => (
              <article key={g.who} className="rounded-2xl border-[1.5px] border-brand-100 bg-white p-3">
                <h3 className="mb-1.5 text-sm font-extrabold text-brand-700">{g.who}</h3>
                <ol className="list-decimal space-y-1 pl-5 text-sm">{g.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              </article>
            ))}
          </section>
        )}
      </div>
    </ModalShell>
  );
}
