import { useEffect, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { getArbeitsplan } from "@/lib/api/events";
import type { Arbeitsplan } from "@/lib/types/event";
import { ArbeitsplanTable } from "./ArbeitsplanTable";

/** Laedt den Arbeitsplan eines Anlasses und zeichnet ihn als Tabelle. */
export function ArbeitsplanView({ eventId }: { eventId: string }) {
  const [plan, setPlan] = useState<Arbeitsplan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getArbeitsplan(eventId)
      .then((p) => {
        if (!cancelled) setPlan(p);
      })
      .catch((e) => {
        if (!cancelled)
          setError(
            e instanceof Error ? e.message : "Fehler beim Laden des Arbeitsplans"
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-md text-sm bg-destructive/10 text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error || "Arbeitsplan nicht gefunden"}
      </div>
    );
  }

  return <ArbeitsplanTable plan={plan} />;
}
