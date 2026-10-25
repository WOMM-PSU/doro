"use client";

import { useEffect, useState } from "react";
import { Flag, Info } from "lucide-react";
import { useDemo, useUi } from "@/components/providers";
import { getTask, getUser } from "@/features/selectors";
import { REPORT_REASONS } from "@/features/moderation";
import { Button, Field, Modal, Select, Textarea, useToast } from "@/components/ui";

export function ReportDialog() {
  const { state, user, store } = useDemo();
  const ui = useUi();
  const { toast } = useToast();
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);

  const target = ui.reportTarget;
  const task = target?.taskId ? getTask(state, target.taskId) : undefined;
  const reportedUser = target?.userId ? getUser(state, target.userId) : undefined;
  const open = Boolean(target);

  useEffect(() => {
    if (open) {
      setReason(REPORT_REASONS[0]);
      setDetails("");
      setError(null);
    }
  }, [open, target?.taskId, target?.userId]);

  const submit = () => {
    if (!target) return;
    const result = store.submitReport({
      subject: target.subject,
      taskId: target.taskId,
      subjectUserId: target.userId,
      reason,
      details: details.trim() || undefined,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    ui.closeReport();
    setDetails("");
    toast("Report submitted. A demo moderator can review it in Profile → Demo controls.", "success");
  };

  return (
    <Modal
      open={open}
      onClose={ui.closeReport}
      title={target?.subject === "USER" ? "Report a person" : "Report a task"}
      description="Reports go to the demo moderation queue. Nothing is sent to a real trust and safety team."
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={ui.closeReport}>
            Cancel
          </Button>
          <Button variant="danger" onClick={submit} disabled={!reason}>
            <Flag className="size-4" aria-hidden />
            Submit report
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-line bg-surface p-3.5 text-[12px] leading-relaxed">
          {task ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Task</p>
              <p className="mt-0.5 font-medium text-ink">{task.title}</p>
            </>
          ) : reportedUser ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Person</p>
              <p className="mt-0.5 font-medium text-ink">{reportedUser.name}</p>
              <p className="text-[11px] text-muted">
                {reportedUser.handle} · {reportedUser.verified ? "Verified" : "Unverified"}
              </p>
            </>
          ) : null}
          <p className="mt-1 text-[10.5px] text-muted">Reported by {user.name} · just now</p>
        </div>

        <Field label="Reason" htmlFor="report-reason">
          <Select id="report-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {REPORT_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="What happened?"
          htmlFor="report-details"
          optional
          hint={`${details.length}/500`}
        >
          <Textarea
            id="report-details"
            value={details}
            maxLength={500}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Share only what's needed to review this."
            className="min-h-[90px]"
          />
        </Field>

        {error ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <p className="flex items-start gap-1.5 rounded-lg bg-muted-surface px-3 py-2 text-[10.5px] leading-relaxed text-muted">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Duplicate reports are blocked for 10 minutes. Reports are stored locally and reviewed by a
          moderator.
        </p>
      </div>
    </Modal>
  );
}
