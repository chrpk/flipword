import { clsx } from "clsx";

export { clsx as cx };

/** Delay for the `i`th item of a list that animates in, capped so long lists don't keep the tail waiting. */
export const stagger = (i: number, base = 0, step = 40) => ({ animationDelay: `${base + Math.min(i, 8) * step}ms` });

export type Variant = "primary" | "secondary" | "ghost" | "destructive" | "outline-destructive";
export type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border bg-background hover:bg-muted",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
  "outline-destructive": "border border-destructive/30 text-destructive hover:bg-destructive/10",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-6 text-sm gap-2",
  icon: "h-10 w-10",
};

/** Button styling, for links and other elements that should look like a Button. */
export const buttonClass = (variant: Variant = "primary", size: Size = "md", className?: string) =>
  clsx(
    "inline-flex shrink-0 items-center justify-center rounded-md font-medium whitespace-nowrap transition-[opacity,background-color,color] select-none",
    "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
    variants[variant],
    sizes[size],
    className,
  );
