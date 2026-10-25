"use client";

import { useEffect, useState } from "react";
import { formatDeadline } from "@/lib/time";

/**
 * A deadline formatted in the viewer's time zone. Server-rendered pages would
 * otherwise print the server's clock time.
 */
export function LocalDeadline({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => setLabel(formatDeadline(iso)), [iso]);
  return <span>{label ?? " "}</span>;
}
