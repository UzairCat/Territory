import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Text,
  type FederatedPointerEvent,
} from 'pixi.js';

import type { BoardState } from '../engine/core/game-state';
import type { HexId } from '../engine/core/ids';
import { createBoardRenderModel, type BoardRenderModel, type BoardTarget } from './render-model';

interface TerritoryBoardOptions {
  readonly onInspect: (target: BoardTarget | null) => void;
  readonly onSelect: (target: BoardTarget) => void;
  readonly selectableTargets: readonly BoardTarget[];
  readonly highlightedHexIds: readonly HexId[];
  readonly playerColors: Readonly<Record<string, string>>;
  readonly showDebugIds?: boolean;
}

function flattenedPoints(points: readonly { readonly x: number; readonly y: number }[]): number[] {
  return points.flatMap((point) => [point.x, point.y]);
}

function targetKey(target: BoardTarget): string {
  return `${target.kind}:${target.id}`;
}

export class TerritoryBoard {
  readonly targets = new Map<string, Graphics>();

  private readonly host: HTMLElement;
  private readonly model: BoardRenderModel;
  private readonly onInspect: TerritoryBoardOptions['onInspect'];
  private readonly onSelect: TerritoryBoardOptions['onSelect'];
  private readonly selectableTargetKeys: ReadonlySet<string>;
  private readonly highlightedHexIds: ReadonlySet<HexId>;
  private readonly playerColors: TerritoryBoardOptions['playerColors'];
  private readonly world = new Container();
  private readonly debugLayer = new Container();
  private readonly application = new Application();
  private resizeObserver: ResizeObserver | null = null;
  private mounted = false;
  private destroyed = false;
  private dragging = false;
  private dragStart = { x: 0, y: 0 };
  private worldStart = { x: 0, y: 0 };

  constructor(host: HTMLElement, board: BoardState, options: TerritoryBoardOptions) {
    this.host = host;
    this.model = createBoardRenderModel(board);
    this.onInspect = options.onInspect;
    this.onSelect = options.onSelect;
    this.selectableTargetKeys = new Set(options.selectableTargets.map(targetKey));
    this.highlightedHexIds = new Set(options.highlightedHexIds);
    this.playerColors = options.playerColors;
    this.debugLayer.visible = options.showDebugIds ?? false;
  }

  async mount(): Promise<void> {
    await this.application.init({
      antialias: true,
      autoDensity: true,
      backgroundAlpha: 0,
      resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
      resizeTo: this.host,
    });

    if (this.destroyed) {
      this.application.destroy({ removeView: true }, { children: true });
      return;
    }

    this.mounted = true;
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
  }

  setDebugIdsVisible(visible: boolean): void {
    this.debugLayer.visible = visible;
  }

  fitBoard(): void {
    if (!this.mounted || this.destroyed) return;
    const { minimumX, maximumX, minimumY, maximumY } = this.model.bounds;
    const boardWidth = maximumX - minimumX;
    const boardHeight = maximumY - minimumY;
    const viewportWidth = this.application.screen.width;
    const viewportHeight = this.application.screen.height;
    const fitScale = Math.min(viewportWidth / boardWidth, viewportHeight / boardHeight) * 0.94;
    const scale = Math.max(0.35, Math.min(1.35, fitScale));
    const centerX = (minimumX + maximumX) / 2;
    const centerY = (minimumY + maximumY) / 2;

    this.world.scale.set(scale);
    this.world.position.set(
      viewportWidth / 2 - centerX * scale,
      viewportHeight / 2 - centerY * scale,
    );
  }

  destroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.mounted) {
      this.application.canvas.removeEventListener('wheel', this.handleWheel);
      this.application.destroy({ removeView: true }, { children: true });
      this.mounted = false;
    }
    this.targets.clear();
  }

  private drawBoard(): void {
    const hexLayer = new Container();
    const portLayer = new Container();
    const edgeLayer = new Container();
    const vertexLayer = new Container();
    const pieceLayer = new Container();
    this.world.addChild(hexLayer, portLayer, edgeLayer, vertexLayer, pieceLayer, this.debugLayer);

    for (const hex of this.model.hexes) {
      const highlighted = this.highlightedHexIds.has(hex.target.id);
      const polygon = flattenedPoints(hex.corners);
      const shadow = new Graphics()
        .poly(hex.corners.map((corner) => ({ x: corner.x + 3, y: corner.y + 5 })))
        .fill({ color: '#050a07', alpha: 0.42 });
      const terrain = new Graphics();
      const drawTerrain = (hovered: boolean) => {
        const borderColor = hovered
          ? '#fff0b8'
          : highlighted
            ? hex.hasRobber
              ? '#e3777e'
              : '#e2c26d'
            : '#101710';
        terrain
          .clear()
          .poly(polygon)
          .fill({ color: hex.terrainColor })
          .stroke({ color: borderColor, width: hovered || highlighted ? 5 : 3 });
      };
      drawTerrain(false);
      terrain.eventMode = 'static';
      terrain.cursor = 'pointer';
      terrain.on('pointerover', () => {
        drawTerrain(true);
        this.onInspect(hex.target);
      });
      terrain.on('pointerout', () => {
        drawTerrain(false);
        this.onInspect(null);
      });
      terrain.on('pointertap', () => this.onInspect(hex.target));
      this.targets.set(targetKey(hex.target), terrain);
      hexLayer.addChild(shadow, terrain);

      const terrainMark = new Graphics()
        .circle(hex.center.x, hex.center.y, 42)
        .stroke({ color: '#ffffff', width: 1, alpha: 0.08 });
      hexLayer.addChild(terrainMark);

      if (hex.numberToken !== null) {
        const highProbability = hex.numberToken === 6 || hex.numberToken === 8;
        const token = new Graphics()
          .circle(hex.center.x, hex.center.y, 22)
          .fill({ color: '#f4ead0' })
          .stroke({ color: highProbability ? '#b6483f' : '#796b4a', width: 2 });
        const number = new Text({
          text: String(hex.numberToken),
          style: {
            fill: highProbability ? '#a52e2e' : '#29251c',
            fontFamily: 'Georgia, serif',
            fontSize: 21,
            fontWeight: '700',
          },
        });
        number.anchor.set(0.5);
        number.position.set(hex.center.x, hex.center.y - 1);
        hexLayer.addChild(token, number);
      }

      if (hex.hasRobber) {
        const robber = new Graphics()
          .circle(hex.center.x, hex.center.y - 7, 11)
          .fill({ color: '#1b1b1c' })
          .roundRect(hex.center.x - 14, hex.center.y + 1, 28, 25, 9)
          .fill({ color: '#1b1b1c' })
          .stroke({ color: '#ded4b8', width: 2, alpha: 0.8 });
        pieceLayer.addChild(robber);
      }

      const debugText = new Text({
        text: hex.target.id,
        style: { fill: '#ffffff', fontFamily: 'monospace', fontSize: 9 },
      });
      debugText.anchor.set(0.5);
      debugText.position.set(hex.center.x, hex.center.y + 43);
      this.debugLayer.addChild(debugText);
    }

    for (const edge of this.model.edges) {
      const selectable = this.selectableTargetKeys.has(targetKey(edge.target));
      const graphic = new Graphics();
      const drawEdge = (hovered: boolean) => {
        graphic
          .clear()
          .moveTo(edge.first.x, edge.first.y)
          .lineTo(edge.second.x, edge.second.y)
          .stroke({
            color: '#ffffff',
            width: 15,
            alpha: 0.001,
          });
        if (selectable || hovered) {
          graphic
            .moveTo(edge.first.x, edge.first.y)
            .lineTo(edge.second.x, edge.second.y)
            .stroke({
              color: selectable ? (hovered ? '#fff0b8' : '#e2c26d') : '#dce7d8',
              width: hovered ? 9 : 7,
              alpha: selectable ? 0.9 : 0.5,
            });
        }
      };
      drawEdge(false);
      graphic.eventMode = 'static';
      graphic.cursor = selectable ? 'pointer' : 'help';
      graphic.on('pointerover', () => {
        drawEdge(true);
        this.onInspect(edge.target);
      });
      graphic.on('pointerout', () => {
        drawEdge(false);
        this.onInspect(null);
      });
      graphic.on('pointertap', () => {
        if (selectable) this.onSelect(edge.target);
        else this.onInspect(edge.target);
      });
      this.targets.set(targetKey(edge.target), graphic);
      edgeLayer.addChild(graphic);

      const ownerId = edge.roadOwnerId;
      if (ownerId !== null) {
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
        pieceLayer.addChild(roadOutline, road);
      }
    }

    for (const vertex of this.model.vertices) {
      const selectable = this.selectableTargetKeys.has(targetKey(vertex.target));
      const graphic = new Graphics();
      const drawVertex = (hovered: boolean) => {
        graphic.clear().circle(vertex.position.x, vertex.position.y, hovered ? 12 : 10);
        if (selectable) {
          graphic
            .fill({ color: hovered ? '#fff0b8' : '#e2c26d', alpha: 0.95 })
            .stroke({ color: '#111910', width: 3, alpha: 0.9 });
        } else {
          graphic.fill({ color: hovered ? '#dce7d8' : '#ffffff', alpha: hovered ? 0.75 : 0.001 });
        }
      };
      drawVertex(false);
      graphic.eventMode = 'static';
      graphic.cursor = selectable ? 'pointer' : 'help';
      graphic.on('pointerover', () => {
        drawVertex(true);
        this.onInspect(vertex.target);
      });
      graphic.on('pointerout', () => {
        drawVertex(false);
        this.onInspect(null);
      });
      graphic.on('pointertap', () => {
        if (selectable) this.onSelect(vertex.target);
        else this.onInspect(vertex.target);
      });
      this.targets.set(targetKey(vertex.target), graphic);
      vertexLayer.addChild(graphic);

      const building = vertex.building;
      if (building !== null) {
        const { x, y } = vertex.position;
        const color = this.playerColors[building.ownerId] ?? '#f6f0dc';
        const piece = new Graphics();
        if (building.type === 'MANSION') {
          piece
            .roundRect(x - 13, y - 8, 26, 22, 3)
            .fill({ color })
            .stroke({ color: '#11140f', width: 3 })
            .rect(x - 9, y - 15, 7, 9)
            .fill({ color })
            .stroke({ color: '#11140f', width: 2 })
            .rect(x + 2, y - 15, 7, 9)
            .fill({ color })
            .stroke({ color: '#11140f', width: 2 });
        } else {
          piece
            .rect(x - 10, y - 2, 20, 16)
            .fill({ color })
            .stroke({ color: '#11140f', width: 3 })
            .poly([x - 13, y - 2, x, y - 15, x + 13, y - 2])
            .fill({ color })
            .stroke({ color: '#11140f', width: 3 });
        }
        piece.eventMode = 'none';
        pieceLayer.addChild(piece);
      }
    }

    for (const port of this.model.ports) {
      const label = new Text({
        text: port.label,
        style: {
          fill: '#efe1b9',
          fontFamily: 'Inter, sans-serif',
          fontSize: 10,
          fontWeight: '700',
        },
      });
      label.anchor.set(0.5);
      label.position.set(port.position.x, port.position.y);
      const background = new Graphics()
        .roundRect(
          port.position.x - label.width / 2 - 6,
          port.position.y - 10,
          label.width + 12,
          20,
          7,
        )
        .fill({ color: '#152019', alpha: 0.94 })
        .stroke({ color: '#d9bc72', width: 1, alpha: 0.65 });
      background.eventMode = 'static';
      background.cursor = 'pointer';
      background.on('pointerover', () => this.onInspect(port.target));
      background.on('pointerout', () => this.onInspect(null));
      background.on('pointertap', () => this.onInspect(port.target));
      this.targets.set(targetKey(port.target), background);
      portLayer.addChild(background, label);
    }
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
    const oldScale = this.world.scale.x;
    const nextScale = Math.max(0.35, Math.min(1.8, oldScale * (event.deltaY < 0 ? 1.1 : 0.9)));
    const localX = (event.offsetX - this.world.x) / oldScale;
    const localY = (event.offsetY - this.world.y) / oldScale;
    this.world.scale.set(nextScale);
    this.world.position.set(event.offsetX - localX * nextScale, event.offsetY - localY * nextScale);
  };
}
