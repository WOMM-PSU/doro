import { DemoProvider } from "@/components/providers";
import { AppShell } from "@/components/app-shell";

export default function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  );
}
