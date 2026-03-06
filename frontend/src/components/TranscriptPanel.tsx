import { useEffect, useRef } from "react";
import type { TranscriptSegment } from "../types.ts";

interface TranscriptPanelProps {
    segments: TranscriptSegment[];
}

export function TranscriptPanel({ segments }: TranscriptPanelProps) {
    const bottomRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new segments arrive
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [segments.length]);

    if (segments.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
                Waiting for transcript...
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
            <div className="space-y-3 p-4">
                {segments.map((seg) => (
                    <div key={seg.id}>
                        <div className="flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-gray-900">
                                {seg.speaker}
                            </span>
                            <span className="text-xs text-gray-400">
                                {new Date(seg.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-700">{seg.text}</p>
                    </div>
                ))}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
