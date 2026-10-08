// Realistic turntable tone arm drawn in SVG.
// The arm is drawn hanging straight down from the pivot and then tilted so the stylus lands on the
// outer grooves of the record. Lifting it off ("rest") is a CSS rotation of the .arm-swing group.
export default function Tonearm({ on }) {
  return (
    <div className={'tonearm' + (on ? ' on' : '')}>
      <svg viewBox="0 0 200 400" aria-hidden="true">
        <defs>
          <linearGradient id="ta-chrome" x1="0" x2="1">
            <stop offset="0" stopColor="#6d6d6d" />
            <stop offset=".35" stopColor="#f4f4f4" />
            <stop offset=".55" stopColor="#bdbdbd" />
            <stop offset="1" stopColor="#4a4a4a" />
          </linearGradient>
          <linearGradient id="ta-weight" x1="0" x2="1">
            <stop offset="0" stopColor="#2a2a2a" />
            <stop offset=".4" stopColor="#8a8a8a" />
            <stop offset=".6" stopColor="#5a5a5a" />
            <stop offset="1" stopColor="#1c1c1c" />
          </linearGradient>
          <linearGradient id="ta-shell" x1="0" x2="1">
            <stop offset="0" stopColor="#1b1b1b" />
            <stop offset=".5" stopColor="#3c3c3c" />
            <stop offset="1" stopColor="#141414" />
          </linearGradient>
          <radialGradient id="ta-base" cx=".4" cy=".35" r=".7">
            <stop offset="0" stopColor="#3a3a3a" />
            <stop offset="1" stopColor="#0e0e0e" />
          </radialGradient>
          <radialGradient id="ta-bearing" cx=".35" cy=".3" r=".75">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset=".45" stopColor="#b5b5b5" />
            <stop offset="1" stopColor="#3d3d3d" />
          </radialGradient>
        </defs>

        {/* arm rest post (where the stylus parks when lifted) */}
        <g className="arm-rest">
          <rect x="176" y="356" width="14" height="34" rx="3" fill="url(#ta-weight)" />
          <path d="M172 358 h22 v6 a4 4 0 0 1 -4 4 h-14 a4 4 0 0 1 -4 -4z" fill="#111" />
        </g>

        {/* base plate */}
        <circle cx="150" cy="50" r="38" fill="url(#ta-base)" stroke="#000" strokeWidth="2" />
        <circle cx="150" cy="50" r="31" fill="none" stroke="#ffffff14" strokeWidth="1.5" />

        <g className="arm-swing">
          <g transform="rotate(12.3 150 50)">
            {/* counterweight behind the pivot */}
            <rect x="133" y="0" width="34" height="36" rx="5" fill="url(#ta-weight)" />
            {[6, 12, 18, 24, 30].map(y => <line key={y} x1="134" x2="166" y1={y} y2={y} stroke="#00000066" strokeWidth="1" />)}
            <rect x="146" y="30" width="8" height="18" fill="url(#ta-chrome)" />

            {/* tube */}
            <rect x="145.5" y="44" width="9" height="266" rx="4.5" fill="url(#ta-chrome)" />
            <rect x="147.5" y="50" width="1.6" height="254" rx=".8" fill="#ffffffb0" />

            {/* collar joining tube and headshell */}
            <rect x="142" y="302" width="16" height="16" rx="3" fill="url(#ta-weight)" />

            {/* headshell, offset like a real one */}
            <g transform="rotate(-20 150 318)">
              <path d="M138 318 h24 l3 58 a4 4 0 0 1 -4 4 h-22 a4 4 0 0 1 -4 -4z" fill="url(#ta-shell)" stroke="#000" strokeWidth="1" />
              {/* finger lift */}
              <path d="M162 330 q14 -2 20 -10" fill="none" stroke="url(#ta-chrome)" strokeWidth="4" strokeLinecap="round" />
              {/* screws */}
              <circle cx="144" cy="330" r="2" fill="#9a9a9a" />
              <circle cx="156" cy="330" r="2" fill="#9a9a9a" />
              {/* cartridge */}
              <rect x="140" y="342" width="20" height="30" rx="2" fill="#121212" stroke="#000" />
              <rect x="140" y="342" width="20" height="5" fill="#1ed760" opacity=".85" />
              <rect x="144" y="364" width="12" height="6" rx="1" fill="#2a2a2a" />
              {/* stylus */}
              <path d="M150 370 l1 16 l-2 0z" fill="#d8d8d8" />
              <circle cx="150" cy="386.5" r="1.4" fill="#fff" />
            </g>
          </g>
        </g>

        {/* bearing on top of the arm */}
        <circle cx="150" cy="50" r="16" fill="url(#ta-bearing)" stroke="#000" strokeWidth="1.5" />
        <circle cx="150" cy="50" r="5" fill="#2b2b2b" />
        <circle cx="148" cy="48" r="1.6" fill="#ffffffcc" />
      </svg>
    </div>
  )
}
