export default function DocumentBadge({ count }) {
  if (!count || count === 0) return null;

  const isLarge = count > 9;

  return (
    <span
      className={`bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0 ${
        isLarge
          ? "px-2 py-0.5 rounded-full h-5 min-w-10"
          : "h-5 w-5 rounded-full"
      }`}
    >
      {count}
    </span>
  );
}