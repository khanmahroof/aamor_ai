"use client";
import Image from "next/image";
import { FileText, Paperclip, X } from "lucide-react";
import { useRef } from "react";
import type { AttachmentView } from "@/lib/ui-types";
export function AttachmentList({
  files,
  onRemove,
}: {
  files: AttachmentView[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment" key={file.id}>
          <a
            href={`/api/files/${file.id}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {file.mimeType.startsWith("image/") ? (
              <Image
                unoptimized
                src={`/api/files/${file.id}`}
                alt={file.filename}
                width={42}
                height={42}
              />
            ) : (
              <FileText size={22} />
            )}
            <span>
              {file.filename}
              <small>
                {(file.size / 1024).toFixed(0)} KB
                {file.mimeType === "application/pdf" ? " · First 20 pages" : ""}
              </small>
            </span>
          </a>
          {onRemove && (
            <button
              type="button"
              aria-label={`Remove ${file.filename}`}
              onClick={() => onRemove(file.id)}
            >
              <X size={13} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function AttachButton({
  onUpload,
  disabled,
}: {
  onUpload: (file: File) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        hidden
        accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.md"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        className="icon-button"
        aria-label="Attach a file"
        disabled={disabled}
        onClick={() => ref.current?.click()}
      >
        <Paperclip size={18} />
      </button>
    </>
  );
}
