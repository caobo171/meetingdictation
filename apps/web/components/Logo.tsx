/**
 * The MeetingDictation mark: a speech bubble holding what you hear (sound
 * bars) and what you type (a caret), with a gold "you got it" dot.
 */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#4F46E5" />
      <path
        d="M15 15h34a7 7 0 0 1 7 7v16a7 7 0 0 1-7 7H31l-10 8.5V45h-6a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7z"
        fill="#FFFCF5"
      />
      <rect x="16" y="26" width="4" height="8" rx="2" fill="#4F46E5" />
      <rect x="23" y="21" width="4" height="18" rx="2" fill="#4F46E5" />
      <rect x="30" y="24.5" width="4" height="11" rx="2" fill="#4F46E5" />
      <rect x="40" y="20" width="3.5" height="20" rx="1.75" fill="#14181F" />
      <circle cx="50" cy="15" r="6.5" fill="#F2C744" stroke="#4F46E5" strokeWidth="2.5" />
    </svg>
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="font-semibold tracking-tight text-foreground" style={{ fontSize: size * 0.58 }}>
        Meeting<span className="text-primary">Dictation</span>
      </span>
    </span>
  );
}
