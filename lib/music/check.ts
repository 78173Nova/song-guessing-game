// Checks whether a stored clip address still works, by asking Apple's audio server for the first 2 bytes.
// Used by the seed (decision 006): only a clear "not found" from Apple counts as broken – if our own
// connection fails, the result is "unknown" and the address is kept.
export type PreviewCheck = "ok" | "broken" | "unknown";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

const BROKEN_STATUSES = [403, 404, 410];

export async function checkPreviewUrl(
  url: string,
  options: { fetchFn?: FetchFn; timeoutMs?: number } = {},
): Promise<PreviewCheck> {
  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(url, {
      headers: { Range: "bytes=0-1" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
    await response.body?.cancel(); // we only need the status, not the audio
    if (response.ok) return "ok";
    if (BROKEN_STATUSES.includes(response.status)) return "broken";
    return "unknown";
  } catch {
    return "unknown";
  }
}
