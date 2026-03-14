"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/history", label: "History" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-blue-900/60 bg-[#3242CA]">
      <div className="mx-auto flex h-17 max-w-7xl items-center justify-between px-4">
        <Link
          href="/"
          className="relative z-10 inline-flex items-center"
          aria-label="Karachordy home"
        >
          <Image
            src="/karachordy_colour.png"
            alt="Karachordy"
            width={300}
            height={60}
            priority
            className="h-[3.75rem] w-auto drop-shadow-[0_6px_18px_rgba(14,18,45,0.28)]"
          />
        </Link>

        <div className="relative z-10 flex items-center gap-1 rounded-full border border-white/12 bg-white/10 p-1.5 backdrop-blur">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-white/22 text-white"
                    : "text-blue-50/82 hover:bg-white/10 hover:text-white"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
