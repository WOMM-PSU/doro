"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Check,
  ClipboardList,
  Compass,
  Plus,
  RotateCcw,
  UserRound,
} from "lucide-react";
import type { User } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import { DEMO_MODE } from "@/lib/demo-mode";
import { DoroLogo } from "@/components/brand";
import {
  Avatar,
  Button,
  Modal,
  cn,
  useToast,
} from "@/components/ui";
import { getUserStats, unreadCount } from "@/features/selectors";
import { TaskDetailSheet } from "@/components/task-detail";
import { PostTaskDialog } from "@/components/post-task";
import { ReportDialog } from "@/components/report";
import { AcceptTaskDialog } from "@/components/accept-dialog";
import { Onboarding } from "@/components/onboarding";

const NAV = [
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/activity", label: "Activity", icon: ClipboardList },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/profile", label: "Profile", icon: UserRound },
] as const;

const ROLE_LABEL: Record<User["role"], string> = {
  requester: "Usually requests",
  helper: "Usually helps",
  both: "Requests & helps",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const [resetOpen, setResetOpen] = useState(false);
  const unread = unreadCount(state, user.id);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const switchPersona = (persona: User) => {
    if (persona.id === user.id) {
      ui.closePersona();
      return;
    }
    store.setActiveUser(persona.id);
    ui.closePersona();
    toast(`Now viewing Doro as ${persona.name}.`, "success");
  };

  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col bg-ink px-4 pb-5 pt-6 text-white lg:flex">
        <Link href="/discover" className="px-2" aria-label="Doro home">
          <DoroLogo size={30} onDark />
        </Link>
        <Button
          variant="lime"
          className="mt-6 w-full justify-between px-4"
          onClick={ui.openCompose}
        >
          <span className="inline-flex items-center gap-2">
            <Plus className="size-4" aria-hidden />
            Post a task
          </span>
        </Button>

        <nav aria-label="Main" className="mt-7 space-y-1">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                  active
                    ? "bg-white/[0.08] text-white"
                    : "text-white/55 hover:bg-white/[0.05] hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    "size-[18px]",
                    active ? "text-lime" : "text-white/40 group-hover:text-white/70",
                  )}
                  aria-hidden
                />
                <span className="flex-1">{item.label}</span>
                {item.label === "Notifications" && unread > 0 ? (
                  <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-lime px-1.5 text-[10px] font-semibold text-ink">
                    {unread}
                  </span>
                ) : null}
                {active ? <span className="size-1.5 rounded-full bg-lime" aria-hidden /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto space-y-3">
          {DEMO_MODE ? (
          <button
            type="button"
            onClick={ui.openPersona}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 text-left transition-colors hover:bg-white/[0.08]"
          >
            <Avatar
              name={user.name}
              initials={user.initials}
              color={user.avatarColor}
              size="sm"
              verified={user.verified}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold">{user.name}</span>
              <span className="block truncate text-[11px] text-white/45">Switch persona</span>
            </span>
          </button>
          ) : (
            <Link
              href="/profile"
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-2.5 text-left transition-colors hover:bg-white/[0.08]"
            >
              <Avatar
                name={user.name}
                initials={user.initials}
                color={user.avatarColor}
                size="sm"
                verified={user.verified}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{user.name}</span>
                <span className="block truncate text-[11px] text-white/45">Your profile</span>
              </span>
            </Link>
          )}
          {DEMO_MODE ? (
            <p className="px-1 text-[10px] text-white/30">Demo environment · no real charges</p>
          ) : null}
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur-md lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/discover" aria-label="Doro home">
            <DoroLogo size={27} />
          </Link>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={ui.openCompose}
              aria-label="Post a task"
              className="mr-0.5 flex size-9 items-center justify-center rounded-full bg-lime text-ink transition-transform active:scale-95"
            >
              <Plus className="size-4" aria-hidden />
            </button>
            <Link
              href="/notifications"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
              title="Notifications"
              className="relative inline-flex size-10 items-center justify-center rounded-full text-muted transition-colors hover:bg-muted-surface hover:text-ink"
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 ? (
                <span className="tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-canvas bg-ink px-1 text-[9px] font-bold text-lime">
                  {unread}
                </span>
              ) : null}
            </Link>
            {DEMO_MODE ? (
              <button
                type="button"
                onClick={ui.openPersona}
                className="ml-0.5 rounded-full p-0.5"
                aria-label={`Current persona: ${user.name}. Switch demo persona`}
              >
                <Avatar name={user.name} initials={user.initials} color={user.avatarColor} size="sm" />
              </button>
            ) : (
              <Link href="/profile" aria-label="Your profile" className="ml-0.5 rounded-full p-0.5">
                <Avatar name={user.name} initials={user.initials} color={user.avatarColor} size="sm" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main id="main-content" className="lg:pl-[252px]">
        <div className="mx-auto w-full max-w-[1220px] px-4 pb-32 pt-5 sm:px-6 lg:px-9 lg:pb-16 lg:pt-8">
          {children}
        </div>
      </main>

      <nav
        aria-label="Main"
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-2 pt-1.5 backdrop-blur-md lg:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-14 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <span className={cn("relative rounded-full px-2.5 py-1", active && "bg-lime-soft")}>
                  <Icon className="size-[19px]" aria-hidden />
                  {item.label === "Notifications" && unread > 0 ? (
                    <span className="absolute -right-0.5 top-0 size-2 rounded-full border border-surface bg-ink" />
                  ) : null}
                </span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {DEMO_MODE && pathname.startsWith("/discover") && !state.onboardingDismissed ? (
        <Onboarding />
      ) : null}

      {DEMO_MODE ? (
        <PersonaModal
          open={ui.personaOpen}
          onClose={ui.closePersona}
          onSelect={switchPersona}
          onReset={() => setResetOpen(true)}
        />
      ) : null}

      <Modal
        open={DEMO_MODE && resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset the demo?"
        description="This restores the seeded tasks, people, offers and messages. Anything you posted or changed in this browser will be removed."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Keep my demo
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetDemo();
                setResetOpen(false);
                ui.closePersona();
                toast("Demo reset to the original sample data.", "success");
              }}
            >
              <RotateCcw className="size-4" aria-hidden />
              Reset demo
            </Button>
          </div>
        }
      >
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>• Seeded tasks, offers, messages and reviews are restored.</li>
          <li>• The active persona returns to Maya Chen.</li>
          <li>• Simulated payment records are reset with the demo.</li>
          <li>• No real money is ever involved.</li>
        </ul>
      </Modal>

      <TaskDetailSheet />
      <PostTaskDialog />
      <AcceptTaskDialog />
      <ReportDialog />
    </div>
  );
}

