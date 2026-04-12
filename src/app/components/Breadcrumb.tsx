interface Props {
  segments: { label: string; onClick?: () => void }[];
}

export function Breadcrumb({ segments }: Props) {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 font-mono text-[11px]">
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-fl-text-ghost">&gt;</span>}
          {seg.onClick ? (
            <button
              type="button"
              onClick={seg.onClick}
              className="text-fl-text-dim transition-colors hover:text-fl-text"
            >
              {seg.label}
            </button>
          ) : (
            <span className="font-bold text-fl-text">{seg.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
