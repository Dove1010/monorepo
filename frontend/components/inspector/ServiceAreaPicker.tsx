"use client";

import { useState } from "react";
import { Check, Search, X } from "lucide-react";

const LAGOS_LGAS = [
  "Agege", "Ajeromi-Ifelodun", "Alimosho", "Amuwo-Odofin", "Apapa",
  "Badagry", "Epe", "Eti-Osa", "Ibeju-Lekki", "Ifako-Ijaiye",
  "Ikeja", "Ikorodu", "Kosofe", "Lagos Island", "Lagos Mainland",
  "Mushin", "Ojo", "Oshodi-Isolo", "Shomolu", "Surulere"
];

interface ServiceAreaPickerProps {
  selectedAreas: string[];
  onChange: (areas: string[]) => void;
}

export function ServiceAreaPicker({ selectedAreas, onChange }: ServiceAreaPickerProps) {
  const [search, setSearch] = useState("");

  const filteredLGAs = LAGOS_LGAS.filter(lga => 
    lga.toLowerCase().includes(search.toLowerCase())
  );

  const toggleArea = (area: string) => {
    if (selectedAreas.includes(area)) {
      onChange(selectedAreas.filter(a => a !== area));
    } else {
      if (selectedAreas.length >= 10) return; // Max 10 areas
      onChange([...selectedAreas, area]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search Lagos LGAs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {selectedAreas.map(area => (
          <span 
            key={area}
            className="inline-flex items-center space-x-1 rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
          >
            <span>{area}</span>
            <button
              type="button"
              onClick={() => toggleArea(area)}
              className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-primary/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selectedAreas.length === 0 && (
          <span className="text-sm text-muted-foreground italic">No areas selected.</span>
        )}
      </div>

      <div className="border border-border rounded-md max-h-60 overflow-y-auto">
        <div className="p-2 space-y-1">
          {filteredLGAs.map(lga => {
            const isSelected = selectedAreas.includes(lga);
            const isDisabled = !isSelected && selectedAreas.length >= 10;
            
            return (
              <button
                key={lga}
                type="button"
                onClick={() => toggleArea(lga)}
                disabled={isDisabled}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors ${
                  isSelected 
                    ? "bg-primary text-primary-foreground" 
                    : isDisabled
                    ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                    : "hover:bg-muted"
                }`}
              >
                <span>{lga}</span>
                {isSelected && <Check className="h-4 w-4" />}
              </button>
            );
          })}
          {filteredLGAs.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No LGAs found.</p>
          )}
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground text-right">
        {selectedAreas.length} / 10 areas selected
      </p>
    </div>
  );
}
