"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  CreditCard,
  Flag,
  HandCoins,
  Lock,
  MapPin,
  Navigation,
  Receipt,
  Send,
  ShieldCheck,
  Star,
  Timer,
} from "lucide-react";
import type { Offer } from "@/types";
import { useDemo, useUi } from "@/components/providers";
import {
  canAcceptTask,
  canCancelTask,
  canConfirmCompletion,
  canMakeOffer,
  canMarkReady,
  canMessageTask,
  canReportDispute,
  canReviewTask,
  canStartTask,
  canVerifyHandoff,
  effectiveStatus,
  getEvents,
  getMessages,
  getOffersForTask,
  getPayment,
  getReviewBy,
  getReviewsForTask,
  getTask,
  getPendingOfferBy,
  getUser,
  getUserStats,
  hasCompletedForRequester,
} from "@/features/selectors";
import { calculateMatch, CATEGORY_LABELS } from "@/features/matching";
import { analyzeMessage } from "@/features/moderation";
import { distanceBetweenLocations, getLocation, travelMinutes } from "@/lib/locations";
import {
  captureStripeEscrowHold,
  createStripeEscrowHold,
  refundStripeEscrowHold,
} from "@/lib/stripe-client";
import { formatMoney } from "@/lib/format";
import { formatDeadline, formatRelative, formatTimeOnly, minutesUntil } from "@/lib/time";
import {
  Avatar,
  Button,
  Field,
  Input,
  Modal,
  Pill,
  StatusBadge,
  Textarea,
  cn,
  useToast,
} from "@/components/ui";

const PAYMENT_LABEL: Record<string, { title: string; body: string }> = {
  DEMO_AUTHORIZED: {
    title: "Demo payment authorized",
    body: "No real money has been charged.",
  },
  DEMO_RELEASED: {
    title: "Demo payout recorded",
    body: "No actual transfer occurred.",
  },
  DEMO_REFUNDED: {
    title: "Demo authorization released",
    body: "No real money was ever charged.",
  },
  DEMO_DISPUTED: {
    title: "Demo payment paused",
    body: "No real money has moved while the problem is reviewed.",
  },
};

type LocalDialog = "offer" | "review" | "cancel" | "dispute" | "complete" | null;

