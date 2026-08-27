"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import type { MonthlyEquityPoint } from "@/lib/rentToOwnCalc";
import { formatCompactNgn, formatNgn } from "@/lib/currency";

interface Props {
  data: MonthlyEquityPoint[];
  propertyPrice: number;
}

function formatShort(val: number): string {
  return formatCompactNgn(val);
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const equity = payload.find((p: any) => p.dataKey === "equity")?.value ?? 0;
  const rentEquivalent =
    payload.find((p: any) => p.dataKey === "rentEquivalent")?.value ?? 0;

  return (
    <div className="border-3 border-foreground bg-white text-black p-3 font-mono text-xs shadow-[3px_3px_0px_0px_rgba(26,26,26,1)]">
      <p className="font-bold border-b-2 border-foreground pb-1 mb-1.5">
        Month {label}
      </p>
      <p className="flex justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-primary border border-foreground inline-block" />
          Equity owned:
        </span>
        <span className="font-bold text-primary">{formatNgn(equity)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-destructive border border-foreground inline-block" />
          Rent cost (no equity):
        </span>
        <span className="font-bold">{formatNgn(rentEquivalent)}</span>
      </p>
    </div>
  );
};

// Render every Nth month label to avoid crowding
function tickEvery(totalMonths: number): (month: number) => string {
  const step = totalMonths <= 24 ? 3 : totalMonths <= 60 ? 6 : 12;
  return (month: number) => (month % step === 0 ? `M${month}` : "");
}

export default function EquityProgressChart({ data, propertyPrice }: Props) {
  if (!data.length) return null;
  const totalMonths = data[data.length - 1].month;
  const labelFormatter = tickEvery(totalMonths);

  return (
    <div className="border-3 border-foreground bg-card p-4 md:p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
      <h3 className="font-mono text-base font-bold mb-1">
        Equity Accumulation Over Time
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Your growing ownership stake vs. equivalent rent cost with no equity.
      </p>

      <div className="h-56 md:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 4, left: -10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rentGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4" vertical={false} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={{ stroke: "#000", strokeWidth: 2 }}
              tickFormatter={labelFormatter}
              tick={{ fill: "#000", fontSize: 10, fontWeight: "bold", fontFamily: "monospace" }}
            />
            <YAxis
              tickLine={false}
              axisLine={{ stroke: "#000", strokeWidth: 2 }}
              tickFormatter={formatShort}
              domain={[0, propertyPrice]}
              tick={{ fill: "#000", fontSize: 10, fontWeight: "bold", fontFamily: "monospace" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              verticalAlign="top"
              height={28}
              iconType="rect"
              formatter={(value) => (
                <span className="font-mono text-[10px] font-bold uppercase">
                  {value === "equity" ? "Your Equity" : "Rent Cost (no equity)"}
                </span>
              )}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#2563eb"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#equityGrad)"
            />
            <Area
              type="monotone"
              dataKey="rentEquivalent"
              stroke="#ef4444"
              strokeWidth={2}
              strokeDasharray="5 3"
              fillOpacity={1}
              fill="url(#rentGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Property value reference line label */}
      <p className="mt-2 text-right font-mono text-[10px] text-muted-foreground">
        Property value: {formatNgn(propertyPrice)}
      </p>
    </div>
  );
}
