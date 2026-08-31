import { cn } from "@/lib/utils";

/**
 * The channel mark: three separate blocks, one letter each, in the BBC house
 * arrangement. `onRed` inverts it for the lower third, where the blocks sit on
 * the red bar; the default sits on the dark studio ground.
 */
export function ChannelMark({
  size = "md",
  onRed = false,
  className,
}: {
  size?: "sm" | "md" | "lg";
  /** blocks over the red bar rather than over the studio ground */
  onRed?: boolean;
  className?: string;
}) {
  const box = {
    sm: "size-[18px] text-[13px]",
    md: "size-[26px] text-[19px]",
    lg: "size-[34px] text-[25px]",
  }[size];

  return (
    <span
      className={cn("inline-flex items-center gap-[3px]", className)}
      aria-label="BBC"
      role="img"
    >
      {["B", "B", "C"].map((letter, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "headline inline-flex items-center justify-center leading-none",
            box,
            onRed ? "bg-white text-red" : "bg-white text-studio",
          )}
        >
          {letter}
        </span>
      ))}
    </span>
  );
}
