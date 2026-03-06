import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { get, post, upload } from "../api/client.ts";
import { FileUpload } from "../components/FileUpload.tsx";
import { DocumentPicker } from "../components/DocumentPicker.tsx";
import type { Interview } from "../types.ts";

type DocMode = "upload" | "existing";

export function CreateInterviewPage() {
    const navigate = useNavigate();

    const [candidateName, setCandidateName] = useState("");
    const [meetingLink, setMeetingLink] = useState("");
    const [stageDetails, setStageDetails] = useState("");

    // Resume
    const [resumeMode, setResumeMode] = useState<DocMode>("upload");
    const [resumeFile, setResumeFile] = useState<File | null>(null);
    const [resumeDocId, setResumeDocId] = useState<string | null>(null);

    // Job description
    const [jdMode, setJdMode] = useState<DocMode>("upload");
    const [jdFile, setJdFile] = useState<File | null>(null);
    const [jdDocId, setJdDocId] = useState<string | null>(null);

    // Hiring criteria
    const [hcMode, setHcMode] = useState<DocMode>("upload");
    const [hcFile, setHcFile] = useState<File | null>(null);
    const [hcDocId, setHcDocId] = useState<string | null>(null);

    const [pastStageDetails, setPastStageDetails] = useState<string[]>([]);

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        get<string[]>("/api/interviews/meta/stage-details")
            .then(setPastStageDetails)
            .catch(() => {});
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            // 1. Create the interview
            const interview = await post<Interview>("/api/interviews", {
                candidate_name: candidateName,
                meeting_link: meetingLink || null,
                stage_details: stageDetails || null,
            });

            // 2. Upload / attach documents
            const docOps: Promise<unknown>[] = [];

            if (resumeMode === "upload" && resumeFile) {
                const fd = new FormData();
                fd.append("file", resumeFile);
                fd.append("type", "resume");
                docOps.push(upload(`/api/interviews/${interview.id}/documents`, fd));
            } else if (resumeMode === "existing" && resumeDocId) {
                docOps.push(
                    post(`/api/interviews/${interview.id}/documents/attach`, {
                        document_id: resumeDocId,
                    }),
                );
            }

            if (jdMode === "upload" && jdFile) {
                const fd = new FormData();
                fd.append("file", jdFile);
                fd.append("type", "job_description");
                docOps.push(upload(`/api/interviews/${interview.id}/documents`, fd));
            } else if (jdMode === "existing" && jdDocId) {
                docOps.push(
                    post(`/api/interviews/${interview.id}/documents/attach`, {
                        document_id: jdDocId,
                    }),
                );
            }

            if (hcMode === "upload" && hcFile) {
                const fd = new FormData();
                fd.append("file", hcFile);
                fd.append("type", "hiring_criteria");
                docOps.push(upload(`/api/interviews/${interview.id}/documents`, fd));
            } else if (hcMode === "existing" && hcDocId) {
                docOps.push(
                    post(`/api/interviews/${interview.id}/documents/attach`, {
                        document_id: hcDocId,
                    }),
                );
            }

            await Promise.all(docOps);

            // 3. Navigate immediately — questions generate in background on the profile page
            navigate(`/interviews/${interview.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to create interview");
        } finally {
            setSubmitting(false);
        }
    }

    function renderDocSection(
        label: string,
        type: "resume" | "job_description" | "hiring_criteria",
        mode: DocMode,
        setMode: (m: DocMode) => void,
        onFile: (f: File) => void,
        onDocId: (id: string) => void,
        accept: string,
    ) {
        return (
            <div>
                <div className="mb-2 flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    <div className="flex rounded-md border border-gray-300 text-xs">
                        <button
                            type="button"
                            onClick={() => setMode("upload")}
                            className={`px-3 py-1 ${
                                mode === "upload"
                                    ? "bg-indigo-600 text-white"
                                    : "text-gray-600 hover:bg-gray-50"
                            } rounded-l-md`}
                        >
                            Upload
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("existing")}
                            className={`px-3 py-1 ${
                                mode === "existing"
                                    ? "bg-indigo-600 text-white"
                                    : "text-gray-600 hover:bg-gray-50"
                            } rounded-r-md`}
                        >
                            Existing
                        </button>
                    </div>
                </div>
                {mode === "upload" ? (
                    <FileUpload onFile={onFile} label="" accept={accept} />
                ) : (
                    <DocumentPicker type={type} onSelect={onDocId} />
                )}
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-2xl">
            <h2 className="mb-6 text-xl font-bold text-gray-900">New Interview</h2>

            <form onSubmit={handleSubmit} className="space-y-5 rounded-lg bg-white p-6 shadow-sm">
                {error && (
                    <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
                )}

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        Candidate Name
                    </label>
                    <input
                        type="text"
                        required
                        value={candidateName}
                        onChange={(e) => setCandidateName(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Jane Doe"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        Teams Meeting Link
                    </label>
                    <input
                        type="text"
                        required
                        value={meetingLink}
                        onChange={(e) => setMeetingLink(e.target.value)}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        placeholder="https://teams.microsoft.com/l/meetup-join/..."
                    />
                </div>

                {renderDocSection(
                    "Resume",
                    "resume",
                    resumeMode,
                    setResumeMode,
                    setResumeFile,
                    setResumeDocId,
                    ".pdf,.doc,.docx",
                )}

                {renderDocSection(
                    "Job Description",
                    "job_description",
                    jdMode,
                    setJdMode,
                    setJdFile,
                    setJdDocId,
                    ".pdf,.doc,.docx,.txt",
                )}

                {renderDocSection(
                    "Hiring Criteria",
                    "hiring_criteria",
                    hcMode,
                    setHcMode,
                    setHcFile,
                    setHcDocId,
                    ".pdf,.doc,.docx,.txt",
                )}

                <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                        Stage Details
                    </label>
                    {pastStageDetails.length > 0 && (
                        <select
                            value=""
                            onChange={(e) => {
                                if (e.target.value) {
                                    setStageDetails(e.target.value);
                                }
                            }}
                            className="mb-2 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        >
                            <option value="">Select from past interviews...</option>
                            {pastStageDetails.map((detail) => (
                                <option key={detail} value={detail}>
                                    {detail}
                                </option>
                            ))}
                        </select>
                    )}
                    <textarea
                        value={stageDetails}
                        onChange={(e) => setStageDetails(e.target.value)}
                        rows={3}
                        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                        placeholder="Technical deep dive -- validate AI/ML experience"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => navigate("/")}
                        className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {submitting ? "Creating..." : "Create Interview"}
                    </button>
                </div>
            </form>
        </div>
    );
}
