import Link from "next/link";
import { Card } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md items-center justify-center">
      <Card className="w-full rounded-2xl p-8 text-center shadow-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" className="mx-auto h-12 w-12" />
        <p className="mt-4 text-5xl font-bold text-brand-900">404</p>
        <h1 className="mt-3 text-lg font-semibold text-slate-900">
          {t("errpg.notFoundTitle")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">{t("errpg.notFoundHint")}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-accent-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-700"
        >
          {t("errpg.backToStart")}
        </Link>
      </Card>
    </div>
  );
}
