import { FileText, FolderOpen, Clock, CheckCircle2 } from "lucide-react";

export default function StatsCards({ documents, folders }) {
  const totalDocs = documents.length;
  const processed = documents.filter(d => d.processing_status === "completed").length;
  const pending = documents.filter(d => d.processing_status === "pending" || d.processing_status === "processing").length;
  const totalFolders = folders.length;

  const stats = [
    { label: "Total Documents", value: totalDocs, icon: FileText, color: "text-primary" },
    { label: "Folders", value: totalFolders, icon: FolderOpen, color: "text-chart-2" },
    { label: "Processed", value: processed, icon: CheckCircle2, color: "text-chart-2" },
    { label: "Pending", value: pending, icon: Clock, color: "text-chart-3" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-card rounded-xl border p-5 transition-shadow hover:shadow-md">
          <div className="flex items-center justify-between mb-3">
            <stat.icon className={`h-5 w-5 ${stat.color}`} />
          </div>
          <p className="text-2xl font-semibold tracking-tight">{stat.value}</p>
          <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}