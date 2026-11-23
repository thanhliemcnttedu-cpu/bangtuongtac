/** Logo phần mềm: tấm bảng có các thẻ màu và dấu tích, cùng hình với favicon. */
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Bảng tương tác" style={{ filter: 'drop-shadow(0 8px 12px rgba(22,104,242,.35))' }}>
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4d98ff" /><stop offset=".6" stopColor="#1668f2" /><stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <rect x="11" y="13" width="42" height="38" rx="8" fill="#fff" fillOpacity=".95" />
      <rect x="16" y="19" width="12" height="14" rx="3" fill="#2f80ff" />
      <rect x="31" y="19" width="12" height="9" rx="3" fill="#14b8a6" />
      <rect x="16" y="36" width="12" height="9" rx="3" fill="#f59e0b" />
      <rect x="31" y="31" width="12" height="14" rx="3" fill="#7c5cff" />
      <circle cx="49" cy="15" r="7" fill="#f59e0b" />
      <path d="m45.8 15 2.2 2.2 4.2-4.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
