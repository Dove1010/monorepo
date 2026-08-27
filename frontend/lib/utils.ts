import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface RiskState {
  isFrozen: boolean;
  freezeReason: string | null;
  deficitNgn: number;
}

export const getRiskState = (user: any, wallet: any): RiskState => {
  const isFrozen = user?.isFrozen || false;
  // Deficit is only relevant if the balance is below zero
  const deficitNgn =
    wallet?.totalBalanceNgn < 0 ? Math.abs(wallet.totalBalanceNgn) : 0;

  return {
    isFrozen,
    freezeReason: user?.freezeReason || "Payment reversal recovery",
    deficitNgn,
  };
};

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return function (...args: Parameters<T>) {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
}
