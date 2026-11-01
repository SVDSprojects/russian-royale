import { useId } from 'react';
import './arcade-art.css';

/** Original, lightweight illustrations. Decorative motion never drives game state. */
export function ArcadeArt({ mode }: { mode: string }) {
  const id = useId().replace(/:/g, '');
  const blue = `${id}-blue`,
    paper = `${id}-paper`,
    lime = `${id}-lime`,
    pink = `${id}-pink`;
  return (
    <div className={`arcade-card-art arcade-card-art--${mode}`} aria-hidden="true">
      <svg viewBox="0 0 360 200" fill="none" focusable="false">
        <defs>
          <linearGradient id={blue} x1="70" y1="20" x2="265" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6385FF" />
            <stop offset=".5" stopColor="#3157EF" />
            <stop offset="1" stopColor="#1238B8" />
          </linearGradient>
          <linearGradient id={paper} x1="100" y1="35" x2="240" y2="190" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFEF6" />
            <stop offset="1" stopColor="#E1DFC9" />
          </linearGradient>
          <linearGradient id={lime} x1="100" y1="20" x2="230" y2="175" gradientUnits="userSpaceOnUse">
            <stop stopColor="#EFFF9C" />
            <stop offset="1" stopColor="#A9CC2F" />
          </linearGradient>
          <linearGradient id={pink} x1="100" y1="30" x2="240" y2="185" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFBDA6" />
            <stop offset="1" stopColor="#E65B47" />
          </linearGradient>
        </defs>
        <ellipse cx="183" cy="177" rx="102" ry="12" fill="#19336D" opacity=".1" />
        <g className="arcade-art-orbit" stroke="#17326D" strokeOpacity=".12">
          <ellipse cx="180" cy="109" rx="142" ry="64" strokeDasharray="3 8" />
          <circle cx="58" cy="116" r="5" fill="#FFFCF0" />
          <circle cx="304" cy="77" r="4" fill="#FFFCF0" />
        </g>
        {mode === 'memory' && (
          <>
            <g transform="translate(104 35) rotate(-17 55 66)">
              <rect x="0" y="6" width="106" height="136" rx="17" fill="#153596" />
              <rect
                width="106"
                height="136"
                rx="17"
                fill={`url(#${blue})`}
                stroke="#FFFFFF"
                strokeOpacity=".7"
                strokeWidth="2"
              />
              <rect x="10" y="10" width="86" height="116" rx="11" stroke="#FFFFFF" strokeOpacity=".25" />
              <path d="M35 68 52 47 70 68 52 90Z" fill="#DFFF71" />
              <circle cx="52" cy="68" r="6" fill="#3157EF" />
            </g>
            <g className="arcade-art-float">
              <g transform="translate(174 39) rotate(12 55 66)">
                <rect y="7" width="106" height="136" rx="17" fill="#A6B951" />
                <rect
                  width="106"
                  height="136"
                  rx="17"
                  fill={`url(#${lime})`}
                  stroke="#F8FFDB"
                  strokeWidth="2"
                />
                <path
                  d="m29 100 24-65 24 65M38 78h30"
                  stroke="#19336D"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="16" cy="17" r="3" fill="#19336D" />
                <circle cx="90" cy="119" r="3" fill="#19336D" />
              </g>
            </g>
            <path
              className="arcade-art-spark"
              d="m286 34 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z"
              fill="#3157EF"
            />
          </>
        )}
        {mode === 'sprint' && (
          <>
            <g className="arcade-art-speed" stroke="#3157EF" strokeWidth="5" strokeLinecap="round">
              <path d="M66 82h32M48 106h46M61 131h31" />
            </g>
            <g className="arcade-art-float">
              <g transform="rotate(12 191 109)">
                <rect x="178" y="14" width="28" height="20" rx="5" fill="#17326D" />
                <rect x="172" y="11" width="40" height="12" rx="5" fill="#E1FF80" />
                <rect
                  x="245"
                  y="43"
                  width="19"
                  height="15"
                  rx="5"
                  transform="rotate(38 245 43)"
                  fill="#17326D"
                />
                <circle cx="191" cy="111" r="67" fill="#133697" />
                <circle cx="191" cy="105" r="67" fill={`url(#${blue})`} stroke="#88A1FF" strokeWidth="2" />
                <circle cx="191" cy="105" r="52" fill="#FFFCED" />
                <path d="M191 62a43 43 0 0 1 43 43h-43Z" fill="#DEFA82" />
                <g stroke="#17326D" strokeWidth="3" strokeLinecap="round">
                  <path d="M191 60v6m45 39h-6m-39 45v-6m-45-39h6" />
                </g>
                <path
                  className="arcade-art-hand"
                  d="M191 105v-29m0 29 21 13"
                  stroke="#17326D"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
                <circle cx="191" cy="105" r="7" fill="#FF9876" />
              </g>
            </g>
            <path
              d="m278 105-14 21h13l-7 20 27-29h-15l8-12Z"
              fill="#F28A60"
              stroke="#F9C4A4"
              strokeWidth="2"
            />
          </>
        )}
        {mode === 'survival' && (
          <>
            <g transform="translate(72 66) rotate(-15 44 44)">
              <path
                d="M44 22C20-2-7 34 18 57l26 25 26-25C95 34 68-2 44 22Z"
                fill="#D55749"
                transform="translate(0 7)"
              />
              <path
                d="M44 22C20-2-7 34 18 57l26 25 26-25C95 34 68-2 44 22Z"
                fill={`url(#${pink})`}
                stroke="#FFD7C7"
                strokeWidth="2"
              />
            </g>
            <g className="arcade-art-float">
              <g transform="translate(134 35)">
                <path
                  d="M46 24C21-2-8 37 18 62l28 29 28-29C100 37 71-2 46 24Z"
                  fill="#153596"
                  transform="translate(0 8)"
                />
                <path
                  d="M46 24C21-2-8 37 18 62l28 29 28-29C100 37 71-2 46 24Z"
                  fill={`url(#${blue})`}
                  stroke="#88A1FF"
                  strokeWidth="2"
                />
                <path d="M22 35c-3 5-2 12 1 16" stroke="#CAD5FF" strokeWidth="5" strokeLinecap="round" />
              </g>
            </g>
            <g transform="translate(211 67) rotate(15 40 40)">
              <path
                d="M40 19C18-3-7 30 16 52l24 24 24-24C87 30 62-3 40 19Z"
                fill="#97AF40"
                transform="translate(0 7)"
              />
              <path
                d="M40 19C18-3-7 30 16 52l24 24 24-24C87 30 62-3 40 19Z"
                fill={`url(#${lime})`}
                stroke="#F2FFC3"
                strokeWidth="2"
              />
            </g>
            <g stroke="#17326D" strokeWidth="3" strokeLinecap="round">
              <path d="m161 16-4-7m47 8 5-7m-28 1V3" />
            </g>
            <rect x="135" y="153" width="92" height="23" rx="11" fill="#FFFCED" />
            <circle cx="159" cy="164" r="4" fill="#EF886B" />
            <circle cx="181" cy="164" r="4" fill="#3157EF" />
            <circle cx="203" cy="164" r="4" fill="#A3C537" />
          </>
        )}
        {mode === 'review' && (
          <>
            <g transform="translate(109 27) rotate(-8 69 70)">
              <rect x="0" y="6" width="133" height="145" rx="13" fill="#AEBDAE" />
              <rect
                width="133"
                height="145"
                rx="13"
                fill={`url(#${paper})`}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
              <path d="M25 0v144" stroke="#EAA6A0" strokeWidth="2" />
              <path
                d="M39 41h70M39 61h55M39 81h70M39 101h48"
                stroke="#BBC6D8"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <g fill="#3157EF">
                {[22, 47, 72, 97, 122].map((y) => (
                  <rect key={y} x="-8" y={y} width="19" height="5" rx="2.5" />
                ))}
              </g>
              <path d="m67 59 11 11m0-11L67 70" stroke="#E47761" strokeWidth="4" strokeLinecap="round" />
              <path d="M57 119h46" stroke="#17326D" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g className="arcade-art-float">
              <g transform="translate(229 119)">
                <circle r="31" fill="#9DAF42" transform="translate(0 6)" />
                <circle r="31" fill={`url(#${lime})`} stroke="#F4FFD0" strokeWidth="2" />
                <path
                  d="m-13 0 9 9 17-19"
                  stroke="#254E3D"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </g>
            <g transform="rotate(27 265 64)">
              <path d="M257 31h16v73l-8 16-8-16Z" fill="#3157EF" />
              <path d="m257 104 8 16 8-16Z" fill="#EBC49C" />
              <path d="m263 116 2 4 2-4" fill="#17326D" />
              <rect x="257" y="25" width="16" height="15" rx="4" fill="#FF9876" />
            </g>
          </>
        )}
        {mode === 'practice' && (
          <>
            <path
              d="M79 153c-20-17 23-25 59-29s61-7 53-25-21-15-9-31 46-15 77-18"
              stroke="#17326D"
              strokeOpacity=".15"
              strokeWidth="19"
              strokeLinecap="round"
            />
            <path
              className="arcade-art-route"
              d="M79 149c-20-17 23-25 59-29s61-7 53-25-21-15-9-31 46-15 77-18"
              stroke="#3157EF"
              strokeWidth="3"
              strokeDasharray="4 7"
              strokeLinecap="round"
            />
            <g transform="translate(91 145)">
              <ellipse cy="9" rx="30" ry="13" fill="#183A96" />
              <ellipse rx="30" ry="13" fill={`url(#${blue})`} stroke="#8CA6FF" strokeWidth="2" />
              <path d="m-8-3 7 6 11-11" stroke="#FFFBEF" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="translate(183 95)">
              <ellipse cy="10" rx="32" ry="15" fill="#9EAD46" />
              <ellipse rx="32" ry="15" fill={`url(#${lime})`} stroke="#F5FFD3" strokeWidth="2" />
              <circle cy="-3" r="6" fill="#17326D" />
            </g>
            <g className="arcade-art-float">
              <g transform="translate(260 47)">
                <ellipse cy="12" rx="36" ry="17" fill="#D17650" />
                <ellipse cy="3" rx="36" ry="17" fill={`url(#${pink})`} stroke="#FFD8BD" strokeWidth="2" />
                <path d="M-6 2v-40" stroke="#17326D" strokeWidth="4" strokeLinecap="round" />
                <path d="M-4-37h33l-9 12 9 11H-4Z" fill="#3157EF" />
                <path d="M4-30h7m-7 8h12" stroke="#EDF4FF" strokeWidth="2" />
              </g>
            </g>
            <path className="arcade-art-spark" d="m91 53 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#EF8F6F" />
          </>
        )}
      </svg>
    </div>
  );
}
