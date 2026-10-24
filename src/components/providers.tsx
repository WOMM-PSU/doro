"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { DemoState, User } from "@/types";
import { DemoStore } from "@/features/store";
import { loadState } from "@/lib/persistence";
import { activeUser } from "@/features/selectors";
import { DoroLogo } from "@/components/brand";
import {
  ToastContext,
  ToastViewport,
  type ToastItem,
  type ToastTone,
} from "@/components/ui";

interface DemoContextValue {
  store: DemoStore;
  state: DemoState;
  user: User;
}

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const value = useContext(DemoContext);
  if (!value) throw new Error("useDemo must be used inside DemoProvider");
  return value;
}

interface UiContextValue {
  selectedTaskId: string | null;
  openTask: (taskId: string) => void;
  closeTask: () => void;
  composeOpen: boolean;
  openCompose: () => void;
  closeCompose: () => void;
  reportTarget: { taskId?: string; userId?: string; subject: "TASK" | "USER" } | null;
  openReport: (target: { taskId?: string; userId?: string; subject: "TASK" | "USER" }) => void;
  closeReport: () => void;
  acceptTaskId: string | null;
  openAccept: (taskId: string) => void;
  closeAccept: () => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function useUi(): UiContextValue {
  const value = useContext(UiContext);
  if (!value) throw new Error("useUi must be used inside UiProvider");
  return value;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <DoroLogo size={38} />
      <p className="text-sm text-muted">A little help, for a fair price.</p>
    </div>
  );
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<DemoStore | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const loaded = loadState();
    setStore(new DemoStore(loaded.state));
    if (loaded.notice) setNotice(loaded.notice);
  }, []);

  if (!store) return <LoadingScreen />;
  return (
    <HydratedDemoProvider store={store} notice={notice} clearNotice={() => setNotice(null)}>
      {children}
    </HydratedDemoProvider>
  );
}

function HydratedDemoProvider({
  store,
  notice,
  clearNotice,
  children,
}: {
  store: DemoStore;
  notice: string | null;
  clearNotice: () => void;
  children: ReactNode;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const user = activeUser(state);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, tone: ToastTone = "default") => {
    const id =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current.slice(-2), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4600);
  }, []);

  useEffect(() => {
    if (notice) {
      toast(notice, "default");
      clearNotice();
    }
  }, [notice, toast, clearNotice]);

  const value = useMemo<DemoContextValue>(
    () => ({ store, state, user }),
    [store, state, user],
  );

  return (
    <DemoContext.Provider value={value}>
      <ToastContext.Provider value={{ toast }}>
        <UiProvider>{children}</UiProvider>
        <ToastViewport toasts={toasts} />
      </ToastContext.Provider>
    </DemoContext.Provider>
  );
}

function UiProvider({ children }: { children: ReactNode }) {
  const { state } = useDemo();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<UiContextValue["reportTarget"]>(null);
  const [acceptTaskId, setAcceptTaskId] = useState<string | null>(null);

  // Persona switches must never leave a dialog open with permissions from the
  // previous identity.
  useEffect(() => {
    setSelectedTaskId(null);
    setComposeOpen(false);
    setReportTarget(null);
    setAcceptTaskId(null);
  }, [state.activeUserId]);

  const openTask = useCallback((taskId: string) => setSelectedTaskId(taskId), []);
  const closeTask = useCallback(() => setSelectedTaskId(null), []);
  const openCompose = useCallback(() => setComposeOpen(true), []);
  const closeCompose = useCallback(() => setComposeOpen(false), []);
  const openReport = useCallback((target: NonNullable<UiContextValue["reportTarget"]>) => {
    setReportTarget(target);
  }, []);
  const closeReport = useCallback(() => setReportTarget(null), []);
  const openAccept = useCallback((taskId: string) => setAcceptTaskId(taskId), []);
  const closeAccept = useCallback(() => setAcceptTaskId(null), []);

  const value = useMemo<UiContextValue>(
    () => ({
      selectedTaskId,
      openTask,
      closeTask,
      composeOpen,
      openCompose,
      closeCompose,
      reportTarget,
      openReport,
      closeReport,
      acceptTaskId,
      openAccept,
      closeAccept,
    }),
    [
      selectedTaskId,
      openTask,
      closeTask,
      composeOpen,
      openCompose,
      closeCompose,
      reportTarget,
      openReport,
      closeReport,
      acceptTaskId,
      openAccept,
      closeAccept,
    ],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}
