interface Props {
  className?: string;
  size?: number;
}

// Plattformneutrales Coin-Icon als Inline-SVG. Ersetzt das 🪙-Emoji,
// das auf iOS in einigen Versionen wie ein Mond ausschaut.
// Goldener Verlauf + dezenter Innenring = sieht ueberall identisch aus.
export default function CoinIcon({ className = '', size = 14 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`inline-block align-middle ${className}`}
      aria-label="coin"
    >
      <defs>
        <radialGradient id="coin-grad" cx="0.35" cy="0.30" r="0.85">
          <stop offset="0%" stopColor="#FFEFA1" />
          <stop offset="55%" stopColor="#FFD447" />
          <stop offset="100%" stopColor="#A8740B" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10.5" fill="url(#coin-grad)" stroke="#8B6914" strokeWidth="0.6" />
      <circle cx="12" cy="12" r="7.5" fill="none" stroke="#8B6914" strokeWidth="0.5" opacity="0.45" />
      <ellipse cx="9" cy="8.5" rx="2" ry="1.2" fill="#FFFFFF" opacity="0.35" />
    </svg>
  );
}
