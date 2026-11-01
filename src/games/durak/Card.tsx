import type { Card as CardType } from "../../../shared/games/durak/types";
export const suits = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};
export const suitNames = {
  clubs: "трефы",
  diamonds: "бубны",
  hearts: "червы",
  spades: "пики",
};
export const rankName = (rank: number) =>
  ({ 11: "В", 12: "Д", 13: "К", 14: "Т" })[rank] ?? String(rank);
export function CardFace({
  card,
  back = false,
}: {
  card?: CardType;
  back?: boolean;
}) {
  if (back || !card)
    return (
      <svg viewBox="0 0 96 140" role="img" aria-label="Рубашка карты">
        <rect
          x="2"
          y="2"
          width="92"
          height="136"
          rx="10"
          fill="#25366E"
          stroke="#F3C969"
          strokeWidth="3"
        />
        <path
          d="M12 18H84V122H12Z M12 18L84 122 M84 18L12 122"
          stroke="#FFF8E9"
          opacity=".25"
          fill="none"
        />
        <path
          d="M23 57H73V86H23Z M23 57L48 74L73 57"
          fill="#FFF8E9"
          stroke="#F3C969"
          strokeWidth="2"
        />
        <text x="48" y="112" textAnchor="middle" fill="#F3C969" fontSize="10">
          RR • ПОЧТА
        </text>
      </svg>
    );
  const color =
    card.suit === "hearts" || card.suit === "diamonds" ? "#A8302F" : "#25366E";
  return (
    <svg
      viewBox="0 0 96 140"
      role="img"
      aria-label={`${rankName(card.rank)} ${suitNames[card.suit]}`}
    >
      <rect
        x="2"
        y="2"
        width="92"
        height="136"
        rx="10"
        fill="#FFF8E9"
        stroke="#D8CAAF"
        strokeWidth="2"
      />
      <path d="M12 34H84 M12 107H84" stroke="#D8CAAF" strokeDasharray="3 3" />
      <text x="13" y="27" fontSize="21" fontWeight="800" fill={color}>
        {rankName(card.rank)}
      </text>
      <text x="78" y="27" textAnchor="middle" fontSize="19" fill={color}>
        {suits[card.suit]}
      </text>
      <text x="48" y="87" textAnchor="middle" fontSize="47" fill={color}>
        {suits[card.suit]}
      </text>
      <text
        x="48"
        y="124"
        textAnchor="middle"
        fontSize="8"
        letterSpacing="1"
        fill="#25366E"
      >
        ПОЧТОВЫЙ БИЛЕТ
      </text>
    </svg>
  );
}
