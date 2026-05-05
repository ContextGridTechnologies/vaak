import * as React from "react"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="scroll-area"
      data-scrollbar-visibility="hover"
      className={cn(
        "vaak-scroll-area min-h-0 min-w-0 overflow-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { ScrollArea }
