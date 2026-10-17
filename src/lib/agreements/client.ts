// Browser helper: ask the server to create and send the building-rules
// agreement for a new lease. Never throws — a failed send shows up on the
// unit page (with a Resend button) rather than blocking registration.
export async function requestAgreementForLease(leaseId: string): Promise<void> {
  try {
    const res = await fetch("/api/agreements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lease_id: leaseId }),
    });
    if (!res.ok) console.error("[agreements] send failed", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[agreements] send failed", err);
  }
}
