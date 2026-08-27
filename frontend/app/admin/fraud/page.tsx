"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiPost } from "@/lib/apiClient"

export default function FraudAdminPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  // Slashing form state
  const [submitEvidence, setSubmitEvidence] = useState({ submitter: "", commitment: "", actor: "", offence: "" })
  const [revealEvidence, setRevealEvidence] = useState({ submitter: "", slashId: "", evidence: "", salt: "" })
  const [proposeSlash, setProposeSlash] = useState({ submitter: "", actor: "", penaltyBps: "" })
  const [finalizeSlash, setFinalizeSlash] = useState({ caller: "", slashId: "" })
  const [cancelSlash, setCancelSlash] = useState({ admin: "", slashId: "" })

  // Bond form state
  const [depositBond, setDepositBond] = useState({ inspector: "", amount: "" })
  const [withdrawBond, setWithdrawBond] = useState({ inspector: "", amount: "" })

  const showMessage = (type: "success" | "error", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const handleSubmit = async (endpoint: string, data: Record<string, unknown>) => {
    setLoading(true)
    setMessage(null)
    try {
      const response = await apiPost<{ success: boolean; outboxId: string }>(`/api/admin/fraud${endpoint}`, data)
      showMessage("success", `Operation queued successfully. Outbox ID: ${response.outboxId}`)
      // Clear form
      Object.keys(data).forEach(key => {
        const setter = {
          "/slashing/submit-evidence": setSubmitEvidence,
          "/slashing/reveal-evidence": setRevealEvidence,
          "/slashing/propose-slash": setProposeSlash,
          "/slashing/finalize-slash": setFinalizeSlash,
          "/slashing/cancel-slash": setCancelSlash,
          "/bond/deposit": setDepositBond,
          "/bond/withdraw": setWithdrawBond,
        }[endpoint]
        if (setter) {
          setter(prev => ({ ...prev, [key]: "" }))
        }
      })
    } catch (err) {
      showMessage("error", err instanceof Error ? err.message : "Operation failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-2 text-3xl font-black">Fraud & Slashing Administration</h1>
        <p className="mb-8 text-muted-foreground">Manage slashing operations and bond collateral</p>

        {message && (
          <Card className={`mb-6 border-2 p-4 ${message.type === "success" ? "border-green-500 bg-green-50" : "border-destructive bg-destructive/10"}`}>
            <p className={`font-bold ${message.type === "success" ? "text-green-800" : "text-destructive"}`}>
              {message.text}
            </p>
          </Card>
        )}

        <Tabs defaultValue="slashing" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="slashing">Slashing Module</TabsTrigger>
            <TabsTrigger value="bond">Bond Collateral</TabsTrigger>
          </TabsList>

          <TabsContent value="slashing" className="space-y-6">
            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Submit Evidence</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="se-submitter">Submitter Address</Label>
                  <Input
                    id="se-submitter"
                    value={submitEvidence.submitter}
                    onChange={(e) => setSubmitEvidence({ ...submitEvidence, submitter: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="se-commitment">Commitment (hex)</Label>
                  <Input
                    id="se-commitment"
                    value={submitEvidence.commitment}
                    onChange={(e) => setSubmitEvidence({ ...submitEvidence, commitment: e.target.value })}
                    placeholder="0x..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="se-actor">Actor Address</Label>
                  <Input
                    id="se-actor"
                    value={submitEvidence.actor}
                    onChange={(e) => setSubmitEvidence({ ...submitEvidence, actor: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="se-offence">Offence Type</Label>
                  <Input
                    id="se-offence"
                    value={submitEvidence.offence}
                    onChange={(e) => setSubmitEvidence({ ...submitEvidence, offence: e.target.value })}
                    placeholder="e.g., double_signing"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/slashing/submit-evidence", submitEvidence)}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Submitting..." : "Submit Evidence"}
                </Button>
              </div>
            </Card>

            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Reveal Evidence</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="re-submitter">Submitter Address</Label>
                  <Input
                    id="re-submitter"
                    value={revealEvidence.submitter}
                    onChange={(e) => setRevealEvidence({ ...revealEvidence, submitter: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="re-slashId">Slash ID</Label>
                  <Input
                    id="re-slashId"
                    value={revealEvidence.slashId}
                    onChange={(e) => setRevealEvidence({ ...revealEvidence, slashId: e.target.value })}
                    placeholder="1"
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="re-evidence">Evidence (hex)</Label>
                  <Input
                    id="re-evidence"
                    value={revealEvidence.evidence}
                    onChange={(e) => setRevealEvidence({ ...revealEvidence, evidence: e.target.value })}
                    placeholder="0x..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="re-salt">Salt (hex)</Label>
                  <Input
                    id="re-salt"
                    value={revealEvidence.salt}
                    onChange={(e) => setRevealEvidence({ ...revealEvidence, salt: e.target.value })}
                    placeholder="0x..."
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/slashing/reveal-evidence", { ...revealEvidence, slashId: Number(revealEvidence.slashId) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Revealing..." : "Reveal Evidence"}
                </Button>
              </div>
            </Card>

            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Propose Slash</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="ps-submitter">Submitter Address</Label>
                  <Input
                    id="ps-submitter"
                    value={proposeSlash.submitter}
                    onChange={(e) => setProposeSlash({ ...proposeSlash, submitter: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="ps-actor">Actor Address</Label>
                  <Input
                    id="ps-actor"
                    value={proposeSlash.actor}
                    onChange={(e) => setProposeSlash({ ...proposeSlash, actor: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="ps-penaltyBps">Penalty (basis points, 0-10000)</Label>
                  <Input
                    id="ps-penaltyBps"
                    value={proposeSlash.penaltyBps}
                    onChange={(e) => setProposeSlash({ ...proposeSlash, penaltyBps: e.target.value })}
                    placeholder="5000 = 50%"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/slashing/propose-slash", { ...proposeSlash, penaltyBps: Number(proposeSlash.penaltyBps) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Proposing..." : "Propose Slash"}
                </Button>
              </div>
            </Card>

            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Finalize Slash</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="fs-caller">Caller Address</Label>
                  <Input
                    id="fs-caller"
                    value={finalizeSlash.caller}
                    onChange={(e) => setFinalizeSlash({ ...finalizeSlash, caller: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="fs-slashId">Slash ID</Label>
                  <Input
                    id="fs-slashId"
                    value={finalizeSlash.slashId}
                    onChange={(e) => setFinalizeSlash({ ...finalizeSlash, slashId: e.target.value })}
                    placeholder="1"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/slashing/finalize-slash", { ...finalizeSlash, slashId: Number(finalizeSlash.slashId) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Finalizing..." : "Finalize Slash"}
                </Button>
              </div>
            </Card>

            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Cancel Slash</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="cs-admin">Admin Address</Label>
                  <Input
                    id="cs-admin"
                    value={cancelSlash.admin}
                    onChange={(e) => setCancelSlash({ ...cancelSlash, admin: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="cs-slashId">Slash ID</Label>
                  <Input
                    id="cs-slashId"
                    value={cancelSlash.slashId}
                    onChange={(e) => setCancelSlash({ ...cancelSlash, slashId: e.target.value })}
                    placeholder="1"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/slashing/cancel-slash", { ...cancelSlash, slashId: Number(cancelSlash.slashId) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Cancelling..." : "Cancel Slash"}
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="bond" className="space-y-6">
            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Deposit Bond</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bd-inspector">Inspector Address</Label>
                  <Input
                    id="bd-inspector"
                    value={depositBond.inspector}
                    onChange={(e) => setDepositBond({ ...depositBond, inspector: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="bd-amount">Amount</Label>
                  <Input
                    id="bd-amount"
                    value={depositBond.amount}
                    onChange={(e) => setDepositBond({ ...depositBond, amount: e.target.value })}
                    placeholder="1000000"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/bond/deposit", { ...depositBond, amount: Number(depositBond.amount) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Depositing..." : "Deposit Bond"}
                </Button>
              </div>
            </Card>

            <Card className="border-2 border-foreground p-6">
              <h2 className="mb-4 text-xl font-bold">Withdraw Bond</h2>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="bw-inspector">Inspector Address</Label>
                  <Input
                    id="bw-inspector"
                    value={withdrawBond.inspector}
                    onChange={(e) => setWithdrawBond({ ...withdrawBond, inspector: e.target.value })}
                    placeholder="G..."
                    className="border-2 border-foreground"
                  />
                </div>
                <div>
                  <Label htmlFor="bw-amount">Amount</Label>
                  <Input
                    id="bw-amount"
                    value={withdrawBond.amount}
                    onChange={(e) => setWithdrawBond({ ...withdrawBond, amount: e.target.value })}
                    placeholder="1000000"
                    className="border-2 border-foreground"
                  />
                </div>
                <Button
                  onClick={() => handleSubmit("/bond/withdraw", { ...withdrawBond, amount: Number(withdrawBond.amount) })}
                  disabled={loading}
                  className="w-full border-2 border-foreground font-bold"
                >
                  {loading ? "Withdrawing..." : "Withdraw Bond"}
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
