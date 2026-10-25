"use client";

import { Compass, HandCoins, Sparkles, Users } from "lucide-react";
import { useDemo } from "@/components/providers";
import { DoroMark } from "@/components/brand";
import { Button, Modal, useToast } from "@/components/ui";

export function Onboarding() {
  const { store } = useDemo();
  const { toast } = useToast();

  const dismiss = () => {
    store.dismissOnboarding();
    toast("You're in. Switch personas any time from your profile menu.", "default");
  };

  return (
    <Modal
      open
      onClose={dismiss}
      title={<span className="sr-only">Welcome to Doro</span>}
      size="md"
      footer={
        <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="text-[10.5px] leading-relaxed text-muted">
            DEMO MODE · Four sample personas, simulated payments, no sign-up.
          </p>
          <Button variant="lime" onClick={dismiss}>
            Start exploring
          </Button>
        </div>
      }
    >
      <div className="-mt-2">
        <div className="flex items-center gap-2.5">
          <DoroMark size={34} />
          <span className="text-sm font-semibold tracking-tight text-ink">
            Welcome to Doro
          </span>
        </div>
        <h2 className="mt-4 max-w-md text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink sm:text-[30px]">
          Post a task. Set a reward.
          <br />
          <span className="text-[#6f7a52]">Find the right person.</span>
        </h2>
        <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-muted">
          Doro is a local task marketplace for the small things — a notebook delivery, a charger
          pickup, 15 minutes of moving help. Helpers nearby can accept or make an offer.
        </p>

        <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
          {[
            {
              icon: Compass,
              title: "Discover",
              body: "Browse feasible tasks ranked by your distance, time and preferences.",
            },
            {
              icon: Sparkles,
              title: "Doro Match",
              body: "Every score is computed and explained — never a random badge.",
            },
            {
              icon: Users,
              title: "Switch sides",
              body: "Use the persona menu to post, accept, message and complete.",
            },
          ].map((item) => (
            <li key={item.title} className="rounded-2xl border border-line bg-surface p-3.5">
              <item.icon className="size-4 text-[#587d2a]" aria-hidden />
              <p className="mt-2 text-[12px] font-semibold text-ink">{item.title}</p>
              <p className="mt-0.5 text-[10.5px] leading-relaxed text-muted">{item.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex items-start gap-2 rounded-xl bg-lime-soft px-3 py-2.5 text-[11px] leading-relaxed text-[#4d6028]">
          <HandCoins className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Try the whole loop: post as Maya, switch to Alex, accept, message, then confirm back as
          Maya. Or open My activity to pick up a task that needs you.
        </div>
      </div>
    </Modal>
  );
}
