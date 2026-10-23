import useSWR from "swr";
import { Loader2 } from "lucide-react";
import { CreatorShell } from "@/components/creator/creator-shell";
import { CreatorConversions } from "@/components/creator/creator-conversions";
import { apiGet } from "@/lib/api/client";
import type { CreatorConversionReport } from "@/lib/creator/conversion-report";

export default function ConversionsPage() {
  return (
    <CreatorShell>
      <ConversionsContent />
    </CreatorShell>
  );
}
function ConversionsContent() {
  const { data, error, isLoading, mutate } = useSWR<CreatorConversionReport>(
    "/api/creator/conversions",
    apiGet,
  );
  if (isLoading)
    return (
      <Loader2
        className="mx-auto my-16 animate-spin"
        aria-label="Loading conversions"
      />
    );
  if (error || !data)
    return (
      <p role="alert">
        Could not load conversions.{" "}
        <button
          type="button"
          onClick={() => void mutate()}
          className="underline underline-offset-4"
        >
          Try again
        </button>
      </p>
    );
  return <CreatorConversions report={data} />;
}
