"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, CheckCircle2, Loader2, Star, X } from "lucide-react";
import type { TaskStatus } from "@/types";

import { cn } from "@/lib/cn";

export { cn };

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

type Variant = "lime" | "dark" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const BUTTON_VARIANTS: Record<Variant, string> = {
  lime: "bg-lime text-ink hover:bg-lime-deep active:bg-[#b6e13d] border border-transparent",
  dark: "bg-ink text-white hover:bg-ink-soft active:bg-black border border-transparent",
  outline:
    "bg-surface text-ink border border-line hover:border-[#cfd3c9] hover:bg-[#fbfcf9] active:bg-muted-surface",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-muted-surface",
  danger: "bg-danger-soft text-danger border border-[#f1d3ce] hover:bg-[#f7ded9]",
};

const BUTTON_SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[13px] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex select-none items-center justify-center rounded-full font-medium transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-transparent text-muted transition-colors hover:bg-muted-surface hover:text-ink disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Avatar / badges                                                            */
/* -------------------------------------------------------------------------- */

const AVATAR_SIZES = {
  xs: "size-7 text-[10px]",
  sm: "size-9 text-[11px]",
  md: "size-11 text-sm",
  lg: "size-16 text-lg",
  xl: "size-20 text-2xl",
} as const;

export function Avatar({
  name,
  initials,
  color,
  size = "md",
  verified,
  className,
}: {
  name: string;
  initials: string;
  color: string;
  size?: keyof typeof AVATAR_SIZES;
  verified?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      title={name}
    >
      <span
        role="img"
        aria-label={name}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-semibold tracking-wide text-ink ring-1 ring-black/5",
          AVATAR_SIZES[size],
        )}
        style={{ backgroundColor: color }}
      >
        {initials}
      </span>
      {verified ? (
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-surface p-[1px]">
          <BadgeCheck className="size-4 text-ink" aria-label="Verified demo profile" />
        </span>
      ) : null}
    </span>
  );
}

const STATUS_STYLES: Record<TaskStatus, { label: string; className: string; dot: string }> = {
  OPEN: { label: "Open", className: "bg-lime-soft text-ink border-[#e3f2b5]", dot: "bg-[#9dc22f]" },
  ASSIGNED: { label: "Assigned", className: "bg-[#edf1f7] text-[#3c4c63] border-[#dfe6f0]", dot: "bg-[#5b7395]" },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-warning-soft text-warning border-[#f2e2b9]",
    dot: "bg-[#c99a2e]",
  },
  AWAITING_CONFIRMATION: {
    label: "Awaiting confirmation",
    className: "bg-[#eaf2fb] text-[#2d5377] border-[#d7e7f5]",
    dot: "bg-[#4b83b4]",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-success-soft text-success border-[#d4ebda]",
    dot: "bg-[#3f9160]",
  },
  CANCELLED: { label: "Cancelled", className: "bg-muted-surface text-muted border-line", dot: "bg-[#9ca197]" },
  EXPIRED: { label: "Expired", className: "bg-muted-surface text-muted border-line", dot: "bg-[#9ca197]" },
  DISPUTED: { label: "Disputed", className: "bg-danger-soft text-danger border-[#f1d3ce]", dot: "bg-[#bf5858]" },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.OPEN;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide",
        style.className,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", style.dot)} aria-hidden />
      {style.label}
    </span>
  );
}

