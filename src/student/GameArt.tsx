import { useId } from 'react';
import './game-art.css';

/** Original miniature worlds for the catalogue; all information lives outside the artwork. */
export function GameArt({ kind }: { kind: string }) {
  const id = useId().replace(/:/g, '');
  const blue = `url(#${id}-blue)`;
  const paper = `url(#${id}-paper)`;
  const lime = `url(#${id}-lime)`;
  return (
    <div className={`rr-world-art rr-world-art--${kind}`} aria-hidden="true">
      <svg viewBox="0 0 400 250" fill="none" focusable="false">
        <defs>
          <linearGradient id={`${id}-blue`} x1="80" y1="30" x2="290" y2="250" gradientUnits="userSpaceOnUse">
            <stop stopColor="#668AFF" />
            <stop offset=".45" stopColor="#2455F5" />
            <stop offset="1" stopColor="#12339B" />
          </linearGradient>
          <linearGradient
            id={`${id}-paper`}
            x1="130"
            y1="45"
            x2="260"
            y2="220"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FFFEF7" />
            <stop offset="1" stopColor="#E8E0CA" />
          </linearGradient>
          <linearGradient id={`${id}-lime`} x1="120" y1="45" x2="260" y2="220" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F3FFA7" />
            <stop offset=".5" stopColor="#D9FF58" />
            <stop offset="1" stopColor="#A0CB29" />
          </linearGradient>
        </defs>
        <ellipse cx="202" cy="215" rx="130" ry="16" fill="#142344" opacity=".08" />
        <g className="rr-world-art__confetti" strokeWidth="2">
          <path d="m49 107 8-13 8 13-8 13z" fill="#2455F5" />
          <path d="m335 71 6-10 6 10-6 10z" fill="#D0EA62" />
          <path d="m305 204 7 6 6-7" stroke="#FF9478" strokeLinecap="round" />
          <circle cx="77" cy="181" r="4" stroke="#ADC4FF" />
          <circle cx="307" cy="40" r="3" fill="#FF9478" />
          <path d="M88 61h8m-4-4v8M326 153h10m-5-5v10" stroke="#95B3FF" strokeLinecap="round" />
        </g>
        {kind === 'spy' ? (
          <g className="rr-world-art__lift">
            <g transform="rotate(12 230 140)">
              <rect x="161" y="49" width="142" height="168" rx="17" fill="#DE765D" />
              <rect x="157" y="43" width="142" height="168" rx="17" fill="#FFA286" />
              <path d="M175 64h47m-47 9h35" stroke="#FFE9CE" strokeWidth="4" strokeLinecap="round" />
              <circle cx="270" cy="179" r="14" stroke="#DB6F54" strokeWidth="3" />
              <path d="m260 179 7 7 14-14" stroke="#DB6F54" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g transform="rotate(-9 190 140)">
              <rect x="108" y="47" width="149" height="174" rx="18" fill="#123494" />
              <rect x="108" y="39" width="149" height="174" rx="18" fill={blue} />
              <rect x="120" y="51" width="125" height="149" rx="11" stroke="#AFC4FF" strokeOpacity=".5" />
              <path
                d="M167 41v-7a13 13 0 0 1 26 0v26a7 7 0 0 1-14 0V35"
                stroke="#D9FF58"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path d="m144 153 26-16h29l24 16 8 28h-94z" fill="#0D277B" />
              <path d="m170 139 14 22 14-22" fill="#F2EEDE" />
              <path d="m181 158-4 20h14l-5-20 3-6h-10z" fill="#D9FF58" />
              <ellipse cx="184" cy="116" rx="28" ry="31" fill={paper} />
              <path d="M150 104q34-20 68 0l-8 22-19-4h-14l-19 4z" fill="#102852" />
              <path
                d="M159 111q9-6 18 0m14 0q9-6 18 0"
                stroke="#D9FF58"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path d="m158 91 7-26 18 7 19-7 8 26z" fill="#0D277B" />
              <path d="M147 94q38-12 75 0" stroke="#D9FF58" strokeWidth="8" strokeLinecap="round" />
              <path d="M133 185h22m50 0h27" stroke="#AFC4FF" strokeWidth="3" strokeLinecap="round" />
            </g>
            <g transform="rotate(14 280 150)">
              <rect x="268" y="157" width="13" height="45" rx="6" fill="#183A9D" />
              <circle
                cx="274"
                cy="139"
                r="32"
                fill="#F7FFD1"
                fillOpacity=".88"
                stroke="#B4D539"
                strokeWidth="9"
              />
              <circle cx="274" cy="139" r="23" stroke="#fff" strokeWidth="2" />
              <path d="m264 128 16 17m-13-23 20 21" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
            </g>
          </g>
        ) : kind === 'target' ? (
          <g className="rr-world-art__lift">
            <path d="M87 137v24c0 44 224 44 224 0v-24z" fill="#12389E" />
            <ellipse cx="199" cy="139" rx="112" ry="63" fill={paper} />
            <ellipse cx="199" cy="137" rx="102" ry="54" fill="#F8F5E9" stroke="#fff" strokeWidth="2" />
            <g className="rr-world-art__wheel">
              <path d="m199 137-93-22a104 52 0 0 1 64-28z" fill="#2455F5" />
              <path d="m199 137-29-50a104 52 0 0 1 81 7z" fill="#D9FF58" />
              <path d="m199 137 52-43a104 52 0 0 1 49 38z" fill="#FF9478" />
              <path d="m199 137 101-5a104 52 0 0 1-52 48z" fill="#2455F5" />
              <path d="m199 137 49 43a104 52 0 0 1-82 7z" fill="#D9FF58" />
              <path d="m199 137-33 50a104 52 0 0 1-60-72z" fill="#FF9478" />
              <ellipse cx="199" cy="137" rx="88" ry="45" stroke="#FFFDF4" strokeWidth="1.5" />
              <path
                d="m199 137-93-22m93 22-29-50m29 50 52-43m-52 43 101-5m-101 5 49 43m-49-43-33 50"
                stroke="#FFFDF4"
                strokeWidth="3"
              />
            </g>
            <ellipse cx="199" cy="137" rx="29" ry="16" fill="#102F91" />
            <path d="m188 136 6-48h10l7 48z" fill="#D6AE4D" />
            <ellipse cx="199" cy="88" rx="12" ry="7" fill="#F5DB78" />
            <path d="m199 85-7-12 7-10 7 10z" fill="#D9FF58" />
            <ellipse cx="199" cy="138" rx="13" ry="6" fill="#F5DB78" />
            <path d="m297 117 28-21-5 30z" fill="#D9FF58" stroke="#A5C43B" strokeWidth="2" />
            <g transform="rotate(-14 117 59)">
              <rect x="95" y="34" width="44" height="51" rx="12" fill="#C3D344" />
              <rect x="95" y="29" width="44" height="51" rx="12" fill={lime} />
              <path
                d="m106 64 11-25 11 25m-17-8h13"
                stroke="#2142AC"
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </g>
            <g transform="rotate(14 276 52)">
              <rect x="254" y="31" width="44" height="48" rx="12" fill="#DB7C60" />
              <rect x="254" y="26" width="44" height="48" rx="12" fill="#FFAB91" />
              <path
                d="M286 61V38h-10a8 8 0 0 0 0 16h10m-10 0-8 8"
                stroke="#213C8E"
                strokeWidth="4"
                strokeLinejoin="round"
              />
            </g>
            <path d="M135 204c18-7 37-8 54-4" stroke="#A8BFF9" strokeWidth="3" strokeLinecap="round" />
          </g>
        ) : kind === 'grid' ? (
          <g className="rr-world-art__lift">
            <ellipse cx="201" cy="198" rx="125" ry="29" fill="#BDE7EF" />
            <path d="m85 161 12 32 52 17 70-9 36-33z" fill="#C5BA98" />
            <path d="m85 161 58-25 66 8 46 24-39 23-70 9-49-18z" fill={paper} />
            <path d="m105 176 48 14 58-10 23-13" stroke="#FFFDF4" strokeWidth="3" />
            <path d="m241 178 11 22 48 2 25-14-7-24z" fill="#174DBD" />
            <path d="m241 178 20-23 48 1 16 24-26 13-46-1z" fill="#D9FF58" />
            <path
              d="M137 168c8-18 34-11 45-23s39-8 49 3 29 15 40 18"
              stroke="#2455F5"
              strokeWidth="3"
              strokeDasharray="5 6"
              strokeLinecap="round"
            />
            <circle cx="138" cy="168" r="5" fill="#FF9478" stroke="#FFFDF4" strokeWidth="2" />
            <circle cx="269" cy="165" r="5" fill="#2455F5" stroke="#FFFDF4" strokeWidth="2" />
            <path d="m164 155 10-84h30l12 84q-26 14-52 0" fill={paper} />
            <path d="m174 73-4 32h37l-4-32z" fill="#FF9478" />
            <path d="m170 105-3 29h44l-4-29z" fill="#FFFDF4" />
            <path d="m167 134-3 21q26 14 52 0l-4-21z" fill="#2455F5" />
            <path d="M181 157v-17a9 9 0 0 1 18 0v17" fill="#173990" />
            <path d="M168 73h42l-6-9h-30z" fill="#15378D" />
            <path d="M177 64V45h24v19" fill="#D9FF58" stroke="#15378D" strokeWidth="3" />
            <path d="M189 45v19" stroke="#15378D" strokeWidth="3" />
            <path d="m169 44 20-17 20 17z" fill={blue} />
            <path d="M189 28V18" stroke="#15378D" strokeWidth="3" strokeLinecap="round" />
            <path className="rr-world-art__beam" d="m201 49 112-33v73L201 60z" fill="#D9FF58" opacity=".24" />
            <path
              d="M290 172v-65l31 10-31 11"
              stroke="#2455F5"
              strokeWidth="3"
              strokeLinejoin="round"
              fill="#FF9478"
            />
            <path d="M122 157v-28" stroke="#886F4E" strokeWidth="4" />
            <path d="m122 108-14 29h28z" fill="#739B53" />
            <path d="m122 118-17 29h34z" fill="#8DB964" />
            <path d="M234 143v-25" stroke="#886F4E" strokeWidth="3" />
            <path d="m234 96-12 31h24z" fill="#739B53" />
            <path d="M84 213h27m120 11h31m60-16h18" stroke="#7ABCD2" strokeWidth="2" strokeLinecap="round" />
            <g transform="rotate(-12 92 66)">
              <rect x="70" y="45" width="49" height="31" rx="8" fill="#2455F5" />
              <path
                d="m81 60 7 6 13-13"
                stroke="#D9FF58"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        ) : (
          <g className="rr-world-art__lift">
            <g transform="rotate(13 222 133)">
              <rect x="151" y="54" width="130" height="159" rx="20" fill="#DD7D64" />
              <rect x="151" y="47" width="130" height="159" rx="20" fill="#FFAA8F" />
              <path d="M168 69h33m-33 9h21" stroke="#FFE9DC" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="rotate(-9 175 131)">
              <rect x="109" y="45" width="133" height="166" rx="20" fill="#C9CEAB" />
              <rect x="109" y="38" width="133" height="166" rx="20" fill={paper} />
              <rect x="120" y="49" width="111" height="144" rx="12" stroke="#D5DCC8" />
              <circle cx="176" cy="116" r="39" fill={blue} />
              {kind === 'moon' ? (
                <path d="M184 85a29 29 0 1 0 21 47 28 28 0 0 1-21-47" fill="#D9FF58" />
              ) : kind === 'shield' ? (
                <path d="m176 91 22 9v17c0 18-22 28-22 28s-22-10-22-28v-17z" fill="#D9FF58" />
              ) : kind === 'cards' ? (
                <path
                  d="M176 88c-6 10-24 19-24 31 0 12 15 14 24 4 9 10 24 8 24-4 0-12-18-21-24-31m0 32-8 20h16z"
                  fill="#D9FF58"
                />
              ) : kind === 'eye' ? (
                <>
                  <path d="M145 116q31-38 62 0-31 38-62 0" fill="#D9FF58" />
                  <circle cx="176" cy="116" r="12" fill="#173896" />
                  <circle cx="180" cy="112" r="4" fill="#fff" />
                </>
              ) : kind === 'chat' ? (
                <path d="M152 98h48v32h-26l-15 12v-12h-7z" fill="#D9FF58" />
              ) : kind === 'type' ? (
                <>
                  <path
                    d="M153 96h46m-23 0v41m-10 0h20"
                    stroke="#D9FF58"
                    strokeWidth="6"
                    strokeLinecap="round"
                  />
                  <path d="m147 148 10-4 9 4 10-4 10 4 10-4" stroke="#FFAA8F" strokeWidth="3" />
                </>
              ) : (
                <path
                  d="M165 105c-2-17 25-20 26-3 0 12-15 12-15 23m0 13v1"
                  stroke="#D9FF58"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              )}
              <path d="M148 170h55m-43 9h30" stroke="#ABB6A4" strokeWidth="4" strokeLinecap="round" />
            </g>
            <g transform="rotate(12 277 178)">
              <circle cx="277" cy="178" r="27" fill="#ADC832" />
              <circle cx="277" cy="173" r="27" fill={lime} />
              <path
                d="m265 173 8 8 17-17"
                stroke="#27499D"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          </g>
        )}
      </svg>
    </div>
  );
}
