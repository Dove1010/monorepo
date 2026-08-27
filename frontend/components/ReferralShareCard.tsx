'use client'

import { useState } from 'react'
import { MessageCircle, Copy, Check, Share2, Loader2, AlertCircle, Gift, Users, Clock, TrendingUp, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'

interface ReferralStats {
  code: string
  referralLink: string
  totalReferred: number
  pendingRewards: number
  appliedRewards: number
  totalRewardAmountNgn: number
}

interface ReferralShareCardProps {
  referralCode?: string
  referralLink?: string
  stats?: ReferralStats
  loading?: boolean
  error?: string | null
  isEligible?: boolean
  eligibilityMessage?: string
}

type CardState = 'loading' | 'error' | 'not-eligible' | 'success'

export function ReferralShareCard({
  referralCode,
  referralLink,
  stats,
  loading = false,
  error = null,
  isEligible = true,
  eligibilityMessage = 'Complete your first rental deal to unlock referrals'
}: ReferralShareCardProps) {
  const [copied, setCopied] = useState(false)
  const [isSharing, setIsSharing] = useState(false)

  const cardState: CardState = (() => {
    if (loading) return 'loading'
    if (error) return 'error'
    if (!isEligible) return 'not-eligible'
    return 'success'
  })()
  const code = referralCode || stats?.code
  const link = referralLink || stats?.referralLink
  const handleNativeShare = async () => {
    if (!link) return

    setIsSharing(true)
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join Shelterflex',
          text: `Join Shelterflex and get amazing rental deals! Use my referral code: ${code}`,
          url: link,
        })
        toast.success('Shared successfully')
      } else {
        toast.error('Sharing not supported on this device')
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        toast.error('Failed to share')
      }
    } finally {
      setIsSharing(false)
    }
  }

  const handleShareWhatsApp = () => {
    if (!code || !link) return

    const text = `Join Shelterflex and get amazing rental deals! Use my referral code: ${code}\n\n${link}`
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`
    window.open(whatsappUrl, '_blank')
  }

  const handleCopyLink = async () => {
    if (!link) return

    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success('Link copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast.error('Failed to copy link')
    }
  }

  // Loading State
  if (cardState === 'loading') {
    return (
      <Card className="border-2 border-border p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading referral info...</span>
        </div>
      </Card>
    )
  }

  // Error State
  if (cardState === 'error') {
    return (
      <Card className="border-2 border-destructive p-6">
        <div className="flex items-center gap-3 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">{error || 'Failed to load referral information'}</p>
        </div>
      </Card>
    )
  }

  // Not Eligible State
  if (cardState === 'not-eligible') {
    return (
      <Card className="border-2 border-border p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted border-2 border-border">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground mb-2">Referrals Locked</h2>
            <p className="text-muted-foreground mb-4">{eligibilityMessage}</p>
            <div className="bg-muted border-2 border-border rounded-lg p-4">
              <p className="text-sm font-medium text-foreground">How to unlock:</p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>Complete your first rental deal activation</li>
                <li>Start earning ₦5,000 per successful referral</li>
              </ul>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  // Success State with Full Stats
  const displayStats = stats || {
    totalReferred: 0,
    pendingRewards: 0,
    appliedRewards: 0,
    totalRewardAmountNgn: 0
  }

  return (
    <Card className="border-2 border-border p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-foreground">Share Your Referral</h2>
        {displayStats.totalReferred > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Gift className="h-4 w-4" />
            <span className="font-medium">₦{(displayStats.totalRewardAmountNgn / 1000).toFixed(0)}k earned</span>
          </div>
        )}
      </div>

      {/* Referral Code Display */}
      {code && (
        <div className="mb-4">
          <label htmlFor="referral-code" className="text-sm font-bold text-muted-foreground mb-2 block">
            Your Referral Code
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <input
                id="referral-code"
                type="text"
                value={code}
                readOnly
                className="w-full bg-muted border-2 border-border rounded-lg p-4 font-mono text-lg font-bold text-foreground focus:outline-none"
                aria-label="Referral code"
              />
            </div>
            <Button
              onClick={handleCopyLink}
              variant="outline"
              size="lg"
              className="border-2 border-border h-14 w-14"
              aria-label={copied ? 'Link copied' : 'Copy referral link'}
            >
              {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}

      {/* Share Buttons */}
      <div className="grid gap-4 md:grid-cols-2 mb-4">
        {/* Native Share */}
        <Button
          onClick={handleNativeShare}
          disabled={isSharing}
          size="lg"
          className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90 border-2 border-primary h-14 font-bold"
          aria-label="Share referral link"
        >
          {isSharing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Share2 className="h-5 w-5" />
          )}
          Share
        </Button>

        {/* WhatsApp Share */}
        <Button
          onClick={handleShareWhatsApp}
          size="lg"
          className="gap-2 bg-green-600 text-white hover:bg-green-700 border-2 border-green-600 h-14 font-bold"
          aria-label="Share on WhatsApp"
        >
          <MessageCircle className="h-5 w-5" />
          WhatsApp
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Card className="border-2 border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-foreground" />
            <span className="text-xs font-bold text-muted-foreground">Invited</span>
          </div>
          <p className="text-xl font-bold text-foreground">{displayStats.totalReferred}</p>
        </Card>

        <Card className="border-2 border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-bold text-muted-foreground">Pending</span>
          </div>
          <p className="text-xl font-bold text-foreground">{displayStats.pendingRewards}</p>
        </Card>

        <Card className="border-2 border-border p-3">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs font-bold text-muted-foreground">Qualified</span>
          </div>
          <p className="text-xl font-bold text-foreground">{displayStats.appliedRewards}</p>
        </Card>
      </div>

      {/* Info Text */}
      <p className="text-xs text-muted-foreground">
        Share the link above to help your friends find the best rental deals on Shelterflex. You'll
        earn ₦5,000 credit when they activate their first deal.
      </p>
    </Card>
  )
}
