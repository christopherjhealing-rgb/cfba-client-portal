import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { DEMO_MODE } from "@/lib/env";
import { StaffLogin } from "@/components/StaffLogin";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isStaff()) redirect("/admin");
  return (
    <>
      <main className="mx-auto max-w-md px-5 py-14">
        <p className="eyebrow">CFBA staff</p>
        <h1 className="mb-5 mt-1 font-display text-[26px] font-semibold">Office sign-in</h1>
        <StaffLogin demo={DEMO_MODE} />
      </main>
    </>
  );
}
