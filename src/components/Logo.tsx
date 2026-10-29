export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" rx="112" className="fill-primary" />
      <rect
        x="148"
        y="112"
        width="232"
        height="300"
        rx="36"
        className="fill-primary-foreground opacity-35"
        transform="rotate(10 264 262)"
      />
      <rect x="132" y="104" width="232" height="300" rx="36" className="fill-primary-foreground" />
      <path d="M196 196h104M196 248h104M196 300h64" className="stroke-primary" strokeWidth="28" strokeLinecap="round" />
    </svg>
  );
}
