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
      viewBox="0 0 1080 1080"
      fill="none"
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <circle cx="540" cy="540" r="540" fill="#D7FF65" />
      <circle cx="540" cy="540" r="430" fill="#B8E92A" />
      <path
        d="M625.394 220.932C571.242 206.37 512.649 205.431 454.59 220.992C278.547 268.175 174.076 449.174 221.246 625.264C268.417 801.354 449.367 905.854 625.41 858.671C801.453 811.487 905.924 630.489 858.754 454.399L716.404 -77L557.027 -34.2836L625.394 220.932ZM497.295 380.412C585.317 356.82 675.792 409.07 699.377 497.115C722.962 585.16 670.726 675.659 582.705 699.251C494.684 722.843 404.209 670.593 380.623 582.548C357.038 494.503 409.274 404.003 497.295 380.412Z"
        fillRule="evenodd"
        clipRule="evenodd"
        fill="#17191C"
      />
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
