import { useId } from 'react';

function IslandShape({ index = 0, beacon = false }: { index?: number; beacon?: boolean }) {
  const palettes = [
    ['#d9f58b', '#94b970', '#edfbc3'],
    ['#ffd2a9', '#d59c7b', '#ffe8c5'],
    ['#d9d5ff', '#9991d4', '#f0edff'],
    ['#b8ece4', '#76b4b1', '#e2faf1'],
    ['#f8d4dd', '#cc94a6', '#ffe9ed'],
  ];
  const palette = palettes[index % palettes.length];
  return (
    <g>
      <ellipse cx="88" cy="132" rx="76" ry="13" fill="#143e9e" opacity=".13" />
      <path d="M12 100 82 69 166 97 166 112 96 145 12 116Z" fill={palette[1]} />
      <path d="m96 128 70-31v15l-70 33Z" fill="#254d63" opacity=".14" />
      <path d="M12 100 82 69 166 97 96 128Z" fill={palette[0]} />
      <path d="m22 100 61-25 72 24-59 23Z" fill={palette[2]} />
      <path
        d="m39 108 17-7m55 12 17-7m9-9 9-3"
        stroke={palette[1]}
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".65"
      />
      {beacon || index % 5 === 0 ? (
        <g>
          <ellipse cx="90" cy="101" rx="28" ry="9" fill="#244778" opacity=".16" />
          <path d="m73 49 27-7 9 60-28 8Z" fill="#fffef3" />
          <path d="m100 42 12 7 11 54-14-1Z" fill="#b7c8ed" />
          <path d="m77 72 26-7 3 17-26 8Z" fill="#ff806c" />
          <path d="m103 65 14 8 3 17-14-8Z" fill="#da625e" />
          <path d="m68 48 28-11 23 10-29 12Z" fill="#1645ce" />
          <path d="M74 29 96 21 111 28 111 46 91 52 74 44Z" fill="#fff4b4" />
          <path d="M96 21v25m-22-17 17 7 20-8M91 36v16" stroke="#2455d9" strokeWidth="3" fill="none" />
          <path d="m68 29 27-22 24 21-28 10Z" fill="#2455f5" />
          <path d="m95 7 24 21-28 10Z" fill="#163da8" />
          <path d="M95 8V0" stroke="#163da8" strokeWidth="3" />
          <path d="m92 91 9-3 2 17-10 3Z" fill="#163da8" />
          <path
            d="M119 90q9-5 18 0m-12 7q7-4 14 0"
            stroke="#77a86a"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        </g>
      ) : index % 5 === 1 ? (
        <g>
          <ellipse cx="89" cy="101" rx="35" ry="8" fill="#906b57" opacity=".17" />
          <path d="m55 88 37 13 31-14-13 20-24 8-23-12Z" fill="#2455f5" />
          <path d="m86 101 6-62v62" stroke="#173873" strokeWidth="4" />
          <path d="m87 44-3 48-33-12Z" fill="#fffdf3" />
          <path d="m96 52 28 30-29 8Z" fill="#ff806c" />
          <path d="m56 89 31 12 35-14" fill="none" stroke="#163c9f" strokeWidth="4" />
        </g>
      ) : index % 5 === 2 ? (
        <g>
          <ellipse cx="92" cy="104" rx="33" ry="8" fill="#65579f" opacity=".2" />
          <path d="m57 70 35 12 36-14v25l-36 15-35-13Z" fill="#2455f5" />
          <path d="m92 82 36-14v25l-36 15Z" fill="#173cb1" />
          <path d="m57 64 34 10 37-15v11L92 85 57 74Z" fill="#fffef3" />
          <path d="m57 57 35 10 36-14v9L92 77 57 67Z" fill="#ff8e78" />
          <path d="m62 48 30-13 31 11-31 13Z" fill="#d9f58b" />
          <path d="m92 59 31-13v8L92 67Z" fill="#97b65e" />
          <path d="m69 48 22 7m-25 18 17 6" stroke="#fffdf3" strokeWidth="2" strokeLinecap="round" />
        </g>
      ) : index % 5 === 3 ? (
        <g>
          <ellipse cx="91" cy="102" rx="30" ry="9" fill="#3b7473" opacity=".18" />
          <path d="M88 103V63" stroke="#805c42" strokeWidth="7" />
          <path d="m53 72 36-52 37 49-38 15Z" fill="#2455f5" />
          <path d="m89 20 37 49-38 15Z" fill="#163fb6" />
          <path d="m63 54 25-38 27 35-27 12Z" fill="#6b8dff" />
          <path d="m89 16 26 35-27 12Z" fill="#2455f5" />
          <path d="m120 92 8-13 8 13-8 5Z" fill="#ff866e" />
          <path d="M128 96v7" stroke="#805c42" strokeWidth="3" />
        </g>
      ) : (
        <g>
          <ellipse cx="88" cy="103" rx="28" ry="8" fill="#7d506a" opacity=".18" />
          <path d="m71 70 21-8 18 9v33l-21 9-18-9Z" fill="#fffdf3" />
          <path d="m89 79 21-8v33l-21 9Z" fill="#b2c2ef" />
          <path d="M92 68V15" stroke="#1842b6" strokeWidth="4" />
          <path d="m94 15 37 11-15 9 9 15-31-10Z" fill="#ff806c" />
          <path d="m94 15 37 11-15 9-22-7Z" fill="#ffb19b" />
          <path d="m77 88 8 4m-8 5 8 4" stroke="#2455f5" strokeWidth="3" strokeLinecap="round" />
        </g>
      )}
    </g>
  );
}