export function TaskDetailSheet() {
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const task = getTask(state, ui.selectedTaskId ?? undefined);
  const [dialog, setDialog] = useState<LocalDialog>(null);
  const [offerToAccept, setOfferToAccept] = useState<Offer | null>(null);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerTime, setOfferTime] = useState("");
  const [offerMessage, setOfferMessage] = useState("");
  const [offerError, setOfferError] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [disputeReason, setDisputeReason] = useState("");
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [handoffInput, setHandoffInput] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const taskId = task?.id;
  useEffect(() => {
    setDialog(null);
    setOfferToAccept(null);
    setHandoffInput("");
    setHandoffError(null);
    setMessageBody("");
    setOfferError(null);
    if (task) {
      setOfferAmount(String(task.rewardCents / 100));
      setOfferTime("");
      setOfferMessage("");
    }
  }, [taskId]);

  const open = Boolean(task && ui.selectedTaskId);
  const messages = useMemo(() => (task ? getMessages(state, task.id) : []), [state, task]);
  const messageModeration = useMemo(() => analyzeMessage(messageBody), [messageBody]);

  useEffect(() => {
    if (!open || !task) return;
    if (task.helperId && (task.requesterId === user.id || task.helperId === user.id)) {
      store.markConversationRead(task.id);
    }
    // Primitive deps only: marking messages read must not retrigger itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, task?.helperId, user.id, messages.length, store]);

  useEffect(() => {
    if (!open) return;
    messagesEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, open]);

  // This hook must run on every render, before the early return, so the hook
  // order stays stable when a task is opened or closed.
  const match = useMemo(() => {
    if (!task || task.requesterId === user.id) return null;
    return calculateMatch(
      task,
      user,
      {},
      {
        completedForRequester: hasCompletedForRequester(state, user.id, task.requesterId),
      },
    );
  }, [state, task, user]);

  if (!task) return null;

  const requester = getUser(state, task.requesterId);
  const helper = task.helperId ? getUser(state, task.helperId) : undefined;
  const isRequester = task.requesterId === user.id;
  const isHelper = task.helperId === user.id;
  const participant = isRequester || isHelper;
  const status = effectiveStatus(task);
  const pendingOffers = getOffersForTask(state, task.id).filter((o) => o.status === "PENDING");
  const allOffers = getOffersForTask(state, task.id);
  const myOpenOffer = getPendingOfferBy(state, task.id, user.id);
  const payment = getPayment(state, task.id);
  const review = getReviewBy(state, task.id, user.id);
  const reviews = getReviewsForTask(state, task.id);
  const events = getEvents(state, task.id);
  const reward = task.agreedRewardCents ?? task.rewardCents;
  const counterpart = isRequester ? helper : isHelper ? requester : undefined;
  const canMessage = canMessageTask(task, user);

  const minutes = minutesUntil(task.deadline);
  const urgent = minutes > 0 && minutes <= 180;
  const routeMiles = match?.routeMiles ?? distanceBetweenLocations(task.locationId, task.dropoffLocationId ?? task.locationId);
  const routeMinutes = match?.travelMinutes ?? travelMinutes(routeMiles);
  const handoffNeeded = Boolean(task.handoffCode) && !task.handoffVerified;
  const canReview = canReviewTask(state, task, user);

  const sendMessage = (event: FormEvent) => {
    event.preventDefault();
    const result = store.sendMessage(task.id, messageBody);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }
    setMessageBody("");
  };

  const handleHandoff = () => {
    const result = store.verifyHandoff(task.id, handoffInput);
    if (!result.ok) {
      setHandoffError(result.error);
      return;
    }
    setHandoffError(null);
    setHandoffInput("");
    toast("Handoff confirmed. You can mark the task ready now.", "success");
  };

  return (
    <>
      <Modal
        open={open}
        onClose={ui.closeTask}
        variant="sheet"
        title={task.title}
        description={`${CATEGORY_LABELS[task.category]} · Posted ${formatRelative(task.createdAt)}`}
        footer={
          <TaskActions
            onAccept={() => ui.openAccept(task.id)}
            onOffer={() => setDialog("offer")}
            onReview={() => setDialog("review")}
            onConfirm={() => setDialog("complete")}
            onCancel={() => setDialog("cancel")}
            onDispute={() => setDialog("dispute")}
            onStart={() => {
              const result = store.startTask(task.id);
              if (!result.ok) return toast(result.error, "error");
              toast("Task started. Message the requester if you need anything.", "success");
            }}
            onReady={() => {
              const result = store.markTaskReady(task.id);
              if (!result.ok) return toast(result.error, "error");
              toast("Marked ready. The requester has been notified to confirm.", "success");
            }}
            onReportTask={() => ui.openReport({ subject: "TASK", taskId: task.id })}
            handoffNeeded={handoffNeeded}
          />
        }
      >
        <div className="space-y-5 pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <StatusBadge status={status} />
            <div className="flex flex-wrap items-center gap-1.5">
              {task.paymentMethod === "cash_handoff" ? (
                <Pill tone="success">
                  <Banknote className="size-3" aria-hidden />
                  Cash at Handoff
                </Pill>
              ) : (
                <Pill tone="neutral">
                  <CreditCard className="size-3" aria-hidden />
                  Stripe Card Hold
                </Pill>
              )}
              {task.acceptanceMode === "offers" ? (
                <Pill tone="warning">
                  <HandCoins className="size-3" aria-hidden />
                  Open to offers
                </Pill>
              ) : (
                <Pill tone="neutral">Fixed reward</Pill>
              )}
              {urgent && status === "OPEN" ? (
                <Pill tone="warning">
                  <Clock3 className="size-3" aria-hidden />
                  Due soon
                </Pill>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl bg-ink p-4 text-white">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                  {task.agreedRewardCents ? "Agreed reward" : "Reward"}
                </p>
                <p className="tabular mt-1 font-mono text-[32px] font-semibold leading-none text-lime">
                  {formatMoney(reward)}
                </p>
                <p className="mt-1.5 text-[11px] text-white/50">
                  {task.agreedRewardCents
                    ? "Locked when the helper was assigned"
                    : task.acceptanceMode === "offers"
                      ? "The requester is open to a different price"
                      : "Fixed price · accept it as posted"}
                </p>
              </div>
              {match && status === "OPEN" ? (
                <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-right">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45">
                    Doro Match
                  </p>
                  <p className="tabular font-mono text-2xl font-semibold leading-tight text-white">
                    {match.score}%
                  </p>
                </div>
              ) : null}
            </div>
            {match && status === "OPEN" ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                {match.explanation.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-1 text-[10.5px] text-white/80"
                  >
                    <Check className="size-2.5 text-lime" aria-hidden />
                    {label}
                  </span>
                ))}
              </div>
            ) : null}
            {match && status === "OPEN" && match.ineligibleReason ? (
              <p className="mt-2 text-[11px] text-lime">{match.ineligibleReason}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <MetaCard
              icon={<MapPin className="size-4" />}
              label={task.dropoffLocationId ? "Pickup → drop-off" : "Location"}
              value={
                task.dropoffLocationId
                  ? `${getLocation(task.locationId).shortLabel} → ${getLocation(task.dropoffLocationId).shortLabel}`
                  : getLocation(task.locationId).name
              }
              hint={getLocation(task.locationId).area}
            />
            <MetaCard
              icon={<CalendarDays className="size-4" />}
              label="Deadline"
              value={formatDeadline(task.deadline)}
              hint={
                status === "COMPLETED"
                  ? "Completed"
                  : minutes <= 0
                    ? "Deadline passed"
                    : `${Math.max(1, Math.round(minutes / 60))}h remaining`
              }
              tone={urgent ? "warning" : "default"}
            />
            <MetaCard
              icon={<Timer className="size-4" />}
              label="Estimated work"
              value={`~${task.estimatedMinutes} min`}
              hint="Helper-provided estimate"
            />
            <MetaCard
              icon={<Navigation className="size-4" />}
              label={isRequester ? "Route length" : "From your area"}
              value={
                routeMiles > 0
                  ? `${routeMiles.toFixed(1)} mi · ~${routeMinutes} min`
                  : "Right there"
              }
              hint="Straight-line demo estimate"
            />
          </div>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">What's needed</h3>
            <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-muted">
              {task.description}
            </p>
          </section>

          {task.requirements?.length || task.itemDescription || task.instructions || task.expenseNote ? (
            <section className="space-y-2.5 rounded-2xl border border-line bg-surface p-4">
              {task.itemDescription ? (
                <DetailRow label="Item" value={task.itemDescription} />
              ) : null}
              {task.requirements?.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Details
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {task.requirements.map((requirement) => (
                      <li key={requirement} className="flex items-start gap-1.5 text-[12.5px] text-ink">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-[#587d2a]" aria-hidden />
                        {requirement}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {task.instructions ? <DetailRow label="Instructions" value={task.instructions} /> : null}
              {task.expenseNote ? (
                <div className="rounded-xl bg-warning-soft px-3 py-2 text-[11.5px] leading-relaxed text-warning">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <Receipt className="size-3.5" aria-hidden />
                    Expense reimbursement
                  </p>
                  <p className="mt-0.5">{task.expenseNote}</p>
                  {task.expenseCents ? (
                    <p className="mt-1 font-medium">Up to {formatMoney(task.expenseCents)} separately.</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {task.handoffCode && participant && status !== "CANCELLED" ? (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    <Lock className="size-3.5" aria-hidden />
                    Handoff code
                  </h3>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    {isRequester
                      ? "Share this four-digit code only when you meet the helper."
                      : "Ask the requester for the code when you hand over the item."}
                  </p>
                </div>
                {task.handoffVerified ? (
                  <Pill tone="success">
                    <CheckCircle2 className="size-3" aria-hidden />
                    Confirmed
                  </Pill>
                ) : null}
              </div>

              {isRequester ? (
                <div className="mt-3 flex items-center gap-2">
                  <div className="flex gap-1.5">
                    {task.handoffCode.split("").map((digit, index) => (
                      <span
                        key={`${digit}-${index}`}
                        className="tabular flex size-9 items-center justify-center rounded-lg border border-line bg-muted-surface font-mono text-lg font-semibold text-ink"
                      >
                        {digit}
                      </span>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      void navigator.clipboard?.writeText(task.handoffCode ?? "").then(
                        () => toast("Handoff code copied.", "success"),
                        () => toast("Copy isn't available in this browser.", "error"),
                      );
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden />
                    Copy
                  </Button>
                </div>
              ) : isHelper && status === "IN_PROGRESS" && !task.handoffVerified ? (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <label htmlFor="handoff-code" className="sr-only">
                    Four-digit handoff code
                  </label>
                  <Input
                    id="handoff-code"
                    inputMode="numeric"
                    maxLength={4}
                    value={handoffInput}
                    onChange={(e) => {
                      setHandoffInput(e.target.value.replace(/\D/g, "").slice(0, 4));
                      setHandoffError(null);
                    }}
                    placeholder="4-digit code"
                    className="tabular h-10 max-w-[160px] text-center font-mono text-base tracking-[0.3em]"
                    aria-invalid={Boolean(handoffError)}
                  />
                  <Button size="sm" variant="dark" onClick={handleHandoff} disabled={handoffInput.length !== 4}>
                    Verify code
                  </Button>
                </div>
              ) : null}
              {handoffError ? (
                <p className="mt-1.5 text-xs font-medium text-danger" role="alert">
                  {handoffError}
                </p>
              ) : null}
              {isHelper && task.handoffCode && !task.handoffVerified && status === "ASSIGNED" ? (
                <p className="mt-2 text-[11.5px] text-muted">
                  Start the task first, then enter the code when you meet.
                </p>
              ) : null}
            </section>
          ) : null}

          {isRequester && task.acceptanceMode === "offers" && status === "OPEN" ? (
            <section>
              <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <HandCoins className="size-3.5" aria-hidden />
                  Offers
                  {pendingOffers.length > 0 ? (
                    <span className="tabular rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-semibold text-lime">
                      {pendingOffers.length}
                    </span>
                  ) : null}
                </h3>
                <span className="text-[10.5px] text-muted">Accepting locks the agreed reward</span>
              </div>
              {pendingOffers.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#d9ddd2] bg-[#fbfcf9] px-3 py-4 text-[12px] text-muted">
                  No offers yet. Helpers can propose a reward while the task is open.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {pendingOffers.map((offer) => {
                    const sender = getUser(state, offer.senderId);
                    const senderStats = sender ? getUserStats(state, sender) : null;
                    return (
                      <li key={offer.id} className="rounded-xl border border-line bg-surface p-3">
                        <div className="flex items-start gap-2.5">
                          {sender ? (
                            <Avatar
                              name={sender.name}
                              initials={sender.initials}
                              color={sender.avatarColor}
                              size="sm"
                              verified={sender.verified}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-[12.5px] font-semibold text-ink">
                                {sender?.name ?? "Helper"}
                                {senderStats && senderStats.isNew ? (
                                  <span className="ml-1.5 rounded-full bg-muted-surface px-1.5 py-0.5 text-[9px] font-medium text-muted">
                                    New helper
                                  </span>
                                ) : null}
                              </p>
                              <p className="tabular text-[15px] font-semibold text-ink">
                                {formatMoney(offer.proposedRewardCents)}
                              </p>
                            </div>
                            <p className="mt-0.5 text-[10.5px] text-muted">
                              {senderStats?.rating
                                ? `${senderStats.rating.toFixed(1)}★ · ${senderStats.completedAsHelper} completed`
                                : `${senderStats?.completedAsHelper ?? 0} completed · no reviews yet`}
                              {offer.proposedTime ? ` · ${formatDeadline(offer.proposedTime)}` : ""}
                            </p>
                            {offer.message ? (
                              <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink/80">
                                “{offer.message}”
                              </p>
                            ) : null}
                            <div className="mt-2.5 flex gap-1.5">
                              <Button
                                size="sm"
                                variant="lime"
                                onClick={() => setOfferToAccept(offer)}
                              >
                                Accept offer
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const result = store.rejectOffer(offer.id);
                                  if (!result.ok) return toast(result.error, "error");
                                  toast("Offer declined. The helper has been notified.", "success");
                                }}
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              {allOffers.some((o) => o.status !== "PENDING") ? (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-medium text-muted hover:text-ink">
                    Offer history
                  </summary>
                  <ul className="mt-1.5 space-y-1 text-[11px] text-muted">
                    {allOffers
                      .filter((o) => o.status !== "PENDING")
                      .map((offer) => (
                        <li key={offer.id} className="flex justify-between gap-2">
                          <span className="capitalize">{offer.status.toLowerCase()}</span>
                          <span>{formatMoney(offer.proposedRewardCents)}</span>
                        </li>
                      ))}
                  </ul>
                </details>
              ) : null}
            </section>
          ) : null}

          {!isRequester && myOpenOffer ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-3.5">
              <div>
                <p className="text-[12px] font-semibold text-ink">
                  Your offer: {formatMoney(myOpenOffer.proposedRewardCents)}
                </p>
                <p className="text-[11px] text-muted">
                  Pending with {requester?.name.split(" ")[0] ?? "the requester"}. You'll be notified
                  when they respond.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const result = store.withdrawOffer(myOpenOffer.id);
                  if (!result.ok) return toast(result.error, "error");
                  toast("Offer withdrawn.", "success");
                }}
              >
                Withdraw
              </Button>
            </div>
          ) : null}

          {counterpart ? (
            <div className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    name={counterpart.name}
                    initials={counterpart.initials}
                    color={counterpart.avatarColor}
                    size="md"
                    verified={counterpart.verified}
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{counterpart.name}</p>
                    <p className="text-[11px] text-muted">
                      {isRequester ? "Your helper" : "Requester"} · {counterpart.joinedLabel}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    ui.openReport({ subject: "USER", userId: counterpart.id, taskId: task.id })
                  }
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-muted hover:text-danger"
                >
                  <Flag className="size-3" aria-hidden />
                  Report
                </button>
              </div>
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-muted">{counterpart.bio}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
                <span>{getUserStats(state, counterpart).completedAsHelper} completed</span>
                <span>
                  {getUserStats(state, counterpart).rating
                    ? `${getUserStats(state, counterpart).rating?.toFixed(1)}★`
                    : "No reviews yet"}
                </span>
                <span>{counterpart.verified ? "Verified demo profile" : "Unverified demo profile"}</span>
              </div>
            </div>
          ) : isRequester ? (
            <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
              <Avatar
                name={requester?.name ?? user.name}
                initials={requester?.initials ?? user.initials}
                color={requester?.avatarColor ?? user.avatarColor}
                size="md"
              />
              <div>
                <p className="text-[13px] font-semibold text-ink">Posted by you</p>
                <p className="text-[11px] text-muted">
                  Helpers nearby can see this request. You'll be notified when someone accepts.
                </p>
              </div>
            </div>
          ) : null}

          {participant && task.helperId ? (
            <section className="rounded-2xl border border-line bg-surface">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                  <Send className="size-3.5" aria-hidden />
                  Messages
                </h3>
                <span className="text-[10.5px] text-muted">Task conversation only</span>
              </div>
              <div className="max-h-[280px] space-y-2.5 overflow-y-auto px-4 py-3">
                {messages.length === 0 ? (
                  <p className="py-4 text-center text-[11.5px] text-muted">
                    No messages yet. Say hello and confirm the details.
                  </p>
                ) : (
                  messages.map((message) => {
                    const mine = message.senderId === user.id;
                    const sender = getUser(state, message.senderId);
                    return (
                      <div
                        key={message.id}
                        className={cn("flex items-end gap-2", mine && "flex-row-reverse")}
                      >
                        {!mine && sender ? (
                          <Avatar
                            name={sender.name}
                            initials={sender.initials}
                            color={sender.avatarColor}
                            size="xs"
                          />
                        ) : null}
                        <div
                          className={cn(
                            "max-w-[82%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed",
                            mine
                              ? "rounded-br-sm bg-ink text-white"
                              : "rounded-bl-sm bg-muted-surface text-ink",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p
                            className={cn(
                              "mt-1 text-[9px]",
                              mine ? "text-white/40" : "text-muted",
                            )}
                          >
                            {formatTimeOnly(message.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              {canMessage && messageModeration.level !== "allow" ? (
                <div
                  className={cn(
                    "mx-3 mt-3 rounded-xl border px-3 py-2 text-[10.5px] leading-relaxed",
                    messageModeration.level === "block"
                      ? "border-[#f1d3ce] bg-danger-soft text-danger"
                      : "border-[#f0e2bd] bg-warning-soft text-warning",
                  )}
                  role="status"
                >
                  <span className="font-semibold">
                    {messageModeration.level === "block" ? "This message is blocked" : "Heads up"}
                  </span>{" "}
                  {messageModeration.suggestions[0] ??
                    `Flagged for ${messageModeration.reasons.join(", ")}.`}
                </div>
              ) : null}
              {canMessage ? (
                <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-line p-3">
                  <label htmlFor="message-body" className="sr-only">
                    Message
                  </label>
                  <Textarea
                    id="message-body"
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (messageBody.trim()) sendMessage(e);
                      }
                    }}
                    placeholder={`Message ${counterpart?.name.split(" ")[0] ?? "the other person"}…`}
                    className="min-h-[42px] max-h-28 resize-none py-2.5 text-[12px]"
                    rows={1}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="dark"
                    className="mb-0.5 size-10 shrink-0 rounded-full p-0"
                    disabled={!messageBody.trim() || messageModeration.level === "block"}
                    aria-label="Send message"
                  >
                    <Send className="size-4" aria-hidden />
                  </Button>
                </form>
              ) : (
                <p className="border-t border-line px-4 py-2.5 text-[11px] text-muted">
                  This conversation is read-only now that the task is closed.
                </p>
              )}
            </section>
          ) : null}

          {payment ? (
            <section className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
                    {task.paymentMethod === "cash_handoff" ? (
                      <Banknote className="size-4 text-[#587d2a]" aria-hidden />
                    ) : (
                      <CreditCard className="size-4 text-[#587d2a]" aria-hidden />
                    )}
                    {task.paymentMethod === "cash_handoff"
                      ? "Cash at Handoff"
                      : "Stripe Card Escrow"}
                  </h3>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {PAYMENT_LABEL[payment.state]?.title ?? payment.state}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Pill tone={payment.state === "DEMO_DISPUTED" ? "danger" : payment.state === "DEMO_RELEASED" ? "success" : "neutral"}>
                    {payment.state === "DEMO_RELEASED"
                      ? "Paid out"
                      : payment.state === "DEMO_AUTHORIZED"
                        ? "Hold active"
                        : payment.state === "DEMO_REFUNDED"
                          ? "Released"
                          : "Paused"}
                  </Pill>
                  {payment.stripePaymentIntentId && task.paymentMethod !== "cash_handoff" ? (
                    <span className="font-mono text-[9px] text-muted">
                      {payment.stripePaymentIntentId.slice(0, 15)}…
                    </span>
                  ) : null}
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 border-t border-line pt-3 text-[11.5px]">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Helper task reward</dt>
                  <dd className="tabular font-medium text-ink">{formatMoney(payment.rewardCents)}</dd>
                </div>
                {task.expenseCents ? (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">Expense reimbursement</dt>
                    <dd className="tabular font-medium text-ink">up to {formatMoney(task.expenseCents)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-3">
                  <dt className="text-muted">Campus platform fee</dt>
                  <dd className="tabular font-medium text-[#587d2a]">$0.00 (Campus free)</dd>
                </div>
                <div className="flex justify-between gap-3 border-t border-line pt-2">
                  <dt className="font-medium text-ink">
                    {payment.state === "DEMO_RELEASED" ? "Total paid out" : "Total authorized hold"}
                  </dt>
                  <dd className="tabular font-semibold text-ink">
                    {formatMoney(payment.rewardCents + (task.expenseCents ?? 0))}
                  </dd>
                </div>
              </dl>
              <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-muted-surface px-3 py-2 text-[10.5px] leading-relaxed text-muted">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                {task.paymentMethod === "cash_handoff"
                  ? "Settle directly with the helper in cash at handoff once the 4-digit code is confirmed."
                  : `${PAYMENT_LABEL[payment.state]?.body ?? "Card hold placed via Stripe API."} Real Stripe credentials in .env activate live processing.`}
              </p>
            </section>
          ) : null}

          {status === "COMPLETED" ? (
            <section className="rounded-2xl border border-[#d4ebda] bg-success-soft p-4">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-semibold text-success">Task completed</h3>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#3f6a4e]">
                    {task.completedAt ? `Confirmed ${formatRelative(task.completedAt)}. ` : ""}
                    {formatMoney(reward)} recorded in the demo ledger. No real transfer occurred.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {reviews.map((item) => {
                      const author = getUser(state, item.authorId);
                      return (
                        <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-white/70 px-2 py-1 text-[10.5px] text-[#315c40]">
                          <Star className="size-3 fill-[#315c40]" aria-hidden />
                          {item.rating}.0 from {author?.name.split(" ")[0] ?? "someone"}
                        </span>
                      );
                    })}
                    {canReview ? (
                      <Button size="sm" variant="lime" onClick={() => setDialog("review")}>
                        Leave a review
                      </Button>
                    ) : review ? (
                      <span className="text-[10.5px] text-[#3f6a4e]">You left a {review.rating}-star review.</span>
                    ) : null}
                  </div>
                  {reviews.length > 0 ? (
                    <ul className="mt-2 space-y-1.5">
                      {reviews
                        .filter((item) => item.comment)
                        .map((item) => (
                          <li key={item.id} className="rounded-lg bg-white/60 px-2.5 py-2 text-[11px] leading-relaxed text-[#315c40]">
                            “{item.comment}”
                          </li>
                        ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          {status === "DISPUTED" ? (
            <section className="rounded-2xl border border-[#f1d3ce] bg-danger-soft p-4">
              <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-danger">
                <AlertTriangle className="size-4" aria-hidden />
                Problem reported
              </h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-[#7c4141]">
                {task.disputeReason ?? "The task is paused while both people review it."} The demo
                payment is paused; no real money has moved.
              </p>
            </section>
          ) : null}

          {status === "CANCELLED" ? (
            <section className="rounded-2xl border border-line bg-muted-surface p-4">
              <h3 className="text-[13px] font-semibold text-ink">Cancelled</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                {task.cancelReason ? `Reason: ${task.cancelReason}` : "This task was cancelled."} Any
                demo authorization was released; no real charge occurred.
              </p>
            </section>
          ) : null}

          <section className="text-[11px] leading-relaxed text-muted">
            <p className="flex items-start gap-1.5 rounded-xl border border-line bg-[#fbfcf9] px-3 py-2.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#587d2a]" aria-hidden />
              Meet in a permitted public location when possible. Keep private information private,
              and report unsafe requests. Doro's demo permits small errands, deliveries, study help,
              tech help and light moving — not rides, alcohol, weapons, cheating or emergencies.
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-muted hover:text-ink">
                Task history ({events.length} events)
              </summary>
              <ol className="mt-2 space-y-1.5 border-l border-line pl-3">
                {events.map((event) => (
                  <li key={event.id} className="text-[10.5px]">
                    <span className="font-medium text-ink">{event.label}</span>
                    <span className="text-muted"> · {formatRelative(event.createdAt)}</span>
                  </li>
                ))}
              </ol>
            </details>
          </section>

          <p className="text-center text-[10px] text-muted">
            DEMO MODE · Sample people, simulated payments. Nothing here is a real transaction.
          </p>
        </div>
      </Modal>

      <OfferDialog
        open={dialog === "offer"}
        onClose={() => setDialog(null)}
        taskTitle={task.title}
        suggestedCents={task.rewardCents}
        amount={offerAmount}
        setAmount={setOfferAmount}
        proposedTime={offerTime}
        setProposedTime={setOfferTime}
        message={offerMessage}
        setMessage={setOfferMessage}
        error={offerError}
        onSubmit={() => {
          const dollars = Number(offerAmount);
          if (!Number.isFinite(dollars) || dollars < 1) {
            setOfferError("Enter an offer of at least $1.00.");
            return;
          }
          const result = store.makeOffer(
            task.id,
            Math.round(dollars * 100),
            offerMessage,
            offerTime ? new Date(offerTime).toISOString() : undefined,
          );
          if (!result.ok) {
            setOfferError(result.error);
            return;
          }
          setOfferError(null);
          setDialog(null);
          setOfferMessage("");
          setOfferTime("");
          toast(
            `Offer sent to ${requester?.name.split(" ")[0] ?? "the requester"}. They'll see it with the task.`,
            "success",
          );
        }}
      />

      <ReviewDialog
        open={dialog === "review"}
        onClose={() => setDialog(null)}
        taskTitle={task.title}
        counterpartName={counterpart?.name.split(" ")[0] ?? "them"}
        rating={reviewRating}
        setRating={setReviewRating}
        comment={reviewComment}
        setComment={setReviewComment}
        onSubmit={() => {
          const result = store.submitReview(task.id, reviewRating, reviewComment);
          if (!result.ok) return toast(result.error, "error");
          setDialog(null);
          setReviewComment("");
          toast("Review submitted. Thanks for keeping Doro trustworthy.", "success");
        }}
      />

      <CancelDialog
        open={dialog === "cancel"}
        onClose={() => setDialog(null)}
        reason={cancelReason}
        setReason={setCancelReason}
        onConfirm={() => {
          const result = store.cancelTask(task.id, cancelReason);
          if (!result.ok) return toast(result.error, "error");
          if (payment?.stripePaymentIntentId && task.paymentMethod !== "cash_handoff") {
            void refundStripeEscrowHold({
              taskId: task.id,
              paymentIntentId: payment.stripePaymentIntentId,
              reason: cancelReason,
            });
          }
          setDialog(null);
          setCancelReason("");
          toast(
            task.paymentMethod === "cash_handoff"
              ? "Task cancelled."
              : "Task cancelled. Stripe card authorization hold released.",
            "success",
          );
        }}
      />

      <DisputeDialog
        open={dialog === "dispute"}
        onClose={() => setDialog(null)}
        reason={disputeReason}
        setReason={setDisputeReason}
        onConfirm={() => {
          const result = store.reportTaskProblem(task.id, disputeReason);
          if (!result.ok) return toast(result.error, "error");
          setDialog(null);
          setDisputeReason("");
          toast("Problem reported. The demo payment is paused pending review.", "default");
        }}
      />

      <Modal
        open={dialog === "complete"}
        onClose={() => setDialog(null)}
        title="Confirm completion?"
        description="Only confirm once the work is really done. This closes the task and records a simulated payout."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Not yet
            </Button>
            <Button
              variant="lime"
              onClick={() => {
                const result = store.confirmTaskCompletion(task.id);
                if (!result.ok) return toast(result.error, "error");
                if (payment?.stripePaymentIntentId && task.paymentMethod !== "cash_handoff") {
                  void captureStripeEscrowHold({
                    taskId: task.id,
                    paymentIntentId: payment.stripePaymentIntentId,
                    amountToCaptureCents: payment.totalCents,
                  });
                }
                setDialog(null);
                toast(
                  task.paymentMethod === "cash_handoff"
                    ? `Completion confirmed. Pay ${formatMoney(reward)} in cash to the helper.`
                    : `Completion confirmed. ${formatMoney(reward)} captured & released to helper.`,
                  "success",
                );
              }}
            >
              Confirm & release
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="text-[13px] font-semibold text-ink">{task.title}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              Helper: {helper?.name ?? "Assigned helper"} · Agreed reward{" "}
              <span className="font-semibold text-ink">{formatMoney(reward)}</span>
            </p>
          </div>
          <p className="text-[11.5px] leading-relaxed text-muted">
            Confirming records a <strong className="text-ink">demo payout</strong>. No real money is
            charged or transferred. Both of you can then leave a review.
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(offerToAccept)}
        onClose={() => setOfferToAccept(null)}
        title="Accept this offer?"
        description="Accepting assigns the helper and locks the agreed reward for this task."
        size="sm"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setOfferToAccept(null)}>
              Keep reviewing
            </Button>
            <Button
              variant="lime"
              onClick={() => {
                if (!offerToAccept) return;
                const result = store.acceptOffer(offerToAccept.id);
                if (!result.ok) return toast(result.error, "error");
                const acceptedReward = offerToAccept.proposedRewardCents;
                const offerSender = offerToAccept.senderId;
                if ((task.paymentMethod ?? "stripe_card") === "stripe_card") {
                  void createStripeEscrowHold({
                    taskId: task.id,
                    title: task.title,
                    rewardCents: acceptedReward,
                    expenseCents: task.expenseCents ?? 0,
                    requesterId: task.requesterId,
                    helperId: offerSender,
                  }).then((intent) => {
                    if (intent.ok && intent.paymentIntentId) {
                      store.attachStripePaymentIntent(
                        task.id,
                        intent.paymentIntentId,
                        intent.mode ?? "test_fallback",
                      );
                    }
                  });
                }
                setOfferToAccept(null);
                toast("Offer accepted. The helper is assigned and notified.", "success");
              }}
            >
              {offerToAccept ? `Accept ${formatMoney(offerToAccept.proposedRewardCents)}` : "Accept"}
            </Button>
          </div>
        }
      >
        {offerToAccept ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[12px] text-muted">
                {getUser(state, offerToAccept.senderId)?.name ?? "The helper"} proposed
              </p>
              <p className="tabular mt-1 text-2xl font-semibold text-ink">
                {formatMoney(offerToAccept.proposedRewardCents)}
              </p>
              {offerToAccept.proposedTime ? (
                <p className="mt-1 text-[11px] text-muted">
                  Proposed time: {formatDeadline(offerToAccept.proposedTime)}
                </p>
              ) : null}
              {offerToAccept.message ? (
                <p className="mt-2 text-[11.5px] leading-relaxed text-ink/80">
                  “{offerToAccept.message}”
                </p>
              ) : null}
            </div>
            <p className="text-[11.5px] leading-relaxed text-muted">
              Other pending offers will be marked as superseded. The agreed reward becomes the demo
              payment amount.
            </p>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function MetaCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className={cn("flex items-center gap-1.5", tone === "warning" ? "text-warning" : "text-muted")}>
        {icon}
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]">{label}</span>
      </div>
      <p className="mt-1 text-[12px] font-medium leading-snug text-ink">{value}</p>
      {hint ? <p className="text-[10px] text-muted">{hint}</p> : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink">{value}</p>
    </div>
  );
}

function TaskActions({
  onAccept,
  onOffer,
  onReview,
  onConfirm,
  onCancel,
  onDispute,
  onStart,
  onReady,
  onReportTask,
  handoffNeeded,
}: {
  onAccept: () => void;
  onOffer: () => void;
  onReview: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDispute: () => void;
  onStart: () => void;
  onReady: () => void;
  onReportTask: () => void;
  handoffNeeded: boolean;
}) {
  const { state, user } = useDemo();
  const ui = useUi();
  const task = getTask(state, ui.selectedTaskId ?? undefined);
  if (!task) return null;

  const isRequester = task.requesterId === user.id;
  const isHelper = task.helperId === user.id;
  const status = effectiveStatus(task);
  const acceptAllowed = canAcceptTask(task, user);
  const offerAllowed = canMakeOffer(task, user);
  const startAllowed = canStartTask(task, user);
  const readyAllowed = canMarkReady(task, user);
  const confirmAllowed = canConfirmCompletion(task, user);
  const cancelAllowed = canCancelTask(task, user);
  const disputeAllowed = canReportDispute(task, user);
  const reviewAllowed = canReviewTask(state, task, user);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!isRequester ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted"
            onClick={onReportTask}
          >
            <Flag className="size-3.5" aria-hidden />
            Report task
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {status === "OPEN" && !isRequester && task.acceptanceMode === "fixed" ? (
            <Button variant="lime" onClick={onAccept} disabled={!acceptAllowed}>
              Accept for {formatMoney(task.rewardCents)}
            </Button>
          ) : null}
          {status === "OPEN" && !isRequester && task.acceptanceMode === "offers" ? (
            <Button variant="lime" onClick={onOffer} disabled={!offerAllowed}>
              <HandCoins className="size-4" aria-hidden />
              Make an offer
            </Button>
          ) : null}
          {isRequester && status === "OPEN" ? (
            <>
              <Button variant="outline" onClick={onCancel} disabled={!cancelAllowed}>
                Cancel task
              </Button>
              <Button variant="dark" onClick={() => ui.closeTask()} className="hidden sm:inline-flex">
                Back to browse
              </Button>
            </>
          ) : null}
          {startAllowed ? (
            <Button variant="lime" onClick={onStart}>
              Start task
            </Button>
          ) : null}
          {isHelper && status === "IN_PROGRESS" ? (
            <div className="flex flex-col items-end gap-1">
              <Button variant="lime" onClick={onReady} disabled={!readyAllowed}>
                <CheckCircle2 className="size-4" aria-hidden />
                Mark work complete
              </Button>
              {handoffNeeded ? (
                <span className="text-[10px] text-muted">Verify the handoff code first</span>
              ) : null}
            </div>
          ) : null}
          {isHelper && status === "AWAITING_CONFIRMATION" ? (
            <span className="rounded-full bg-muted-surface px-3 py-2 text-[11px] font-medium text-muted">
              Waiting for the requester
            </span>
          ) : null}
          {confirmAllowed ? (
            <Button variant="lime" onClick={onConfirm}>
              Confirm completion
            </Button>
          ) : null}
          {disputeAllowed ? (
            <Button variant="outline" onClick={onDispute}>
              <AlertTriangle className="size-3.5" aria-hidden />
              Report a problem
            </Button>
          ) : null}
          {isRequester && (status === "ASSIGNED" || status === "IN_PROGRESS") ? (
            <Button variant="ghost" size="sm" className="text-danger" onClick={onCancel} disabled={!cancelAllowed}>
              Cancel
            </Button>
          ) : null}
          {reviewAllowed ? (
            <Button variant="lime" onClick={onReview}>
              <Star className="size-4" aria-hidden />
              Leave a review
            </Button>
          ) : null}
          {status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED" ? (
            <Link
              href="/activity"
              onClick={ui.closeTask}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink hover:bg-muted-surface"
            >
              View in activity
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          ) : null}
          <Button variant="ghost" onClick={ui.closeTask} className="sm:hidden">
            Close
          </Button>
        </div>
      </div>
      <p className="text-right text-[9.5px] text-muted">
        DEMO MODE · Simulated payments, no real charge or transfer.
      </p>
    </div>
  );
}

function OfferDialog({
  open,
  onClose,
  taskTitle,
  suggestedCents,
  amount,
  setAmount,
  proposedTime,
  setProposedTime,
  message,
  setMessage,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  taskTitle: string;
  suggestedCents: number;
  amount: string;
  setAmount: (value: string) => void;
  proposedTime: string;
  setProposedTime: (value: string) => void;
  message: string;
  setMessage: (value: string) => void;
  error: string | null;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Make an offer"
      description="Propose the reward that works for you. The requester can accept, decline, or leave it open."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="lime" onClick={onSubmit}>
            Send offer
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-muted-surface px-3 py-2.5 text-[11.5px] leading-relaxed text-muted">
          <p className="font-medium text-ink">{taskTitle}</p>
          <p className="mt-0.5">The requester listed {formatMoney(suggestedCents)}. Offers are not binding until accepted.</p>
        </div>
        <Field label="Your reward" htmlFor="offer-amount" hint="USD">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-medium text-muted">
              $
            </span>
            <Input
              id="offer-amount"
              type="number"
              min={1}
              max={1000}
              step="0.50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tabular pl-7 text-base font-semibold"
              data-autofocus
            />
          </div>
        </Field>
        <Field
          label="Proposed time"
          htmlFor="offer-time"
          optional
          hint="If different from the deadline"
        >
          <Input
            id="offer-time"
            type="datetime-local"
            value={proposedTime}
            onChange={(e) => setProposedTime(e.target.value)}
          />
        </Field>
        <Field label="Message" htmlFor="offer-message" optional hint={`${message.length}/300`}>
          <Textarea
            id="offer-message"
            value={message}
            maxLength={300}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Why you're a good fit, or when you're free."
            className="min-h-[84px]"
          />
        </Field>
        {error ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

function ReviewDialog({
  open,
  onClose,
  taskTitle,
  counterpartName,
  rating,
  setRating,
  comment,
  setComment,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  taskTitle: string;
  counterpartName: string;
  rating: number;
  setRating: (value: number) => void;
  comment: string;
  setComment: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Review ${counterpartName}`}
      description={taskTitle}
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Later
          </Button>
          <Button variant="lime" onClick={onSubmit}>
            Submit review
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-semibold text-ink">How did it go?</p>
          <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star === 1 ? "" : "s"}`}
                onClick={() => setRating(star)}
                className="rounded-md p-1"
              >
                <Star
                  className={cn(
                    "size-7 transition-colors",
                    star <= rating ? "fill-ink text-ink" : "fill-transparent text-[#c9cdc4]",
                  )}
                  aria-hidden
                />
              </button>
            ))}
            <span className="ml-2 text-xs font-medium text-muted">{rating}.0</span>
          </div>
        </div>
        <Field label="Comment" htmlFor="review-comment" optional hint={`${comment.length}/300`}>
          <Textarea
            id="review-comment"
            value={comment}
            maxLength={300}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Clear, kind, specific — what should the next person know?"
            className="min-h-[90px]"
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-muted">
          Reviews are public in this demo and count toward reputation. Ratings are not proof of
          identity or safety.
        </p>
      </div>
    </Modal>
  );
}

function CancelDialog({
  open,
  onClose,
  reason,
  setReason,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cancel this task?"
      description="This closes the task for everyone. The helper will be notified, and any demo authorization is released."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Keep the task
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={reason.trim().length < 3}>
            Cancel task
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Reason" htmlFor="cancel-reason" hint="Shown to the helper">
          <Textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={240}
            placeholder="e.g. Found another way to get it done."
            className="min-h-[80px]"
          />
        </Field>
        <p className="text-[11px] leading-relaxed text-muted">
          No real money is involved. Frequent cancellations would affect trust scores in a production
          version; this demo only records the cancellation.
        </p>
      </div>
    </Modal>
  );
}

function DisputeDialog({
  open,
  onClose,
  reason,
  setReason,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  reason: string;
  setReason: (value: string) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report a problem"
      description="This pauses the task and the simulated payment so both people can sort it out."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={reason.trim().length < 5}>
            Report problem
          </Button>
        </div>
      }
    >
      <Field label="What happened?" htmlFor="dispute-reason">
        <Textarea
          id="dispute-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="Describe the issue factually so both sides understand."
          className="min-h-[100px]"
        />
      </Field>
    </Modal>
  );
}
