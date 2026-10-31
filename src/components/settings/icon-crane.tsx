/** Grúa sobre camión, con el trazo de lucide (que no trae una). */
export function IconoGrua({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d="M2 16v-2.5h13V16" />
      <path d="M15 16v-4.5h3.5L21 14v2" />
      <circle cx="5" cy="17.5" r="1.5" />
      <circle cx="9.5" cy="17.5" r="1.5" />
      <circle cx="18" cy="17.5" r="1.5" />
      <path d="M9 13.5v-2.5h3v2.5" />
      <path d="M12 11 4 3.5" />
      <path d="M4 3.5V8" />
      <path d="M4 8a1.25 1.25 0 1 0 1.25 1.25" />
    </svg>
  )
}
