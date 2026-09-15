/**
 * Reads an AI SDK UI message stream response (SSE) the way `useChat` does:
 * the assembled answer text, plus any error chunks the route surfaced.
 */
export async function readUIMessageStream(
  response: Response,
): Promise<{ text: string; errors: string[] }> {
  const body = response.body ? await response.text() : "";
  let text = "";
  const errors: string[] = [];

  for (const line of body.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice("data:".length).trim();
    if (!payload || payload === "[DONE]") continue;
    const chunk = JSON.parse(payload) as { type?: string; delta?: string; errorText?: string };
    if (chunk.type === "text-delta") text += chunk.delta ?? "";
    else if (chunk.type === "error" && chunk.errorText) errors.push(chunk.errorText);
  }

  return { text, errors };
}
