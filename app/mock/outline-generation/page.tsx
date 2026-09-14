/* Throwaway fixture for iterating on the outline-generation screen by eye.
   It renders the re-imagined surface with sample props, so no auth, database
   or workflow run is involved. Delete this route before shipping.
   Open http://localhost:3000/mock/outline-generation */

import { AppShell } from "@/components/app-shell";
import { NowColumnMock } from "./now-column";
import { TOPIC } from "./fixture";

export default function MockOutlineGenerationPage() {
  return (
    <AppShell section={TOPIC}>
      <NowColumnMock />
    </AppShell>
  );
}
