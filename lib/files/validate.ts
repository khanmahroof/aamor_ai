import "server-only";
import sharp from "sharp";
import { AppError, envNumber } from "../http";
const types: Record<string, string[]> = {
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  md: ["text/markdown", "text/plain", ""],
};
export async function validateUpload(file: File) {
  if (
    !file.size ||
    file.size > envNumber("MAX_UPLOAD_SIZE_MB", 10, 1, 20) * 1024 * 1024
  )
    throw new AppError(413, "File is empty or exceeds the upload size limit.");
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  if (!types[extension]?.includes(file.type.toLowerCase()))
    throw new AppError(
      400,
      "File type and extension must match: PNG, JPG, WEBP, PDF, TXT or Markdown.",
    );
  const filename =
    file.name
      .replace(/[/\\\x00-\x1f\x7f]/g, "_")
      .replace(/[^\p{L}\p{N} ._-]/gu, "_")
      .slice(-120) || `file.${extension}`;
  let buffer = Buffer.from(await file.arrayBuffer());
  let mimeType = types[extension][0];
  let storedExtension = extension;
  if (mimeType.startsWith("image/")) {
    try {
      const image = sharp(buffer, {
        limitInputPixels: 25000000,
        animated: false,
      });
      const metadata = await image.metadata();
      if (metadata.format !== (extension === "jpg" ? "jpeg" : extension))
        throw new Error("Mismatch");
      buffer = await image
        .resize({
          width: 1280,
          height: 1280,
          fit: "inside",
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      mimeType = "image/png";
      storedExtension = "png";
    } catch {
      throw new AppError(400, "The image is invalid or too large to decode.");
    }
  } else if (extension === "pdf") {
    if (buffer.subarray(0, 5).toString() !== "%PDF-")
      throw new AppError(400, "The file is not a valid PDF.");
  } else {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (text.includes("\0")) throw new Error("binary");
    } catch {
      throw new AppError(400, "Text files must contain valid UTF-8 text.");
    }
  }
  return { filename, mimeType, buffer, extension: storedExtension };
}
