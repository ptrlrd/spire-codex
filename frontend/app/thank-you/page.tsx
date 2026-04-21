export default function ThankYouPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold mb-8">
        <span className="text-[var(--accent-gold)]">Thank</span>{" "}
        <span className="text-[var(--text-primary)]">You</span>
      </h1>

      <div className="text-[var(--text-secondary)] leading-relaxed space-y-4">
        <p>
          Just wanted to say thank you to everyone that has supported the project. Thanks to
          those who&apos;ve been using the site, reporting bugs, and helping make it better.
          This project wouldn&apos;t be where it is without the community. If you&apos;ve been
          enjoying the project, please make sure to share it on social media!
        </p>

        {/* Ko-fi supporters — gold-accented featured block. Donations
            keep the lights on, so they get the visual weight to match. */}
        <div className="not-prose mt-2 rounded-xl border border-[var(--accent-gold)]/30 bg-[var(--accent-gold)]/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[var(--accent-gold)]">♥</span>
            <h2 className="text-sm font-semibold text-[var(--accent-gold)] uppercase tracking-wider">
              Ko-fi Supporters
            </h2>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            A very special thank you to those who&apos;ve donated on{" "}
            <a
              href="https://ko-fi.com/yitsy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent-gold)] hover:underline"
            >
              Ko-fi
            </a>
            . Your support keeps the lights on.
          </p>
          <div className="flex flex-wrap gap-2">
            {["Katie K", "LeMerkur", "SpireMeta"].map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 text-sm font-medium text-[var(--accent-gold)]"
              >
                <span aria-hidden>★</span>
                {name}
              </span>
            ))}
          </div>
        </div>

        <p>
          And special thanks to the following community contributors:
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>vesper-arch</li>
          <li>terracubist</li>
          <li>U77654</li>
          <li>Purple Aspired Dreaming</li>
          <li>Kobaru</li>
          <li>Severi</li>
        </ul>
      </div>
    </div>
  );
}
