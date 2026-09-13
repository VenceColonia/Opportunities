export default function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-brand-600 text-white"
      : score >= 60
        ? "bg-brand-300 text-brand-700"
        : score >= 40
          ? "bg-amber-200 text-amber-800"
          : "bg-stone-200 text-stone-600";

  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color}`}>
      {score}
    </div>
  );
}
