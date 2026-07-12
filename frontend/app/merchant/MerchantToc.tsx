"use client";

import { useState, useEffect, type MouseEvent as ReactMouseEvent } from "react";

// Sticky scroll-spy table of contents for the merchant guide pages. Mirrors the
// ToC on the card/relic entity pages: it observes the `.card-rvmp section[id]`
// blocks and highlights the link for whichever section is currently in view.
export default function MerchantToc({ items }: { items: { id: string; label: string }[] }) {
  const [activeSection, setActiveSection] = useState<string>(items[0]?.id ?? "");

  // Scroll-spy: highlight the section currently in view.
  useEffect(() => {
    const secs = Array.from(
      document.querySelectorAll<HTMLElement>(".card-rvmp section[id]"),
    );
    if (secs.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActiveSection((e.target as HTMLElement).id);
        });
      },
      { rootMargin: "-130px 0px -70% 0px" },
    );
    secs.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const handleTocClick = (e: ReactMouseEvent, secId: string) => {
    e.preventDefault();
    const el = document.getElementById(secId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveSection(secId);
    }
  };

  return (
    <nav className="toc" aria-label="On this page">
      {items.map((it) => (
        <a
          key={it.id}
          href={`#${it.id}`}
          className={activeSection === it.id ? "on" : undefined}
          onClick={(e) => handleTocClick(e, it.id)}
        >
          {it.label}
        </a>
      ))}
    </nav>
  );
}
