import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
const parser = new PDFParse({
  data: new Uint8Array(await readFile(process.argv[2])),
});
try {
  const result = await parser.getText({
    partial: Array.from({ length: 20 }, (_, index) => index + 1),
  });
  process.stdout.write(JSON.stringify({ text: result.text.slice(0, 100000) }));
} finally {
  await parser.destroy();
}
