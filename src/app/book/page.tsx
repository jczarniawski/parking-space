import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { QuickBookWizard } from "@/components/quick-book-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Quick booking" };

export default async function BookPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="mx-auto w-full max-w-md">
      <QuickBookWizard />
    </div>
  );
}
