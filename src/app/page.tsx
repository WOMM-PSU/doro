import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  HandCoins,
  MapPin,
  MessageSquareLock,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { DoroLogo, DoroMark } from "@/components/brand";
import { DEMO_MODE } from "@/lib/demo-mode";
import { createSeedState } from "@/features/seed";
import { calculateMatch } from "@/features/matching";
import { getUser } from "@/features/selectors";
import { formatDeadline } from "@/lib/time";
import { formatMiles } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function LandingPage() {
  const state = createSeedState();
  const maya = getUser(state, "u-maya")!;
  const alex = getUser(state, "u-alex")!;
  const notebook = state.tasks.find((t) => t.id === "t-notebook")!;
  const match = calculateMatch(notebook, alex);

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="Doro home">
            <DoroLogo size={29} />
          </Link>
          <nav aria-label="Landing" className="hidden items-center gap-7 md:flex">
            <a href="#how" className="text-[13px] font-medium text-muted transition-colors hover:text-ink">
              How it works
            </a>
            <a href="#why" className="text-[13px] font-medium text-muted transition-colors hover:text-ink">
              Why Doro
            </a>
            <a href="#permitted" className="text-[13px] font-medium text-muted transition-colors hover:text-ink">
              What's allowed
            </a>
          </nav>
          <Link
            href="/discover"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-ink-soft"
          >
            {DEMO_MODE ? "Open the demo" : "Open Doro"}
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-40 top-10 hidden size-[520px] rounded-full bg-lime-soft/80 blur-3xl lg:block"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:gap-10 lg:pb-24 lg:pt-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                <span className="size-1.5 rounded-full bg-[#a6c43f]" aria-hidden />
                University Park · local help
              </div>
              <h1 className="mt-5 max-w-[560px] text-[44px] font-semibold leading-[0.98] tracking-[-0.045em] text-ink sm:text-[60px] lg:text-[66px]">
                Get your stuff{" "}
                <span className="relative inline-block">
                  <span className="relative z-10">done.</span>
                  <span
                    aria-hidden
                    className="absolute inset-x-0 bottom-[0.04em] z-0 h-[0.32em] rounded-sm bg-lime"
                  />
                </span>
              </h1>
              <p className="mt-5 max-w-[480px] text-[15px] leading-relaxed text-muted">
                Need something small handled? Post the task, set a fair reward, and find
                someone nearby who can do it. Doro is built for notebooks, chargers, moving
                boxes and study help — the tasks that don't need a whole industry.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/discover"
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-lime px-6 text-sm font-semibold text-ink transition-colors hover:bg-lime-deep"
                >
                  {DEMO_MODE ? "Open the live demo" : "Find a task"}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
                <a
                  href="#how"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink transition-colors hover:bg-muted-surface"
                >
                  See how it works
                </a>
              </div>
              <dl className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[11px] font-medium text-muted">
                <div className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-[#587d2a]" aria-hidden />
                  No sign-up or API keys
                </div>
                {DEMO_MODE ? (
                  <div className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-[#587d2a]" aria-hidden />
                    Four demo personas
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-[#587d2a]" aria-hidden />
                    Built for University Park
                  </div>
                )}
                {DEMO_MODE ? (
                  <div className="flex items-center gap-1.5">
                    <Check className="size-3.5 text-[#587d2a]" aria-hidden />
                    Payments are simulated
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="relative mx-auto w-full max-w-[440px] lg:mx-0">
              <div className="relative rounded-[28px] border border-line bg-[#eef1e9] p-3 shadow-lift sm:p-5">
                <div className="flex items-center justify-between px-1 pb-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#717a66]">
                    Discover · near you
                  </span>
                  <span className="rounded-full bg-surface px-2 py-1 text-[9.5px] font-medium text-muted">
                    0.4 mi
                  </span>
                </div>
                <article className="rounded-2xl border border-line bg-surface p-4 shadow-soft sm:p-5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted-surface px-2 py-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted">
                      <MapPin className="size-3" aria-hidden />
                      Pickup & delivery
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-lime-soft px-2 py-1 text-[9.5px] font-semibold text-[#4d6028]">
                      <Sparkles className="size-3" aria-hidden />
                      {match.score}% match
                    </span>
                  </div>
                  <h2 className="mt-3 text-[17px] font-semibold leading-snug text-ink">
                    {notebook.title}
                  </h2>
                  <p className="mt-1 line-clamp-2 text-[11.5px] leading-relaxed text-muted">
                    {notebook.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" aria-hidden />
                      West Halls → Pattee
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <NavigationArrow />
                      {formatMiles(match.routeMiles)} · ~{match.travelMinutes} min walk
                    </span>
                    <span>{formatDeadline(notebook.deadline)}</span>
                  </div>
                  <div className="mt-3 rounded-lg bg-[#f7faf0] px-2.5 py-2 text-[10px] leading-relaxed text-[#4d6528]">
                    {match.explanation.slice(0, 2).join(" · ")}
                  </div>
                  <div className="mt-4 flex items-end justify-between border-t border-line pt-3.5">
                    <div>
                      <p className="tabular font-mono text-2xl font-semibold text-ink">$5.00</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted">
                        <span className="flex size-5 items-center justify-center rounded-full bg-[#f3d2b8] text-[8px] font-semibold text-ink">
                          MC
                        </span>
                        {maya.name}
                        <Stars />
                      </p>
                    </div>
                    <span className="inline-flex h-9 items-center rounded-full bg-lime px-4 text-[11px] font-semibold text-ink">
                      Accept · $5
                    </span>
                  </div>
                </article>

                <div className="absolute -right-3 -top-4 hidden w-[190px] rounded-2xl border border-line bg-surface p-3 shadow-lift sm:block">
                  <div className="flex items-center gap-2">
                    <span className="flex size-8 items-center justify-center rounded-xl bg-ink text-lime">
                      <Sparkles className="size-4" aria-hidden />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-muted">
                        Doro Match
                      </p>
                      <p className="text-[11px] font-semibold text-ink">Explained, not magic</p>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {[
                      ["Distance", 25],
                      ["Timing", 20],
                      ["Preferences", 15],
                      ["Reward", 15],
                    ].map(([label, weight]) => (
                      <div key={String(label)} className="flex items-center gap-1.5">
                        <span className="w-[62px] text-[8.5px] text-muted">{label}</span>
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted-surface">
                          <span
                            className="block h-full rounded-full bg-lime-deep"
                            style={{ width: `${Math.min(100, Number(weight) * 3)}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="absolute -bottom-5 -left-3 hidden items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 shadow-lift sm:flex">
                  <span className="flex size-8 items-center justify-center rounded-full bg-success-soft text-success">
                    <Check className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold text-ink">Alex accepted your task</p>
                    <p className="text-[9px] text-muted">Task conversation opened</p>
                  </div>
                </div>
              </div>
              <p className="mt-6 text-center text-[9.5px] text-muted lg:text-left">
                {DEMO_MODE
                  ? "Sample task and a real Doro Match calculation · approximate demo locations"
                  : "A task card with the live Doro Match calculation"}
              </p>
            </div>
          </div>
        </section>

        <section aria-label="Small tasks Doro handles" className="border-y border-line bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Small things, handled.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {["Notebook delivery", "Charger pickup", "15 min of moving", "Calculus help", "Python bug", "Stationery run"].map(
                (item) => (
                  <span
                    key={item}
                    className="rounded-full border border-line px-2.5 py-1 text-[10.5px] font-medium text-muted"
                  >
                    {item}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="max-w-xl">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6f7a52]">
              How it works
            </p>
            <h2 className="mt-2 text-[30px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[38px]">
              Post a task. Set a reward.
              <br />
              Find the right person.
            </h2>
          </div>
          <div className="mt-8 grid gap-3 md:grid-cols-3">
            {[
              {
                step: "01",
                icon: HandCoins,
                title: "Describe the small thing",
                body: "A notebook to the library. A charger from across campus. A Python error. Choose a place, a deadline and a reward — Doro suggests a fair range from the details.",
              },
              {
                step: "02",
                icon: Sparkles,
                title: "See who it fits",
                body: "Helpers nearby get a computed match: distance, time, preferences, effort-adjusted reward, skills and reliability. Fixed price or open to offers.",
              },
              {
                step: "03",
                icon: ShieldCheck,
                title: "Meet, hand off, confirm",
                body: "Message only inside the task, use a four-digit handoff code for deliveries, then confirm completion and leave a review. The reward is authorized before the handoff.",
              },
            ].map((item) => (
              <article key={item.step} className="rounded-2xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-lime text-ink">
                    <item.icon className="size-4" aria-hidden />
                  </span>
                  <span className="font-mono text-[11px] font-medium text-muted">{item.step}</span>
                </div>
                <h3 className="mt-4 text-[15px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="why" className="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="overflow-hidden rounded-[28px] bg-ink text-white">
            <div className="grid gap-10 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-lime/70">
                  Why Doro
                </p>
                <h2 className="mt-2 text-[30px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[36px]">
                  Built for the tasks
                  <br />
                  that don't need
                  <br />
                  <span className="text-lime">a whole app.</span>
                </h2>
                <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                  <div className="flex -space-x-2">
                    {state.users.map((person) => (
                      <span
                        key={person.id}
                        className="flex size-8 items-center justify-center rounded-full border-2 border-ink text-[9px] font-semibold text-ink"
                        style={{ backgroundColor: person.avatarColor }}
                      >
                        {person.initials}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10.5px] leading-relaxed text-white/55">
                    Maya, Alex, Jordan and Sam are sample personas.
                    <br />
                    {DEMO_MODE ? "Switch between them instantly in the demo." : "Share the link with people nearby."}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  {
                    icon: Sparkles,
                    title: "Explainable matching",
                    body: "The score comes from seven weighted, normalized signals. Helpers see why a task fits — distance, timing, preferences, reward for effort, skills, reliability and personal relevance. No random percentages.",
                  },
                  {
                    icon: HandCoins,
                    title: "A fair price, not an auction",
                    body: "Doro recommends a range from category, duration, travel, urgency and expenses, then hands the choice back. Open-to-offers tasks allow a counter-proposal without becoming a bidding war.",
                  },
                  {
                    icon: MessageSquareLock,
                    title: "Trust stays task-scoped",
                    body: "Messaging opens only after a helper is assigned. Delivery handoffs use a four-digit code, reports are one tap away, and no one's exact live location is broadcast.",
                  },
                  {
                    icon: Users,
                    title: "Fair to new helpers",
                    body: "A neutral reliability prior means a first-time helper can still rank well. Established helpers get a modest edge, not an unbeatable one — sample personas produce visibly different feeds.",
                  },
                ].map((item) => (
                  <article key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <item.icon className="size-4 text-lime" aria-hidden />
                    <h3 className="mt-3 text-[13px] font-semibold">{item.title}</h3>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/50">{item.body}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="permitted" className="border-t border-line bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:py-20">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#6f7a52]">
                Clear boundaries
              </p>
              <h2 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-[34px]">
                Helpful, not
                <br />
                a free-for-all.
              </h2>
              <p className="mt-3 max-w-sm text-[12.5px] leading-relaxed text-muted">
                Doro deliberately excludes work with licensing, safety or legal risk. This keeps the
                marketplace focused and makes trust easier to understand.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line p-4">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                  <Check className="size-3.5 text-[#587d2a]" aria-hidden />
                  Permitted
                </p>
                <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-muted">
                  <li>Small pickup & delivery</li>
                  <li>Everyday errands</li>
                  <li>Short tutoring and study help</li>
                  <li>Simple technical help</li>
                  <li>Light moving and lifting</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                  <span className="text-danger">×</span>
                  Not permitted
                </p>
                <ul className="mt-2 space-y-1.5 text-[11.5px] leading-relaxed text-muted">
                  <li>Alcohol, controlled substances, weapons</li>
                  <li>Academic cheating or impersonation</li>
                  <li>Medical emergencies or licensed care</li>
                  <li>Paid passenger rides</li>
                  <li>Illegal goods or activities</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
          <div className="relative overflow-hidden rounded-[28px] bg-lime p-7 sm:p-12">
            <div className="relative z-10 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#4d6028]">
                  Need something done?
                </p>
                <h2 className="mt-2 max-w-[520px] text-[29px] font-semibold leading-[1.06] tracking-[-0.03em] text-ink sm:text-[38px]">
                  There's probably someone nearby.
                </h2>
                <p className="mt-2 max-w-md text-[12.5px] leading-relaxed text-[#435225]">
                  {DEMO_MODE
                    ? "Open the demo as Maya, post a notebook delivery, then switch to Alex and complete the loop. Everything is local, seeded and ready."
                    : "Post a notebook delivery, review offers, and complete the handoff with a nearby helper."}
                </p>
              </div>
              <Link
                href="/discover"
                className="inline-flex h-12 shrink-0 items-center gap-2 rounded-full bg-ink px-6 text-sm font-semibold text-white transition-colors hover:bg-ink-soft"
              >
                Enter Doro
                <ArrowUpRight className="size-4" aria-hidden />
              </Link>
            </div>
            <DoroMark size={200} className="absolute -bottom-12 -right-8 opacity-[0.12] sm:-bottom-16 sm:-right-4" />
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2.5">
            <DoroLogo size={24} />
            <span>Get your stuff done.</span>
          </div>
          <p className="max-w-md leading-relaxed">
            {DEMO_MODE
              ? "A hackathon demo. Fictional people, approximate campus locations and simulated payments. No real money, identity verification or background checks."
              : "Campus locations and travel times are approximate. Use the task chat and handoff code to coordinate."}
          </p>
        </div>
      </footer>
    </div>
  );
}

function NavigationArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M21 3 3 10.5l6.7 2.8L12.5 20 21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

function Stars() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className="size-2 fill-[#1d1f23] text-[#1d1f23]" />
      ))}
    </span>
  );
}
