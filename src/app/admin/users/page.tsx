import { UsersManager } from "@/components/admin/users-manager";

export const dynamic = "force-dynamic";

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">Users</h2>
      <UsersManager />
    </div>
  );
}
