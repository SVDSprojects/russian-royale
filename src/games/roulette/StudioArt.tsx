import { useId, type CSSProperties } from 'react';
import type { GameProps } from '../../../shared/games/roulette/types';

const sampleSectors = [
  { id: 'a', label: 'А', color: '#dbf55c' },
  { id: 'b', label: 'Б', color: '#769bff' },
  { id: 'v', label: 'В', color: '#ff9d82' },
  { id: 'g', label: 'Г', color: '#f7edcf' },
  { id: 'd', label: 'Д', color: '#b7b0f4' },
  { id: 'e', label: 'Е', color: '#dbf55c' },
  { id: 'yo', label: 'Ё', color: '#92c4fb' },
  { id: 'ya', label: 'Я', color: '#ff9d82' },
];

function labelColor(color: string) {
  const rgb = color.match(/[\da-f]{2}/gi)?.map((n) => parseInt(n, 16)) ?? [255, 255, 255];
  return rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114 > 145 ? '#152e6d' : '#fffbed';
}

function WheelSculpture({
  sectors = sampleSectors,
  angle = -22.5,
  spinning = false,
  elapsed = 0,
  round = 0,
}: {
  sectors?: typeof sampleSectors;
  angle?: number;
  spinning?: boolean;
  elapsed?: number;
  round?: number;
}) {
  const id = useId().replace(/:/g, '');
  const n = sectors.length || 1;
  return (
    <svg className="rr-studio-art" viewBox="0 0 600 480" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#5d88ff" />
          <stop offset=".45" stopColor="#2859eb" />
          <stop offset="1" stopColor="#1437a2" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fffdf1" />
          <stop offset=".45" stopColor="#ece7d6" />
          <stop offset="1" stopColor="#c9c8b9" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff" stopOpacity=".48" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#162d68" stopOpacity=".1" />
        </linearGradient>
        <radialGradient id={`${id}-hub`} cx=".35" cy=".25">
          <stop stopColor="#fffef8" />
          <stop offset=".7" stopColor="#f8f0d9" />
          <stop offset="1" stopColor="#d5d7c6" />
        </radialGradient>
      </defs>
      <ellipse cx="301" cy="438" rx="194" ry="21" fill="#173c8c" opacity=".1" />
      <g className="rr-studio-backdrop">
        <circle cx="300" cy="224" r="218" fill="none" stroke="#234cc4" strokeOpacity=".08" />
        <circle
          cx="300"
          cy="224"
          r="203"
          fill="none"
          stroke="#234cc4"
          strokeOpacity=".1"
          strokeDasharray="2 13"
        />
        <path d="M34 341H566M79 387H521" fill="none" stroke="#234cc4" strokeOpacity=".07" />
        <path d="m63 119 17 7-7 17-17-7Z" fill="#ff8b6f" />
        <path d="m502 313 11 4-4 11-11-4Z" fill="#2455ed" />
        <circle cx="505" cy="102" r="8" fill="#dbf55c" />
        <path d="m119 307 2-10 3 10 10 3-10 2-3 10-2-10-10-2Z" fill="#486bd8" />
        <path d="m460 45 2-12 3 12 12 3-12 3-3 12-2-12-12-3Z" fill="#ff8b6f" />
      </g>
      <path d="M270 322h60l18 93h-96Z" fill={`url(#${id}-blue)`} />
      <path d="M270 322h14l-13 93h-19Z" fill="#7b9aff" opacity=".7" />
      <path d="M214 415q0-14 20-14h132q20 0 20 14v12H214Z" fill="#18388d" />
      <ellipse cx="300" cy="414" rx="86" ry="16" fill={`url(#${id}-blue)`} />
      <ellipse cx="300" cy="410" rx="64" ry="8" fill="#a6beff" opacity=".2" />
      <circle cx="300" cy="232" r="189" fill="#183786" />
      <circle cx="300" cy="222" r="189" fill={`url(#${id}-blue)`} stroke="#1e44ae" strokeWidth="2" />
      <circle cx="300" cy="222" r="178" fill={`url(#${id}-metal)`} />
      <circle cx="300" cy="222" r="169" fill="#183786" />
      {Array.from({ length: 36 }, (_, i) => {
        const a = (i * Math.PI) / 18;
        return (
          <circle
            key={i}
            cx={300 + 182 * Math.cos(a)}
            cy={222 + 182 * Math.sin(a)}
            r={i % 3 === 0 ? 2.6 : 1.5}
            fill={i % 3 === 0 ? '#edff9d' : '#b7ccff'}
            opacity={i % 3 === 0 ? 1 : 0.6}
          />
        );
      })}
      <g
        key={round}
        className={`rr-studio-rotor${spinning ? ' is-spinning' : ''}`}
        style={
          {
            '--rr-studio-stop': `${angle}deg`,
            transform: `rotate(${angle}deg)`,
            animationDelay: `-${elapsed}ms`,
          } as CSSProperties
        }
      >
        {sectors.map((sector, i) => {
          const a = (i * 2 * Math.PI) / n - Math.PI / 2;
          const b = ((i + 1) * 2 * Math.PI) / n - Math.PI / 2;
          const middle = (a + b) / 2;
          const path =
            n === 1
              ? 'M300 57a165 165 0 1 1-.01 0Z'
              : `M300 222L${300 + 165 * Math.cos(a)} ${222 + 165 * Math.sin(a)}A165 165 0 ${n === 1 ? 1 : 0} 1 ${300 + 165 * Math.cos(b)} ${222 + 165 * Math.sin(b)}Z`;
          const tx = 300 + 119 * Math.cos(middle);
          const ty = 222 + 119 * Math.sin(middle);
          return (
            <g key={sector.id}>
              <path d={path} fill={sector.color} stroke="#f8f3dd" strokeWidth="3" />
              <path d={path} fill={`url(#${id}-shine)`} />
              <circle
                cx={300 + 153 * Math.cos(middle)}
                cy={222 + 153 * Math.sin(middle)}
                r="3"
                fill={labelColor(sector.color)}
                opacity=".32"
              />
              <text
                x={tx}
                y={ty + 9}
                textAnchor="middle"
                fill={labelColor(sector.color)}
                fontFamily="'Manrope Variable', sans-serif"
                fontSize={n > 9 ? 23 : 30}
                fontWeight="900"
                transform={`rotate(${(middle * 180) / Math.PI + 90} ${tx} ${ty})`}
              >
                {sector.label.slice(0, 1).toLocaleUpperCase('ru')}
              </text>
            </g>
          );
        })}
      </g>
      <circle cx="300" cy="228" r="48" fill="#0e2e70" opacity=".2" />
      <circle cx="300" cy="222" r="46" fill={`url(#${id}-blue)`} />
      <circle cx="300" cy="219" r="38" fill={`url(#${id}-hub)`} stroke="#fff9e9" strokeWidth="2" />
      <text
        x="300"
        y="232"
        fontSize="37"
        textAnchor="middle"
        fontWeight="900"
        fontFamily="'Unbounded Variable', sans-serif"
        fill="#2455df"
      >
        Ё
      </text>
      <path
        d="M146 154a166 166 0 0 1 115-95"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".6"
      />
      <path
        d="M440 300a160 160 0 0 1-64 63"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        opacity=".3"
      />
      <g className={spinning ? 'rr-studio-pointer is-spinning' : 'rr-studio-pointer'}>
        <path d="m282 28 18 45 18-45Z" fill="#ac442d" transform="translate(0 5)" />
        <path
          d="m282 28 18 45 18-45Z"
          fill="#ff8b6f"
          stroke="#fff7e9"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path d="m289 32 11 28V32Z" fill="#ffb09a" />
        <circle cx="300" cy="29" r="4" fill="#fff8e8" />
      </g>
      <g className="rr-studio-float rr-studio-float-a">
        <g transform="translate(52 215) rotate(-12)">
          <rect x="3" y="6" width="64" height="71" rx="14" fill="#c5644e" />
          <rect width="64" height="71" rx="14" fill="#ffa48a" stroke="#ffd5c5" strokeWidth="2" />
          <text
            x="32"
            y="49"
            textAnchor="middle"
            fill="#773828"
            fontFamily="'Unbounded Variable', sans-serif"
            fontSize="39"
            fontWeight="800"
          >
            Я
          </text>
        </g>
      </g>
      <g className="rr-studio-float rr-studio-float-b">
        <g transform="translate(486 173) rotate(13)">
          <rect x="1" y="7" width="66" height="73" rx="14" fill="#a2b74a" />
          <rect width="66" height="73" rx="14" fill="#e2f877" stroke="#f5ffc0" strokeWidth="2" />
          <text
            x="33"
            y="51"
            textAnchor="middle"
            fill="#4a5b24"
            fontFamily="'Unbounded Variable', sans-serif"
            fontSize="41"
            fontWeight="800"
          >
            А
          </text>
        </g>
      </g>
    </svg>
  );
}

