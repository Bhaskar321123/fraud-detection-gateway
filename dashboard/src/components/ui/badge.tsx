import * as React from "react"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border-transparent bg-slate-800 text-slate-50 hover:bg-slate-700",
    secondary: "border-transparent bg-slate-800 text-slate-50 hover:bg-slate-800/80",
    destructive: "border-transparent bg-rose-500/20 text-rose-400 hover:bg-rose-500/30",
    success: "border-transparent bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
    warning: "border-transparent bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
    outline: "text-slate-50 border-slate-700",
  }
  
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-300 focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
