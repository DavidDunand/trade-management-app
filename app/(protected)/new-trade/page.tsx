"use client";
export const dynamic = "force-dynamic";
import { useRouter } from "next/navigation";
import NewTradeForm from "../components/NewTradeForm";

export default function NewTradePage() {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">New Trade</h1>
          <div className="text-sm text-black/60">Add a new trade to Blotter</div>
        </div>
      </div>

      <NewTradeForm
        variant="page"
        mode="new"
        sourceTradeId={null}
        onCancel={() => router.push("/blotter")}
        onSaved={() => router.push("/blotter")}
      />
    </div>
  );
}