export function IslandArt({ index = 0, winner = false }: { index?: number; winner?: boolean }) {
  return (
    <svg
      className={`jd-island-art${winner ? ' jd-island-art--winner' : ''}`}
      viewBox="0 0 180 150"
      aria-hidden="true"
      focusable="false"
    >
      <IslandShape index={index} beacon={winner} />
      {winner && (
        <g className="jd-art-spark" fill="#ff806c">
          <path d="m36 21 4 10 11 4-11 4-4 11-4-11-10-4 10-4Z" />
          <path d="m147 49 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" />
        </g>
      )}
    </svg>
  );
}

export function ArchipelagoArt() {
  const id = useId().replace(/:/g, '');
  return (
    <div className="jd-archipelago" aria-hidden="true">
      <svg viewBox="0 0 640 410" focusable="false">
        <defs>
          <radialGradient id={`${id}-sea`}>
            <stop stopColor="#b6dedf" />
            <stop offset="1" stopColor="#e3efeb" />
          </radialGradient>
          <linearGradient id={`${id}-beam`}>
            <stop stopColor="#fffbd5" stopOpacity=".95" />
            <stop offset="1" stopColor="#fffbd5" stopOpacity="0" />
          </linearGradient>
        </defs>
        <ellipse cx="330" cy="254" rx="300" ry="143" fill={`url(#${id}-sea)`} />
        <ellipse cx="330" cy="254" rx="267" ry="120" fill="none" stroke="#fffdf3" strokeWidth="2" />
        <ellipse cx="330" cy="254" rx="239" ry="101" fill="none" stroke="#c6dcdf" />
        <path
          d="M141 182Q130 72 286 97T516 200Q590 309 378 343T133 280"
          fill="none"
          stroke="#648fb0"
          strokeWidth="2"
          strokeDasharray="4 9"
          strokeLinecap="round"
          opacity=".65"
        />
        <g transform="translate(72 78) scale(.78)">
          <IslandShape index={2} />
        </g>
        <g transform="translate(381 35) scale(.8)">
          <IslandShape index={3} />
        </g>
        <g className="jd-beacon-beam">
          <path d="M321 142 565 21 591 181Z" fill={`url(#${id}-beam)`} />
        </g>
        <g transform="translate(201 97) scale(1.3)">
          <IslandShape beacon />
        </g>
        <g transform="translate(403 194) scale(.94)">
          <IslandShape index={4} />
        </g>
        <g transform="translate(102 221) scale(.86)">
          <IslandShape index={1} />
        </g>
        <g fill="none" stroke="#7aa7bb" strokeWidth="2" strokeLinecap="round" opacity=".65">
          <path d="M57 237q13 8 26 0m458-14q13 8 26 0M315 339q14 8 28 0m38-275q9 5 18 0M212 196q8 5 16 0" />
        </g>
        <g className="jd-art-spark" fill="#2455f5">
          <path d="m274 41 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" />
          <path d="m558 281 3 9 9 3-9 3-3 9-3-9-9-3 9-3Z" />
        </g>
        <g fill="#fb8e79">
          <circle cx="86" cy="181" r="5" />
          <circle cx="522" cy="89" r="4" />
        </g>
        <g transform="translate(521 326)" stroke="#2455f5" fill="none">
          <circle r="22" strokeOpacity=".22" />
          <path d="M0-15v30M-15 0h30" strokeOpacity=".3" />
          <path d="m0-13 5 13-5 13-5-13Z" fill="#2455f5" stroke="none" />
          <path d="m0 0 5 0-5 13Z" fill="#ff806c" stroke="none" />
        </g>
      </svg>
      <span className="jd-map-coordinate">55°N / 37°E</span>
    </div>
  );
}
