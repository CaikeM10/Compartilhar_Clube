interface SectionDividerProps {
  variant?: "wave" | "curve" | "gradient"
  flip?: boolean
  fromColor?: string
  toColor?: string
}

export function SectionDivider({
  variant = "wave",
  flip = false,
  fromColor = "#e1b12c",
  toColor = "#e1b12c",
}: SectionDividerProps) {
  if (variant === "gradient") {
    return (
      <div className="w-full h-16 md:h-20 relative overflow-hidden">
        <svg
          viewBox="0 0 1200 120"
          preserveAspectRatio="none"
          className="absolute bottom-0 w-full h-full"
          style={{ transform: flip ? "rotate(180deg)" : "none" }}
        >
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fromColor} stopOpacity="0.25" />
              <stop offset="50%" stopColor={toColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={fromColor} stopOpacity="0.25" />
            </linearGradient>
          </defs>
          <path d="M0,60 Q300,90 600,60 T1200,60 L1200,120 L0,120 Z" fill="url(#gradient)" />
        </svg>
      </div>
    )
  }

  if (variant === "curve") {
    return (
      <div className="w-full overflow-hidden leading-none" style={{ transform: flip ? "rotate(180deg)" : "none" }}>
        <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="relative block w-full h-10 md:h-12">
          <defs>
            <linearGradient id={`curve-gradient-${flip ? "flip" : "normal"}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={fromColor} stopOpacity="0.2" />
              <stop offset="50%" stopColor={toColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={fromColor} stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <path
            d="M0,0 C300,50 900,50 1200,0 L1200,60 L0,60 Z"
            fill={`url(#curve-gradient-${flip ? "flip" : "normal"})`}
          />
        </svg>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden leading-none" style={{ transform: flip ? "rotate(180deg)" : "none" }}>
      <svg viewBox="0 0 1200 60" preserveAspectRatio="none" className="relative block w-full h-10 md:h-12">
        <defs>
          <linearGradient id={`wave-gradient-${flip ? "flip" : "normal"}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fromColor} stopOpacity="0.25" />
            <stop offset="50%" stopColor={toColor} stopOpacity="0.35" />
            <stop offset="100%" stopColor={fromColor} stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path
          d="M321.39,28.22c58-5.4,114.16-15.07,172-20.93C575.78,0,661.58-0.87,743.84,7.17c79.94,7.78,162.83,24.49,241.82,36.41c70.05,9.24,146.53,13.05,214.34,1.5V0H0V13.68A600.21,600.21,0,0,0,321.39,28.22Z"
          fill={`url(#wave-gradient-${flip ? "flip" : "normal"})`}
        />
      </svg>
    </div>
  )
}
