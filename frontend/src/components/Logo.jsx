export default function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-14 w-14 items-center justify-center rounded-[24px] bg-gradient-to-br from-teal-500 to-sky-500 shadow-lg shadow-teal-300/30">
        <svg viewBox="0 0 64 64" className="h-9 w-9 text-white" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="18" y="10" width="28" height="44" rx="8" stroke="currentColor" strokeWidth="4" />
          <path d="M26 16H38" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <rect x="28" y="24" width="8" height="14" rx="2" fill="currentColor" />
          <path d="M39 24.5C41 23.5 44 23 46 24.5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M38 40L43 28" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <path d="M47 20L54 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </svg>
      </div>
      <div>
        <p className="text-sm uppercase tracking-[0.32em] text-teal-600">Air-timee</p>
        <p className="text-sm text-slate-500">Instant M-Pesa airtime, no waiting</p>
      </div>
    </div>
  );
}
