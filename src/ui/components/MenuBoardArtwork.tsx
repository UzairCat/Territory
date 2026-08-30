interface MenuBoardArtworkProps {
  readonly compact?: boolean;
}

type MenuTileKind = 'FOREST' | 'GRAIN' | 'PASTURE' | 'BRICK' | 'ORE';

interface Point {
  readonly x: number;
  readonly y: number;
}

interface MenuTile {
  readonly q: number;
  readonly r: number;
  readonly kind: MenuTileKind;
  readonly number: number;
}

interface RenderMenuTile extends MenuTile {
  readonly center: Point;
  readonly corners: readonly Point[];
}

const HEX_SIZE = 64;
const BOARD_CENTER = { x: 310, y: 220 } as const;
const CORNER_ANGLES = [-90, -30, 30, 90, 150, 210] as const;

const MENU_TILES: readonly MenuTile[] = [
  { q: 0, r: -1, kind: 'FOREST', number: 10 },
  { q: 1, r: -1, kind: 'GRAIN', number: 8 },
  { q: -1, r: 0, kind: 'PASTURE', number: 11 },
  { q: 0, r: 0, kind: 'FOREST', number: 6 },
  { q: 1, r: 0, kind: 'PASTURE', number: 4 },
  { q: -1, r: 1, kind: 'BRICK', number: 5 },
  { q: 0, r: 1, kind: 'ORE', number: 9 },
] as const;

function tileCenter(q: number, r: number): Point {
  return {
    x: BOARD_CENTER.x + Math.sqrt(3) * HEX_SIZE * (q + r / 2),
    y: BOARD_CENTER.y + 1.5 * HEX_SIZE * r,
  };
}

function tileCorners(center: Point, scale = 1): readonly Point[] {
  return CORNER_ANGLES.map((angle) => {
    const radians = (angle * Math.PI) / 180;
    return {
      x: center.x + Math.cos(radians) * HEX_SIZE * scale,
      y: center.y + Math.sin(radians) * HEX_SIZE * scale,
    };
  });
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
}

function edgeKey(first: Point, second: Point): string {
  const keys = [pointKey(first), pointKey(second)].sort();
  return keys.join('|');
}

function polygonPoints(points: readonly Point[]): string {
  return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
}

const RENDER_TILES: readonly RenderMenuTile[] = MENU_TILES.map((tile) => {
  const center = tileCenter(tile.q, tile.r);
  return { ...tile, center, corners: tileCorners(center) };
});

const BOUNDARY_EDGES: readonly { readonly first: Point; readonly second: Point }[] = (() => {
  const edges = new Map<
    string,
    { readonly first: Point; readonly second: Point; readonly count: number }
  >();
  for (const tile of RENDER_TILES) {
    tile.corners.forEach((first, index) => {
      const second = tile.corners[(index + 1) % tile.corners.length]!;
      const key = edgeKey(first, second);
      const existing = edges.get(key);
      edges.set(key, { first, second, count: (existing?.count ?? 0) + 1 });
    });
  }
  return [...edges.values()].filter((edge) => edge.count === 1);
})();

function PineTree({ x, y, scale = 1 }: Point & { readonly scale?: number }) {
  return (
    <g className="menu-map-pine" transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-2" y="2" width="4" height="14" rx="1" />
      <path d="M0-22-12 1h24ZM0-15-15 9h30Z" />
      <path className="menu-map-pine__light" d="m-1-14-7 15 9-3Z" />
    </g>
  );
}

function WheatStalk({ x, y, scale = 1 }: Point & { readonly scale?: number }) {
  return (
    <g className="menu-map-wheat" transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 15V-13M0 4l-7-6M0-2l7-6M0-8l-6-5M0-8l6-6" />
      <ellipse cx="-4" cy="-4" rx="4" ry="2" transform="rotate(34 -4 -4)" />
      <ellipse cx="4" cy="-9" rx="4" ry="2" transform="rotate(-34 4 -9)" />
      <ellipse cx="-3" cy="-12" rx="3.5" ry="1.8" transform="rotate(34 -3 -12)" />
      <ellipse cx="3" cy="-15" rx="3.5" ry="1.8" transform="rotate(-34 3 -15)" />
    </g>
  );
}

