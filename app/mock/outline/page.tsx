/* Throwaway fixture for iterating on the outline-review screen by eye.
   It renders the re-imagined surface with sample data, so no auth, database
   or workflow run is involved. Delete this route before shipping.
   Open http://localhost:3000/mock/outline */

import { AppShell } from "@/components/app-shell";
import { LedgerMock } from "./ledger";
import { TOPIC } from "./fixture";

export default function MockOutlinePage() {
  return (
    <AppShell section={TOPIC}>
      <LedgerMock />
    </AppShell>
  );
}
