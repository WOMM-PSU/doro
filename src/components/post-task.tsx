"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  ChevronDown,
  CreditCard,
  HandCoins,
  Info,
  Lock,
  MapPin,
  Plus,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import type { AcceptanceMode, PaymentMethod, TaskCategory } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import { CATEGORY_LABELS } from "@/features/matching";
import {
  recommendReward,
  rewardPosition,
  type RewardRecommendation,
} from "@/features/pricing";
import { inferTaskDetails, parseTaskSentence } from "@/features/task-suggestions";
import { analyzeContent } from "@/features/moderation";
import { getLocalLlmStatus, parseTaskWithLocalLlm, type LocalLlmStatus } from "@/lib/local-llm";
import { DEMO_MODE } from "@/lib/demo-mode";
import { LOCATIONS, getLocation } from "@/lib/locations";
import { formatDeadline, fromDateTimeLocalValue, toDateTimeLocalValue } from "@/lib/time";
import { formatMoney } from "@/lib/format";
import {
  Avatar,
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Pill,
  Select,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";
import { CATEGORY_ICONS } from "@/components/icons";

const CATEGORY_OPTIONS: { value: TaskCategory; label: string; minutes: number }[] = [
  { value: "delivery", label: "Pickup & delivery", minutes: 15 },
  { value: "errands", label: "Errands", minutes: 20 },
  { value: "tutoring", label: "Study & tutoring", minutes: 45 },
  { value: "tech", label: "Tech help", minutes: 30 },
  { value: "moving", label: "Moving & lifting", minutes: 30 },
  { value: "other", label: "Other help", minutes: 30 },
];

const CATEGORY_SKILLS: Record<TaskCategory, string[]> = {
  delivery: ["delivery"],
  errands: ["errands"],
  tutoring: ["tutoring"],
  tech: ["tech"],
  moving: ["lifting"],
  other: [],
};

type DeadlinePreset = "asap" | "today" | "tomorrow" | "custom";

/** Validated fields in on-screen order, so a failed publish jumps to the first one. */
const FIELD_ORDER: { key: string; id: string }[] = [
  { key: "title", id: "task-title" },
  { key: "description", id: "task-description" },
  { key: "duration", id: "task-duration" },
  { key: "dropoff", id: "task-dropoff" },
  { key: "deadline", id: "deadline-options" },
  { key: "reward", id: "task-reward" },
  { key: "expense", id: "task-expense" },
];

/** Scrolls a field (or error) into the middle of the dialog and focuses it. */
function revealField(id: string) {
  // Wait a frame so freshly rendered errors and expanded sections exist.
  window.requestAnimationFrame(() => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    const focusTarget =
      element.matches("input, textarea, select")
        ? element
        : element.querySelector<HTMLElement>("[aria-pressed='true'], input, button");
    focusTarget?.focus({ preventScroll: true });
  });
}

