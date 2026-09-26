/** Incremental UTF-8 line reader handles boundaries across network chunks. */
export async function* lines(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      if (buffer.length > 2 * 1024 * 1024)
        throw new Error("Provider frame is too large.");
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        yield buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
      }
      if (done) {
        if (buffer) yield buffer;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
export async function* sseData(body: ReadableStream<Uint8Array>) {
  let data: string[] = [];
  let size = 0;
  for await (const line of lines(body)) {
    if (!line) {
      if (data.length) yield data.join("\n");
      data = [];
      size = 0;
    } else if (line.startsWith("data:")) {
      size += line.length;
      if (size > 2 * 1024 * 1024) throw new Error("Stream event is too large.");
      data.push(line.slice(5).trimStart());
    }
  }
  if (data.length) yield data.join("\n");
}
