"use client";

import Link from "next/link";
import Image from "next/image";
import { Bed, MapPin, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PropertyListing } from "@/lib/propertiesApi";

interface MapListingCardProps {
  property: PropertyListing;
  onClose?: () => void;
}

export function MapListingCard({ property, onClose }: MapListingCardProps) {
  const priceInK = Math.round(property.annualRentNgn / 1000);
  const thumbnail = property.photos?.[0] ?? null;
  const locationLabel = [property.area, property.city]
    .filter(Boolean)
    .join(", ") || property.address;

  return (
    <div className="border-2 border-foreground bg-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]" style={{ maxWidth: 240 }}>
      {/* Thumbnail */}
      <div className="relative h-28 w-full bg-muted border-b-2 border-foreground overflow-hidden">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={property.address}
            fill
            className="object-cover"
            sizes="240px"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <span className="font-mono text-xs font-bold text-muted-foreground">
              No photo
            </span>
          </div>
        )}

        {/* Close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center border-2 border-foreground bg-background hover:bg-muted"
            aria-label="Close popup"
          >
            <X className="h-3 w-3" />
          </button>
        )}

        {/* Price badge */}
        <Badge className="absolute bottom-1 left-1 border-2 border-foreground bg-primary font-mono text-xs font-black text-primary-foreground">
          ₦{priceInK}k/yr
        </Badge>
      </div>

      {/* Details */}
      <div className="p-2 space-y-1">
        {/* Bedrooms */}
        <div className="flex items-center gap-1 text-xs font-medium">
          <Bed className="h-3 w-3 shrink-0" />
          <span>{property.bedrooms} bed{property.bedrooms !== 1 ? "s" : ""}</span>
        </div>

        {/* Location */}
        <div className="flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0 mt-px" />
          <span className="line-clamp-2 leading-tight">{locationLabel}</span>
        </div>

        {/* CTA */}
        <Link href={`/properties/${property.listingId}`} className="block pt-1">
          <Button
            size="sm"
            className="w-full border-2 border-foreground bg-primary py-1 text-xs font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
          >
            View Details
          </Button>
        </Link>
      </div>
    </div>
  );
}
