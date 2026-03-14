"use client";

import Link from "next/link";

export default function HistoryPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-zinc-950 px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="mt-2 text-zinc-400">
          History requires the backend database to be connected. For now, use
          the home page to analyze songs.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500"
        >
          Analyze a Song
        </Link>
      </div>
    </div>
  );
}
