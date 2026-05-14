import * as React from "react"

import { cn } from "@/lib/utils"

const SCROLLBAR_IDLE_DELAY_MS = 900

function ScrollArea({
  className,
  children,
  onBlur,
  onFocus,
  onPointerMove,
  onScroll,
  ...props
}: React.ComponentProps<"div">) {
  const [scrollbarVisible, setScrollbarVisible] = React.useState(false)
  const idleTimerRef = React.useRef<number | null>(null)

  const clearIdleTimer = React.useCallback(() => {
    if (idleTimerRef.current === null) {
      return
    }

    window.clearTimeout(idleTimerRef.current)
    idleTimerRef.current = null
  }, [])

  const showScrollbarTemporarily = React.useCallback(() => {
    clearIdleTimer()
    setScrollbarVisible(true)
    idleTimerRef.current = window.setTimeout(() => {
      setScrollbarVisible(false)
      idleTimerRef.current = null
    }, SCROLLBAR_IDLE_DELAY_MS)
  }, [clearIdleTimer])

  React.useEffect(() => clearIdleTimer, [clearIdleTimer])

  return (
    <div
      data-slot="scroll-area"
      data-scrollbar-visibility={scrollbarVisible ? "visible" : "idle"}
      className={cn(
        "vaak-scroll-area min-h-0 min-w-0 overflow-auto",
        className
      )}
      onBlur={(event) => {
        onBlur?.(event)
        clearIdleTimer()
        setScrollbarVisible(false)
      }}
      onFocus={(event) => {
        onFocus?.(event)
        showScrollbarTemporarily()
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        showScrollbarTemporarily()
      }}
      onScroll={(event) => {
        onScroll?.(event)
        showScrollbarTemporarily()
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export { ScrollArea }