export function Pill({
  children,
  className,
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: "neutral" | "lime" | "dark" | "success" | "danger" | "warning";
}) {
  const tones = {
    neutral: "bg-muted-surface text-muted border-transparent",
    lime: "bg-lime-soft text-ink border-[#e3f2b5]",
    dark: "bg-ink text-white border-transparent",
    success: "bg-success-soft text-success border-[#d4ebda]",
    danger: "bg-danger-soft text-danger border-[#f1d3ce]",
    warning: "bg-warning-soft text-warning border-[#f2e2b9]",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Money({
  cents,
  className,
  size = "md",
}: {
  cents: number;
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = {
    sm: "text-sm",
    md: "text-lg",
    lg: "text-2xl",
    xl: "text-[34px]",
  };
  return (
    <span className={cn("tabular font-semibold tracking-tight", sizes[size], className)}>
      ${(cents / 100).toFixed(2)}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

const CONTROL =
  "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm text-text placeholder:text-[#a2a69f] transition-colors focus:border-[#b9beb2] focus:outline-none focus:ring-4 focus:ring-ink/5 disabled:cursor-not-allowed disabled:bg-muted-surface";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-11", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "min-h-[96px] resize-y leading-relaxed", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, "h-11 appearance-none pr-9", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  optional,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  optional?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-ink">
          {label}
          {optional ? <span className="ml-1.5 font-normal text-muted">optional</span> : null}
        </label>
        {hint ? <span className="text-[11px] text-muted">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1.5 text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
  size = "md",
}: {
  options: { value: T; label: string; icon?: ReactNode; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-surface p-1",
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium transition-colors",
              size === "sm" ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-[13px]",
              selected ? "bg-ink text-white" : "text-muted hover:bg-muted-surface hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
            {typeof option.count === "number" ? (
              <span
                className={cn(
                  "tabular rounded-full px-1.5 text-[10px]",
                  selected ? "bg-white/15 text-white" : "bg-muted-surface text-muted",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 flex">
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-5 appearance-none rounded-md border border-[#cfd3c9] bg-surface checked:border-ink checked:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
        <CheckCircle2
          className="pointer-events-none absolute left-0.5 top-0.5 size-4 text-lime opacity-0 peer-checked:opacity-100"
          aria-hidden
        />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? <span className="mt-0.5 block text-xs leading-relaxed text-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* Modal                                                                      */
/* -------------------------------------------------------------------------- */

// Dialogs can stack (e.g. Report over a task sheet). Only the topmost one
// handles keys, and the body scroll lock is released once the last one closes,
// whatever order they unmount in.
const openModals: symbol[] = [];
let overflowBeforeModals = "";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "center",
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "center" | "sheet";
  size?: "sm" | "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const token = Symbol("modal");
    if (openModals.length === 0) {
      overflowBeforeModals = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModals.push(token);
    const focusTimer = window.setTimeout(() => {
      const target =
        panelRef.current?.querySelector<HTMLElement>("[data-autofocus]") ??
        panelRef.current?.querySelector<HTMLElement>(
          "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])",
        );
      (target ?? panelRef.current)?.focus();
    }, 30);

    const handleKey = (event: KeyboardEvent) => {
      if (openModals[openModals.length - 1] !== token) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(focusTimer);
      openModals.splice(openModals.indexOf(token), 1);
      if (openModals.length === 0) document.body.style.overflow = overflowBeforeModals;
      previousActive?.focus?.();
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const sizes = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-5xl",
  } as const;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex bg-ink/35 backdrop-blur-[2px]",
        variant === "sheet"
          ? "items-stretch justify-end"
          : "items-end justify-center p-0 sm:items-center sm:p-6",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex w-full flex-col overflow-hidden bg-canvas outline-none animate-in",
          variant === "sheet"
            ? "h-full max-w-[580px] shadow-lift"
            : cn(
                "max-h-[92dvh] rounded-t-[28px] shadow-lift sm:rounded-[28px]",
                sizes[size],
              ),
        )}
      >
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-4 border-b border-line bg-canvas/95 px-5 py-4 backdrop-blur sm:px-6",
            variant === "sheet" && "pt-5",
          )}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-tight text-ink sm:text-xl">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-[13px] leading-relaxed text-muted">
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="-mr-1 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-surface px-5 py-4 sm:px-6">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* -------------------------------------------------------------------------- */
/* Empty / misc                                                               */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#d9ddd2] bg-[#fbfcf9] px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-lime text-ink">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Stars({
  value,
  size = 14,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          style={{ width: size, height: size }}
          className={star <= Math.round(value) ? "fill-[#1d1f23] text-[#1d1f23]" : "fill-transparent text-[#c9cdc4]"}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Toasts                                                                     */
/* -------------------------------------------------------------------------- */

export type ToastTone = "default" | "success" | "error";
export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

export const ToastContext = createContext<{
  toast: (message: string, tone?: ToastTone) => void;
}>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-[72px] z-[60] flex flex-col items-center gap-2 px-4 sm:top-4"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            "pointer-events-auto flex max-w-[min(420px,92vw)] items-start gap-2.5 rounded-2xl border px-4 py-3 text-sm shadow-lift animate-rise",
            item.tone === "error"
              ? "border-[#f1d3ce] bg-danger-soft text-danger"
              : item.tone === "success"
                ? "border-[#d4ebda] bg-success-soft text-success"
                : "border-line bg-ink text-white",
          )}
        >
          {item.tone === "success" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
          <span className="leading-snug">{item.message}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}