function GrassCluster({ x, y, scale = 1 }: Point & { readonly scale?: number }) {
  return (
    <path
      className="menu-map-grass"
      d="M0 6 0-5M0 6-6-2M0 6 7-1"
      transform={`translate(${x} ${y}) scale(${scale})`}
    />
  );
}

function TileMark({ kind }: { readonly kind: MenuTileKind }) {
  if (kind === 'FOREST') {
    return (
      <g className="menu-map-mark menu-map-mark--forest">
        <ellipse cx="0" cy="-12" rx="43" ry="24" />
        <PineTree x={-27} y={-14} scale={0.72} />
        <PineTree x={25} y={-15} scale={0.78} />
        <PineTree x={0} y={-27} scale={1.02} />
        <GrassCluster x={-39} y={18} scale={0.72} />
        <GrassCluster x={38} y={16} scale={0.66} />
      </g>
    );
  }
  if (kind === 'GRAIN') {
    return (
      <g className="menu-map-mark menu-map-mark--grain">
        <path className="menu-map-field-rows" d="M-48-16 48-23M-50-5 50-12M-50 7 50 0" />
        <WheatStalk x={-29} y={-18} scale={0.8} />
        <WheatStalk x={-10} y={-27} scale={0.95} />
        <WheatStalk x={13} y={-26} scale={0.9} />
        <WheatStalk x={33} y={-17} scale={0.74} />
      </g>
    );
  }
  if (kind === 'PASTURE') {
    return (
      <g className="menu-map-mark menu-map-mark--pasture">
        <ellipse className="menu-map-meadow" cx="-13" cy="-10" rx="38" ry="24" />
        <g className="menu-map-sheep" transform="translate(0 -20)">
          <circle cx="-10" cy="0" r="9" />
          <circle cx="0" cy="-3" r="11" />
          <circle cx="10" cy="0" r="9" />
          <circle className="menu-map-sheep__head" cx="19" cy="2" r="6" />
          <circle className="menu-map-sheep__eye" cx="21" cy="0" r="1.2" />
          <path className="menu-map-sheep__legs" d="M-7 7v10M8 7v10" />
        </g>
        <GrassCluster x={-40} y={19} scale={0.78} />
        <GrassCluster x={36} y={18} scale={0.72} />
      </g>
    );
  }
  if (kind === 'BRICK') {
    return (
      <g className="menu-map-mark menu-map-mark--brick">
        <path className="menu-map-hill menu-map-hill--back" d="m-49 5 23-31L-3 5Z" />
        <path className="menu-map-hill" d="M-18 5 12-32 47 5Z" />
        <path className="menu-map-hill__light" d="m2-15 10-17 13 18-10-5-6 8Z" />
        <g className="menu-map-bricks" transform="translate(0 -22)">
          <rect x="-31" y="-13" width="62" height="34" rx="4" />
          <path d="M-31-5h62M-31 4h62M-31 13h62M-16-13v8M12-13v8M-23-5v9M5-5v9M-14 4v9M15 4v9M-23 13v8M5 13v8" />
        </g>
      </g>
    );
  }
  return (
    <g className="menu-map-mark menu-map-mark--ore">
      <path className="menu-map-mountain menu-map-mountain--back" d="m-49 9 29-39L7 9Z" />
      <path className="menu-map-mountain" d="M-35 10 5-40 46 10Z" />
      <path className="menu-map-snow" d="M-10-22 5-40l14 18-10-6-7 9Z" />
      <path className="menu-map-snow menu-map-snow--back" d="m-31-15 11-15 10 15-10-5Z" />
      <path className="menu-map-rock" d="m25 20 8-15 11 16ZM-42 21l7-12 10 12Z" />
    </g>
  );
}

function NumberToken({ number }: { readonly number: number }) {
  const probability = 6 - Math.abs(7 - number);
  const dotSpacing = 5.5;
  const dotStart = -((probability - 1) * dotSpacing) / 2;
  const highProbability = number === 6 || number === 8;
  return (
    <g className={`menu-map-number${highProbability ? ' is-hot' : ''}`}>
      <rect className="menu-map-number__shadow" x="-18" y="1" width="39" height="44" rx="7" />
      <rect className="menu-map-number__token" x="-20" y="-3" width="39" height="44" rx="7" />
      <rect className="menu-map-number__inset" x="-16" y="1" width="31" height="36" rx="5" />
      <text x="-0.5" y="19" textAnchor="middle">
        {number}
      </text>
      <g className="menu-map-number__dots">
        {Array.from({ length: probability }, (_, index) => (
          <circle key={index} cx={dotStart + index * dotSpacing} cy="31" r="2.05" />
        ))}
      </g>
    </g>
  );
}

