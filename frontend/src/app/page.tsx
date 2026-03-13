"use client";

import { FormEvent, useState } from "react";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const prettyJson = (value: unknown) => JSON.stringify(value, null, 2);

const tryParseJson = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }

  return JSON.parse(value);
};

export default function Home() {
  const [endpoint, setEndpoint] = useState("/health");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [body, setBody] = useState("{\n  \"url\": \"https://www.youtube.com/watch?v=dQw4w9WgXcQ\"\n}");
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [responseText, setResponseText] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");

  const canHaveBody = method !== "GET";

  const runRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorText("");

    const startedAt = performance.now();

    try {
      const requestBody = canHaveBody ? tryParseJson(body) : undefined;
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint,
          method,
          body: requestBody,
        }),
      });

      const raw = await response.text();
      setStatus(response.status);
      setDurationMs(Math.round(performance.now() - startedAt));

      try {
        setResponseText(prettyJson(JSON.parse(raw)));
      } catch {
        setResponseText(raw || "<empty response>");
      }
    } catch (error) {
      setStatus(null);
      setDurationMs(Math.round(performance.now() - startedAt));
      setResponseText("");
      setErrorText(
        error instanceof Error ? error.message : "Unexpected error while calling API.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#f4e6cc_0%,#f9f6ee_42%,#d9e8f5_100%)] px-4 py-10 text-stone-900 md:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <section className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur-sm md:p-8">
          <p className="text-sm uppercase tracking-[0.18em] text-stone-500">Karachordy</p>
          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">ChordMini VPS API Console</h1>
          <p className="mt-3 text-sm text-stone-700 md:text-base">
            Quick frontend for your self-hosted API at
            <span className="ml-1 rounded bg-stone-900 px-2 py-0.5 font-mono text-xs text-amber-200 md:text-sm">
              http://134.199.153.5:5001
            </span>
          </p>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-white p-6 shadow-lg md:p-8">
          <form className="space-y-4" onSubmit={runRequest}>
            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <label className="text-sm font-medium text-stone-700" htmlFor="method">
                Method
              </label>
              <select
                id="method"
                value={method}
                onChange={(event) => setMethod(event.target.value as HttpMethod)}
                className="h-12 rounded-xl border border-stone-300 px-3 outline-none focus:border-stone-600"
              >
                {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 md:grid-cols-[180px_1fr]">
              <label className="pt-3 text-sm font-medium text-stone-700" htmlFor="endpoint">
                Endpoint
              </label>
              <input
                id="endpoint"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="/health"
                className="h-12 rounded-xl border border-stone-300 px-3 font-mono text-sm outline-none focus:border-stone-600"
                required
              />
            </div>

            {canHaveBody ? (
              <div className="grid gap-4 md:grid-cols-[180px_1fr]">
                <label className="pt-3 text-sm font-medium text-stone-700" htmlFor="body">
                  JSON Body
                </label>
                <textarea
                  id="body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  className="min-h-44 rounded-xl border border-stone-300 p-3 font-mono text-sm outline-none focus:border-stone-600"
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={isLoading}
                className="h-12 min-w-32 rounded-xl bg-stone-900 px-4 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {isLoading ? "Sending..." : "Send Request"}
              </button>
              <span className="text-sm text-stone-600">
                Uses server-side proxy to bypass browser CORS/mixed-content issues.
              </span>
            </div>
          </form>
        </section>

        <section className="mt-6 rounded-3xl border border-stone-200 bg-stone-950 p-6 text-stone-100 shadow-lg md:p-8">
          <div className="flex flex-wrap gap-3 text-xs md:text-sm">
            <span className="rounded bg-stone-800 px-2 py-1">
              Status: {status === null ? "-" : status}
            </span>
            <span className="rounded bg-stone-800 px-2 py-1">
              Duration: {durationMs === null ? "-" : `${durationMs} ms`}
            </span>
          </div>

          {errorText ? <p className="mt-4 text-sm text-red-300">{errorText}</p> : null}

          <pre className="mt-4 overflow-auto rounded-xl bg-black/35 p-4 text-xs leading-relaxed md:text-sm">
            {responseText || "No response yet. Run a request to inspect output."}
          </pre>
        </section>
      </div>
    </main>
  );
}
