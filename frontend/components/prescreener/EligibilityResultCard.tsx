"use client"

import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle, AlertTriangle, XCircle, ArrowRight } from "lucide-react"
import Link from "next/link"
import type { EligibilityBand } from "@/lib/affordabilityCalc"
import { getOverallLabel } from "@/lib/affordabilityCalc"

type EligibilityResultCardProps = {
  band: EligibilityBand
  incomePass: boolean
  employmentLabel: string
  depositPass: boolean
  onReset: () => void
}

function BandIcon({ band }: { band: EligibilityBand }) {
  switch (band) {
    case "strong": return <CheckCircle className="h-12 w-12 text-green-600" />
    case "moderate": return <AlertTriangle className="h-12 w-12 text-yellow-600" />
    case "low": return <XCircle className="h-12 w-12 text-destructive" />
  }
}

const BAND_COLORS: Record<EligibilityBand, string> = {
  strong: "border-green-600 bg-green-50",
  moderate: "border-yellow-600 bg-yellow-50",
  low: "border-destructive bg-destructive/5",
}

const BAND_LABELS: Record<EligibilityBand, string> = {
  strong: "Strong",
  moderate: "Moderate",
  low: "Low",
}

export function EligibilityResultCard({ band, incomePass, employmentLabel, depositPass, onReset }: EligibilityResultCardProps) {
  return (
    <Card className={`border-3 p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${BAND_COLORS[band]}`}>
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">{BandIcon({ band })}</div>
        <h2 className="text-2xl font-black mb-2">Eligibility: {BAND_LABELS[band]}</h2>
        <p className="text-sm font-medium">{getOverallLabel(band)}</p>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-center justify-between border-2 border-foreground p-3">
          <span className="text-sm font-bold">Income Check</span>
          <span className={`text-sm font-bold ${incomePass ? "text-green-600" : "text-destructive"}`}>
            {incomePass ? "Pass" : "Fail"}
          </span>
        </div>
        <div className="flex items-center justify-between border-2 border-foreground p-3">
          <span className="text-sm font-bold">Employment</span>
          <span className="text-sm font-bold">{employmentLabel}</span>
        </div>
        <div className="flex items-center justify-between border-2 border-foreground p-3">
          <span className="text-sm font-bold">Deposit Readiness</span>
          <span className={`text-sm font-bold ${depositPass ? "text-green-600" : "text-destructive"}`}>
            {depositPass ? "Ready" : "Insufficient"}
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          onClick={onReset}
          variant="outline"
          className="flex-1 border-3 border-foreground font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all"
        >
          Start Over
        </Button>
        <Link href="/properties" className="flex-1">
          <Button className="w-full border-3 border-foreground bg-primary font-bold shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] hover:shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all">
            Browse Properties
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </Card>
  )
}
