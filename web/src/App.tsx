import { useEffect, useRef, useState } from "react";
import { Topbar, type AppStatus } from "./components/Topbar.js";
import { UploadZone } from "./components/UploadZone.js";
import { ProgressStepper } from "./components/ProgressStepper.js";
import { ResultsScreen } from "./components/ResultsScreen.js";
import { LoginScreen } from "./components/LoginScreen.js";
import { uploadVideo, fetchJob, fetchSession } from "./lib/api.js";
import type { Job } from "./lib/types.js";

const POLL_INTERVAL_MS = 1500;

function statusFor(job: Job | null): AppStatus {
  if (!job) return "IDLE";
  if (job.status === "failed") return "ERROR";
  if (job.status === "done") return "READY";
  return "ANALYZING";
}

export default function App() {
  const [job, setJob] = useState<Job | null>(null);
  const [uploadError, setUploadError] = useState<string | undefined>();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Null means "not yet known" — rendering the login screen before the
    // check resolves would flash a password prompt at an authenticated user.
    fetchSession()
      .then((s) => setAuthed(!s.required || s.authenticated))
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSelect = async (file: File) => {
    setUploadError(undefined);
    try {
      const { jobId } = await uploadVideo(file);
      const initial = await fetchJob(jobId);
      setJob(initial);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await fetchJob(jobId);
          setJob(updated);
          if (updated.status === "done" || updated.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    }
  };

  if (authed === null) {
    return <div className="min-h-screen bg-bg" />;
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-bg">
        <Topbar status="IDLE" />
        <LoginScreen onAuthenticated={() => setAuthed(true)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      <Topbar status={statusFor(job)} jobId={job?.id} />
      {!job && <UploadZone onSelect={handleSelect} error={uploadError} />}
      {job && job.status !== "done" && <ProgressStepper job={job} />}
      {job && job.status === "done" && job.spec && <ResultsScreen job={job} />}
    </div>
  );
}