export function RouletteWheel({ props }: { props: GameProps }) {
  const v = props.view;
  const sectors = v.sectorIds.map((id) => v.categories.find((c) => c.id === id)!).filter(Boolean);
  const angle = 1440 - (v.sectorIndex * 360) / (sectors.length || 1) - 180 / (sectors.length || 1);
  const selected = sectors[v.sectorIndex];
  return (
    <aside className="rr-studio-wheel" data-spinning={v.phase === 'spin'}>
      <div className="rr-studio-wheel-label">
        <span className="rr-studio-live-dot" /> КОЛЕСО ТЕМ <span>№ {String(v.round).padStart(2, '0')}</span>
      </div>
      <WheelSculpture
        sectors={sectors}
        angle={angle}
        spinning={v.phase === 'spin'}
        elapsed={Math.min(2000, Math.max(0, props.serverNowMs - v.phaseStartedAt))}
        round={v.round}
      />
      <div className="rr-studio-sector" aria-live="polite">
        <small>{v.phase === 'spin' ? 'Вращаем колесо' : 'Тема этого раунда'}</small>
        <strong>{v.phase === 'spin' ? 'Ловим момент…' : (selected?.label ?? 'Карусель знаний')}</strong>
      </div>
      <div className="rr-studio-sector-legend" aria-label="Темы на колесе">
        {sectors.map((sector, i) => (
          <span key={sector.id} className={i === v.sectorIndex && v.phase !== 'spin' ? 'is-current' : ''}>
            <i style={{ background: sector.color }} />
            {sector.label}
          </span>
        ))}
      </div>
    </aside>
  );
}

