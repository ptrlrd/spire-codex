"use client";

import { useState } from "react";
import Link from "next/link";
import { useLangPrefix } from "@/lib/use-lang-prefix";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const categories = [
  { label: "General", value: "general" },
  { label: "Character", value: "character" },
  { label: "Strategy", value: "strategy" },
  { label: "Mechanic", value: "mechanic" },
  { label: "Boss", value: "boss" },
  { label: "Event", value: "event" },
  { label: "Advanced", value: "advanced" },
];

const difficulties = [
  { label: "Beginner", value: "beginner" },
  { label: "Intermediate", value: "intermediate" },
  { label: "Advanced", value: "advanced" },
];

const characters = [
  { label: "None", value: "" },
  { label: "Ironclad", value: "ironclad" },
  { label: "Silent", value: "silent" },
  { label: "Defect", value: "defect" },
  { label: "Necrobinder", value: "necrobinder" },
  { label: "Regent", value: "regent" },
];

export default function SubmitGuidePage() {
  const lp = useLangPrefix();
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [contact, setContact] = useState("");
  const [category, setCategory] = useState("general");
  const [difficulty, setDifficulty] = useState("beginner");
  const [character, setCharacter] = useState("");
  const [tags, setTags] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [bluesky, setBluesky] = useState("");
  const [twitter, setTwitter] = useState("");
  const [twitch, setTwitch] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const validateUrl = (url: string, label: string): string | null => {
    if (!url.trim()) return null;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return `${label} must start with http:// or https://`;
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || !authorName.trim() || !contact.trim()) return;

    const urlError = validateUrl(website, "Website");
    if (urlError) { setErrorMsg(urlError); setStatus("error"); return; }

    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch(`${API}/api/guides`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          author_name: authorName.trim(),
          contact: contact.trim(),
          category,
          difficulty,
          character: character || null,
          tags,
          summary: summary.trim(),
          content: content.trim(),
          website: website.trim() || null,
          bluesky: bluesky.trim() || null,
          twitter: twitter.trim() || null,
          twitch: twitch.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || "Failed to submit guide");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-[var(--bg-card)] rounded-lg border border-emerald-700/40 p-8 text-center">
          <h1 className="text-2xl font-bold text-emerald-400 mb-3">Guide Submitted!</h1>
          <p className="text-[var(--text-secondary)] mb-6">
            Thanks for your contribution! We&apos;ll review your guide and publish it soon.
          </p>
          <Link href={`${lp}/guides`} className="text-[var(--accent-gold)] hover:underline">
            Back to Guides
          </Link>
        </div>
      </div>
    );
  }

  const inputClass = "w-full bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-gold)] transition-colors";
  const labelClass = "block text-sm font-medium text-[var(--text-secondary)] mb-1";

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Link href={`${lp}/guides`} className="text-sm text-[var(--text-muted)] hover:text-[var(--accent-gold)] mb-6 inline-flex items-center gap-1 transition-colors">
        <span>&larr;</span> Back to Guides
      </Link>

      <h1 className="text-3xl font-bold mb-2">
        <span className="text-[var(--accent-gold)]">Submit a Guide</span>
      </h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">
        Share your knowledge with the community. Guides are reviewed before publishing. Markdown formatting is supported in the guide content.
      </p>

      <form onSubmit={handleSubmit} className="bg-[var(--bg-card)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-4">
        <div>
          <label className={labelClass}>Title *</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder="e.g. Ironclad Strength Build Guide" maxLength={200} required />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Your Name *</label>
            <input type="text" value={authorName} onChange={(e) => setAuthorName(e.target.value)} className={inputClass} placeholder="Your display name" maxLength={100} required />
          </div>
          <div>
            <label className={labelClass}>Contact *</label>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} className={inputClass} placeholder="Discord username or email" maxLength={200} required />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className={inputClass}>
              {difficulties.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Character</label>
            <select value={character} onChange={(e) => setCharacter(e.target.value)} className={inputClass}>
              {characters.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Tags</label>
          <input type="text" value={tags} onChange={(e) => setTags(e.target.value)} className={inputClass} placeholder="Comma-separated, e.g. strength, scaling, act 3" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Website <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} className={inputClass} placeholder="https://yoursite.com" pattern="https?://.*" title="Must start with http:// or https://" />
          </div>
          <div>
            <label className={labelClass}>Bluesky <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
            <input type="text" value={bluesky} onChange={(e) => setBluesky(e.target.value)} className={inputClass} placeholder="handle.bsky.social" />
          </div>
          <div>
            <label className={labelClass}>X / Twitter <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
            <input type="text" value={twitter} onChange={(e) => setTwitter(e.target.value)} className={inputClass} placeholder="username" />
          </div>
          <div>
            <label className={labelClass}>Twitch <span className="text-[var(--text-muted)] font-normal">(optional)</span></label>
            <input type="text" value={twitch} onChange={(e) => setTwitch(e.target.value)} className={inputClass} placeholder="username" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Summary *</label>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} className={inputClass} rows={2} placeholder="A brief summary of what this guide covers" maxLength={500} required />
        </div>

        <div>
          <label className={labelClass}>Guide Content * <span className="text-[var(--text-muted)] font-normal">(Markdown supported)</span></label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} className={`${inputClass} font-mono`} rows={15} placeholder="Write your guide here. Use ## for headings, **bold** for emphasis, - for lists..." maxLength={50000} required />
        </div>

        {status === "error" && errorMsg && (
          <p className="text-sm text-red-400">{errorMsg}</p>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="w-full py-2.5 rounded-lg bg-[var(--accent-gold)] text-black font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === "sending" ? "Submitting..." : "Submit Guide"}
        </button>
      </form>
    </div>
  );
}
