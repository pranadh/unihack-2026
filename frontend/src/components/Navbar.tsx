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
    <nav className="border-b border-[#2A3AB8] bg-[#3242CA]">
      <div className="mx-auto flex h-[72px] w-full max-w-[1440px] items-center justify-between px-6 lg:px-[120px]">
        <Link
          href="/"
          className="inline-flex items-center"
          aria-label="Karachordy home"
        >
          <Image
            src="/karachordy_colour.png"
            alt="Karachordy"
            width={300}
            height={60}
            priority
            className="h-12 w-auto md:h-14"
          />
        </Link>

        <div className="flex items-center gap-3">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[8px] px-4 py-2 text-[15px] font-bold leading-none transition-colors ${
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
