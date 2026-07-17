import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import LogoutButton from "./LogoutButton";
import LlmToggle from "./LlmToggle";
import NavClock from "./NavClock";

/**
 * Top navigation. Server component so it can read the session directly. It
 * renders nothing when there is no user (e.g. on the login page), keeping the
 * login screen chrome-free.
 */
export default async function Nav() {
  const user = await getCurrentUser();
  if (!user) return null;

  const links = [
    { href: "/", label: "Home" },
    { href: "/invoices", label: "Invoices" },
    { href: "/invoices/new", label: "New Invoice" },
    { href: "/prompts", label: "Prompts" },
  ];

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-8">
          <div className="flex flex-col">
            <Link href="/" className="text-lg font-bold tracking-tight text-slate-900">
              Triage <span className="text-emerald-600">Overview</span>
            </Link>
            <NavClock />
          </div>
          <nav className="flex gap-5 text-sm font-medium text-slate-600">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-slate-900">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {user.email} · <span className="capitalize">{user.role}</span>
          </span>
          <LlmToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
