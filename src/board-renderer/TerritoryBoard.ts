import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Text,
  type FederatedPointerEvent,
} from 'pixi.js';

import type { BoardState, KnightState, KNState } from '../engine/core/game-state';
import { TERRAINS } from '../engine/content/resources';
import type { EdgeId, HexId, ResourceId, VertexId } from '../engine/core/ids';
import {
  createBoardRenderModel,
  type BoardRenderModel,
  type BoardTarget,
  type BoardViewportPoint,
  type RenderHex,
  type RenderPort,
} from './render-model';
import {
  boardRenderProfile,
  type BoardFrameRateLimit,
  type BoardGraphicsQuality,
} from './performance';

export interface TerritoryBoardOptions {
  readonly onInspect: (target: BoardTarget | null, position?: BoardViewportPoint) => void;
  readonly onSelect: (target: BoardTarget, position: BoardViewportPoint) => void;
  readonly selectableTargets: readonly BoardTarget[];
  readonly highlightedHexIds: readonly HexId[];
  readonly emphasizedEdgeIds?: readonly EdgeId[];
  readonly emphasizedVertexIds?: readonly VertexId[];
  readonly inventorSelectionActive?: boolean;
  readonly inventorSelectedHexId?: HexId | null;
  readonly inventorPendingHexId?: HexId | null;
  readonly numberTokenSwap?: readonly [HexId, HexId] | null;
  readonly numberTokenSwapKey?: string | null;
  readonly madnessHighlightedHexIds?: readonly HexId[];
  readonly terrainChange?: {
    readonly hexId: HexId;
    readonly fromResourceId: ResourceId;
  } | null;
  readonly merchantPlacementActive?: boolean;
  readonly animatedTarget: BoardTarget | null;
  readonly robberMove: {
    readonly fromHexId: HexId;
    readonly toHexId: HexId;
  } | null;
  readonly playerColors: Readonly<Record<string, string>>;
  readonly showTargetPulses?: boolean;
  readonly showRobberAttention?: boolean;
  readonly reducedMotion?: boolean;
  readonly graphicsQuality?: BoardGraphicsQuality;
  readonly frameRateLimit?: BoardFrameRateLimit;
  readonly showDebugIds?: boolean;
  readonly knights?: readonly KnightState[];
  readonly merchant?: KNState['merchant'];
}

