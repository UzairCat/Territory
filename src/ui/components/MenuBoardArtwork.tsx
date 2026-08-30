interface MenuBoardArtworkProps {
  readonly compact?: boolean;
}

type MenuTileKind = 'FOREST' | 'GRAIN' | 'PASTURE' | 'BRICK' | 'ORE';

interface MenuTile {
  readonly x: number;
  readonly y: number;
  readonly kind: MenuTileKind;
  readonly number: number;
}

const MENU_TILES: readonly MenuTile[] = [
  { x: 208, y: 157, kind: 'FOREST', number: 10 },
  { x: 310, y: 98, kind: 'GRAIN', number: 8 },
  { x: 412, y: 157, kind: 'PASTURE', number: 4 },
  { x: 208, y: 275, kind: 'PASTURE', number: 11 },
  { x: 310, y: 216, kind: 'FOREST', number: 6 },
  { x: 412, y: 275, kind: 'ORE', number: 9 },
  { x: 310, y: 334, kind: 'BRICK', number: 5 },
] as const;

function TileMark({ kind }: { readonly kind: MenuTileKind }) {
  if (kind === 'FOREST') {
    return (
      <g className="menu-map-mark menu-map-mark--forest">
        <path d="M0 -37 22 -7H11l18 24H8v20H-8V17h-21l18-24h-11Z" />
        <path d="M-20 21h40" />
      </g>
    );
  }
  if (kind === 'GRAIN') {
    return (
      <g className="menu-map-mark menu-map-mark--grain">
        <path d="M0 31V-34M0-22l-14-10M0-10 16-12M0 3-16-11M0 16l16-12" />
        <path d="M-14-32c8 0 14 4 14 10-8 0-14-4-14-10ZM16-22C8-22 1-18 0-10c9 0 15-4 16-12ZM-16-8C-8-8-1-3 0 3c-9 0-15-4-16-11ZM16 4C8 4 1 9 0 16c9 0 15-4 16-12Z" />
      </g>
    );
  }
  if (kind === 'PASTURE') {
    return (
      <g className="menu-map-mark menu-map-mark--pasture">
        <ellipse cx="-5" cy="-6" rx="23" ry="16" />
        <circle cx="20" cy="-5" r="10" />
        <path d="M-18 6v22M5 6v22M24 2l8 8M25-10l8-6" />
      </g>
    );
  }
  if (kind === 'BRICK') {
    return (
      <g className="menu-map-mark menu-map-mark--brick">
        <rect x="-31" y="-27" width="62" height="49" rx="4" />
        <path d="M-31-10h62M-31 7h62M-11-27v17M15-27v17M-20-10V7M9-10V7M-9 7v15M19 7v15" />
      </g>
    );
  }
  return (
    <g className="menu-map-mark menu-map-mark--ore">
      <path d="m-31 18 9-28 18-13 20 6 15 27-17 17-25 4Z" />
      <circle cx="-13" cy="-3" r="8" />
      <circle cx="8" cy="3" r="11" />
      <circle cx="16" cy="-12" r="6" />
    </g>
  );
}

