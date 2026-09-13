export default function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-emerald-600 text-white"
      : score >= 60
        ? "bg-blue-600 text-white"
        : score >= 40
          ? "bg-amber-500 text-white"
          : "bg-gray-400 text-white";

  return (
    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${color}`}>
      {score}
    </div>
  );
}
