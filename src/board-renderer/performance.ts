export const BOARD_GRAPHICS_QUALITIES = ['HIGH', 'BALANCED', 'PERFORMANCE'] as const;

export type BoardGraphicsQuality = (typeof BOARD_GRAPHICS_QUALITIES)[number];

export const BOARD_FRAME_RATE_LIMITS = [60, 45, 30] as const;

export type BoardFrameRateLimit = (typeof BOARD_FRAME_RATE_LIMITS)[number];

export interface BoardRenderProfile {
  readonly antialias: boolean;
  readonly maximumResolution: number;
  readonly terrainDetails: boolean;
}

export function boardRenderProfile(quality: BoardGraphicsQuality): BoardRenderProfile {
  switch (quality) {
    case 'PERFORMANCE':
      return { antialias: false, maximumResolution: 1, terrainDetails: false };
    case 'BALANCED':
      return { antialias: true, maximumResolution: 1.5, terrainDetails: true };
    case 'HIGH':
      return { antialias: true, maximumResolution: 2, terrainDetails: true };
  }
}
