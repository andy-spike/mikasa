import "server-only";

export function jsonError(status: number, error: string) {
  return Response.json({ error }, { status });
}

type TextPart = { type: "text"; text: string };

export function collectStreamText(event: {
  content: { type: string; text?: string }[];
  text: string;
}): string {
  return (
    event.content
      .filter((part): part is TextPart => part.type === "text")
      .map((part) => part.text)
      .join("") || event.text
  );
}

export function textStreamResponse(stream: ReadableStream<string>) {
  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
