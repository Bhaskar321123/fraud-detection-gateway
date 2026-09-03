import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label className="flex items-center cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            onChange={(e) => onCheckedChange?.(e.target.checked)}
            ref={ref}
            {...props}
          />
          <div
            className={cn(
              "block w-10 h-6 rounded-full transition-colors border",
              checked ? "bg-soc-cyan/20 border-soc-cyan" : "bg-soc-bg border-soc-border"
            )}
          ></div>
          <div
            className={cn(
              "absolute left-1 top-1 w-4 h-4 rounded-full transition-transform",
              checked ? "transform translate-x-4 bg-soc-cyan shadow-[0_0_8px_rgba(6,182,212,0.8)]" : "bg-slate-500"
            )}
          ></div>
        </div>
      </label>
    )
  }
)
Switch.displayName = "Switch"

export { Switch }
