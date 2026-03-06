import { useState, useEffect } from "react";
import { get } from "../api/client.ts";
import type { Document } from "../types.ts";

interface DocumentPickerProps {
    type: "resume" | "job_description" | "hiring_criteria";
    onSelect: (documentId: string) => void;
}

export function DocumentPicker({ type, onSelect }: DocumentPickerProps) {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState("");

    useEffect(() => {
        get<Document[]>(`/api/documents?type=${type}`)
            .then(setDocuments)
            .catch(() => setDocuments([]))
            .finally(() => setLoading(false));
    }, [type]);

    function handleChange(value: string) {
        setSelected(value);
        if (value) {
            onSelect(value);
        }
    }

    if (loading) {
        return <p className="text-sm text-gray-400">Loading documents...</p>;
    }

    if (documents.length === 0) {
        return <p className="text-sm text-gray-400">No existing documents found</p>;
    }

    return (
        <select
            value={selected}
            onChange={(e) => handleChange(e.target.value)}
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
        >
            <option value="">Select an existing document...</option>
            {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                    {doc.filename} ({new Date(doc.created_at).toLocaleDateString()})
                </option>
            ))}
        </select>
    );
}
