import { AuditList } from "@/components/admin/audit-list";

export const dynamic = "force-dynamic";

export default function AdminAuditPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Audit log</h2>
      <AuditList />
    </div>
  );
}
