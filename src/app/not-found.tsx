import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";
import { DoroLogo } from "@/components/brand";

import { DEMO_MODE } from "@/lib/demo-mode";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-6 text-center">
      <Link href="/" aria-label="Doro home">
        <DoroLogo size={34} />
      </Link>
      <p className="mt-8 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
        404 · Page not found
      </p>
      <h1 className="mt-2 max-w-md text-[32px] font-semibold leading-tight tracking-[-0.035em] text-ink">
        This one isn't on the map.
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
        The page may have moved, or the link might be from an older demo build. Discover and My
        activity are still right where you left them.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link
          href="/discover"
          className="inline-flex h-11 items-center gap-2 rounded-full bg-lime px-5 text-sm font-semibold text-ink hover:bg-lime-deep"
        >
          <Compass className="size-4" aria-hidden />
          Go to Discover
        </Link>
        <Link
          href="/"
          className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink hover:bg-muted-surface"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to landing
        </Link>
      </div>
      {DEMO_MODE ? (
        <p className="mt-8 text-[10px] text-muted">No real payments or accounts.</p>
      ) : null}
    </main>
  );
}
