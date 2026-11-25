// Hàm Edge (Deno) gửi nhắc việc đẩy. Được pg_cron gọi mỗi 15 phút (xem docs/HUONG-DAN-NHAC-VIEC-DAY.md).
// Bí mật cần đặt: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), CRON_SECRET.
// SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY do Supabase tự cấp. Triển khai với --no-verify-jwt (hàm tự kiểm tra x-cron-secret).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Sub { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; prefs: { soonHours?: number; overdue?: boolean; report?: boolean } | null }
interface Task { id: string; board_id: string; label: string; due_at: string | null; report_due_at: string | null; progress: string | null }

const DAY = 86_400_000;
const OPEN = (t: Task): boolean => !['done', 'cancelled', 'postponed'].includes(t.progress ?? 'todo');
const fmt = (iso: string): string => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

Deno.serve(async (req: Request) => {
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const pub = Deno.env.get('VAPID_PUBLIC_KEY');
  const priv = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!pub || !priv) return new Response('Thiếu khóa VAPID', { status: 500 });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com', pub, priv);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const now = Date.now();
  const since = new Date(now - 3 * DAY).toISOString();
  const { data: subs, error } = await db.from('push_subscriptions').select('id,user_id,endpoint,p256dh,auth,prefs');
  if (error) return new Response(error.message, { status: 500 });
  const list = (subs ?? []) as Sub[];

  // Việc cá nhân của từng người (bảng việc riêng, chưa xóa), gom theo chủ.
  const tasksOf = new Map<string, Task[]>();
  for (const uid of new Set(list.map((s) => s.user_id))) {
    const { data: boards } = await db.from('boards').select('id').eq('owner_id', uid).is('deleted_at', null).eq('settings->>personal', 'true');
    const ids = (boards ?? []).map((b: { id: string }) => b.id);
    if (ids.length === 0) { tasksOf.set(uid, []); continue; }
    const { data: tasks } = await db.from('board_tasks').select('id,board_id,label,due_at,report_due_at,progress').in('board_id', ids).or(`due_at.gte.${since},report_due_at.gte.${since}`);
    tasksOf.set(uid, ((tasks ?? []) as Task[]).filter(OPEN));
  }

  let sent = 0;
  let dead = 0;
  for (const s of list) {
    const soonMs = (s.prefs?.soonHours ?? 24) * 3_600_000;
    const wantOverdue = s.prefs?.overdue !== false;
    const wantReport = s.prefs?.report !== false;
    const { data: done } = await db.from('push_sent').select('key').eq('sub_id', s.id);
    const have = new Set((done ?? []).map((d: { key: string }) => d.key));
    const msgs: { key: string; title: string; body: string }[] = [];
    for (const t of tasksOf.get(s.user_id) ?? []) {
      if (t.due_at) {
        const due = new Date(t.due_at).getTime();
        if (due < now && due >= now - 3 * DAY && wantOverdue) msgs.push({ key: `${t.id}:overdue:${t.due_at}`, title: `Quá hạn: ${t.label}`, body: `Hạn ${fmt(t.due_at)}` });
        else if (due >= now && due <= now + soonMs) msgs.push({ key: `${t.id}:soon:${t.due_at}`, title: `Sắp đến hạn: ${t.label}`, body: `Hạn ${fmt(t.due_at)}` });
      }
      if (t.report_due_at && wantReport) {
        const r = new Date(t.report_due_at).getTime();
        if (r >= now - 3 * DAY && r <= now + soonMs) msgs.push({ key: `${t.id}:report:${t.report_due_at}`, title: `${r < now ? 'Quá hạn báo cáo' : 'Sắp đến hạn báo cáo'}: ${t.label}`, body: `Hạn báo cáo ${fmt(t.report_due_at)}` });
      }
    }
    // Tối đa 10 nhắc mỗi lượt cho một thiết bị, tránh dồn dập khi mới bật.
    for (const m of msgs.filter((x) => !have.has(x.key)).slice(0, 10)) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: m.title, body: m.body, url: '/?p=my', tag: m.key }), { TTL: 3600 });
        await db.from('push_sent').insert({ sub_id: s.id, key: m.key });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        // Thiết bị đã gỡ đăng ký (404, 410): xóa dòng để lần sau khỏi gửi.
        if (code === 404 || code === 410) { await db.from('push_subscriptions').delete().eq('id', s.id); dead++; break; }
        console.error('push lỗi', code, (e as Error).message);
      }
    }
  }
  await db.from('push_sent').delete().lt('sent_at', new Date(now - 30 * DAY).toISOString());
  return Response.json({ subscriptions: list.length, sent, removed: dead });
});