function flattenedPoints(points: readonly { readonly x: number; readonly y: number }[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function targetKey(target: BoardTarget): string {
  return `${target.kind}:${target.id}`;
}

function seededUnit(seed: string, index: number): number {
  let hash = 2166136261 ^ index;
  for (let characterIndex = 0; characterIndex < seed.length; characterIndex += 1) {
    hash ^= seed.charCodeAt(characterIndex);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4_294_967_295;
}

function insetPolygon(hex: RenderHex, scale: number) {
  return hex.corners.map((corner) => ({
    x: hex.center.x + (corner.x - hex.center.x) * scale,
    y: hex.center.y + (corner.y - hex.center.y) * scale,
  }));
}

function drawGrassCluster(x: number, y: number, scale = 1): Graphics {
  return new Graphics()
    .moveTo(x, y)
    .lineTo(x - 3 * scale, y - 7 * scale)
    .moveTo(x, y)
    .lineTo(x + 1 * scale, y - 9 * scale)
    .moveTo(x, y)
    .lineTo(x + 5 * scale, y - 6 * scale)
    .stroke({ color: '#294f2d', width: 1.4 * scale, alpha: 0.82 });
}

function drawPineTree(x: number, y: number, scale: number): Graphics {
  return new Graphics()
    .roundRect(x - 2 * scale, y + 2 * scale, 4 * scale, 13 * scale, 1.2 * scale)
    .fill({ color: '#5a3822' })
    .poly([x, y - 20 * scale, x - 12 * scale, y + 2 * scale, x + 12 * scale, y + 2 * scale])
    .fill({ color: '#163f29' })
    .stroke({ color: '#0c2d1c', width: 1.2 * scale, alpha: 0.78 })
    .poly([x, y - 13 * scale, x - 15 * scale, y + 9 * scale, x + 15 * scale, y + 9 * scale])
    .fill({ color: '#245f38' })
    .stroke({ color: '#123a24', width: 1.2 * scale, alpha: 0.78 })
    .poly([
      x - 1 * scale,
      y - 12 * scale,
      x - 7 * scale,
      y + 2 * scale,
      x + 2 * scale,
      y - 1 * scale,
    ])
    .fill({ color: '#4c8b4d', alpha: 0.72 });
}

function drawWheatStalk(x: number, y: number, scale: number): Graphics {
  const wheat = new Graphics()
    .moveTo(x, y + 13 * scale)
    .lineTo(x, y - 10 * scale)
    .moveTo(x, y + 4 * scale)
    .lineTo(x - 6 * scale, y - 1 * scale)
    .moveTo(x, y)
    .lineTo(x + 6 * scale, y - 5 * scale)
    .stroke({ color: '#7f5b1e', width: 1.35 * scale, alpha: 0.9 });

  for (let grain = 0; grain < 4; grain += 1) {
    const grainY = y - (4 + grain * 3) * scale;
    wheat
      .ellipse(x - 2.4 * scale, grainY, 2.4 * scale, 1.25 * scale)
      .fill({ color: '#f4d166', alpha: 0.96 })
      .ellipse(x + 2.4 * scale, grainY - 1 * scale, 2.4 * scale, 1.25 * scale)
      .fill({ color: '#e9bd45', alpha: 0.96 });
  }
  return wheat;
}

function createTerrainDetails(hex: RenderHex): Container {
  const details = new Container();
  details.eventMode = 'none';
  const { x, y } = hex.center;
  const seed = hex.target.id;
  const texture = new Graphics();

  for (let index = 0; index < 22; index += 1) {
    const angle = seededUnit(seed, index * 2) * Math.PI * 2;
    const radius = Math.sqrt(seededUnit(seed, index * 2 + 1)) * 48;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius * 0.82;
    const light = index % 3 === 0;
    texture
      .circle(pointX, pointY, light ? 1.6 : 1.1)
      .fill({ color: light ? '#fff4bf' : '#152219', alpha: light ? 0.12 : 0.1 });
  }

  const bevel = new Graphics()
    .poly(flattenedPoints(insetPolygon(hex, 0.91)))
    .stroke({ color: '#fff5c9', width: 1.5, alpha: 0.18 });
  details.addChild(texture, bevel);

  if (hex.terrainName === 'Forest') {
    const ground = new Graphics()
      .ellipse(x, y - 6, 43, 25)
      .fill({ color: '#244f30', alpha: 0.35 })
      .ellipse(x + 9, y - 17, 31, 17)
      .fill({ color: '#4b8244', alpha: 0.22 });
    details.addChild(
      ground,
      drawGrassCluster(x - 37, y + 17, 0.75),
      drawGrassCluster(x + 35, y + 15, 0.7),
      drawPineTree(x - 25, y - 17, 0.72),
      drawPineTree(x + 23, y - 17, 0.8),
      drawPineTree(x - 1, y - 29, 1.03),
    );
  } else if (hex.terrainName === 'Hills') {
    const hills = new Graphics()
      .poly([x - 49, y + 5, x - 27, y - 24, x - 4, y + 5])
      .fill({ color: '#713827', alpha: 0.72 })
      .poly([x - 18, y + 5, x + 12, y - 31, x + 46, y + 5])
      .fill({ color: '#bb633f', alpha: 0.9 })
      .poly([x + 2, y - 14, x + 12, y - 31, x + 24, y - 13])
      .fill({ color: '#e69b62', alpha: 0.78 })
      .moveTo(x - 43, y + 7)
      .lineTo(x + 47, y + 7)
      .stroke({ color: '#e5a56b', width: 2, alpha: 0.46 });
    const brickBacking = new Graphics()
      .roundRect(x - 31, y - 34, 62, 34, 4)
      .fill({ color: '#663523', alpha: 0.72 })
      .stroke({ color: '#e39a67', width: 1.4, alpha: 0.7 });
    const bricks = new Graphics();
    for (let row = 0; row < 4; row += 1) {
      const columns = row % 2 === 0 ? 4 : 3;
      const rowOffset = row % 2 === 0 ? -27 : -20;
      for (let column = 0; column < columns; column += 1) {
        bricks
          .roundRect(x + rowOffset + column * 14, y - 31 + row * 7.3, 13, 6.3, 1.2)
          .fill({ color: (row + column) % 2 === 0 ? '#db744b' : '#c45f3d' })
          .stroke({ color: '#713523', width: 1, alpha: 0.9 })
          .moveTo(x + rowOffset + column * 14 + 2, y - 29 + row * 7.3)
          .lineTo(x + rowOffset + column * 14 + 10, y - 29 + row * 7.3)
          .stroke({ color: '#f2a272', width: 0.8, alpha: 0.55 });
      }
    }
    details.addChild(hills, brickBacking, bricks);
  } else if (hex.terrainName === 'Fields') {
    const rows = new Graphics();
    for (let row = -2; row <= 2; row += 1) {
      rows
        .moveTo(x - 49, y + row * 9 + 5)
        .lineTo(x + 49, y + row * 9 - 3)
        .stroke({ color: row % 2 === 0 ? '#f5cf5c' : '#9c7021', width: 2, alpha: 0.34 });
    }
    details.addChild(
      rows,
      drawWheatStalk(x - 29, y - 20, 0.78),
      drawWheatStalk(x - 10, y - 29, 0.95),
      drawWheatStalk(x + 13, y - 27, 0.88),
      drawWheatStalk(x + 32, y - 18, 0.72),
    );
  } else if (hex.terrainName === 'Pasture') {
    const meadow = new Graphics()
      .ellipse(x - 17, y - 7, 34, 23)
      .fill({ color: '#a5c865', alpha: 0.22 })
      .ellipse(x + 28, y + 4, 24, 17)
      .fill({ color: '#52793d', alpha: 0.18 });
    const sheep = new Graphics()
      .circle(x - 9, y - 24, 8)
      .fill({ color: '#f5f0d9' })
      .circle(x, y - 27, 10)
      .fill({ color: '#fff8e6' })
      .circle(x + 10, y - 24, 8)
      .fill({ color: '#eee9d4' })
      .circle(x + 17, y - 22, 5)
      .fill({ color: '#4a443b' })
      .circle(x + 19, y - 23, 1)
      .fill({ color: '#f7e8b8' })
      .rect(x - 7, y - 18, 2.5, 9)
      .fill({ color: '#514a3e' })
      .rect(x + 7, y - 18, 2.5, 9)
      .fill({ color: '#514a3e' });
    details.addChild(
      meadow,
      drawGrassCluster(x - 38, y + 18, 0.8),
      drawGrassCluster(x - 28, y - 8, 0.55),
      drawGrassCluster(x + 37, y + 18, 0.75),
      sheep,
    );
  } else if (hex.terrainName === 'Mountains') {
    const mountains = new Graphics()
      .poly([x - 48, y + 10, x - 20, y - 29, x + 6, y + 10])
      .fill({ color: '#444d58' })
      .poly([x - 35, y + 11, x + 4, y - 38, x + 44, y + 11])
      .fill({ color: '#687581' })
      .poly([x - 9, y - 22, x + 4, y - 38, x + 17, y - 21, x + 8, y - 26, x + 2, y - 18])
      .fill({ color: '#e8e7dc', alpha: 0.92 })
      .poly([x - 31, y - 13, x - 20, y - 29, x - 10, y - 13, x - 20, y - 18])
      .fill({ color: '#cfd4cf', alpha: 0.84 });
    const rocks = new Graphics()
      .poly([x + 25, y + 15, x + 31, y + 4, x + 40, y + 16])
      .fill({ color: '#889099' })
      .stroke({ color: '#3c4650', width: 1.2 })
      .poly([x - 39, y + 18, x - 34, y + 9, x - 26, y + 18])
      .fill({ color: '#7d858d' })
      .stroke({ color: '#3c4650', width: 1.2 });
    details.addChild(mountains, rocks);
  } else {
    const dunes = new Graphics()
      .moveTo(x - 46, y - 5)
      .lineTo(x - 22, y - 15)
      .lineTo(x + 7, y - 6)
      .lineTo(x + 39, y - 16)
      .stroke({ color: '#eed49a', width: 3, alpha: 0.55 })
      .moveTo(x - 42, y + 18)
      .lineTo(x - 8, y + 10)
      .lineTo(x + 31, y + 19)
      .stroke({ color: '#876f48', width: 2, alpha: 0.36 });
    const cactus = new Graphics()
      .roundRect(x - 26, y - 27, 6, 29, 3)
      .fill({ color: '#557044' })
      .roundRect(x - 32, y - 20, 8, 5, 2)
      .fill({ color: '#557044' })
      .roundRect(x - 33, y - 25, 5, 10, 2)
      .fill({ color: '#557044' })
      .roundRect(x - 22, y - 15, 8, 5, 2)
      .fill({ color: '#557044' })
      .roundRect(x - 17, y - 21, 5, 11, 2)
      .fill({ color: '#557044' });
    const stone = new Graphics()
      .poly([x + 21, y - 2, x + 29, y - 14, x + 38, y - 1])
      .fill({ color: '#8f8166' })
      .stroke({ color: '#685d48', width: 1.2 });
    details.addChild(dunes, cactus, stone);
  }

  return details;
}

function createNumberToken(
  hex: RenderHex,
  selected = false,
  pending = false,
  madness = false,
): Container | null {
  if (hex.numberToken === null) return null;
  const group = new Container();
  group.eventMode = 'none';
  const highProbability = hex.numberToken === 6 || hex.numberToken === 8;
  const centerY = hex.center.y + 20;
  group.position.set(hex.center.x, centerY);
  const selectionGlow =
    selected || pending || madness
      ? new Graphics()
          .roundRect(-25, -28, 49, 54, 10)
          .fill({
            color: madness ? '#9a78e8' : pending ? '#62bde2' : '#f3cb55',
            alpha: 0.22,
          })
          .stroke({
            color: madness ? '#d9c5ff' : pending ? '#bcecff' : '#ffe78b',
            width: 4,
            alpha: 1,
          })
      : null;
  const shadow = new Graphics()
    .roundRect(-18, -20, 39, 44, 7)
    .fill({ color: '#191b17', alpha: 0.42 });
  const token = new Graphics()
    .roundRect(-20, -23, 39, 44, 7)
    .fill({ color: '#fff8df' })
    .stroke({ color: highProbability ? '#b84137' : '#6f684f', width: 2 })
    .roundRect(-16, -19, 31, 36, 5)
    .stroke({ color: '#ffffff', width: 1, alpha: 0.68 });
  const number = new Text({
    text: String(hex.numberToken),
    style: {
      fill: highProbability ? '#b72f2b' : '#252820',
      fontFamily: 'Georgia, serif',
      fontSize: hex.numberToken >= 10 ? 18 : 21,
      fontWeight: '700',
    },
  });
  number.anchor.set(0.5);
  number.position.set(-0.5, -7);

  const probability = 6 - Math.abs(7 - hex.numberToken);
  const dots = new Graphics();
  const spacing = 5.5;
  const startX = -((probability - 1) * spacing) / 2;
  for (let index = 0; index < probability; index += 1) {
    dots
      .circle(startX + index * spacing, 11, 2.05)
      .fill({ color: highProbability ? '#c73a32' : '#4b5045' });
  }
  if (selectionGlow !== null) group.addChild(selectionGlow);
  group.addChild(shadow, token, number, dots);
  return group;
}

function createRobber(hex: RenderHex): Container {
  const robber = new Container();
  robber.eventMode = 'none';
  const artwork = new Container();
  artwork.eventMode = 'none';
  artwork.position.set(hex.center.x + 22, hex.center.y + 2);
  artwork.scale.set(0.78);
  const x = 0;
  const y = 0;
  const shadow = new Graphics().ellipse(x, y + 29, 22, 7).fill({ color: '#07100d', alpha: 0.52 });
  const body = new Graphics()
    .poly([x - 13, y - 10, x + 13, y - 10, x + 20, y + 27, x - 20, y + 27])
    .fill({ color: '#d7d0c2' })
    .stroke({ color: '#111519', width: 2.2 })
    .rect(x - 15, y - 3, 30, 5)
    .fill({ color: '#303338' })
    .rect(x - 17, y + 7, 34, 5)
    .fill({ color: '#303338' })
    .rect(x - 18, y + 17, 36, 5)
    .fill({ color: '#303338' })
    .moveTo(x - 18, y + 25)
    .lineTo(x + 18, y + 25)
    .stroke({ color: '#8d877c', width: 1.2, alpha: 0.72 });
  const head = new Graphics()
    .roundRect(x - 5, y - 17, 10, 8, 3)
    .fill({ color: '#a9a397' })
    .ellipse(x, y - 28, 14, 16)
    .fill({ color: '#bdb6a8' })
    .stroke({ color: '#54534f', width: 2 })
    .ellipse(x - 4, y - 33, 5, 7)
    .fill({ color: '#ddd6c8', alpha: 0.34 });
  artwork.addChild(shadow, body, head);
  robber.addChild(artwork);
  return robber;
}

function createRobberAttentionCue(hex: RenderHex): Container {
  const cue = new Container();
  cue.eventMode = 'none';
  cue.position.set(hex.center.x + 22, hex.center.y + 2);
  const rings = new Graphics()
    .circle(0, 0, 25)
    .stroke({ color: '#fff3bd', width: 3, alpha: 0.92 })
    .circle(0, 0, 31)
    .stroke({ color: '#d6e4de', width: 2, alpha: 0.55 });
  const markers = new Graphics()
    .poly([-8, -40, 8, -40, 0, -29])
    .fill({ color: '#fff3bd', alpha: 0.94 })
    .poly([-8, 40, 8, 40, 0, 29])
    .fill({ color: '#fff3bd', alpha: 0.72 });
  cue.addChild(rings, markers);
  return cue;
}

function tintHexColor(color: string, amount: number): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(color);
  if (match === null) return color;
  const red = Number.parseInt(match[1] ?? '00', 16);
  const green = Number.parseInt(match[2] ?? '00', 16);
  const blue = Number.parseInt(match[3] ?? '00', 16);
  const target = amount < 0 ? 0 : 255;
  const weight = Math.abs(amount);
  const channel = (value: number) =>
    Math.round(value + (target - value) * weight)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

function createBuildingPiece(
  x: number,
  y: number,
  color: string,
  type: 'HOUSE' | 'MANSION',
): Container {
  const piece = new Container();
  piece.eventMode = 'none';
  const dark = tintHexColor(color, -0.38);
  const darker = tintHexColor(color, -0.62);
  const light = tintHexColor(color, 0.28);

  if (type === 'HOUSE') {
    const shadow = new Graphics()
      .ellipse(x + 2, y + 12, 18, 6)
      .fill({ color: '#07100d', alpha: 0.5 });
    const structure = new Graphics()
      .poly([x - 11, y - 3, x + 10, y - 3, x + 10, y + 13, x - 11, y + 13])
      .fill({ color })
      .stroke({ color: '#11140f', width: 2.6 })
      .poly([x + 10, y - 3, x + 15, y, x + 15, y + 11, x + 10, y + 13])
      .fill({ color: dark })
      .stroke({ color: '#11140f', width: 2.2 })
      .poly([x - 15, y - 3, x, y - 19, x + 15, y - 3])
      .fill({ color: light })
      .stroke({ color: '#11140f', width: 2.7 })
      .poly([x, y - 19, x + 15, y - 3, x + 9, y - 1, x, y - 12])
      .fill({ color: dark, alpha: 0.76 })
      .rect(x + 6, y - 18, 5, 9)
      .fill({ color: dark })
      .stroke({ color: '#11140f', width: 1.8 })
      .roundRect(x - 4, y + 3, 7, 10, 1.5)
      .fill({ color: darker })
      .rect(x + 5, y + 2, 4, 4)
      .fill({ color: '#f5e8aa' })
      .stroke({ color: darker, width: 1 });
    const roofHighlight = new Graphics()
      .moveTo(x - 11, y - 4)
      .lineTo(x, y - 15)
      .stroke({ color: '#ffffff', width: 1.2, alpha: 0.4 });
    piece.addChild(shadow, structure, roofHighlight);
    return piece;
  }

  const shadow = new Graphics()
    .ellipse(x + 2, y + 14, 27, 7)
    .fill({ color: '#07100d', alpha: 0.54 });
  const structure = new Graphics()
    .roundRect(x - 23, y - 2, 17, 17, 2)
    .fill({ color: dark })
    .stroke({ color: '#11140f', width: 2.4 })
    .poly([x - 25, y - 2, x - 15, y - 13, x - 4, y - 2])
    .fill({ color: light })
    .stroke({ color: '#11140f', width: 2.4 })
    .roundRect(x + 7, y - 8, 18, 23, 2)
    .fill({ color: dark })
    .stroke({ color: '#11140f', width: 2.4 })
    .poly([x + 5, y - 8, x + 16, y - 20, x + 27, y - 8])
    .fill({ color: light })
    .stroke({ color: '#11140f', width: 2.4 })
    .roundRect(x - 8, y - 16, 17, 31, 2.4)
    .fill({ color })
    .stroke({ color: '#11140f', width: 2.8 })
    .poly([x - 10, y - 16, x, y - 28, x + 11, y - 16])
    .fill({ color: light })
    .stroke({ color: '#11140f', width: 2.7 })
    .rect(x - 4, y + 4, 8, 11)
    .fill({ color: darker });
  const details = new Graphics();
  for (const [windowX, windowY] of [
    [x - 19, y + 3],
    [x + 13, y - 2],
    [x + 19, y + 5],
    [x - 4, y - 10],
    [x + 3, y - 10],
    [x - 4, y - 2],
    [x + 3, y - 2],
  ] as const) {
    details
      .roundRect(windowX, windowY, 4, 4, 0.8)
      .fill({ color: '#f5e8aa' })
      .stroke({ color: darker, width: 0.9 });
  }
  details
    .moveTo(x - 20, y - 3)
    .lineTo(x - 15, y - 9)
    .stroke({ color: '#ffffff', width: 1.1, alpha: 0.38 })
    .moveTo(x + 10, y - 9)
    .lineTo(x + 16, y - 16)
    .stroke({ color: '#ffffff', width: 1.1, alpha: 0.38 })
    .moveTo(x - 6, y - 17)
    .lineTo(x, y - 24)
    .stroke({ color: '#ffffff', width: 1.2, alpha: 0.4 });
  piece.addChild(shadow, structure, details);
  return piece;
}

function createKnightPiece(
  x: number,
  y: number,
  color: string,
  level: 1 | 2 | 3,
  active: boolean,
): Container {
  const piece = new Container();
  piece.eventMode = 'none';
  const dark = tintHexColor(color, -0.52);
  const light = tintHexColor(color, 0.35);
  const rim = active ? '#ffd96b' : '#101511';
  const metal = active ? (level >= 2 ? '#ffe58a' : '#f2c655') : '#aebbb5';
  const halfWidth = level === 1 ? 10 : level === 2 ? 12 : 14;
  const shadow = new Graphics().ellipse(x, y + 13, 18 + level * 2, 5).fill({
    color: '#07100d',
    alpha: 0.52,
  });
  const weapons = new Graphics();
  if (level >= 2) {
    weapons
      .moveTo(x - 14, y + 8)
      .lineTo(x + 10, y - 22)
      .stroke({ color: '#eef1df', width: 3 })
      .moveTo(x - 17, y + 5)
      .lineTo(x - 9, y + 11)
      .stroke({ color: metal, width: 3.5 })
      .circle(x + 11, y - 23, 2.3)
      .fill({ color: metal });
  }
  if (level >= 3) {
    weapons
      .moveTo(x + 15, y + 9)
      .lineTo(x - 10, y - 22)
      .stroke({ color: '#eef1df', width: 3 })
      .moveTo(x + 18, y + 5)
      .lineTo(x + 10, y + 12)
      .stroke({ color: metal, width: 3.5 })
      .circle(x - 11, y - 23, 2.3)
      .fill({ color: metal });
  }
  const shield = new Graphics()
    .poly([
      x - halfWidth,
      y - 10,
      x + halfWidth,
      y - 10,
      x + halfWidth - 2,
      y + 7,
      x,
      y + 16 + level,
      x - halfWidth + 2,
      y + 7,
    ])
    .fill({ color })
    .stroke({ color: rim, width: active ? 3.2 : 2.3 })
    .poly([x, y - 7, x + halfWidth - 3, y - 7, x + halfWidth - 5, y + 5, x, y + 12 + level])
    .fill({ color: active ? '#b98a24' : dark, alpha: active ? 0.62 : 0.72 });
  const helmet = new Graphics()
    .arc(x, y - 10, 8 + level, Math.PI, 0)
    .lineTo(x + 8 + level, y - 5)
    .lineTo(x - 8 - level, y - 5)
    .closePath()
    .fill({ color: light })
    .stroke({ color: rim, width: active ? 2.6 : 1.8 })
    .rect(x - 1.5, y - 16 - level, 3, 11 + level)
    .fill({ color: metal });
  const crest = new Graphics();
  if (level === 2) {
    crest
      .poly([x - 6, y - 17, x, y - 25, x + 7, y - 17, x + 2, y - 14, x - 4, y - 14])
      .fill({ color: metal })
      .stroke({ color: dark, width: 1.2 });
  } else if (level === 3) {
    crest
      .poly([
        x - 10,
        y - 17,
        x - 8,
        y - 27,
        x - 3,
        y - 22,
        x,
        y - 31,
        x + 4,
        y - 22,
        x + 9,
        y - 28,
        x + 11,
        y - 17,
      ])
      .fill({ color: metal })
      .stroke({ color: active ? '#fff2aa' : dark, width: 1.5 });
  }
  const insignia = new Graphics()
    .moveTo(x - 5 - level, y - 1)
    .lineTo(x, y + 5 + level)
    .lineTo(x + 5 + level, y - 1)
    .stroke({ color: active ? '#fff0a4' : light, width: active ? 2.5 : 1.8, alpha: 0.9 });
  const activeRankDetail = new Graphics();
  if (active && level >= 2) {
    activeRankDetail
      .poly([x - halfWidth + 2, y - 8, x - halfWidth + 7, y - 12, x - 2, y - 7, x - 6, y - 2])
      .fill({ color: '#ffe58a', alpha: 0.9 })
      .stroke({ color: '#fff4bd', width: 1.2 })
      .poly([x + halfWidth - 2, y - 8, x + halfWidth - 7, y - 12, x + 2, y - 7, x + 6, y - 2])
      .fill({ color: '#d9a62e', alpha: 0.92 })
      .stroke({ color: '#fff4bd', width: 1.2 })
      .moveTo(x - halfWidth + 3, y + 4)
      .lineTo(x, y + 15 + level)
      .lineTo(x + halfWidth - 3, y + 4)
      .stroke({ color: '#ffe58a', width: level === 3 ? 3.2 : 2.4, alpha: 0.94 });
    if (level === 3) {
      activeRankDetail
        .circle(x - 7, y - 13, 2.2)
        .fill({ color: '#fff3ac' })
        .circle(x + 7, y - 13, 2.2)
        .fill({ color: '#fff3ac' });
    }
  }
  const rank = new Graphics();
  for (let index = 0; index < level; index += 1) {
    rank
      .poly([
        x + (index - (level - 1) / 2) * 6,
        y + 7,
        x + (index - (level - 1) / 2) * 6 + 2.3,
        y + 10,
        x + (index - (level - 1) / 2) * 6,
        y + 13,
        x + (index - (level - 1) / 2) * 6 - 2.3,
        y + 10,
      ])
      .fill({ color: active ? '#fff1a6' : '#f0d783' })
      .stroke({ color: dark, width: 0.7 });
  }
  piece.addChild(shadow, weapons, shield, activeRankDetail, insignia, helmet, crest, rank);
  return piece;
}

function createBuildingEnhancement(
  x: number,
  y: number,
  playerColor: string,
  hasWall: boolean,
  metropolis: string | null | undefined,
): Container | null {
  if ((!hasWall && metropolis === null) || (!hasWall && metropolis === undefined)) return null;
  const enhancement = new Container();
  enhancement.eventMode = 'none';
  if (hasWall) {
    const wallDark = tintHexColor(playerColor, -0.48);
    const wallLight = tintHexColor(playerColor, 0.28);
    const wall = new Graphics()
      .poly([
        x - 31,
        y + 9,
        x - 25,
        y + 9,
        x - 25,
        y + 5,
        x - 17,
        y + 5,
        x - 17,
        y + 10,
        x - 6,
        y + 10,
        x - 6,
        y + 6,
        x + 6,
        y + 6,
        x + 6,
        y + 10,
        x + 17,
        y + 10,
        x + 17,
        y + 5,
        x + 25,
        y + 5,
        x + 25,
        y + 9,
        x + 31,
        y + 9,
        x + 29,
        y + 22,
        x - 29,
        y + 22,
      ])
      .fill({ color: wallLight })
      .stroke({ color: '#202621', width: 2.4 })
      .roundRect(x - 25, y + 13, 50, 6, 1.5)
      .fill({ color: wallDark, alpha: 0.72 })
      .moveTo(x - 24, y + 11)
      .lineTo(x + 24, y + 11)
      .stroke({ color: tintHexColor(playerColor, 0.55), width: 1.3, alpha: 0.72 });
    enhancement.addChild(wall);
  }
  if (metropolis !== null && metropolis !== undefined) {
    const facade = new Graphics();
    const detail = new Graphics();

    if (metropolis === 'SCIENCE') {
      facade
        .roundRect(x - 21, y - 1, 14, 14, 2)
        .fill({ color: '#2b7959' })
        .stroke({ color: '#173d2d', width: 1.8 })
        .roundRect(x + 8, y - 7, 15, 20, 2)
        .fill({ color: '#2b7959' })
        .stroke({ color: '#173d2d', width: 1.8 })
        .roundRect(x - 7, y - 15, 14, 28, 2)
        .fill({ color: '#55ad7c' })
        .stroke({ color: '#173d2d', width: 2 });
      detail
        .circle(x, y - 7, 3.2)
        .fill({ color: '#d7f2d6' })
        .stroke({ color: '#1d5d42', width: 1.3 })
        .moveTo(x, y - 3.8)
        .lineTo(x, y + 7)
        .moveTo(x - 4.8, y + 2)
        .lineTo(x + 4.8, y + 2)
        .stroke({ color: '#d7f2d6', width: 1.35, alpha: 0.9 })
        .circle(x - 4.8, y + 2, 1.35)
        .circle(x + 4.8, y + 2, 1.35)
        .circle(x, y + 7, 1.35)
        .fill({ color: '#e8f8df' });
    } else if (metropolis === 'TRADE') {
      facade
        .roundRect(x - 21, y - 1, 14, 14, 2)
        .fill({ color: '#b68427' })
        .stroke({ color: '#5d4215', width: 1.8 })
        .roundRect(x + 8, y - 7, 15, 20, 2)
        .fill({ color: '#b68427' })
        .stroke({ color: '#5d4215', width: 1.8 })
        .roundRect(x - 7, y - 15, 14, 28, 2)
        .fill({ color: '#dfb74e' })
        .stroke({ color: '#5d4215', width: 2 });
      detail
        .rect(x - 5, y - 12, 3.3, 5)
        .rect(x - 1.65, y - 12, 3.3, 5)
        .rect(x + 1.7, y - 12, 3.3, 5)
        .fill({ color: '#fff0ad' })
        .circle(x, y - 1, 4.4)
        .fill({ color: '#ffe18a' })
        .stroke({ color: '#795619', width: 1.35 })
        .circle(x, y - 1, 1.4)
        .fill({ color: '#a87821' })
        .moveTo(x - 5, y + 6)
        .lineTo(x + 5, y + 6)
        .stroke({ color: '#fff0ad', width: 2 });
    } else {
      facade
        .roundRect(x - 21, y - 1, 14, 14, 1.5)
        .fill({ color: '#416b9b' })
        .stroke({ color: '#1c3555', width: 1.8 })
        .roundRect(x + 8, y - 7, 15, 20, 1.5)
        .fill({ color: '#416b9b' })
        .stroke({ color: '#1c3555', width: 1.8 })
        .roundRect(x - 7, y - 15, 14, 28, 1.5)
        .fill({ color: '#668ebd' })
        .stroke({ color: '#1c3555', width: 2 });
      detail
        .rect(x - 5, y - 12, 2.5, 22)
        .rect(x + 2.5, y - 12, 2.5, 22)
        .fill({ color: '#b9d1e9', alpha: 0.88 })
        .poly([x, y - 8, x + 4.5, y - 5, x + 3.2, y + 2, x, y + 5, x - 3.2, y + 2, x - 4.5, y - 5])
        .fill({ color: '#e3edf4' })
        .stroke({ color: '#294d77', width: 1.2 })
        .moveTo(x, y - 5)
        .lineTo(x, y + 2)
        .stroke({ color: '#416b9b', width: 1.2 });
    }
    enhancement.addChild(facade, detail);
  }
  return enhancement;
}

function createMerchantToken(hex: RenderHex, color: string): Container {
  const token = new Container();
  token.eventMode = 'none';
  token.position.set(hex.center.x - 23, hex.center.y + 2);
  token.scale.set(0.78);
  const dark = tintHexColor(color, -0.55);
  const light = tintHexColor(color, 0.34);
  const shadow = new Graphics().ellipse(0, 29, 22, 7).fill({ color: '#07100d', alpha: 0.5 });
  const staff = new Graphics()
    .moveTo(18, -23)
    .lineTo(20, 28)
    .stroke({ color: '#3f2815', width: 3.4 })
    .moveTo(17, -23)
    .lineTo(22, -28)
    .stroke({ color: '#9d7136', width: 2.2 });
  const boots = new Graphics()
    .roundRect(-14, 21, 11, 8, 3)
    .fill({ color: '#2c2118' })
    .roundRect(3, 21, 11, 8, 3)
    .fill({ color: '#2c2118' });
  const coat = new Graphics()
    .poly([-13, -7, 13, -7, 18, 24, 7, 27, 0, 20, -7, 27, -18, 24])
    .fill({ color })
    .stroke({ color: dark, width: 2.3 })
    .poly([-11, -5, -2, -7, 0, 19, -8, 14])
    .fill({ color: light, alpha: 0.88 })
    .poly([11, -5, 2, -7, 0, 19, 8, 14])
    .fill({ color: dark, alpha: 0.62 })
    .moveTo(0, -6)
    .lineTo(0, 19)
    .stroke({ color: '#f0cf6c', width: 2 })
    .circle(0, 1, 1.4)
    .circle(0, 7, 1.4)
    .circle(0, 13, 1.4)
    .fill({ color: '#ffe88f' });
  const head = new Graphics()
    .roundRect(-7, -18, 14, 14, 5)
    .fill({ color: '#e0b682' })
    .stroke({ color: '#51341f', width: 1.6 })
    .circle(-2.5, -13.5, 1)
    .circle(2.5, -13.5, 1)
    .fill({ color: '#2e2118' })
    .moveTo(-3, -8.8)
    .quadraticCurveTo(0, -6.5, 3, -8.8)
    .stroke({ color: '#6e3f27', width: 1.2 });
  const hat = new Graphics()
    .roundRect(-10, -29, 20, 11, 3)
    .fill({ color: '#8d6230' })
    .stroke({ color: '#3c2818', width: 1.8 })
    .roundRect(-17, -21, 34, 5, 2.5)
    .fill({ color: '#bb8743' })
    .stroke({ color: '#3c2818', width: 1.8 })
    .rect(-9, -22, 18, 3)
    .fill({ color: light });
  const feather = new Graphics()
    .moveTo(7, -26)
    .quadraticCurveTo(19, -38, 22, -30)
    .quadraticCurveTo(17, -24, 8, -22)
    .fill({ color: '#f0c85a' })
    .stroke({ color: '#725018', width: 1.3 })
    .moveTo(9, -23)
    .lineTo(20, -32)
    .stroke({ color: '#7a551c', width: 1 });
  const satchel = new Graphics()
    .moveTo(-8, -1)
    .quadraticCurveTo(-24, 5, -17, 17)
    .stroke({ color: '#4f311a', width: 2.5 })
    .roundRect(-24, 10, 14, 12, 3)
    .fill({ color: '#9a6933' })
    .stroke({ color: '#4f311a', width: 1.8 })
    .circle(-17, 16, 3.2)
    .fill({ color: '#f1cf62' })
    .stroke({ color: '#795817', width: 1 });
  token.addChild(shadow, staff, boots, coat, head, hat, feather, satchel);
  return token;
}

function createMerchantPlacementCue(hex: RenderHex): Container {
  const cue = new Container();
  cue.eventMode = 'none';
  cue.visible = false;
  const centerX = hex.center.x - 23;
  const centerY = hex.center.y + 2;
  const halo = new Graphics()
    .circle(centerX, centerY, 35)
    .fill({ color: '#f1cd60', alpha: 0.2 })
    .stroke({ color: '#ffe89a', width: 4, alpha: 0.92 })
    .ellipse(centerX, centerY + 29, 27, 9)
    .fill({ color: '#14251e', alpha: 0.42 })
    .stroke({ color: '#ffe89a', width: 2.2, alpha: 0.82 });
  const merchant = createMerchantToken(hex, '#dfb84e');
  merchant.alpha = 0.88;
  cue.addChild(halo, merchant);
  return cue;
}

const PORT_RESOURCE_STYLE: Readonly<
  Record<string, { readonly glyph: string; readonly color: string; readonly fontSize: number }>
> = {
  wood: { glyph: '🌲', color: '#2c6a3d', fontSize: 18 },
  brick: { glyph: '🧱', color: '#b85943', fontSize: 18 },
  grain: { glyph: '🌾', color: '#d9a92f', fontSize: 19 },
  livestock: { glyph: '🐑', color: '#7ca64f', fontSize: 18 },
  ore: { glyph: '🪨', color: '#707a87', fontSize: 18 },
};

const PORT_BASE_SCALE = 1.1;
const PORT_HOVER_SCALE = 1.28;

function portRatioOffset(port: RenderPort): { readonly x: number; readonly y: number } {
  const midpoint = {
    x: (port.shoreConnections[0].x + port.shoreConnections[1].x) / 2,
    y: (port.shoreConnections[0].y + port.shoreConnections[1].y) / 2,
  };
  const outwardX = port.position.x - midpoint.x;
  const outwardY = port.position.y - midpoint.y;

  if (outwardY > Math.abs(outwardX) * 0.45) return { x: 0, y: 40 };
  const side = outwardX === 0 ? (port.position.x < 0 ? -1 : 1) : Math.sign(outwardX);
  return { x: side * 44, y: 10 };
}

function createPortShip(port: RenderPort): Container {
  const ship = new Container();
  ship.position.set(port.position.x, port.position.y);
  ship.eventMode = 'none';
  const resourceStyle =
    port.resourceId === null
      ? { glyph: '★', color: '#69518f', fontSize: 17 }
      : (PORT_RESOURCE_STYLE[port.resourceId] ?? {
          glyph: '🪨',
          color: '#707a87',
          fontSize: 18,
        });

  const water = new Graphics()
    .ellipse(0, 18, 23, 6)
    .stroke({ color: '#b9f2ef', width: 2, alpha: 0.58 })
    .ellipse(0, 21, 17, 4)
    .stroke({ color: '#5bc3cf', width: 1.5, alpha: 0.52 });
  const hullShadow = new Graphics()
    .poly([-21, 8, 21, 8, 14, 20, -13, 20])
    .fill({ color: '#1d251f', alpha: 0.5 });
  const hull = new Graphics()
    .poly([-20, 5, 20, 5, 13, 17, -12, 17])
    .fill({ color: '#8a502b' })
    .stroke({ color: '#3d2a1c', width: 2 })
    .moveTo(-14, 10)
    .lineTo(14, 10)
    .stroke({ color: '#d59b55', width: 1.4, alpha: 0.8 });
  const mastAndSails = new Graphics()
    .moveTo(0, -31)
    .lineTo(0, 8)
    .stroke({ color: '#51351f', width: 2.3 })
    .poly([-2, -27, -2, 1, -19, -1])
    .fill({ color: resourceStyle.color })
    .stroke({ color: '#fff0c7', width: 1.4, alpha: 0.92 })
    .poly([3, -22, 3, 1, 18, 1])
    .fill({ color: resourceStyle.color, alpha: 0.78 })
    .stroke({ color: '#fff0c7', width: 1.4, alpha: 0.92 })
    .poly([1, -32, 13, -29, 1, -25])
    .fill({ color: resourceStyle.color });
  const badge = new Graphics()
    .circle(0, 12, 12.5)
    .fill({ color: '#fff8df' })
    .stroke({ color: resourceStyle.color, width: 3.2 });
  const glyph = new Text({
    text: resourceStyle.glyph,
    style: {
      fill: resourceStyle.color,
      fontFamily:
        port.resourceId !== null
          ? 'Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif'
          : 'Georgia, serif',
      fontSize: resourceStyle.fontSize,
      fontWeight: '700',
    },
  });
  glyph.anchor.set(0.5);
  glyph.position.set(0, 11.5);
  const labelOffset = portRatioOffset(port);
  const ratioBackground = new Graphics()
    .roundRect(labelOffset.x - 23, labelOffset.y - 12, 46, 24, 8)
    .fill({ color: '#fff9e5' })
    .stroke({ color: '#30291e', width: 3 })
    .roundRect(labelOffset.x - 21, labelOffset.y - 10, 42, 20, 6)
    .stroke({ color: resourceStyle.color, width: 2 });
  const ratio = new Text({
    text: `${port.tradeRatio}:1`,
    style: {
      fill: '#171b17',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 14.5,
      fontWeight: '900',
    },
  });
  ratio.anchor.set(0.5);
  ratio.position.set(labelOffset.x, labelOffset.y);
  ship.addChild(water, hullShadow, hull, mastAndSails, badge, glyph, ratioBackground, ratio);
  ship.scale.set(PORT_BASE_SCALE);
  return ship;
}

function createPortDocks(port: RenderPort): Graphics {
  const midpoint = {
    x: (port.shoreConnections[0].x + port.shoreConnections[1].x) / 2,
    y: (port.shoreConnections[0].y + port.shoreConnections[1].y) / 2,
  };
  const radialX = port.position.x - midpoint.x;
  const radialY = port.position.y - midpoint.y;
  const radialLength = Math.hypot(radialX, radialY) || 1;
  const radialUnitX = radialX / radialLength;
  const radialUnitY = radialY / radialLength;
  const radialPerpendicularX = -radialUnitY;
  const radialPerpendicularY = radialUnitX;
  const dock = new Graphics();

  for (const shore of port.shoreConnections) {
    const sideProjection =
      (shore.x - midpoint.x) * radialPerpendicularX + (shore.y - midpoint.y) * radialPerpendicularY;
    const side = sideProjection < 0 ? -1 : 1;
    const dockEnd = {
      x: port.position.x - radialUnitX * 16 + radialPerpendicularX * side * 8,
      y: port.position.y - radialUnitY * 16 + radialPerpendicularY * side * 8,
    };
    const deltaX = dockEnd.x - shore.x;
    const deltaY = dockEnd.y - shore.y;
    const length = Math.hypot(deltaX, deltaY) || 1;
    const unitX = deltaX / length;
    const unitY = deltaY / length;
    const perpendicularX = -unitY;
    const perpendicularY = unitX;

    dock
      .moveTo(shore.x, shore.y)
      .lineTo(dockEnd.x, dockEnd.y)
      .stroke({ color: '#31251b', width: 10, alpha: 0.94 })
      .moveTo(shore.x, shore.y)
      .lineTo(dockEnd.x, dockEnd.y)
      .stroke({ color: '#bc7b35', width: 6.5 });

    for (let distance = 5; distance < length - 3; distance += 7) {
      const centerX = shore.x + unitX * distance;
      const centerY = shore.y + unitY * distance;
      dock
        .moveTo(centerX - perpendicularX * 4.5, centerY - perpendicularY * 4.5)
        .lineTo(centerX + perpendicularX * 4.5, centerY + perpendicularY * 4.5)
        .stroke({ color: '#6f431f', width: 1.2, alpha: 0.9 });
    }
  }
  dock.eventMode = 'none';
  return dock;
}

export class TerritoryBoard {
  readonly targets = new Map<string, Graphics>();

  private readonly host: HTMLElement;
  private model: BoardRenderModel;
  private readonly onInspect: TerritoryBoardOptions['onInspect'];
  private readonly onSelect: TerritoryBoardOptions['onSelect'];
  private selectableTargetKeys: ReadonlySet<string>;
  private highlightedHexIds: ReadonlySet<HexId>;
  private emphasizedEdgeIds: ReadonlySet<EdgeId>;
  private emphasizedVertexIds: ReadonlySet<VertexId>;
  private inventorSelectionActive: boolean;
  private inventorSelectedHexId: HexId | null;
  private inventorPendingHexId: HexId | null;
  private numberTokenSwap: readonly [HexId, HexId] | null;
  private numberTokenSwapKey: string | null;
  private numberTokenSwapStartedAt: number | null;
  private completedNumberTokenSwapKey: string | null = null;
  private madnessHighlightedHexIds: ReadonlySet<HexId>;
  private terrainChange: TerritoryBoardOptions['terrainChange'];
  private merchantPlacementActive: boolean;
  private animatedTargetKey: string | null;
  private robberMove: TerritoryBoardOptions['robberMove'];
  private playerColors: TerritoryBoardOptions['playerColors'];
  private showTargetPulses: boolean;
  private robberSelectionActive: boolean;
  private reducedMotion: boolean;
  private readonly graphicsQuality: BoardGraphicsQuality;
  private frameRateLimit: BoardFrameRateLimit;
  // The board moves as one camera-controlled unit. A render group lets Pixi update that
  // transform on the GPU instead of walking every child while the player pans or zooms.
  private readonly world = new Container({ isRenderGroup: true });
  private readonly coastLayer = new Container();
  private readonly hexLayer = new Container();
  private readonly hexControlLayer = new Container();
  private readonly numberTokenLayer = new Container();
  private readonly portLayer = new Container();
  private readonly edgeLayer = new Container();
  private readonly vertexLayer = new Container();
  private readonly roadHighlightLayer = new Container();
  private readonly pieceLayer = new Container();
  private readonly cueLayer = new Container();
  private readonly debugLayer = new Container();
  private readonly hexInteractionLayer = new Container();
  private readonly application = new Application();
  private readonly pulsingTargets: Array<{
    readonly display: Container;
    readonly group: 'controls' | 'numbers';
    readonly phaseOffset: number;
    readonly baseY: number;
    readonly bobDistance: number;
  }> = [];
  private readonly transientTickerCallbacks = new Map<
    () => void,
    'numbers' | 'pieces' | 'terrain'
  >();
  private staticVisualSignature = '';
  private numberVisualSignature = '';
  private pieceVisualSignature = '';
  private controlVisualSignature = '';
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private pageVisible = typeof document === 'undefined' || !document.hidden;
  private viewportVisible = true;
  private mounted = false;
  private destroyed = false;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private worldStart = { x: 0, y: 0 };

  constructor(host: HTMLElement, board: BoardState, options: TerritoryBoardOptions) {
    this.host = host;
    this.model = createBoardRenderModel(board, 70, options.knights ?? [], options.merchant ?? null);
    this.onInspect = options.onInspect;
    this.onSelect = options.onSelect;
    this.selectableTargetKeys = new Set(options.selectableTargets.map(targetKey));
    this.highlightedHexIds = new Set(options.highlightedHexIds);
    this.emphasizedEdgeIds = new Set(options.emphasizedEdgeIds ?? []);
    this.emphasizedVertexIds = new Set(options.emphasizedVertexIds ?? []);
    this.inventorSelectionActive = options.inventorSelectionActive ?? false;
    this.inventorSelectedHexId = options.inventorSelectedHexId ?? null;
    this.inventorPendingHexId = options.inventorPendingHexId ?? null;
    this.numberTokenSwap = options.numberTokenSwap ?? null;
    this.numberTokenSwapKey = options.numberTokenSwapKey ?? this.numberTokenSwap?.join('|') ?? null;
    this.numberTokenSwapStartedAt =
      this.numberTokenSwap === null ? null : globalThis.performance.now();
    this.madnessHighlightedHexIds = new Set(options.madnessHighlightedHexIds ?? []);
    this.terrainChange = options.terrainChange ?? null;
    this.merchantPlacementActive = options.merchantPlacementActive ?? false;
    this.animatedTargetKey =
      options.animatedTarget === null ? null : targetKey(options.animatedTarget);
    this.robberMove = options.robberMove;
    this.playerColors = options.playerColors;
    this.showTargetPulses = options.showTargetPulses ?? true;
    this.robberSelectionActive = options.showRobberAttention ?? false;
    this.reducedMotion = options.reducedMotion ?? false;
    this.graphicsQuality = options.graphicsQuality ?? 'HIGH';
    this.frameRateLimit = options.frameRateLimit ?? 60;
    this.debugLayer.visible = options.showDebugIds ?? false;
    for (const layer of [
      this.coastLayer,
      this.numberTokenLayer,
      this.roadHighlightLayer,
      this.pieceLayer,
      this.cueLayer,
      this.debugLayer,
    ]) {
      layer.eventMode = 'none';
      layer.interactiveChildren = false;
    }
    this.world.addChild(
      this.coastLayer,
      this.hexLayer,
      this.hexControlLayer,
      this.numberTokenLayer,
      this.portLayer,
      this.edgeLayer,
      this.vertexLayer,
      this.roadHighlightLayer,
      this.pieceLayer,
      this.cueLayer,
      this.debugLayer,
      this.hexInteractionLayer,
    );
  }

  async mount(): Promise<void> {
    const profile = boardRenderProfile(this.graphicsQuality);
    await this.application.init({
      antialias: profile.antialias,
      autoDensity: true,
      backgroundAlpha: 0,
      powerPreference: 'high-performance',
      resolution: Math.min(globalThis.devicePixelRatio || 1, profile.maximumResolution),
      resizeTo: this.host,
    });

    if (this.destroyed) {
      this.application.destroy({ removeView: true }, { children: true });
      return;
    }

    this.mounted = true;
    this.application.ticker.maxFPS = this.frameRateLimit;
    this.application.canvas.className = 'board-canvas';
    this.application.canvas.setAttribute('role', 'img');
    this.application.canvas.setAttribute(
      'aria-label',
      'Interactive Territory board. Gold markers are legal placements. Drag to pan and use the mouse wheel to zoom.',
    );
    this.application.canvas.tabIndex = 0;
    this.host.replaceChildren(this.application.canvas);
    this.application.stage.addChild(this.world);
    this.drawBoard();
    this.attachViewportInteraction();
    this.fitBoard();

    this.resizeObserver = new ResizeObserver(() => {
      this.application.stage.hitArea = new Rectangle(
        0,
        0,
        this.application.screen.width,
        this.application.screen.height,
      );
      this.fitBoard();
    });
    this.resizeObserver.observe(this.host);

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.intersectionObserver = new IntersectionObserver(([entry]) => {
        this.viewportVisible = entry?.isIntersecting ?? true;
        this.syncRenderActivity();
      });
      this.intersectionObserver.observe(this.host);
    }
    this.syncRenderActivity();
  }

  setDebugIdsVisible(visible: boolean): void {
    this.debugLayer.visible = visible;
    if (visible && this.debugLayer.children.length === 0) this.drawDebugLayer();
    if (!visible && this.debugLayer.children.length > 0) this.clearLayer(this.debugLayer);
  }

  update(board: BoardState, options: TerritoryBoardOptions): void {
    if (!this.mounted || this.destroyed) return;
    const previousHexIds = this.model.hexes.map((hex) => hex.target.id).join('|');
    const previousRoadHighlightKey = [...this.emphasizedEdgeIds].sort().join('|');
    const nextModel = createBoardRenderModel(
      board,
      70,
      options.knights ?? [],
      options.merchant ?? null,
    );
    const nextHexIds = nextModel.hexes.map((hex) => hex.target.id).join('|');

    this.model = nextModel;
    this.selectableTargetKeys = new Set(options.selectableTargets.map(targetKey));
    this.highlightedHexIds = new Set(options.highlightedHexIds);
    this.emphasizedEdgeIds = new Set(options.emphasizedEdgeIds ?? []);
    this.emphasizedVertexIds = new Set(options.emphasizedVertexIds ?? []);
    this.inventorSelectionActive = options.inventorSelectionActive ?? false;
    this.inventorSelectedHexId = options.inventorSelectedHexId ?? null;
    this.inventorPendingHexId = options.inventorPendingHexId ?? null;
    const nextNumberTokenSwap = options.numberTokenSwap ?? null;
    const nextNumberTokenSwapKey =
      options.numberTokenSwapKey ?? nextNumberTokenSwap?.join('|') ?? null;
    if (nextNumberTokenSwapKey !== this.numberTokenSwapKey) {
      this.numberTokenSwapStartedAt =
        nextNumberTokenSwap === null ? null : globalThis.performance.now();
    }
    this.numberTokenSwap = nextNumberTokenSwap;
    this.numberTokenSwapKey = nextNumberTokenSwapKey;
    this.madnessHighlightedHexIds = new Set(options.madnessHighlightedHexIds ?? []);
    this.terrainChange = options.terrainChange ?? null;
    this.merchantPlacementActive = options.merchantPlacementActive ?? false;
    this.animatedTargetKey =
      options.animatedTarget === null ? null : targetKey(options.animatedTarget);
    this.robberMove = options.robberMove;
    this.playerColors = options.playerColors;
    this.showTargetPulses = options.showTargetPulses ?? true;
    this.robberSelectionActive = options.showRobberAttention ?? false;
    this.reducedMotion = options.reducedMotion ?? false;
    this.frameRateLimit = options.frameRateLimit ?? 60;
    this.application.ticker.maxFPS = this.frameRateLimit;

    const nextStaticSignature = this.createStaticVisualSignature();
    const nextNumberSignature = this.createNumberVisualSignature();
    const nextPieceSignature = this.createPieceVisualSignature();
    const nextControlSignature = this.createControlVisualSignature();
    const staticChanged = nextStaticSignature !== this.staticVisualSignature;
    const numbersChanged = staticChanged || nextNumberSignature !== this.numberVisualSignature;
    const piecesChanged = staticChanged || nextPieceSignature !== this.pieceVisualSignature;
    const controlsChanged = staticChanged || nextControlSignature !== this.controlVisualSignature;
    const roadHighlightsChanged =
      staticChanged || [...this.emphasizedEdgeIds].sort().join('|') !== previousRoadHighlightKey;

    if (staticChanged) {
      this.clearTransientGroup('terrain');
      this.drawStaticLayers();
    }
    if (numbersChanged) {
      this.clearTransientGroup('numbers');
      this.clearPulseGroup('numbers');
      this.drawNumberTokens();
    }
    if (piecesChanged) {
      this.clearTransientGroup('pieces');
      this.drawPieces();
    }
    if (roadHighlightsChanged) this.drawRoadHighlights();
    if (controlsChanged) {
      this.clearPulseGroup('controls');
      this.drawControls();
    }
    if (numbersChanged || controlsChanged) this.startTargetPulse();

    this.staticVisualSignature = nextStaticSignature;
    this.numberVisualSignature = nextNumberSignature;
    this.pieceVisualSignature = nextPieceSignature;
    this.controlVisualSignature = nextControlSignature;
    if (previousHexIds !== nextHexIds) this.fitBoard();
  }

  fitBoard(): void {
    if (!this.mounted || this.destroyed) return;
    const { minimumX, maximumX, minimumY, maximumY } = this.model.bounds;
    const boardWidth = maximumX - minimumX;
    const boardHeight = maximumY - minimumY;
    const viewportWidth = this.application.screen.width;
    const viewportHeight = this.application.screen.height;
    const fitScale = Math.min(viewportWidth / boardWidth, viewportHeight / boardHeight) * 0.94;
    const scale = Math.max(0.08, Math.min(1.35, fitScale));
    const centerX = (minimumX + maximumX) / 2;
    const centerY = (minimumY + maximumY) / 2;

    this.world.scale.set(scale);
    this.world.position.set(
      viewportWidth / 2 - centerX * scale,
      viewportHeight / 2 - centerY * scale,
    );
  }

  zoomBy(factor: number): void {
    if (!this.mounted || this.destroyed || !Number.isFinite(factor) || factor <= 0) return;
    this.zoomAt(
      this.application.screen.width / 2,
      this.application.screen.height / 2,
      this.world.scale.x * factor,
    );
  }

  getHexScreenPosition(hexId: HexId): BoardViewportPoint | null {
    if (!this.mounted || this.destroyed) return null;
    const hex = this.model.hexes.find((candidate) => candidate.target.id === hexId);
    if (hex === undefined) return null;
    const point = this.world.toGlobal(hex.center);
    return { x: point.x, y: point.y };
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    if (this.mounted) {
      this.application.ticker.remove(this.animateTargetPulse);
      for (const callback of this.transientTickerCallbacks.keys()) {
        this.application.ticker.remove(callback);
      }
      this.transientTickerCallbacks.clear();
      this.application.canvas.removeEventListener('wheel', this.handleWheel);
      this.application.destroy({ removeView: true }, { children: true });
      this.mounted = false;
    }
    this.targets.clear();
  }

  private drawBoard(): void {
    this.drawStaticLayers();
    this.drawNumberTokens();
    this.drawRoadHighlights();
    this.drawPieces();
    this.drawControls();
    this.startTargetPulse();
    this.staticVisualSignature = this.createStaticVisualSignature();
    this.numberVisualSignature = this.createNumberVisualSignature();
    this.pieceVisualSignature = this.createPieceVisualSignature();
    this.controlVisualSignature = this.createControlVisualSignature();
  }

  private createStaticVisualSignature(): string {
    return [
      this.model.hexes
        .map(
          (hex) =>
            `${hex.target.id}:${hex.center.x}:${hex.center.y}:${hex.terrainName}:${hex.terrainColor}:${hex.corners.map((corner) => `${corner.x},${corner.y}`).join(';')}`,
        )
        .join('|'),
      this.model.edges
        .filter((edge) => edge.isBoundary)
        .map(
          (edge) =>
            `${edge.target.id}:${edge.first.x},${edge.first.y}:${edge.second.x},${edge.second.y}`,
        )
        .join('|'),
      this.model.ports
        .map(
          (port) =>
            `${port.target.id}:${port.edgeId}:${port.position.x},${port.position.y}:${port.label}:${port.shoreConnections.map((point) => `${point.x},${point.y}`).join(';')}`,
        )
        .join('|'),
      this.terrainChange === null || this.terrainChange === undefined
        ? ''
        : `${this.terrainChange.hexId}:${this.terrainChange.fromResourceId}`,
      this.reducedMotion ? 'reduced' : 'animated',
    ].join('~');
  }

  private createNumberVisualSignature(): string {
    return [
      this.model.hexes.map((hex) => `${hex.target.id}:${hex.numberToken ?? ''}`).join('|'),
      this.inventorSelectionActive ? 'inventor' : '',
      this.inventorSelectedHexId ?? '',
      this.inventorPendingHexId ?? '',
      this.numberTokenSwapKey ?? '',
      [...this.madnessHighlightedHexIds].sort().join('|'),
      [...this.selectableTargetKeys]
        .filter((key) => key.startsWith('HEX:'))
        .sort()
        .join('|'),
      this.reducedMotion ? 'reduced' : 'animated',
    ].join('~');
  }

  private createPieceVisualSignature(): string {
    return [
      this.model.hexes
        .map((hex) => `${hex.target.id}:${hex.hasRobber ? 1 : 0}:${hex.merchantOwnerId ?? ''}`)
        .join('|'),
      this.model.edges.map((edge) => `${edge.target.id}:${edge.roadOwnerId ?? ''}`).join('|'),
      this.model.vertices
        .map((vertex) => {
          const building = vertex.building;
          const knight = vertex.knight;
          return `${vertex.target.id}:${
            building === null
              ? ''
              : `${building.ownerId},${building.type},${building.hasWall ? 1 : 0},${building.metropolis ?? ''}`
          }:${
            knight === null
              ? ''
              : `${knight.id},${knight.ownerId},${knight.level},${knight.active ? 1 : 0}`
          }`;
        })
        .join('|'),
      Object.entries(this.playerColors)
        .sort(([first], [second]) => first.localeCompare(second))
        .map(([playerId, color]) => `${playerId}:${color}`)
        .join('|'),
      this.animatedTargetKey ?? '',
      this.robberMove === null ? '' : `${this.robberMove.fromHexId}:${this.robberMove.toHexId}`,
      this.reducedMotion ? 'reduced' : 'animated',
    ].join('~');
  }

  private createControlVisualSignature(): string {
    return [
      [...this.selectableTargetKeys].sort().join('|'),
      [...this.highlightedHexIds].sort().join('|'),
      [...this.emphasizedVertexIds].sort().join('|'),
      this.merchantPlacementActive ? 'merchant' : '',
      this.robberSelectionActive ? 'robber' : '',
      this.showTargetPulses ? 'pulses' : '',
      this.reducedMotion ? 'reduced' : 'animated',
      this.model.hexes.map((hex) => `${hex.target.id}:${hex.hasRobber ? 1 : 0}`).join('|'),
    ].join('~');
  }

  private clearLayer(layer: Container): void {
    for (const child of layer.removeChildren()) child.destroy({ children: true });
  }

  private drawStaticLayers(): void {
    this.clearLayer(this.coastLayer);
    this.clearLayer(this.hexLayer);
    this.clearLayer(this.portLayer);
    for (const key of [...this.targets.keys()]) {
      if (key.startsWith('PORT:')) this.targets.delete(key);
    }

    for (const edge of this.model.edges) {
      if (!edge.isBoundary) continue;
      this.coastLayer.addChild(
        new Graphics()
          .moveTo(edge.first.x, edge.first.y)
          .lineTo(edge.second.x, edge.second.y)
          .stroke({ color: '#58bfcc', width: 21, alpha: 0.24 })
          .moveTo(edge.first.x, edge.first.y)
          .lineTo(edge.second.x, edge.second.y)
          .stroke({ color: '#b9f0e8', width: 13, alpha: 0.68 })
          .moveTo(edge.first.x, edge.first.y)
          .lineTo(edge.second.x, edge.second.y)
          .stroke({ color: '#f2dda4', width: 6, alpha: 0.94 }),
      );
    }

    const showTerrainDetails = boardRenderProfile(this.graphicsQuality).terrainDetails;
    for (const hex of this.model.hexes) {
      const polygon = flattenedPoints(hex.corners);
      const shadow = new Graphics()
        .poly(hex.corners.map((corner) => ({ x: corner.x + 3, y: corner.y + 5 })))
        .fill({ color: '#050a07', alpha: 0.42 });
      const terrain = new Graphics()
        .poly(polygon)
        .fill({ color: hex.terrainColor })
        .stroke({ color: '#101710', width: 3 });
      terrain.eventMode = 'none';
      const terrainDetails = showTerrainDetails ? createTerrainDetails(hex) : null;
      if (terrainDetails === null) this.hexLayer.addChild(shadow, terrain);
      else this.hexLayer.addChild(shadow, terrain, terrainDetails);
      this.animateTerrainChange(hex, polygon, this.hexLayer);
    }

    for (const port of this.model.ports) {
      const dock = createPortDocks(port);
      const ship = createPortShip(port);
      const labelOffset = portRatioOffset(port);
      const hitTarget = new Graphics()
        .roundRect(port.position.x - 35, port.position.y - 44, 70, 76, 12)
        .fill({ color: '#ffffff', alpha: 0.001 })
        .roundRect(
          port.position.x + labelOffset.x * PORT_BASE_SCALE - 27,
          port.position.y + labelOffset.y * PORT_BASE_SCALE - 15,
          54,
          30,
          8,
        )
        .fill({ color: '#ffffff', alpha: 0.001 });
      hitTarget.eventMode = 'static';
      hitTarget.cursor = 'pointer';
      hitTarget.on('pointerover', () => {
        ship.scale.set(PORT_HOVER_SCALE);
        this.onInspect(port.target);
      });
      hitTarget.on('pointerout', () => {
        ship.scale.set(PORT_BASE_SCALE);
        this.onInspect(null);
      });
      hitTarget.on('pointertap', () => this.onInspect(port.target));
      this.targets.set(targetKey(port.target), hitTarget);
      this.portLayer.addChild(dock, ship, hitTarget);
    }

    if (this.debugLayer.visible) this.drawDebugLayer();
  }

  private drawDebugLayer(): void {
    this.clearLayer(this.debugLayer);
    for (const hex of this.model.hexes) {
      const debugText = new Text({
        text: hex.target.id,
        style: { fill: '#ffffff', fontFamily: 'monospace', fontSize: 9 },
      });
      debugText.anchor.set(0.5);
      debugText.position.set(hex.center.x, hex.center.y + 43);
      this.debugLayer.addChild(debugText);
    }
  }

  private drawNumberTokens(): void {
    this.clearLayer(this.numberTokenLayer);
    for (const hex of this.model.hexes) {
      const selectable = this.selectableTargetKeys.has(targetKey(hex.target));
      const numberToken = createNumberToken(
        hex,
        this.inventorSelectedHexId === hex.target.id,
        this.inventorPendingHexId === hex.target.id,
        this.madnessHighlightedHexIds.has(hex.target.id),
      );
      if (numberToken === null) continue;
      this.numberTokenLayer.addChild(numberToken);
      if (
        (this.inventorSelectionActive &&
          (selectable ||
            this.inventorSelectedHexId === hex.target.id ||
            this.inventorPendingHexId === hex.target.id)) ||
        this.madnessHighlightedHexIds.has(hex.target.id)
      ) {
        this.registerPulsingTarget(numberToken, 8, 'numbers');
      }
      this.animateNumberTokenSwap(hex.target.id, numberToken);
    }
  }

  private drawRoadHighlights(): void {
    this.clearLayer(this.roadHighlightLayer);
    for (const edge of this.model.edges) {
      if (!this.emphasizedEdgeIds.has(edge.target.id) || edge.roadOwnerId === null) continue;
      const glow = new Graphics()
        .moveTo(edge.first.x, edge.first.y)
        .lineTo(edge.second.x, edge.second.y)
        .stroke({ color: '#ffd86a', width: 28, alpha: 0.24 })
        .moveTo(edge.first.x, edge.first.y)
        .lineTo(edge.second.x, edge.second.y)
        .stroke({ color: '#ffe59a', width: 18, alpha: 0.9 });
      glow.eventMode = 'none';
      this.roadHighlightLayer.addChild(glow);
    }
  }

  private drawPieces(): void {
    this.clearLayer(this.pieceLayer);
    for (const hex of this.model.hexes) {
      if (hex.hasRobber) {
        const robber = createRobber(hex);
        this.pieceLayer.addChild(robber);
        this.animateRobberMove(hex.target.id, robber);
      }
      if (hex.merchantOwnerId !== null) {
        this.pieceLayer.addChild(
          createMerchantToken(hex, this.playerColors[hex.merchantOwnerId] ?? '#f6d77c'),
        );
      }
    }

    for (const edge of this.model.edges) {
      const ownerId = edge.roadOwnerId;
      if (ownerId === null) continue;
      const roadOutline = new Graphics()
        .moveTo(edge.first.x, edge.first.y)
        .lineTo(edge.second.x, edge.second.y)
        .stroke({ color: '#10140f', width: 13, alpha: 0.95 });
      const road = new Graphics()
        .moveTo(edge.first.x, edge.first.y)
        .lineTo(edge.second.x, edge.second.y)
        .stroke({ color: this.playerColors[ownerId] ?? '#f6f0dc', width: 8 });
      roadOutline.eventMode = 'none';
      road.eventMode = 'none';
      this.pieceLayer.addChild(roadOutline, road);
      this.animatePlacement(edge.target, [roadOutline, road]);
    }

    for (const vertex of this.model.vertices) {
      const building = vertex.building;
      if (building !== null) {
        const { x, y } = vertex.position;
        const color = this.playerColors[building.ownerId] ?? '#f6f0dc';
        const piece = createBuildingPiece(x, y, color, building.type);
        this.pieceLayer.addChild(piece);
        const enhancement = createBuildingEnhancement(
          x,
          y,
          color,
          building.hasWall === true,
          building.metropolis,
        );
        if (enhancement !== null) this.pieceLayer.addChild(enhancement);
        this.animatePlacement(vertex.target, [piece]);
      }
      if (vertex.knight !== null) {
        const knight = createKnightPiece(
          vertex.position.x,
          vertex.position.y,
          this.playerColors[vertex.knight.ownerId] ?? '#f6f0dc',
          vertex.knight.level,
          vertex.knight.active,
        );
        this.pieceLayer.addChild(knight);
        // The Knight itself must never depend on the animation ticker for visibility. A stopped
        // ticker (for example during an intersection/visibility transition) used to leave a newly
        // constructed Knight at alpha 0 indefinitely.
      }
    }
  }

  private drawControls(): void {
    this.clearLayer(this.hexControlLayer);
    this.clearLayer(this.edgeLayer);
    this.clearLayer(this.vertexLayer);
    this.clearLayer(this.cueLayer);
    this.clearLayer(this.hexInteractionLayer);
    for (const key of [...this.targets.keys()]) {
      if (!key.startsWith('PORT:')) this.targets.delete(key);
    }

    for (const hex of this.model.hexes) {
      const selectable = this.selectableTargetKeys.has(targetKey(hex.target));
      const highlighted = this.highlightedHexIds.has(hex.target.id);
      const polygon = flattenedPoints(hex.corners);
      const merchantPlacementCue =
        this.merchantPlacementActive && selectable ? createMerchantPlacementCue(hex) : null;
      if (merchantPlacementCue !== null) this.cueLayer.addChild(merchantPlacementCue);
      const graphic = new Graphics();
      const drawHexControl = (hovered: boolean) => {
        const borderColor = hovered
          ? '#fff0b8'
          : selectable
            ? '#e2c26d'
            : highlighted
              ? hex.hasRobber
                ? '#e3777e'
                : '#e2c26d'
              : '#ffffff';
        graphic
          .clear()
          .poly(polygon)
          .fill({ color: '#ffffff', alpha: 0.001 })
          .stroke({
            color: borderColor,
            width: hovered || highlighted || selectable ? 5 : 0,
            alpha: hovered || highlighted || selectable ? 1 : 0,
          });
      };
      const inspect = (hovered: boolean) => {
        drawHexControl(hovered);
        if (merchantPlacementCue !== null) merchantPlacementCue.visible = hovered;
        this.onInspect(hovered ? hex.target : null);
      };
      drawHexControl(false);
      graphic.eventMode = 'static';
      graphic.cursor = selectable ? 'pointer' : 'help';
      graphic.on('pointerover', () => inspect(true));
      graphic.on('pointerout', () => inspect(false));
      graphic.on('pointertap', (event: FederatedPointerEvent) => {
        if (selectable) this.onSelect(hex.target, event.global);
        else this.onInspect(hex.target);
      });
      this.targets.set(targetKey(hex.target), graphic);
      this.hexControlLayer.addChild(graphic);

      if (selectable) {
        const interactionTarget = new Graphics()
          .poly(polygon)
          .fill({ color: '#ffffff', alpha: 0.001 });
        interactionTarget.eventMode = 'static';
        interactionTarget.cursor = 'pointer';
        interactionTarget.on('pointerover', () => inspect(true));
        interactionTarget.on('pointerout', () => inspect(false));
        interactionTarget.on('pointertap', (event: FederatedPointerEvent) =>
          this.onSelect(hex.target, event.global),
        );
        this.hexInteractionLayer.addChild(interactionTarget);
      }

      if (hex.hasRobber && this.robberSelectionActive) {
        const cue = createRobberAttentionCue(hex);
        this.registerPulsingTarget(cue, 5, 'controls');
        this.cueLayer.addChild(cue);
      }
    }

    for (const edge of this.model.edges) {
      const selectable = this.selectableTargetKeys.has(targetKey(edge.target));
      const graphic = new Graphics();
      const drawEdge = (hovered: boolean) => {
        graphic
          .clear()
          .moveTo(edge.first.x, edge.first.y)
          .lineTo(edge.second.x, edge.second.y)
          .stroke({ color: '#ffffff', width: 15, alpha: 0.001 });
        if (selectable && (this.showTargetPulses || hovered)) {
          graphic
            .moveTo(edge.first.x, edge.first.y)
            .lineTo(edge.second.x, edge.second.y)
            .stroke({
              color: hovered ? '#edf2ee' : '#bdcac3',
              width: hovered ? 9 : 6,
              alpha: hovered ? 0.88 : 0.52,
            });
        }
      };
      drawEdge(false);
      graphic.eventMode = 'static';
      graphic.cursor = selectable ? 'pointer' : edge.roadOwnerId === null ? 'default' : 'help';
      graphic.on('pointerover', (event: FederatedPointerEvent) => {
        if (selectable) drawEdge(true);
        this.onInspect(edge.target, event.global);
      });
      graphic.on('pointerout', () => {
        drawEdge(false);
        this.onInspect(null);
      });
      graphic.on('pointertap', (event: FederatedPointerEvent) => {
        if (selectable) this.onSelect(edge.target, event.global);
        else this.onInspect(edge.target, event.global);
      });
      this.targets.set(targetKey(edge.target), graphic);
      if (selectable && this.showTargetPulses) {
        const midpointX = (edge.first.x + edge.second.x) / 2;
        const midpointY = (edge.first.y + edge.second.y) / 2;
        const pulse = new Graphics()
          .moveTo(edge.first.x - midpointX, edge.first.y - midpointY)
          .lineTo(edge.second.x - midpointX, edge.second.y - midpointY)
          .stroke({ color: '#eef5f1', width: 9, alpha: 0.82 });
        pulse.position.set(midpointX, midpointY);
        pulse.eventMode = 'none';
        this.registerPulsingTarget(pulse, 0, 'controls');
        this.cueLayer.addChild(pulse);
      }
      this.edgeLayer.addChild(graphic);
    }

    for (const vertex of this.model.vertices) {
      const selectable = this.selectableTargetKeys.has(targetKey(vertex.target));
      const graphic = new Graphics();
      const drawVertex = (hovered: boolean) => {
        graphic.clear().circle(vertex.position.x, vertex.position.y, hovered ? 12 : 10);
        if (selectable && (this.showTargetPulses || hovered)) {
          graphic
            .fill({ color: '#d8e0db', alpha: hovered ? 0.5 : 0.2 })
            .stroke({ color: hovered ? '#f0f4f1' : '#aab8b0', width: 2.5, alpha: 0.72 });
        } else {
          graphic.fill({ color: '#ffffff', alpha: 0.001 });
        }
      };
      drawVertex(false);
      graphic.eventMode = 'static';
      graphic.cursor = selectable ? 'pointer' : 'default';
      graphic.on('pointerover', () => {
        if (selectable) drawVertex(true);
        this.onInspect(vertex.target);
      });
      graphic.on('pointerout', () => {
        drawVertex(false);
        this.onInspect(null);
      });
      graphic.on('pointertap', (event: FederatedPointerEvent) => {
        if (selectable) this.onSelect(vertex.target, event.global);
        else this.onInspect(vertex.target);
      });
      this.targets.set(targetKey(vertex.target), graphic);
      if (selectable && this.showTargetPulses) {
        const emphasized = this.emphasizedVertexIds.has(vertex.target.id);
        const pulse = new Graphics()
          .circle(0, 0, emphasized ? 22 : 11)
          .fill({ color: emphasized ? '#f2c95d' : '#d5ded9', alpha: emphasized ? 0.12 : 0.32 })
          .stroke({
            color: emphasized ? '#ffe58a' : '#e8eeea',
            width: emphasized ? 5 : 2,
            alpha: emphasized ? 1 : 0.68,
          });
        if (emphasized) {
          pulse.circle(0, 0, 16).stroke({ color: '#20372f', width: 2.2, alpha: 0.96 });
        }
        pulse.position.set(vertex.position.x, vertex.position.y);
        pulse.eventMode = 'none';
        this.registerPulsingTarget(pulse, 0, 'controls');
        this.cueLayer.addChild(pulse);
      }
      this.vertexLayer.addChild(graphic);
    }
  }

  private readonly handleVisibilityChange = (): void => {
    this.pageVisible = !document.hidden;
    this.syncRenderActivity();
  };

  private syncRenderActivity(): void {
    if (!this.mounted || this.destroyed) return;
    if (this.pageVisible && this.viewportVisible) {
      this.application.start();
    } else {
      this.application.stop();
    }
  }

  private registerPulsingTarget(
    display: Container,
    bobDistance = 0,
    group: 'controls' | 'numbers' = 'controls',
  ): void {
    this.pulsingTargets.push({
      display,
      group,
      phaseOffset: this.pulsingTargets.length * 0.22,
      baseY: display.y,
      bobDistance,
    });
  }

  private clearPulseGroup(group: 'controls' | 'numbers'): void {
    this.application.ticker.remove(this.animateTargetPulse);
    for (let index = this.pulsingTargets.length - 1; index >= 0; index -= 1) {
      if (this.pulsingTargets[index]?.group === group) this.pulsingTargets.splice(index, 1);
    }
  }

  private clearTransientGroup(group: 'numbers' | 'pieces' | 'terrain'): void {
    for (const [callback, callbackGroup] of this.transientTickerCallbacks) {
      if (callbackGroup !== group) continue;
      this.application.ticker.remove(callback);
      this.transientTickerCallbacks.delete(callback);
    }
  }

  private startTargetPulse(): void {
    if (this.pulsingTargets.length === 0) return;
    if (this.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      for (const target of this.pulsingTargets) target.display.alpha = 0.78;
      return;
    }
    this.application.ticker.add(this.animateTargetPulse);
  }

  private readonly animateTargetPulse = () => {
    const elapsed = globalThis.performance.now() / 520;
    for (const target of this.pulsingTargets) {
      const wave = (Math.sin(elapsed + target.phaseOffset) + 1) / 2;
      target.display.scale.set(0.9 + wave * 0.2);
      target.display.alpha = 0.55 + wave * 0.4;
      target.display.y = target.baseY - wave * target.bobDistance;
    }
  };

  private animateNumberTokenSwap(destinationHexId: HexId, token: Container): void {
    const swap = this.numberTokenSwap;
    const animationKey = this.numberTokenSwapKey;
    if (
      swap === null ||
      animationKey === null ||
      this.completedNumberTokenSwapKey === animationKey ||
      !swap.includes(destinationHexId)
    ) {
      return;
    }
    const originHexId = destinationHexId === swap[0] ? swap[1] : swap[0];
    const origin = this.model.hexes.find((hex) => hex.target.id === originHexId);
    const destination = this.model.hexes.find((hex) => hex.target.id === destinationHexId);
    if (origin === undefined || destination === undefined) return;
    if (this.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      this.completedNumberTokenSwapKey = animationKey;
      return;
    }

    const startX = origin.center.x;
    const startY = origin.center.y + 20;
    const endX = destination.center.x;
    const endY = destination.center.y + 20;
    const direction = destinationHexId === swap[0] ? -1 : 1;
    const startedAt = this.numberTokenSwapStartedAt ?? globalThis.performance.now();
    token.position.set(startX, startY);
    const animate = () => {
      const progress = Math.min(1, (globalThis.performance.now() - startedAt) / 1_850);
      const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
      token.position.set(
        startX + (endX - startX) * eased,
        startY + (endY - startY) * eased - Math.sin(progress * Math.PI) * 28 * direction,
      );
      token.rotation = Math.sin(progress * Math.PI) * 0.08 * direction;
      token.scale.set(1 + Math.sin(progress * Math.PI) * 0.13);
      if (progress < 1) return;
      token.position.set(endX, endY);
      token.rotation = 0;
      token.scale.set(1);
      this.completedNumberTokenSwapKey = animationKey;
      this.application.ticker.remove(animate);
      this.transientTickerCallbacks.delete(animate);
    };
    animate();
    if (globalThis.performance.now() - startedAt >= 1_850) return;
    this.transientTickerCallbacks.set(animate, 'numbers');
    this.application.ticker.add(animate);
  }

  private animateTerrainChange(hex: RenderHex, polygon: number[], layer: Container): void {
    const change = this.terrainChange;
    if (change === null || change === undefined || change.hexId !== hex.target.id) return;
    const previousTerrain = TERRAINS.find(
      (terrain) => terrain.resourceId === change.fromResourceId,
    );
    if (previousTerrain === undefined) return;
    const overlay = new Graphics().poly(polygon).fill({ color: previousTerrain.color });
    overlay.eventMode = 'none';
    layer.addChild(overlay);
    if (this.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      overlay.alpha = 0;
      return;
    }
    const startedAt = globalThis.performance.now();
    const tick = () => {
      const progress = Math.min(1, (globalThis.performance.now() - startedAt) / 2_200);
      overlay.alpha = 1 - (0.5 - Math.cos(progress * Math.PI) / 2);
      if (progress < 1) return;
      overlay.visible = false;
      this.application.ticker.remove(tick);
      this.transientTickerCallbacks.delete(tick);
    };
    this.transientTickerCallbacks.set(tick, 'terrain');
    this.application.ticker.add(tick);
  }

  private animateRobberMove(destinationHexId: HexId, robber: Container): void {
    const move = this.robberMove;
    if (move === null || move.toHexId !== destinationHexId) {
      this.animatePlacement({ kind: 'HEX', id: destinationHexId }, [robber]);
      return;
    }
    if (this.reducedMotion || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const source = this.model.hexes.find((hex) => hex.target.id === move.fromHexId);
    const destination = this.model.hexes.find((hex) => hex.target.id === move.toHexId);
    if (source === undefined || destination === undefined) return;
    const offsetX = source.center.x - destination.center.x;
    const offsetY = source.center.y - destination.center.y;
    const startedAt = globalThis.performance.now();
    robber.position.set(offsetX, offsetY);
    robber.alpha = 0.88;

    const tick = () => {
      const progress = Math.min((globalThis.performance.now() - startedAt) / 620, 1);
      const eased = 1 - (1 - progress) ** 3;
      robber.position.set(
        offsetX * (1 - eased),
        offsetY * (1 - eased) - Math.sin(progress * Math.PI) * 18,
      );
      robber.alpha = 0.88 + eased * 0.12;
      if (progress < 1) return;
      robber.position.set(0, 0);
      robber.alpha = 1;
      this.application.ticker.remove(tick);
      this.transientTickerCallbacks.delete(tick);
    };
    this.transientTickerCallbacks.set(tick, 'pieces');
    this.application.ticker.add(tick);
  }

  private animatePlacement(target: BoardTarget, pieces: readonly Container[]): void {
    if (
      this.animatedTargetKey !== targetKey(target) ||
      this.reducedMotion ||
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const startedAt = globalThis.performance.now();
    for (const piece of pieces) piece.alpha = 0;
    const tick = () => {
      const progress = Math.min((globalThis.performance.now() - startedAt) / 260, 1);
      const eased = 1 - (1 - progress) ** 3;
      for (const piece of pieces) piece.alpha = eased;
      if (progress >= 1) {
        this.application.ticker.remove(tick);
        this.transientTickerCallbacks.delete(tick);
      }
    };
    this.transientTickerCallbacks.set(tick, 'pieces');
    this.application.ticker.add(tick);
  }

  private attachViewportInteraction(): void {
    this.application.stage.eventMode = 'static';
    this.application.stage.hitArea = new Rectangle(
      0,
      0,
      this.application.screen.width,
      this.application.screen.height,
    );
    this.application.stage.on('pointerdown', (event: FederatedPointerEvent) => {
      this.dragging = true;
      this.dragStart = { x: event.global.x, y: event.global.y };
      this.worldStart = { x: this.world.x, y: this.world.y };
      this.application.canvas.style.cursor = 'grabbing';
    });
    this.application.stage.on('globalpointermove', (event: FederatedPointerEvent) => {
      if (!this.dragging) return;
      this.world.position.set(
        this.worldStart.x + event.global.x - this.dragStart.x,
        this.worldStart.y + event.global.y - this.dragStart.y,
      );
    });
    const stopDragging = () => {
      this.dragging = false;
      this.application.canvas.style.cursor = 'grab';
    };
    this.application.stage.on('pointerup', stopDragging);
    this.application.stage.on('pointerupoutside', stopDragging);
    this.application.canvas.style.cursor = 'grab';
    this.application.canvas.addEventListener('wheel', this.handleWheel, { passive: false });
  }

  private readonly handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.zoomAt(
      event.offsetX,
      event.offsetY,
      this.world.scale.x * (event.deltaY < 0 ? 1.12 : 0.89),
    );
  };

  private zoomAt(screenX: number, screenY: number, requestedScale: number): void {
    const oldScale = this.world.scale.x;
    const nextScale = Math.max(0.08, Math.min(2.2, requestedScale));
    const localX = (screenX - this.world.x) / oldScale;
    const localY = (screenY - this.world.y) / oldScale;
    this.world.scale.set(nextScale);
    this.world.position.set(screenX - localX * nextScale, screenY - localY * nextScale);
  }
}