export function PostTaskDialog() {
  const { user, store, state } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sentence, setSentence] = useState("");
  const [sentenceBusy, setSentenceBusy] = useState(false);
  const [llmStatus, setLlmStatus] = useState<LocalLlmStatus | null>(null);
  const [category, setCategory] = useState<TaskCategory>("delivery");
  const [pickupId, setPickupId] = useState(user.homeLocationId);
  const [dropoffId, setDropoffId] = useState(
    user.homeLocationId === "hub" ? "pattee" : "hub",
  );
  const [locationId, setLocationId] = useState(user.homeLocationId);
  const [preset, setPreset] = useState<DeadlinePreset>("asap");
  const [customDeadline, setCustomDeadline] = useState("");
  const [allowLateFinish, setAllowLateFinish] = useState(false);
  const [estimatedMinutes, setEstimatedMinutes] = useState(15);
  const [durationTouched, setDurationTouched] = useState(false);
  const [rewardInput, setRewardInput] = useState("");
  const [rewardTouched, setRewardTouched] = useState(false);
  const [acceptanceMode, setAcceptanceMode] = useState<AcceptanceMode>("fixed");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("stripe_card");
  const [requirements, setRequirements] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [expenseInput, setExpenseInput] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [publishedTaskId, setPublishedTaskId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const previousUser = useRef(user.id);

  const isDelivery = category === "delivery";
  const deadline = useMemo(() => resolveDeadline(preset, customDeadline), [preset, customDeadline]);
  const expenseCents = expenseInput.trim() ? Math.max(0, Math.round(Number(expenseInput) * 100)) : 0;

  const recommendation = useMemo(
    () =>
      recommendReward({
        category,
        estimatedMinutes: Number.isFinite(estimatedMinutes) ? estimatedMinutes : 15,
        deadline: deadline ?? undefined,
        locationId: isDelivery ? pickupId : locationId,
        dropoffLocationId: isDelivery ? dropoffId : undefined,
        expenseCents,
        history: state.tasks
          .filter((task) => task.status === "COMPLETED")
          .map((task) => ({
            category: task.category,
            rewardCents: task.agreedRewardCents ?? task.rewardCents,
          })),
      }),
    [
      category,
      estimatedMinutes,
      deadline,
      isDelivery,
      pickupId,
      dropoffId,
      locationId,
      expenseCents,
      state.tasks,
    ],
  );

  useEffect(() => {
    let active = true;
    getLocalLlmStatus().then((status) => {
      if (active) setLlmStatus(status);
    });
    return () => {
      active = false;
    };
  }, []);

  // Until the requester edits the reward, it follows the typical suggestion.
  const rewardValue = rewardTouched ? rewardInput : (recommendation.typicalCents / 100).toFixed(2);
  const rewardCents = Math.max(0, Math.round(Number(rewardValue || 0) * 100));

  const inference = useMemo(
    () => inferTaskDetails(`${title} ${description}`),
    [title, description],
  );

  const moderation = useMemo(
    () =>
      analyzeContent(
        `${title} ${description} ${requirements} ${itemDescription} ${instructions}`,
      ),
    [title, description, requirements, itemDescription, instructions],
  );

  const resetAll = () => {
    setTitle("");
    setDescription("");
    setSentence("");
    setSentenceBusy(false);
    setCategory("delivery");
    setPickupId(user.homeLocationId);
    setDropoffId(user.homeLocationId === "hub" ? "pattee" : "hub");
    setLocationId(user.homeLocationId);
    setPreset("asap");
    setCustomDeadline("");
    setAllowLateFinish(false);
    setEstimatedMinutes(15);
    setDurationTouched(false);
    setRewardInput("");
    setRewardTouched(false);
    setAcceptanceMode("fixed");
    setPaymentMethod("stripe_card");
    setRequirements("");
    setItemDescription("");
    setInstructions("");
    setExpenseInput("");
    setExpenseNote("");
    setMoreOpen(false);
    setErrors({});
    setFormError(null);
    setPublishedTaskId(null);
    setDiscardOpen(false);
  };

  useEffect(() => {
    if (previousUser.current !== user.id) {
      previousUser.current = user.id;
      resetAll();
    }
    // Only persona changes should reset the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // "Post again" on an expired task opens the composer prefilled with it.
  useEffect(() => {
    if (!ui.composeOpen || !ui.repostTaskId) return;
    const source = state.tasks.find((t) => t.id === ui.repostTaskId);
    if (!source) return;
    resetAll();
    setTitle(source.title);
    setDescription(source.description);
    setCategory(source.category);
    if (source.category === "delivery" && source.dropoffLocationId) {
      setPickupId(source.locationId);
      setDropoffId(source.dropoffLocationId);
    } else {
      setLocationId(source.locationId);
    }
    setEstimatedMinutes(source.estimatedMinutes);
    setDurationTouched(true);
    setRewardInput((source.rewardCents / 100).toFixed(2));
    setRewardTouched(true);
    setAcceptanceMode(source.acceptanceMode);
    setPaymentMethod(source.paymentMethod ?? "stripe_card");
    setAllowLateFinish(Boolean(source.allowLateFinish));
    setRequirements(source.requirements?.join("\n") ?? "");
    setItemDescription(source.itemDescription ?? "");
    setInstructions(source.instructions ?? "");
    setExpenseInput(source.expenseCents ? (source.expenseCents / 100).toFixed(2) : "");
    setExpenseNote(source.expenseNote ?? "");
    setMoreOpen(Boolean(source.requirements?.length || source.itemDescription || source.instructions || source.expenseCents));
    // Only a new repost request should prefill; later edits must stick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.composeOpen, ui.repostTaskId]);

  const hasDraft =
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    requirements.trim().length > 0 ||
    itemDescription.trim().length > 0 ||
    instructions.trim().length > 0 ||
    expenseInput.trim().length > 0 ||
    rewardTouched;

  const handleClose = () => {
    setDiscardOpen(false);
    if (publishedTaskId) resetAll();
    ui.closeCompose();
  };

  const validate = (): Record<string, string> => {
    const next: Record<string, string> = {};
    if (title.trim().length < 4) next.title = "Give the task a short, clear title.";
    if (description.trim().length < 12) next.description = "Add a sentence or two about what you need.";
    if (isDelivery && pickupId === dropoffId) next.dropoff = "Pickup and drop-off need to be different.";
    if (!deadline) next.deadline = "Choose a valid deadline.";
    else if (new Date(deadline).getTime() - Date.now() < 5 * 60_000) {
      next.deadline = "Choose a deadline at least five minutes from now.";
    }
    if (!Number.isFinite(estimatedMinutes) || estimatedMinutes < 5 || estimatedMinutes > 240) {
      next.duration = "Estimate between 5 and 240 minutes.";
    }
    if (!Number.isFinite(Number(rewardValue)) || rewardCents < 100) {
      next.reward = "Set a reward of at least $1.00.";
    }
    if (rewardCents > 100_000) next.reward = "This demo supports rewards up to $1,000.";
    if (expenseInput.trim() && (!Number.isFinite(Number(expenseInput)) || expenseCents > 20_000)) {
      next.expense = "Keep reimbursable expenses under $200.";
    }
    setErrors(next);
    return next;
  };

  const handleSubmit = () => {
    const next = validate();
    const firstInvalid = FIELD_ORDER.find((field) => next[field.key]);
    if (firstInvalid) {
      if (firstInvalid.key === "expense") setMoreOpen(true);
      revealField(
        firstInvalid.key === "deadline" && preset === "custom" ? "custom-deadline" : firstInvalid.id,
      );
      return;
    }
    if (!deadline) return;
    const result = store.createTask({
      title,
      description,
      category,
      locationId: isDelivery ? pickupId : locationId,
      dropoffLocationId: isDelivery ? dropoffId : undefined,
      rewardCents,
      acceptanceMode,
      paymentMethod,
      deadline,
      allowLateFinish,
      estimatedMinutes: Number(estimatedMinutes),
      requirements: requirements || undefined,
      requiredSkills: CATEGORY_SKILLS[category],
      expenseCents: expenseCents || undefined,
      expenseNote: expenseNote || undefined,
      itemDescription: itemDescription || undefined,
      instructions: instructions || undefined,
    });
    if (!result.ok) {
      setFormError(result.error);
      revealField("post-task-error");
      return;
    }
    setFormError(null);
    setPublishedTaskId(result.data.id);
    toast("Task published. Eligible helpers can see it now.", "success");
  };

  const applySentence = async () => {
    const text = sentence.trim();
    if (text.length < 8) {
      toast("Describe the task in a sentence first.", "error");
      return;
    }
    setSentenceBusy(true);
    try {
      const local = llmStatus?.ready ? await parseTaskWithLocalLlm(text) : null;
      const parsed = local ?? parseTaskSentence(text);
      if (!parsed) {
        toast("Couldn't read that sentence. Add what, where, and when.", "error");
        return;
      }
      if (parsed.title) setTitle(parsed.title);
      if (parsed.description) setDescription(parsed.description);
      setCategory(parsed.category);
      setEstimatedMinutes(parsed.estimatedMinutes);
      setDurationTouched(true);
      if (parsed.rewardCents) {
        setRewardInput((parsed.rewardCents / 100).toFixed(2));
        setRewardTouched(true);
      }
      if (parsed.dropoffLocationId) {
        setPickupId(parsed.locationId ?? pickupId);
        setDropoffId(parsed.dropoffLocationId);
      } else if (parsed.locationId) {
        setLocationId(parsed.locationId);
        setPickupId(parsed.locationId);
      }
      if (parsed.deadline) {
        setPreset("custom");
        setCustomDeadline(toDateTimeLocalValue(new Date(parsed.deadline)));
      }
      setErrors({});
      toast(
        local
          ? "Filled from the on-device model. Review anything it guessed."
          : parsed.source === "rules"
            ? "Filled with the local rule parser. Review before posting."
            : "Filled the form. Review before posting.",
        "default",
      );
    } finally {
      setSentenceBusy(false);
    }
  };

  const applyInference = () => {
    if (!inference) return;
    setCategory(inference.category);
    setEstimatedMinutes(inference.estimatedMinutes);
    setDurationTouched(true);
    setErrors({});
    toast(`Applied a rule-based suggestion: ${CATEGORY_LABELS[inference.category]}.`, "default");
  };

  const publishedTask = state.tasks.find((t) => t.id === publishedTaskId);

  return (
    <>
      <Modal
        open={ui.composeOpen}
        onClose={handleClose}
        title={publishedTaskId ? "Your task is live" : "Post a task"}
        description={
          publishedTaskId
            ? "Helpers who match can find it in Discover. The demo data updates immediately."
            : "A little detail goes a long way. Most requests take about 30 seconds to post."
        }
        size="lg"
        footer={
          publishedTaskId ? undefined : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted">
                  You'll offer
                </p>
                <p className="tabular text-lg font-semibold text-ink">
                  {formatMoney(rewardCents)}
                  {expenseCents ? (
                    <span className="ml-1 text-[11px] font-normal text-muted">
                      + up to {formatMoney(expenseCents)} expenses
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {hasDraft ? (
                  <Button variant="ghost" size="sm" onClick={() => setDiscardOpen(true)}>
                    Discard draft
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  form="post-task-form"
                  variant="lime"
                  size="lg"
                  disabled={moderation.level === "block"}
                >
                  <Plus className="size-4" aria-hidden />
                  Publish task
                </Button>
              </div>
            </div>
          )
        }
      >
        {publishedTaskId && publishedTask ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="flex size-16 items-center justify-center rounded-2xl bg-lime text-ink">
              <Check className="size-7" aria-hidden />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-ink">Posted to University Park</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">
              “{publishedTask.title}” is open for {formatMoney(publishedTask.rewardCents)}. Helpers who
              match your details receive an in-app notification.
            </p>
            <div className="mt-4 w-full max-w-sm rounded-2xl border border-line bg-surface p-4 text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted">Deadline</span>
                <span className="text-[11.5px] font-medium text-ink">
                  {formatDeadline(publishedTask.deadline)}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted">Acceptance</span>
                <span className="text-[11.5px] font-medium text-ink">
                  {publishedTask.acceptanceMode === "fixed" ? "Fixed reward" : "Open to offers"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted">If it runs late</span>
                <span className="text-[11.5px] font-medium text-ink">
                  {publishedTask.allowLateFinish ? "Helper can still finish" : "You'll be asked"}
                </span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-muted">Payment method</span>
                <span className="text-[11.5px] font-medium text-ink">
                  {publishedTask.paymentMethod === "cash_handoff"
                    ? "Cash at Handoff"
                    : "Stripe Card Hold (Escrow)"}
                </span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button
                variant="lime"
                onClick={() => {
                  const id = publishedTaskId;
                  resetAll();
                  ui.closeCompose();
                  if (id) ui.openTask(id);
                }}
              >
                View task
                <ArrowRight className="size-4" aria-hidden />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  resetAll();
                  ui.closeCompose();
                  router.push("/activity");
                }}
              >
                Go to My activity
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  resetAll();
                }}
              >
                Post another
              </Button>
            </div>
            <p className="mt-4 text-[10px] text-muted">
              {DEMO_MODE
                ? "DEMO MODE · No real charge. Editing isn't available in this build; cancel and repost if plans change."
                : "Editing isn't available yet; cancel and repost if plans change."}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_312px]">
            <form
              id="post-task-form"
              onSubmit={(event) => {
                event.preventDefault();
                handleSubmit();
              }}
              className="min-w-0 space-y-6"
            >
              {formError ? (
                <div id="post-task-error" className="flex items-start gap-2 rounded-xl border border-[#f1d3ce] bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {formError}
                </div>
              ) : null}

              {moderation.level !== "allow" ? (
                <div
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed",
                    moderation.level === "block"
                      ? "border-[#f1d3ce] bg-danger-soft text-danger"
                      : "border-[#f0e2bd] bg-warning-soft text-warning",
                  )}
                  role="status"
                  aria-live="polite"
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    <ShieldCheck className="size-4 shrink-0" aria-hidden />
                    {moderation.level === "block"
                      ? "This can't be posted as written"
                      : "Check this before you post"}
                  </p>
                  <p className="mt-1">
                    The local classifier flagged: {moderation.reasons.join(", ")}. No text leaves
                    your browser.
                  </p>
                  {moderation.suggestions.length > 0 ? (
                    <ul className="mt-1.5 space-y-0.5">
                      {moderation.suggestions.map((suggestion) => (
                        <li key={suggestion} className="flex items-start gap-1.5">
                          <span className="mt-1.5 size-1 shrink-0 rounded-full bg-current" aria-hidden />
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <section className="rounded-2xl border border-[#dcebb0] bg-lime-soft/60 p-3.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-[#587d2a]" aria-hidden />
                  <h3 className="text-[12.5px] font-semibold text-ink">One sentence is enough</h3>
                </div>
                <p className="mt-0.5 text-[10.5px] leading-relaxed text-[#5f6f45]">
                  Try “Bring my charger from Pattee to East Halls by 4pm for $6.”
                </p>
                <Textarea
                  value={sentence}
                  onChange={(event) => setSentence(event.target.value)}
                  maxLength={400}
                  rows={2}
                  className="mt-2 min-h-[58px] bg-surface text-[12.5px]"
                  placeholder="What do you need, where, and by when?"
                  aria-label="Describe the task in one sentence"
                />
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="min-w-0 text-[10px] leading-relaxed text-[#5f6f45]">
                    <span className="font-semibold text-ink">
                      {llmStatus ? llmStatus.label : "Checking this browser…"}
                    </span>
                    {llmStatus ? ` · ${llmStatus.detail}` : null}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="dark"
                    onClick={applySentence}
                    disabled={sentenceBusy || sentence.trim().length < 8}
                    className="shrink-0"
                  >
                    <Sparkles className="size-3.5" aria-hidden />
                    {sentenceBusy ? "Reading…" : "Fill the form"}
                  </Button>
                </div>
              </section>

              <section className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
                    1 · The basics
                  </h3>
                  <span className="text-[10px] text-muted">Required</span>
                </div>
                <Field label="What do you need?" htmlFor="task-title" error={errors.title}>
                  <Input
                    id="task-title"
                    data-autofocus
                    value={title}
                    maxLength={90}
                    onChange={(e) => {
                      setTitle(e.target.value);
                      setErrors((current) => ({ ...current, title: "" }));
                    }}
                    placeholder="e.g. Deliver a notebook to the HUB"
                  />
                </Field>
                <Field
                  label="Describe it"
                  htmlFor="task-description"
                  hint={`${description.length}/1000`}
                  error={errors.description}
                >
                  <Textarea
                    id="task-description"
                    value={description}
                    maxLength={1000}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setErrors((current) => ({ ...current, description: "" }));
                    }}
                    placeholder="What should someone do, and where? Include anything they need to know."
                    className="min-h-[88px]"
                  />
                </Field>

                {inference &&
                (inference.category !== category ||
                  inference.estimatedMinutes !== estimatedMinutes) ? (
                  <button
                    type="button"
                    onClick={applyInference}
                    className="flex w-full items-start gap-2 rounded-xl border border-[#e3f2b5] bg-lime-soft px-3 py-2.5 text-left"
                  >
                    <Sparkles className="mt-0.5 size-4 shrink-0 text-[#587d2a]" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-semibold text-ink">
                        Use a suggestion · {CATEGORY_LABELS[inference.category]} · ~{inference.estimatedMinutes} min
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-[#5f6f45]">
                        {inference.reason} A rule-based hint from your words; no network call.
                      </span>
                    </span>
                    <span className="text-[10px] font-semibold text-ink underline underline-offset-2">Apply</span>
                  </button>
                ) : null}

                <div>
                  <p className="text-[13px] font-semibold text-ink" id="category-label">
                    Category
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-labelledby="category-label">
                    {CATEGORY_OPTIONS.map((option) => {
                      const Icon = CATEGORY_ICONS[option.value];
                      const active = category === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => {
                            setCategory(option.value);
                            if (!durationTouched) setEstimatedMinutes(option.minutes);
                            setErrors({});
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11.5px] font-medium transition-colors",
                            active
                              ? "border-ink bg-ink text-white"
                              : "border-line bg-surface text-muted hover:border-[#cfd3c9] hover:text-ink",
                          )}
                        >
                          <Icon className="size-3.5" aria-hidden />
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Field
                  label="Estimated duration"
                  htmlFor="task-duration"
                  hint="Minutes of actual work"
                  error={errors.duration}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      id="task-duration"
                      type="number"
                      min={5}
                      max={240}
                      step={5}
                      value={estimatedMinutes}
                      onChange={(e) => {
                        setEstimatedMinutes(Number(e.target.value));
                        setDurationTouched(true);
                      }}
                      className="tabular max-w-[120px]"
                    />
                    <span className="text-xs text-muted">minutes</span>
                  </div>
                </Field>
              </section>

              <section className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
                    2 · Where & when
                  </h3>
                  <span className="text-[10px] text-muted">Approximate demo places</span>
                </div>

                {isDelivery ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Pickup" htmlFor="task-pickup">
                      <Select
                        id="task-pickup"
                        value={pickupId}
                        onChange={(e) => setPickupId(e.target.value)}
                      >
                        {LOCATIONS.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Drop-off" htmlFor="task-dropoff" error={errors.dropoff}>
                      <Select
                        id="task-dropoff"
                        value={dropoffId}
                        onChange={(e) => setDropoffId(e.target.value)}
                      >
                        {LOCATIONS.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                ) : (
                  <Field label="Location" htmlFor="task-location">
                    <Select
                      id="task-location"
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value)}
                    >
                      {LOCATIONS.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}

                <div>
                  <p className="text-[13px] font-semibold text-ink" id="deadline-label">
                    Deadline
                  </p>
                  <div id="deadline-options" className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-labelledby="deadline-label">
                    {(
                      [
                        { value: "asap", label: "ASAP" },
                        { value: "today", label: "In 4 hours" },
                        { value: "tomorrow", label: "Tomorrow" },
                        { value: "custom", label: "Pick a time" },
                      ] as { value: DeadlinePreset; label: string }[]
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={preset === option.value}
                        onClick={() => setPreset(option.value)}
                        className={cn(
                          "rounded-xl border px-2 py-2 text-[11.5px] font-medium transition-colors",
                          preset === option.value
                            ? "border-ink bg-ink text-white"
                            : "border-line bg-surface text-muted hover:text-ink",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {preset === "custom" ? (
                    <div className="mt-2">
                      <label htmlFor="custom-deadline" className="sr-only">
                        Custom deadline
                      </label>
                      <Input
                        id="custom-deadline"
                        type="datetime-local"
                        value={customDeadline}
                        min={toDateTimeLocalValue(new Date(Date.now() + 10 * 60_000))}
                        onChange={(e) => setCustomDeadline(e.target.value)}
                      />
                    </div>
                  ) : null}
                  <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted">
                    <CalendarDays className="size-3" aria-hidden />
                    {deadline ? formatDeadline(deadline) : "Choose a valid date and time"}
                    {preset === "asap" ? " · within about two hours" : ""}
                  </p>
                  {errors.deadline ? (
                    <p className="mt-1 text-xs font-medium text-danger" role="alert">
                      {errors.deadline}
                    </p>
                  ) : null}
                  <div className="mt-3">
                    <Checkbox
                      checked={allowLateFinish}
                      onChange={setAllowLateFinish}
                      label="Helpers can finish late"
                      description="If the deadline passes before your helper starts, they can still do it. Otherwise we'll ask you first."
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[13px] font-semibold text-ink" id="acceptance-label">
                    How helpers can take it
                  </p>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2" role="group" aria-labelledby="acceptance-label">
                    <button
                      type="button"
                      aria-pressed={acceptanceMode === "fixed"}
                      onClick={() => setAcceptanceMode("fixed")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        acceptanceMode === "fixed"
                          ? "border-ink bg-surface shadow-soft"
                          : "border-line bg-surface hover:border-[#cfd3c9]",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <Lock className="size-3.5" aria-hidden />
                        Fixed reward
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                        The first qualified helper accepts your amount. Fastest and simplest.
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={acceptanceMode === "offers"}
                      onClick={() => setAcceptanceMode("offers")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        acceptanceMode === "offers"
                          ? "border-ink bg-surface shadow-soft"
                          : "border-line bg-surface hover:border-[#cfd3c9]",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <HandCoins className="size-3.5" aria-hidden />
                        Open to offers
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                        Helpers propose a reward or time. You review and choose.
                      </span>
                    </button>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[13px] font-bold uppercase tracking-[0.1em] text-muted">
                    3 · Your reward
                  </h3>
                  <span className="text-[10px] text-muted">USD · demo only</span>
                </div>

                <div className="rounded-2xl border border-line bg-[#fbfcf9] p-3.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                        Suggested reward
                      </p>
                      <p className="tabular mt-0.5 font-mono text-xl font-semibold text-ink">
                        {formatMoney(recommendation.minCents, { compact: true })}–
                        {formatMoney(recommendation.maxCents, { compact: true })}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                      <Info className="size-3" aria-hidden />
                      Estimated from task details
                    </span>
                  </div>
                  <RewardScale recommendation={recommendation} rewardCents={rewardCents} />
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">
                    Typical around {formatMoney(recommendation.typicalCents)} for ~
                    {recommendation.totalMinutes} min of effort and travel. Based on category, time,
                    travel, urgency and completed tasks — not live market data.
                  </p>
                </div>

                <Field label="Amount" htmlFor="task-reward" error={errors.reward}>
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base font-semibold text-muted">
                        $
                      </span>
                      <Input
                        id="task-reward"
                        type="number"
                        min={1}
                        max={1000}
                        step="0.50"
                        value={rewardValue}
                        onChange={(e) => {
                          setRewardInput(e.target.value);
                          setRewardTouched(true);
                        }}
                        className="tabular h-12 pl-8 text-lg font-semibold"
                      />
                    </div>
                    <div className="text-right">
                      <p
                        className={cn(
                          "text-[10.5px] font-semibold",
                          rewardPosition(rewardCents, recommendation) === "below"
                            ? "text-warning"
                            : rewardPosition(rewardCents, recommendation) === "above"
                              ? "text-muted"
                              : "text-success",
                        )}
                      >
                        {rewardPosition(rewardCents, recommendation) === "below"
                          ? "Below the estimate"
                          : rewardPosition(rewardCents, recommendation) === "above"
                            ? "Above the estimate"
                            : "Within the estimate"}
                      </p>
                      <p className="text-[9.5px] text-muted">You stay in control</p>
                    </div>
                  </div>
                </Field>
                <input
                  type="range"
                  aria-label="Reward amount"
                  min={1}
                  max={40}
                  step={0.5}
                  value={Math.min(40, Math.max(1, Number(rewardValue) || 1))}
                  onChange={(e) => {
                    setRewardInput(Number(e.target.value).toFixed(2));
                    setRewardTouched(true);
                  }}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-muted-surface accent-[#17191c]"
                />
                <RewardFactors recommendation={recommendation} />

                <div className="pt-1">
                  <p className="text-[13px] font-semibold text-ink" id="payment-method-label">
                    Payment method
                  </p>
                  <div
                    className="mt-1.5 grid gap-2 sm:grid-cols-2"
                    role="group"
                    aria-labelledby="payment-method-label"
                  >
                    <button
                      type="button"
                      aria-pressed={paymentMethod === "stripe_card"}
                      onClick={() => setPaymentMethod("stripe_card")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        paymentMethod === "stripe_card"
                          ? "border-ink bg-surface shadow-soft"
                          : "border-line bg-surface hover:border-[#cfd3c9]",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <CreditCard className="size-3.5" aria-hidden />
                        Stripe Card Escrow
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                        Places a card hold on assignment and releases when the 4-digit handoff code is confirmed.
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={paymentMethod === "cash_handoff"}
                      onClick={() => setPaymentMethod("cash_handoff")}
                      className={cn(
                        "rounded-xl border p-3 text-left transition-colors",
                        paymentMethod === "cash_handoff"
                          ? "border-ink bg-surface shadow-soft"
                          : "border-line bg-surface hover:border-[#cfd3c9]",
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                        <Banknote className="size-3.5" aria-hidden />
                        Cash at Handoff
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-relaxed text-muted">
                        Pay cash in person when you meet and confirm the 4-digit handoff code.
                      </span>
                    </button>
                  </div>
                </div>
              </section>

              <section>
                <button
                  type="button"
                  onClick={() => setMoreOpen((open) => !open)}
                  aria-expanded={moreOpen}
                  className="flex w-full items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-3 text-left"
                >
                  <span>
                    <span className="block text-[12.5px] font-semibold text-ink">
                      More detail <span className="font-normal text-muted">(optional)</span>
                    </span>
                    <span className="mt-0.5 block text-[10.5px] text-muted">
                      Item, instructions, receipts, requirements
                    </span>
                  </span>
                  <ChevronDown
                    className={cn("size-4 text-muted transition-transform", moreOpen && "rotate-180")}
                    aria-hidden
                  />
                </button>
                {moreOpen ? (
                  <div className="mt-3 space-y-3.5">
                    <Field
                      label="Requirements"
                      htmlFor="task-requirements"
                      optional
                      hint="One per line"
                    >
                      <Textarea
                        id="task-requirements"
                        value={requirements}
                        onChange={(e) => setRequirements(e.target.value)}
                        maxLength={400}
                        placeholder={"e.g. One spiral notebook\nHand it to the library desk"}
                        className="min-h-[76px]"
                      />
                    </Field>
                    {isDelivery || category === "errands" ? (
                      <Field label="Item" htmlFor="task-item" optional hint="Size, weight, description">
                        <Input
                          id="task-item"
                          value={itemDescription}
                          onChange={(e) => setItemDescription(e.target.value)}
                          maxLength={120}
                          placeholder="e.g. One spiral notebook, about 1 lb"
                        />
                      </Field>
                    ) : null}
                    <Field label="Instructions" htmlFor="task-instructions" optional>
                      <Textarea
                        id="task-instructions"
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        maxLength={400}
                        placeholder="Where to meet, names, or anything private-but-necessary."
                        className="min-h-[76px]"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                      <Field label="Expenses" htmlFor="task-expense" optional error={errors.expense}>
                        <div className="relative">
                          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
                            $
                          </span>
                          <Input
                            id="task-expense"
                            type="number"
                            min={0}
                            step="0.50"
                            value={expenseInput}
                            onChange={(e) => setExpenseInput(e.target.value)}
                            className="tabular pl-7"
                            placeholder="0.00"
                          />
                        </div>
                      </Field>
                      <Field label="Expense note" htmlFor="task-expense-note" optional>
                        <Input
                          id="task-expense-note"
                          value={expenseNote}
                          onChange={(e) => setExpenseNote(e.target.value)}
                          maxLength={160}
                          placeholder="e.g. Receipt required; reimbursed on delivery"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="rounded-xl bg-muted-surface px-3.5 py-3 text-[11px] leading-relaxed text-muted">
                <p className="flex items-center gap-1.5 font-semibold text-ink">
                  <ShieldCheck className="size-3.5 text-[#587d2a]" aria-hidden />
                  What's permitted
                </p>
                <p className="mt-1">
                  Small errands, deliveries, study help, tech help and light moving. Not allowed:
                  rides, alcohol or controlled substances, weapons, academic cheating, medical
                  emergencies, or work requiring a professional license.
                </p>
              </div>
            </form>

            <aside className="min-w-0 space-y-3 lg:sticky lg:top-0 lg:self-start">
              <div className="flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-ink">Live preview</h3>
                <Pill tone="lime">How helpers see it</Pill>
              </div>
              <div className="rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                  {CATEGORY_LABELS[category]}
                </p>
                <h4 className="mt-1.5 min-h-[24px] text-[15px] font-semibold leading-snug text-ink">
                  {title.trim() || "Your task title"}
                </h4>
                <p className="mt-1 line-clamp-3 min-h-[40px] text-[11.5px] leading-relaxed text-muted">
                  {description.trim() || "Your short description will help the right person say yes."}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3" aria-hidden />
                    {isDelivery
                      ? `${getLocation(pickupId).shortLabel} → ${getLocation(dropoffId).shortLabel}`
                      : getLocation(locationId).shortLabel}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3" aria-hidden />
                    {deadline ? formatDeadline(deadline) : "No deadline"}
                  </span>
                </div>
                <div className="mt-3 flex items-end justify-between border-t border-line pt-1.5">
                  <div>
                    <p className="tabular font-mono text-xl font-semibold text-ink">
                      {formatMoney(rewardCents)}
                    </p>
                    <p className="text-[9.5px] text-muted">
                      {acceptanceMode === "fixed" ? "Fixed reward" : "Or make an offer"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Avatar
                      name={user.name}
                      initials={user.initials}
                      color={user.avatarColor}
                      size="xs"
                    />
                    <span className="text-[10px] font-medium text-ink">{user.name.split(" ")[0]}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl bg-ink p-4 text-white">
                <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/50">
                  Estimated reward
                </p>
                <p className="tabular mt-0.5 font-mono text-2xl font-semibold text-lime">
                  {formatMoney(recommendation.minCents, { compact: true })}–
                  {formatMoney(recommendation.maxCents, { compact: true })}
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-white/55">
                  Typical {formatMoney(recommendation.typicalCents)} · ~{recommendation.totalMinutes} min total.
                  Rules-based, not market data.
                </p>
                <div className="mt-3 space-y-1.5 border-t border-white/10 pt-2.5">
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="text-white/50">Payment method</span>
                    <span className="font-medium text-white">
                      {paymentMethod === "cash_handoff" ? "Cash at Handoff" : "Stripe Card Hold"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="text-white/50">Helper task reward</span>
                    <span className="tabular font-medium text-white">{formatMoney(rewardCents)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="text-white/50">Expense reimbursement</span>
                    <span className="tabular font-medium text-white">
                      {expenseCents ? `up to ${formatMoney(expenseCents)}` : "$0.00"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10.5px]">
                    <span className="text-white/50">Campus platform fee</span>
                    <span className="tabular font-medium text-lime">$0.00</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 text-[11px]">
                    <span className="text-white/70">Total payout / hold</span>
                    <span className="tabular font-semibold text-lime">
                      {formatMoney(rewardCents + expenseCents)}
                    </span>
                  </div>
                </div>
                <p className="mt-2.5 flex items-start gap-1.5 text-[9.5px] leading-relaxed text-white/40">
                  <Wallet className="mt-0.5 size-3 shrink-0" aria-hidden />
                  {paymentMethod === "cash_handoff"
                    ? "Settled in cash on handoff after 4-digit code confirmation. $0 campus fee."
                    : "Stripe PaymentIntent authorized on assignment and captured on 4-digit handoff confirmation."}
                </p>
              </div>
            </aside>
          </div>
        )}
      </Modal>

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this draft?"
        description="Your details haven't been published. Discarding clears the form permanently."
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDiscardOpen(false)}>
              Keep editing
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDiscardOpen(false);
                resetAll();
                ui.closeCompose();
                toast("Draft discarded.");
              }}
            >
              Discard
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted">Nothing was posted, so nobody else saw this draft.</p>
      </Modal>
    </>
  );
}

/** Suggested range as a band, with a marker where the current reward sits. */
function RewardScale({
  recommendation,
  rewardCents,
}: {
  recommendation: RewardRecommendation;
  rewardCents: number;
}) {
  const scale = Math.max(recommendation.maxCents * 1.5, rewardCents, 100);
  const percent = (cents: number) => `${Math.min(100, (cents / scale) * 100)}%`;
  return (
    <div className="relative mt-2 h-1.5 rounded-full bg-muted-surface" aria-hidden>
      <div
        className="absolute inset-y-0 rounded-full bg-lime-deep"
        style={{
          left: percent(recommendation.minCents),
          width: `calc(${percent(recommendation.maxCents)} - ${percent(recommendation.minCents)})`,
        }}
      />
      <div
        className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink shadow-soft transition-[left] duration-150"
        style={{ left: percent(rewardCents) }}
      />
    </div>
  );
}

function RewardFactors({ recommendation }: { recommendation: RewardRecommendation }) {
  return (
    <details className="group">
      <summary className="cursor-pointer list-none text-[10.5px] font-medium text-muted hover:text-ink">
        Why this estimate?
      </summary>
      <ul className="mt-1.5 space-y-1 text-[10.5px] text-muted">
        {recommendation.factors.map((factor) => (
          <li key={factor} className="flex items-start gap-1.5">
            <span className="mt-1 size-1 shrink-0 rounded-full bg-[#a6c43f]" aria-hidden />
            {factor}
          </li>
        ))}
        <li className="flex items-start gap-1.5">
          <span className="mt-1 size-1 shrink-0 rounded-full bg-[#a6c43f]" aria-hidden />
          Suggested range {formatMoney(recommendation.minCents)}–{formatMoney(recommendation.maxCents)}
        </li>
      </ul>
    </details>
  );
}

function resolveDeadline(preset: DeadlinePreset, custom: string): string | null {
  const now = new Date();
  switch (preset) {
    case "asap":
      return new Date(now.getTime() + 2 * 3_600_000).toISOString();
    case "today":
      return new Date(now.getTime() + 4 * 3_600_000).toISOString();
    case "tomorrow": {
      const date = new Date(now);
      date.setDate(date.getDate() + 1);
      date.setHours(12, 0, 0, 0);
      return date.toISOString();
    }
    case "custom":
      return fromDateTimeLocalValue(custom);
    default:
      return null;
  }
}
