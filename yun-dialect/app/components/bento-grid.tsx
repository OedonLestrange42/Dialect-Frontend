import { cn } from "@/app/lib/utils";
import React from "react";

const BentoGrid = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => {
  return (
    <div
      className={cn(
        "mx-auto grid max-w-7xl grid-cols-1 gap-4 p-4 md:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
};

export default BentoGrid;