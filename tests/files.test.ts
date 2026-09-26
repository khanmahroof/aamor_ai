import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { validateUpload } from "../lib/files/validate";
import { storagePath } from "../lib/files/storage";
test("uploads reject forged extensions, MIME, invalid images and binary text", async () => {
  await assert.rejects(
    validateUpload(
      new File(["<svg/>"], "image.svg", { type: "image/svg+xml" }),
    ),
  );
  await assert.rejects(
    validateUpload(new File(["fake"], "a.png", { type: "image/png" })),
  );
  await assert.rejects(
    validateUpload(new File(["\0binary"], "a.txt", { type: "text/plain" })),
  );
  await assert.rejects(
    validateUpload(new File(["pdf"], "a.pdf", { type: "application/pdf" })),
  );
  assert.throws(() => storagePath("../../secret.env"));
});
test("real images are decoded and normalized; filenames cannot traverse paths", async () => {
  const png = await sharp({
    create: { width: 20, height: 20, channels: 3, background: "#ffffff" },
  })
    .png()
    .toBuffer();
  const data = await validateUpload(
    new File([new Uint8Array(png)], "../../test.png", { type: "image/png" }),
  );
  assert.equal(data.mimeType, "image/png");
  assert.equal(data.filename.includes("/"), false);
  assert.equal((await sharp(data.buffer).metadata()).width, 20);
});
