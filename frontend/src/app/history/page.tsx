"use client";

import Link from "next/link";

export default function HistoryPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-[#0d0b12] px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-[1.5rem] border border-white/8 bg-[#15111b] p-8">
        <h1 className="text-2xl font-bold text-white">History</h1>
        <p className="mt-2 text-stone-200/75">
          History requires the backend database to be connected. For now, use
          the home page to analyse songs.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-[#3242CA] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2b3ab2]"
        >
          Analyse a Song
        </Link>
      </div>
    </div>
  );
}
