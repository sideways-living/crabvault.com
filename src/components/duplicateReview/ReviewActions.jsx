import { Loader2, CheckCircle2, Copy, X, GitMerge, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPTS = {
  exact_duplicate: "This appears to be an exact duplicate. What would you like to do?",
  renamed_duplicate: "Same file content, different filenames. Which do you want to keep?",
  possible_version: "This looks like a newer version of an existing document. How should it be treated?",
};

export default function ReviewActions({ review, isResolving, onResolve }) {
  const { review_type } = review;
  const busy = isResolving;

  const Btn = ({ decision, variant = "outline", children, icon: Icon }) => (
    <Button
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={() => onResolve(review, decision)}
      className="gap-1.5"
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : Icon ? <Icon className="h-3 w-3" /> : null}
      {children}
    </Button>
  );

  return (
    <div className="mt-4 pt-4 border-t space-y-3">
      <p className="text-xs text-muted-foreground font-medium">
        {PROMPTS[review_type] || "How should this be handled?"}
      </p>

      <div className="flex flex-wrap gap-2">
        {review_type === "exact_duplicate" && (
          <>
            <Btn decision="keep_existing" icon={CheckCircle2}>Confirm duplicate — keep existing</Btn>
            <Btn decision="keep_new">Keep new instead</Btn>
            <Btn decision="dismiss" variant="ghost" icon={X}>Dismiss match</Btn>
          </>
        )}

        {review_type === "renamed_duplicate" && (
          <>
            <Btn decision="keep_existing" icon={FileText}>Keep existing filename</Btn>
            <Btn decision="keep_new">Keep new filename</Btn>
            <Btn decision="keep_both" icon={Copy}>Keep both files</Btn>
            <Btn decision="dismiss" variant="ghost" icon={X}>Dismiss match</Btn>
          </>
        )}

        {review_type === "possible_version" && (
          <>
            <Btn decision="merge_as_version" variant="default" icon={GitMerge}>Confirm as new version</Btn>
            <Btn decision="keep_both" icon={Copy}>Keep as separate document</Btn>
            <Btn decision="dismiss" variant="ghost" icon={X}>Dismiss match</Btn>
          </>
        )}
      </div>
    </div>
  );
}