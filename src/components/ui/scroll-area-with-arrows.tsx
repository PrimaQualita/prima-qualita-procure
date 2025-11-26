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
    <div className={cn("relative", className)} ref={scrollRef}>
      {/* Vertical arrows */}
      {showVertical && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="absolute top-0 right-1 z-10 h-5 w-5 p-0 bg-background/80 hover:bg-background border shadow-sm"
            onClick={() => scrollBy("up")}
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="absolute bottom-0 right-1 z-10 h-5 w-5 p-0 bg-background/80 hover:bg-background border shadow-sm"
            onClick={() => scrollBy("down")}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </>
      )}

      {/* Horizontal arrows */}
      {showHorizontal && (
        <>
          <Button
            variant="ghost"
            size="sm"
            className="absolute left-0 bottom-1 z-10 h-5 w-5 p-0 bg-background/80 hover:bg-background border shadow-sm"
            onClick={() => scrollBy("left")}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-6 bottom-1 z-10 h-5 w-5 p-0 bg-background/80 hover:bg-background border shadow-sm"
            onClick={() => scrollBy("right")}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </>
      )}

      <ScrollArea className="h-full w-full">
        <div className={cn(showVertical && "pr-6", showHorizontal && "pb-4")}>
          {children}
        </div>
        {showVertical && <ScrollBar orientation="vertical" />}
        {showHorizontal && <ScrollBar orientation="horizontal" />}
      </ScrollArea>
    </div>
  );
}