export function MenuBoardArtwork({ compact = false }: MenuBoardArtworkProps) {
  return (
    <div className={`menu-board-art${compact ? ' menu-board-art--compact' : ''}`}>
      <svg viewBox="0 0 620 445" aria-hidden="true" focusable="false">
        <defs>
          <filter id="menu-map-shadow" x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow
              dx="0"
              dy="12"
              stdDeviation="10"
              floodColor="#001b29"
              floodOpacity=".52"
            />
          </filter>
          <filter id="menu-piece-shadow" x="-60%" y="-60%" width="220%" height="240%">
            <feDropShadow dx="0" dy="6" stdDeviation="4" floodColor="#001018" floodOpacity=".7" />
          </filter>
          <linearGradient id="menu-water-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#70c5d0" stopOpacity=".24" />
            <stop offset=".54" stopColor="#175c76" stopOpacity=".16" />
            <stop offset="1" stopColor="#061f2c" stopOpacity="0" />
          </linearGradient>
        </defs>

        <ellipse className="menu-map-water-ring" cx="310" cy="225" rx="268" ry="189" />
        <ellipse cx="310" cy="225" rx="244" ry="168" fill="url(#menu-water-glow)" />

        <g className="menu-map-tiles" filter="url(#menu-map-shadow)">
          {MENU_TILES.map((tile) => (
            <g
              key={`${tile.x}-${tile.y}`}
              className={`menu-map-tile menu-map-tile--${tile.kind.toLocaleLowerCase()}`}
              transform={`translate(${tile.x} ${tile.y})`}
            >
              <polygon points="0,-57 50,-29 50,29 0,57 -50,29 -50,-29" />
              <polygon
                className="menu-map-tile__inset"
                points="0,-50 43,-25 43,25 0,50 -43,25 -43,-25"
              />
              <TileMark kind={tile.kind} />
              <g
                className={`menu-map-number${tile.number === 6 || tile.number === 8 ? ' is-hot' : ''}`}
              >
                <rect x="-17" y="13" width="34" height="28" rx="7" />
                <text x="0" y="34" textAnchor="middle">
                  {tile.number}
                </text>
              </g>
            </g>
          ))}
        </g>

        <g className="menu-map-roads" filter="url(#menu-piece-shadow)">
          <path d="m163 248 45 27" />
          <path d="m208 275 51 29" />
          <path d="m361 305 51-30" />
          <path d="m412 275 46 26" />
        </g>

        <g
          className="menu-map-house"
          transform="translate(155 232)"
          filter="url(#menu-piece-shadow)"
        >
          <path d="m-24 0 24-22L24 0v27h-48Z" />
          <path className="menu-map-house__roof" d="M-29 2 0-27 29 2 22 8 0-13-22 8Z" />
          <rect className="menu-map-house__door" x="-5" y="11" width="10" height="16" rx="2" />
        </g>

        <g
          className="menu-map-city"
          transform="translate(462 304)"
          filter="url(#menu-piece-shadow)"
        >
          <path d="M-28-8h18v-15H9v15h19v37h-56Z" />
          <path className="menu-map-city__roof" d="m-33-8 14-15 9 9 9-18L14-14l8-9L33-8Z" />
          <rect className="menu-map-city__door" x="-6" y="10" width="12" height="19" rx="2" />
        </g>

        <g
          className="menu-map-knight"
          transform="translate(465 145)"
          filter="url(#menu-piece-shadow)"
        >
          <path d="M0-30c14 8 27 9 27 9v20c0 22-13 35-27 43C-14 34-27 21-27-1v-20s13-1 27-9Z" />
          <path className="menu-map-knight__line" d="M0-18v45M-16-3h32" />
          <circle cx="0" cy="-10" r="4" />
        </g>

        <g
          className="menu-map-robber"
          transform="translate(307 206)"
          filter="url(#menu-piece-shadow)"
        >
          <circle cy="-25" r="12" />
          <path d="M-17 28c0-28 6-42 17-42s17 14 17 42Z" />
          <path className="menu-map-robber__shine" d="M-5-9c-5 7-7 18-7 29" />
        </g>

        <g
          className="menu-map-ship"
          transform="translate(110 337)"
          filter="url(#menu-piece-shadow)"
        >
          <path className="menu-map-ship__sail" d="M2-45v38h-31Z" />
          <path className="menu-map-ship__sail menu-map-ship__sail--right" d="M7-37v30h25Z" />
          <path className="menu-map-ship__mast" d="M4-50v52" />
          <path className="menu-map-ship__hull" d="M-36-5h73L25 12h-49Z" />
        </g>
      </svg>
      <span className="menu-board-art__seal" aria-hidden="true">
        <i>♛</i>
        <b>Build your realm</b>
      </span>
    </div>
  );
}
