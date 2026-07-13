"use client";

import { useEffect } from "react";
import { Button, Card } from "@/components/ui";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-900">
          Something went wrong
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          An unexpected error occurred. You can try again, or come back later.
        </p>
        {error.digest ? (
          <p className="mt-2 text-xs text-slate-400">Error ID: {error.digest}</p>
        ) : null}
        <Button onClick={reset} className="mt-6 w-full">
          Try again
        </Button>
      </Card>
    </div>
  );
}
