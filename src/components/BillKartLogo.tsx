import React from 'react';

export type BillKartLogoVariant = 'emerald' | 'topbar' | 'admin';
export type BillKartLogoSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<BillKartLogoSize, string> = {
  sm: 'w-9 h-9 rounded-xl',
  md: 'w-12 h-12 rounded-2xl',
  lg: 'w-16 h-16 rounded-2xl',
  xl: 'w-28 h-28 rounded-3xl',
};

const VARIANT_CONTAINER_CLASSES: Record<BillKartLogoVariant, string> = {
  emerald: 'bg-emerald-50 ring-2 ring-emerald-400/40 shadow-lg',
  topbar: 'bg-emerald-50 ring-1 ring-emerald-400/50 shadow-md',
  admin: 'bg-sky-50 ring-1 ring-sky-400/50 shadow-lg',
};

const VARIANT_IMAGE_FILTER_CLASSES: Record<BillKartLogoVariant, string> = {
  // Shifts bright neon green accents to UI-matched Emerald (#059669 / #064e3b)
  emerald: '[filter:hue-rotate(20deg)_saturate(0.84)_contrast(1.04)_brightness(0.98)]',
  topbar: '[filter:hue-rotate(20deg)_saturate(0.88)_contrast(1.05)]',
  // Shifts cart & swoosh accents toward Ocean Teal / Sky to match Admin Console theme
  admin: '[filter:hue-rotate(62deg)_saturate(0.82)_contrast(1.06)]',
};

export function BillKartLogo({
  size = 'md',
  variant = 'emerald',
  className = '',
}: {
  size?: BillKartLogoSize;
  variant?: BillKartLogoVariant;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden shrink-0 inline-flex items-center justify-center ${SIZE_CLASSES[size]} ${VARIANT_CONTAINER_CLASSES[variant]} ${className}`}
    >
      <img
        src="/assets/aistudio/BillKart_Green_Cart_Logo_beb258ac.png"
        alt="BillKart Logo"
        className={`w-full h-full object-cover scale-[1.12] select-none ${VARIANT_IMAGE_FILTER_CLASSES[variant]}`}
        draggable={false}
      />
    </div>
  );
}
