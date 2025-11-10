import React, { useMemo } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, className }: RichTextEditorProps) {
  const modules = useMemo(
    () => ({
      toolbar: [
        [{ font: [] }],
        [{ size: ["small", false, "large", "huge"] }],
        ["bold", "italic", "underline"],
        [{ align: [] }],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ indent: "-1" }, { indent: "+1" }],
        [{ color: [] }, { background: [] }],
        ["clean"],
      ],
    }),
    []
  );

  const formats = [
    "font",
    "size",
    "bold",
    "italic",
    "underline",
    "align",
    "list",
    "bullet",
    "indent",
    "color",
    "background",
  ];

  return (
    <div className={cn("rich-text-editor", className)}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        className="bg-background"
      />
    </div>
  );
}