export function RouletteLobbyArt() {
  return (
    <div className="rr-studio-lobby-art">
      <div className="rr-studio-art-caption">
        <span>БОЛЬШЕ, ЧЕМ УДАЧА</span>
        <span>А — Я ↗</span>
      </div>
      <WheelSculpture />
      <span className="rr-studio-sticker">
        Крутится колесо.
        <br />
        <b>Решают знания.</b>
      </span>
    </div>
  );
}

export function RouletteTrophy({ cancelled = false }: { cancelled?: boolean }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="rr-studio-trophy" viewBox="0 0 420 230" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-cup`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#f2ffb2" />
          <stop offset=".5" stopColor="#dbf55c" />
          <stop offset="1" stopColor="#a3c248" />
        </linearGradient>
      </defs>
      <ellipse cx="210" cy="212" rx="133" ry="12" fill="#2145a1" opacity=".1" />
      <path d="M104 185h65v27h-65Z" fill="#8ea7ee" />
      <path d="M251 177h65v35h-65Z" fill="#ffad93" />
      <path d="M167 162h86v50h-86Z" fill="#214dd7" />
      <path d="M167 162h86v9h-86Z" fill="#517afb" />
      <path d="M200 124h20v32h-20Z" fill="#90ad36" />
      <ellipse cx="210" cy="157" rx="32" ry="8" fill={`url(#${id}-cup)`} />
      <path
        d="M166 65h-24v20q0 30 40 30M254 65h24v20q0 30-40 30"
        fill="none"
        stroke="#afc954"
        strokeWidth="12"
      />
      <path d="M166 60h88v26q0 48-44 48t-44-48Z" fill={`url(#${id}-cup)`} />
      <ellipse cx="210" cy="60" rx="44" ry="10" fill="#f2ffb2" />
      <ellipse cx="210" cy="61" rx="34" ry="5" fill="#a7c446" />
      <path d="m210 76 6 12 14 2-10 10 2 14-12-7-12 7 2-14-10-10 14-2Z" fill="#597524" />
      <path d="M176 73v14q0 25 17 31" fill="none" stroke="#f4ffc0" strokeWidth="5" strokeLinecap="round" />
      {!cancelled && (
        <g className="rr-studio-celebration">
          <path d="m111 64 8-21 12 6-8 21Zm194 60 14-14 8 8-14 14Z" fill="#ff967a" />
          <path d="m292 53 13-13 8 8-13 13ZM94 130l13 5-4 10-13-5Z" fill="#4972ed" />
          <path d="m239 25 4-12 4 12 12 4-12 4-4 12-4-12-12-4Z" fill="#b3d448" />
          <circle cx="150" cy="33" r="4" fill="#6c8be5" />
          <circle cx="332" cy="84" r="5" fill="#badb5a" />
        </g>
      )}
    </svg>
  );
}
