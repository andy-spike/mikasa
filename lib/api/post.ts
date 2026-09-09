// POSTs JSON and streams text chunks to onDelta. True only on a clean finish.
export async function postStream(
  url: string,
  body: unknown,
  onDelta: (chunk: string) => void,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok || !response.body) return false;
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return true;
      if (value) onDelta(value);
    }
  } catch {
    return false;
  }
}
