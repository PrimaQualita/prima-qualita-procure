import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Archive } from "lucide-react";
import { ReactNode } from "react";

interface StorageCategoryCardProps {
  title: string;
  count: number;
  sizeMB: number;
  description: string;
  colorClass: string;
  onView?: () => void;
  showView?: boolean;
  icon?: ReactNode;
}

export function StorageCategoryCard({
  title,
  count,
  sizeMB,
  description,
  colorClass,
  onView,
  showView = false,
  icon
}: StorageCategoryCardProps) {
  // Extrair as cores do colorClass (ex: "border-purple-200 bg-purple-50/50" => purple)
  const colorMatch = colorClass.match(/border-(\w+)-/);
  const color = colorMatch ? colorMatch[1] : 'slate';
  
  return (
    <Card className={colorClass}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-1">
              {icon}
              <p className={`text-xs font-medium text-${color}-900`}>{title}</p>
            </div>
            <p className={`text-2xl font-bold text-${color}-700`}>{count}</p>
            <p className={`text-sm font-semibold text-${color}-600`}>
              {sizeMB} MB
            </p>
            <p className={`text-xs text-${color}-700/70`}>{description}</p>
          </div>
          {showView && onView && (
            <Button
              size="sm"
              variant="outline"
              onClick={onView}
            >
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
