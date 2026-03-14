"use client";

import Link from "next/link";

export default function HistoryPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="mt-2 text-blue-100/75">
          History requires the backend database to be connected. For now, use
          the home page to analyze songs.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-md bg-[#3242CA] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2b3ab2]"
        >
          Analyze a Song
        </Link>
      </div>
    </div>
  );
}
