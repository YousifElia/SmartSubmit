/** SmartSubmit mark: a form line being completed into a check. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SmartSubmit">
      <defs>
        <linearGradient id="ss-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c5cff" />
          <stop offset="1" stopColor="#4f2bcc" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#ss-g)" />
      <rect x="14" y="17" width="24" height="5" rx="2.5" fill="#fff" opacity=".55" />
      <rect x="14" y="29.5" width="15" height="5" rx="2.5" fill="#fff" opacity=".55" />
      <path
        d="M15.5 45.5l7.2 7 26-27.5"
        fill="none"
        stroke="#fff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="text-[17px] font-semibold tracking-tight text-ink">SmartSubmit</span>
    </span>
  );
}