function PersonaModal({
  open,
  onClose,
  onSelect,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (user: User) => void;
  onReset: () => void;
}) {
  const { state, user } = useDemo();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Switch persona"
      description="Try both sides of the marketplace. Your tasks, messages and notifications stay as they are."
      size="md"
      footer={
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <p className="text-[11px] text-muted">Sample people, simulated payments.</p>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="size-3.5" aria-hidden />
            Reset demo
          </Button>
        </div>
      }
    >
      <ul className="space-y-2">
        {state.users.map((persona) => {
          const stats = getUserStats(state, persona);
          const active = persona.id === user.id;
          return (
            <li key={persona.id}>
              <button
                type="button"
                onClick={() => onSelect(persona)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all",
                  active
                    ? "border-ink bg-surface shadow-soft"
                    : "border-line bg-surface hover:border-[#cfd3c9] hover:shadow-soft",
                )}
              >
                <Avatar
                  name={persona.name}
                  initials={persona.initials}
                  color={persona.avatarColor}
                  size="md"
                  verified={persona.verified}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-ink">{persona.name}</span>
                    {active ? (
                      <span className="rounded-full bg-lime-soft px-2 py-0.5 text-[10px] font-semibold text-ink">
                        Active
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    {ROLE_LABEL[persona.role]} · {stats.completedAsHelper} completed
                    {stats.rating ? ` · ${stats.rating.toFixed(1)}★` : stats.isNew ? " · New helper" : ""}
                  </span>
                </span>
                {active ? (
                  <span className="flex size-6 items-center justify-center rounded-full bg-lime">
                    <Check className="size-3.5 text-ink" aria-hidden />
                  </span>
                ) : (
                  <span className="text-[11px] font-medium text-muted">Switch</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
