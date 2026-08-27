import { Suspense } from "react"
import { PreScreenClient } from "./PreScreenClient"

export default function PreScreenPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-lg px-4 py-12">
          <div className="border-3 border-foreground p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            <p className="text-sm text-muted-foreground">Loading pre-screener...</p>
          </div>
        </div>
      </main>
    }>
      <PreScreenClient />
    </Suspense>
  )
}
