const colorMap: Record<string, string> = {
  blue: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
  red: "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
  amber: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
  green: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
  purple: "bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800",
  indigo: "bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800",
};

const badgeColor: Record<string, string> = {
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
};

export interface ToolCardProps {
  name: string;
  gap: string;
  description: string;
  color: string;
}

export function ToolCard({ name, gap, description, color }: ToolCardProps) {
  return (
    <div className={`border rounded-lg p-6 ${colorMap[color] ?? colorMap.blue}`}>
      <span
        className={`inline-block text-xs font-semibold px-2 py-1 rounded mb-3 ${badgeColor[color] ?? badgeColor.blue}`}
      >
        {gap}
      </span>
      <h3 className="font-mono text-lg font-bold mb-2">{name}</h3>
      <p className="text-sm text-gray-700 dark:text-gray-300">{description}</p>
    </div>
  );
}
