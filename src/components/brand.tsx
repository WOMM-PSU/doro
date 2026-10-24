import { cn } from "@/lib/cn";

export function DoroMark({
  size = 32,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect width="32" height="32" rx="10" fill="#D7FF65" />
      <path
        d="M10.5 20.5c0-2.2 1.8-4 4-4h4.2a3.3 3.3 0 1 0 0-6.6h-3"
        stroke="#17191C"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <circle cx="10.5" cy="20.5" r="2.4" fill="#17191C" />
      <circle cx="15.8" cy="9.9" r="2.4" fill="#17191C" opacity="0.22" />
    </svg>
  );
}

export function DoroLogo({
  size = 30,
  onDark = false,
  withDot = true,
  className,
}: {
  size?: number;
  onDark?: boolean;
  withDot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <DoroMark size={size} />
      <span
        className={cn(
          "text-[26px] font-semibold leading-none tracking-[-0.045em]",
          onDark ? "text-white" : "text-ink",
        )}
        style={{ fontSize: size * 0.86 }}
      >
        doro
        {withDot ? <span className="text-lime">.</span> : null}
      </span>
    </span>
  );
}
