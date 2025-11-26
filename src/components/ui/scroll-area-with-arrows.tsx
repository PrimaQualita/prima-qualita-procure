import * as React from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScrollAreaWithArrowsProps {
  children: React.ReactNode;
  className?: string;
  orientation?: "vertical" | "horizontal" | "both";
  scrollStep?: number;
}

export function ScrollAreaWithArrows({
  children,
  className,
  orientation = "vertical",
  scrollStep = 100,
}: ScrollAreaWithArrowsProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollBy = (direction: "up" | "down" | "left" | "right") => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    const options: ScrollToOptions = { behavior: "smooth" };

    switch (direction) {
      case "up":
        options.top = viewport.scrollTop - scrollStep;
        break;
      case "down":
        options.top = viewport.scrollTop + scrollStep;
        break;
      case "left":
        options.left = viewport.scrollLeft - scrollStep;
        break;
      case "right":
        options.left = viewport.scrollLeft + scrollStep;
        break;
    }

    viewport.scrollTo(options);
  };

  const showVertical = orientation === "vertical" || orientation === "both";
  const showHorizontal = orientation === "horizontal" || orientation === "both";

  return (
    <div className={cn("flex flex-col overflow-hidden", className)} ref={scrollRef}>
      {/* Top arrow */}
      {showVertical && (
        <div className="flex justify-center py-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-8 p-0 bg-muted hover:bg-muted/80 border shadow-sm"
            onClick={() => scrollBy("up")}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Horizontal left arrow + ScrollArea + Horizontal right arrow */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {showHorizontal && (
          <div className="flex items-center px-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-5 p-0 bg-muted hover:bg-muted/80 border shadow-sm"
              onClick={() => scrollBy("left")}
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
          </div>
        )}

        <ScrollArea className="flex-1 h-full">
          {children}
          {showVertical && <ScrollBar orientation="vertical" />}
          {showHorizontal && <ScrollBar orientation="horizontal" />}
        </ScrollArea>

        {showHorizontal && (
          <div className="flex items-center px-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-5 p-0 bg-muted hover:bg-muted/80 border shadow-sm"
              onClick={() => scrollBy("right")}
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>

      {/* Bottom arrow */}
      {showVertical && (
        <div className="flex justify-center py-1 flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-8 p-0 bg-muted hover:bg-muted/80 border shadow-sm"
            onClick={() => scrollBy("down")}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
