"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Loader2, Users, HandCoins, Timer } from "lucide-react";
import { handleError } from "@/lib/toast";
import {
  claimDelegateeCommission,
  claimDelegateeRewards,
  completeUndelegate,
  delegateStake,
  getDelegateeEarnings,
  getDelegationPosition,
  requestUndelegate,
  setDelegateeCommission,
  type DelegateeEarningsResponse,
  type DelegationPositionResponse,
} from "@/lib/config";
import { formatUsdc } from "./PositionCard";

interface DelegationPanelProps {
  walletAddress: string;
}

/**
 * Delegated staking, backed by the stake_delegation contract.
 *
 * stake_delegation keeps its own stake ledger, separate from the staking_pool
 * position shown above by PositionCard. This panel therefore labels every
 * figure as "delegated staking" and never adds it to the direct position — the
 * two are distinct balances the user holds in two different contracts.
 */
export function DelegationPanel({ walletAddress }: DelegationPanelProps) {
  const [position, setPosition] = useState<DelegationPositionResponse | null>(null);
  const [earnings, setEarnings] = useState<DelegateeEarningsResponse | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [delegatee, setDelegatee] = useState("");
  const [amount, setAmount] = useState("");
  const [commissionBps, setCommissionBps] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [pos, earn] = await Promise.all([
        getDelegationPosition(walletAddress),
        getDelegateeEarnings(walletAddress),
      ]);
      setPosition(pos);
      setEarnings(earn);
      setUnavailable(false);
    } catch (err) {
      // A 503 here means SOROBAN_STAKE_DELEGATION_ID is not deployed for this
      // environment; the rest of the staking dashboard stays usable.
      console.error("Failed to load delegated-staking position", err);
      setUnavailable(true);
    }
  }, [walletAddress]);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_BACKEND_URL) return;
    void refresh();
  }, [refresh]);

  async function run(action: string, fn: () => Promise<{ message?: string }>, fallback: string) {
    setBusy(action);
    setStatus("");
    try {
      const res = await fn();
      setStatus(res.message || fallback);
      await refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : fallback + " failed";
      setStatus(message);
      handleError(err, fallback + " failed");
    } finally {
      setBusy(null);
    }
  }

  if (unavailable) {
    return null;
  }

  const delegations = position?.position.delegations ?? [];

  return (
    <Card className="border-2 border-foreground/10 bg-card shadow-sm">
      <CardHeader className="pb-3 border-b border-foreground/5">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <CardTitle className="text-base font-bold">Delegated staking</CardTitle>
          <Badge variant="outline" className="text-[10px] font-bold uppercase">
            Separate contract
          </Badge>
        </div>
        <CardDescription className="text-xs leading-relaxed">
          Hand your stake to a delegatee who runs the claim/compound loop for a commission.
          This position lives in the <span className="font-mono">stake_delegation</span> contract
          and is <strong>separate</strong> from the directly staked position above — the two
          balances are never combined.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Position split */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Delegation balance", position?.position.staked],
            ["Delegated", position?.position.delegated],
            ["Free to delegate", position?.position.free],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg border border-foreground/10 bg-muted/20 p-3">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
              <div className="mt-1 font-mono text-sm font-black">
                {formatUsdc(value as string | undefined)} USDC
              </div>
            </div>
          ))}
          <div className="rounded-lg border border-foreground/10 bg-muted/20 p-3">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">Current epoch</div>
            <div className="mt-1 font-mono text-sm font-black">
              {position?.position.currentEpoch ?? "—"}
            </div>
          </div>
        </div>

        {/* Delegate / undelegate */}
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={delegatee}
              onChange={(e) => setDelegatee(e.target.value.trim())}
              placeholder="Delegatee address (G...)"
              className="font-mono text-xs"
              aria-label="Delegatee address"
            />
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value.trim())}
              placeholder="Amount in USDC"
              inputMode="decimal"
              className="font-mono text-xs"
              aria-label="Amount to delegate in USDC"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                run("delegate", () => delegateStake(delegatee, amount, walletAddress), "Stake delegated")
              }
              disabled={!delegatee || !amount || busy !== null}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {busy === "delegate" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Delegate my stake
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run(
                  "request",
                  () => requestUndelegate(delegatee, amount, walletAddress),
                  "Undelegation requested",
                )
              }
              disabled={!delegatee || !amount || busy !== null}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {busy === "request" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Request undelegation
            </Button>
          </div>
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground leading-relaxed">
            <Timer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Undelegating is two steps: request starts the contract&apos;s cooldown (7 days by
            default) and the stake keeps earning for the delegatee until you complete it.
          </p>
        </div>

        {/* Active delegations */}
        <div className="space-y-2">
          <div className="text-[10px] font-bold uppercase text-muted-foreground">
            Active delegations
          </div>
          {delegations.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing delegated yet. Your whole delegation balance is free.
            </p>
          ) : (
            <ul className="space-y-2">
              {delegations.map((row) => (
                <li
                  key={row.delegatee}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-foreground/10 bg-muted/20 p-3"
                >
                  <div className="min-w-0">
                    <div className="font-mono text-xs truncate">
                      {row.delegatee.slice(0, 6)}...{row.delegatee.slice(-6)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      Active since epoch {row.activatedEpoch}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-black">
                      {formatUsdc(row.amountUsdc)} USDC
                    </span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        run(
                          `complete:${row.delegatee}`,
                          () => completeUndelegate(row.delegatee, walletAddress),
                          "Undelegation completed",
                        )
                      }
                      disabled={busy !== null}
                      className="h-8 text-[11px] font-bold rounded-lg"
                    >
                      {busy === `complete:${row.delegatee}` ? (
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      ) : null}
                      Complete undelegation
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Delegatee side */}
        <div className="space-y-3 rounded-xl border border-foreground/10 bg-muted/10 p-4">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold">Acting as a delegatee</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            If others delegate to this wallet, you earn their rewards net of the commission you
            charge, and the commission accrues to you separately.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-foreground/10 bg-card p-3">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">
                Rewards claimable
              </div>
              <div className="mt-1 font-mono text-sm font-black text-emerald-600 dark:text-emerald-500">
                {formatUsdc(earnings?.earnings.claimable)} USDC
              </div>
            </div>
            <div className="rounded-lg border border-foreground/10 bg-card p-3">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">
                Commission claimable
              </div>
              <div className="mt-1 font-mono text-sm font-black text-emerald-600 dark:text-emerald-500">
                {formatUsdc(earnings?.earnings.commissionClaimable)} USDC
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={commissionBps}
              onChange={(e) => setCommissionBps(e.target.value.trim())}
              placeholder="Commission (bps, 0-10000)"
              inputMode="numeric"
              className="h-9 w-56 font-mono text-xs"
              aria-label="Commission rate in basis points"
            />
            <Button
              variant="outline"
              onClick={() =>
                run(
                  "commission",
                  () => setDelegateeCommission(Number(commissionBps), walletAddress),
                  "Commission updated",
                )
              }
              disabled={commissionBps === "" || busy !== null}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {busy === "commission" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Set commission
            </Button>
            <Button
              onClick={() =>
                run("claim", () => claimDelegateeRewards(walletAddress), "Delegatee rewards claimed")
              }
              disabled={busy !== null}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {busy === "claim" ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Claim rewards
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                run(
                  "claim-commission",
                  () => claimDelegateeCommission(walletAddress),
                  "Commission claimed",
                )
              }
              disabled={busy !== null}
              className="h-9 text-xs font-bold rounded-xl"
            >
              {busy === "claim-commission" ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Claim commission
            </Button>
          </div>
        </div>

        {status && (
          <div className="rounded-xl border border-foreground/10 bg-muted/30 p-3 text-xs text-muted-foreground">
            {status}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
