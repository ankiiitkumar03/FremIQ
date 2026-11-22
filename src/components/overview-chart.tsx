"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ActivityChart({
  data,
}: {
  data: Array<{ label: string; total: number; completed: number; failed: number }>;
}) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
          <CartesianGrid stroke="#262733" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "#A1A1AA", fontSize: 11 }}
            axisLine={{ stroke: "#30313C" }}
            tickLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "#A1A1AA", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(167,139,250,0.08)" }}
            contentStyle={{
              background: "#171820",
              border: "1px solid #30313C",
              borderRadius: 10,
              fontSize: 12,
              color: "#F5F5F7",
            }}
          />
          <Bar dataKey="completed" name="Completed" fill="#A78BFA" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="failed" name="Failed" fill="#F87171" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
