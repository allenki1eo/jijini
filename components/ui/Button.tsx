import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "sun" | "forest" | "sky" | "coral" | "cream" | "night" | "ghost";
export type ButtonSize = "md" | "lg" | "xl";

const VARIANTS: Record<ButtonVariant, string> = {
  sun: "chunky bg-sun text-night [--edge:var(--color-sun-800)]",
  forest: "chunky bg-forest text-cream [--edge:var(--color-forest-800)]",
  sky: "chunky bg-sky text-night [--edge:var(--color-sky-700)]",
  coral: "chunky bg-coral text-cream [--edge:var(--color-coral-700)]",
  cream: "chunky bg-cream text-night [--edge:var(--color-cream-400)]",
  night: "chunky bg-night-600 text-cream ring-1 ring-white/10 [--edge:var(--color-night)]",
  ghost: "bg-transparent text-cream hover:bg-white/8 active:bg-white/12",
};

const SIZES: Record<ButtonSize, string> = {
  md: "min-h-12 px-5 text-base gap-2 rounded-[1rem]",
  lg: "min-h-14 px-6 text-lg gap-2.5 rounded-[1.15rem]",
  xl: "min-h-18 px-8 text-2xl gap-3 rounded-[1.4rem]",
};

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  children?: ReactNode;
  className?: string;
}

const classes = ({ variant = "night", size = "md", block, className }: BaseProps) =>
  cn(
    "relative inline-flex select-none items-center justify-center font-display font-bold leading-none tracking-tight",
    "disabled:opacity-45 disabled:saturate-50",
    VARIANTS[variant],
    SIZES[size],
    block && "w-full",
    className,
  );

const Content = ({ icon, iconRight, children }: BaseProps) => (
  <>
    {icon && <span className="grid shrink-0 place-items-center [&_svg]:size-[1.15em]">{icon}</span>}
    {children && <span className="pt-[0.12em]">{children}</span>}
    {iconRight && <span className="grid shrink-0 place-items-center [&_svg]:size-[1.1em]">{iconRight}</span>}
  </>
);

export type ButtonProps = BaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, size, icon, iconRight, block, className, children, type = "button", ...rest }: ButtonProps) {
  return (
    <button type={type} className={classes({ variant, size, block, className })} {...rest}>
      <Content icon={icon} iconRight={iconRight}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({ href, variant, size, icon, iconRight, block, className, children, ...rest }: BaseProps & { href: string; "aria-label"?: string }) {
  return (
    <Link href={href} className={classes({ variant, size, block, className })} {...rest}>
      <Content icon={icon} iconRight={iconRight}>
        {children}
      </Content>
    </Link>
  );
}
