import { SetupWizard } from "@/components/admin/setup-wizard";

export const dynamic = "force-dynamic";

export default function AdminSetupPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Parking setup</h2>
        <p className="mt-1 text-sm text-slate-500">
          Add your office parking spots, then optionally assign reserved spots
          to management members. You can come back here any time to add more.
        </p>
      </div>
      <SetupWizard />
    </div>
  );
}