function CoastLines({ className }: { readonly className: string }) {
  return (
    <g className={className}>
      {BOUNDARY_EDGES.map((edge) => (
        <line
          key={edgeKey(edge.first, edge.second)}
          x1={edge.first.x}
          y1={edge.first.y}
          x2={edge.second.x}
          y2={edge.second.y}
        />
      ))}
    </g>
  );
}

export function MenuBoardArtwork({ compact = false }: MenuBoardArtworkProps) {
  return (
    <div className={`menu-board-art${compact ? ' menu-board-art--compact' : ''}`}>
      <svg viewBox="0 0 620 445" aria-hidden="true" focusable="false">
        <defs>
          <filter id="menu-map-shadow" x="-30%" y="-30%" width="160%" height="190%">
            <feDropShadow dx="0" dy="10" stdDeviation="9" floodColor="#00131d" floodOpacity=".6" />
          </filter>
          <filter id="menu-piece-shadow" x="-60%" y="-60%" width="220%" height="240%">
            <feDropShadow
              dx="2"
              dy="6"
              stdDeviation="3.5"
              floodColor="#001018"
              floodOpacity=".72"
            />
          </filter>
        </defs>

        <g className="menu-map-water-details">
          <path d="M62 340c32-10 58-8 84 2M468 92c34-9 59-7 88 4M463 390c27-7 48-6 72 2" />
        </g>

        <g filter="url(#menu-map-shadow)">
          <CoastLines className="menu-map-coast menu-map-coast--water" />
          <CoastLines className="menu-map-coast menu-map-coast--foam" />
          <CoastLines className="menu-map-coast menu-map-coast--sand" />

          <g className="menu-map-tiles">
            {RENDER_TILES.map((tile) => (
              <g
                key={`${tile.q}-${tile.r}`}
                className={`menu-map-tile menu-map-tile--${tile.kind.toLocaleLowerCase()}`}
                transform={`translate(${tile.center.x} ${tile.center.y})`}
              >
                <polygon
                  className="menu-map-tile__shadow"
                  points={polygonPoints(tileCorners({ x: 3, y: 5 }))}
                />
                <polygon
                  className="menu-map-tile__surface"
                  points={polygonPoints(tileCorners({ x: 0, y: 0 }))}
                />
                <polygon
                  className="menu-map-tile__inset"
                  points={polygonPoints(tileCorners({ x: 0, y: 0 }, 0.91))}
                />
                <TileMark kind={tile.kind} />
                <NumberToken number={tile.number} />
              </g>
            ))}
          </g>
        </g>

        <g className="menu-map-docks" filter="url(#menu-piece-shadow)">
          <path d="M143.72 252 118 294M199.15 284 130 304" />
          <path
            className="menu-map-dock-planks"
            d="m137 263-8-5m3 14-8-5m-4 14-8-5m65 13-4-8m-8 13-4-8m-9 13-4-8"
          />
        </g>

        <g className="menu-map-roads" filter="url(#menu-piece-shadow)">
          <g className="menu-map-road menu-map-road--amber">
            <path d="M143.72 188v64M143.72 252l55.43 32M199.15 284l55.43-32" />
          </g>
          <g className="menu-map-road menu-map-road--blue">
            <path d="m365.43 380 55.42-32M420.85 348v-64M420.85 284l55.43-32" />
          </g>
        </g>

        <g
          className="menu-map-house"
          transform="translate(143.72 188)"
          filter="url(#menu-piece-shadow)"
        >
          <ellipse className="menu-map-piece-shadow" cx="2" cy="12" rx="18" ry="6" />
          <path className="menu-map-house__front" d="M-11-3h21v16h-21Z" />
          <path className="menu-map-house__side" d="m10-3 5 3v11l-5 2Z" />
          <path className="menu-map-house__roof" d="m-15-3 15-16L15-3 9-1 0-12-9-1Z" />
          <rect className="menu-map-house__chimney" x="6" y="-18" width="5" height="9" />
          <rect className="menu-map-house__door" x="-4" y="3" width="7" height="10" rx="1.5" />
          <rect className="menu-map-house__window" x="5" y="2" width="4" height="4" />
        </g>

        <g
          className="menu-map-city"
          transform="translate(476.28 252)"
          filter="url(#menu-piece-shadow)"
        >
          <ellipse className="menu-map-piece-shadow" cx="2" cy="15" rx="28" ry="7" />
          <path className="menu-map-city__wing" d="M-24-2h18v18h-18ZM7-8h19v24H7Z" />
          <path className="menu-map-city__tower" d="M-8-16H9v32H-8Z" />
          <path
            className="menu-map-city__roof"
            d="m-26-2 11-12L-4-2M5-8l12-13L29-8M-10-16 0-28l11 12"
          />
          <rect className="menu-map-city__door" x="-4" y="5" width="8" height="11" />
          <g className="menu-map-city__windows">
            <rect x="-20" y="3" width="4" height="4" />
            <rect x="12" y="-2" width="4" height="4" />
            <rect x="19" y="5" width="4" height="4" />
            <rect x="-5" y="-10" width="4" height="4" />
            <rect x="2" y="-10" width="4" height="4" />
          </g>
        </g>

        <g
          className="menu-map-knight"
          transform="translate(420.85 156)"
          filter="url(#menu-piece-shadow)"
        >
          <ellipse className="menu-map-piece-shadow" cy="15" rx="20" ry="6" />
          <path className="menu-map-knight__sword" d="m-15 9 27-34M-18 5l8 7" />
          <path className="menu-map-knight__shield" d="M-13-10h26L11 8 0 19-11 8Z" />
          <path className="menu-map-knight__shade" d="M0-7h10L8 6 0 14Z" />
          <path className="menu-map-knight__helmet" d="M-10-10a10 10 0 0 1 20 0v6h-20Z" />
          <path className="menu-map-knight__crest" d="m-7-16 7-9 8 9-5 3h-7Z" />
          <path className="menu-map-knight__insignia" d="m-7 0 7 8 7-8" />
          <g className="menu-map-knight__rank">
            <path d="m-4 9 4 4 4-4-4-4Z" />
            <path d="m3 9 4 4 4-4-4-4Z" />
          </g>
        </g>

        <g
          className="menu-map-robber"
          transform="translate(332 222)"
          filter="url(#menu-piece-shadow)"
        >
          <ellipse className="menu-map-piece-shadow" cy="29" rx="22" ry="7" />
          <path className="menu-map-robber__body" d="M-13-10h26l7 37h-40Z" />
          <path className="menu-map-robber__stripes" d="M-15-3h30M-17 8h34M-18 19h36" />
          <rect className="menu-map-robber__neck" x="-5" y="-17" width="10" height="8" rx="3" />
          <ellipse className="menu-map-robber__head" cy="-28" rx="14" ry="16" />
          <ellipse className="menu-map-robber__shine" cx="-4" cy="-33" rx="5" ry="7" />
        </g>

        <g
          className="menu-map-ship"
          transform="translate(104 318)"
          filter="url(#menu-piece-shadow)"
        >
          <ellipse className="menu-map-ship__water" cy="19" rx="23" ry="6" />
          <path className="menu-map-ship__hull-shadow" d="M-21 8h42l-7 12h-27Z" />
          <path className="menu-map-ship__hull" d="M-20 5h40l-7 12h-25Z" />
          <path className="menu-map-ship__deck" d="M-14 10h28" />
          <path className="menu-map-ship__mast" d="M0-31V8" />
          <path className="menu-map-ship__sail" d="M-2-27V1l-17-2Z" />
          <path className="menu-map-ship__sail menu-map-ship__sail--right" d="M3-22V1h15Z" />
          <path className="menu-map-ship__flag" d="M1-32 13-29 1-25Z" />
          <g className="menu-map-port-ratio" transform="translate(-22 39)">
            <rect x="-18" y="-9" width="36" height="18" rx="7" />
            <text y="4" textAnchor="middle">
              3:1
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
