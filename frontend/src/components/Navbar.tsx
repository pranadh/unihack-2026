"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/history", label: "History" },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#2A3AB8] bg-[#3242CA]">
      <div className="mx-auto flex h-[58px] w-full max-w-[1440px] items-center justify-between px-6 lg:px-[120px]">
        <Link
          href="/"
          className="inline-flex items-center text-[32px] font-bold leading-none tracking-tight text-[#F4F7FF]"
          aria-label="Karachordy home"
        >
          Karachordy
        </Link>

        <div className="flex items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[6px] px-3 py-[5px] text-[13px] font-bold leading-none transition-colors ${
                  isActive
                    ? "bg-[#1A2140] text-[#F4F7FF]"
                    : "bg-[#1A2140] text-[#D8E0FF] hover:text-[#F4F7FF]"
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
