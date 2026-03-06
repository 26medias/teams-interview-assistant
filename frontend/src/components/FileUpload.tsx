import { useState, useRef, useCallback, type DragEvent } from "react";

interface FileUploadProps {
    onFile: (file: File) => void;
    label: string;
    accept?: string;
}

export function FileUpload({ onFile, label, accept }: FileUploadProps) {
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(
        (file: File) => {
            setFileName(file.name);
            onFile(file);
        },
        [onFile],
    );

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        setDragging(true);
    }

    function handleDragLeave(e: DragEvent) {
        e.preventDefault();
        setDragging(false);
    }

    return (
        <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
                {label}
            </label>
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => inputRef.current?.click()}
                className={`flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors ${
                    dragging
                        ? "border-indigo-400 bg-indigo-50"
                        : "border-gray-300 bg-gray-50 hover:border-gray-400"
                }`}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                    }}
                />
                {fileName ? (
                    <span className="text-gray-700">{fileName}</span>
                ) : (
                    <span className="text-gray-500">
                        Drag and drop a file here, or click to browse
                    </span>
                )}
            </div>
        </div>
    );
}
