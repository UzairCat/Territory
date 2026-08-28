import type { ProgressCardArtworkId, ProgressCardDefinition } from '../../engine/content/types';

interface ProgressCardArtworkProps {
  readonly definition: ProgressCardDefinition;
  readonly compact?: boolean;
}

function ArtworkSvg({ artwork }: { readonly artwork: ProgressCardArtworkId }) {
  if (artwork === 'KNIGHT') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__shadow" d="M13 62h39l-5-12-11-5-16 4z" />
        <path className="progress-svg__accent" d="M17 51c2-12 8-22 20-27l10 7-7 5 6 15z" />
        <path
          className="progress-svg__paper"
          d="M22 49V30c0-10 7-18 17-18 5 0 10 2 13 6l-8 5v10l-8 4v12z"
        />
        <path className="progress-svg__dark" d="M28 27h17v6H28zm7 7h9l-5 6h-4z" />
        <path className="progress-svg__gold" d="M34 13c-1-7 4-10 10-9-2 3-2 6 1 8-3 0-6 1-8 4z" />
        <circle className="progress-svg__gold" cx="30" cy="30" r="2" />
        <path className="progress-svg__line" d="M18 54h31M23 59h25" />
      </svg>
    );
  }

  if (artwork === 'ROAD_BUILDING') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__land" d="M5 57c10-9 18-10 28-4 8 5 16 5 26-1v15H5z" />
        <path className="progress-svg__road" d="m13 60 9-48 8 2-8 49z" />
        <path className="progress-svg__road-light" d="m17 58 8-42 2 1-8 42z" />
        <path className="progress-svg__road" d="m36 61 7-38 8 2-6 39z" />
        <path className="progress-svg__road-light" d="m40 59 6-32 2 1-5 32z" />
        <circle className="progress-svg__gold" cx="26" cy="14" r="5" />
        <circle className="progress-svg__gold" cx="47" cy="24" r="5" />
        <path className="progress-svg__dark" d="m21 14 5-6 5 6v5H21zm21 10 5-6 5 6v5H42z" />
      </svg>
    );
  }

  if (artwork === 'YEAR_OF_PLENTY') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__basket" d="M13 42h40l-5 22H18z" />
        <path className="progress-svg__basket-line" d="M17 48h33M20 55h28M27 43v19M38 43v19" />
        <circle className="progress-svg__wood" cx="19" cy="37" r="8" />
        <circle className="progress-svg__brick" cx="31" cy="33" r="8" />
        <circle className="progress-svg__ore" cx="44" cy="37" r="9" />
        <path
          className="progress-svg__grain"
          d="M31 28C25 18 28 9 32 5c5 7 5 15 1 23zm-4-5-8-8m16 7 8-10"
        />
        <path
          className="progress-svg__livestock"
          d="M42 25c-1-7 5-12 11-8 6-1 9 7 4 11-3 4-12 4-15-3z"
        />
        <circle className="progress-svg__dark" cx="54" cy="22" r="1.4" />
      </svg>
    );
  }

  if (artwork === 'MONOPOLY') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__line" d="m14 17 16 18M50 17 34 35M10 50l20-12m24 12L35 38" />
        <circle className="progress-svg__wood" cx="12" cy="15" r="7" />
        <circle className="progress-svg__brick" cx="52" cy="15" r="7" />
        <circle className="progress-svg__grain" cx="9" cy="53" r="7" />
        <circle className="progress-svg__ore" cx="55" cy="53" r="7" />
        <circle className="progress-svg__paper" cx="32" cy="37" r="16" />
        <path className="progress-svg__gold" d="m21 27 6 4 5-9 5 9 7-4-3 12H24z" />
        <text className="progress-svg__letter" x="32" y="48">
          M
        </text>
        <path className="progress-svg__dark" d="M24 52h16v5H24z" />
      </svg>
    );
  }

  if (artwork === 'CHAPEL') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__land" d="M7 61h50v7H7z" />
        <path className="progress-svg__paper" d="M16 34h34v28H16z" />
        <path className="progress-svg__accent" d="m13 36 20-18 20 18z" />
        <path className="progress-svg__paper" d="M27 19h12v17H27z" />
        <path className="progress-svg__gold" d="M31 5h4v14h-4zm-5 4h14v4H26z" />
        <path className="progress-svg__dark" d="M27 46c0-8 11-8 11 0v16H27z" />
        <circle className="progress-svg__glass" cx="33" cy="29" r="4" />
      </svg>
    );
  }

  if (artwork === 'LIBRARY') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__shadow" d="M7 56h50v9H7z" />
        <path
          className="progress-svg__paper"
          d="M8 19c11-4 19-1 24 6v34C25 52 17 51 8 54zm48 0c-11-4-19-1-24 6v34c7-7 15-8 24-5z"
        />
        <path
          className="progress-svg__line"
          d="M32 26v34M14 28c6-1 11 1 14 4m-14 6c6-1 11 1 14 4m22-14c-6-1-11 1-14 4m14 6c-6-1-11 1-14 4"
        />
        <path className="progress-svg__gold" d="m26 12 6-8 6 8-6 8z" />
      </svg>
    );
  }

  if (artwork === 'MARKET') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__wood-dark" d="M11 29h42v35H11z" />
        <path className="progress-svg__paper" d="M8 18h48l-4 15H12z" />
        <path className="progress-svg__accent" d="M8 18h12l-2 15h-6zm24 0h12l2 15H34z" />
        <path className="progress-svg__gold" d="M20 18h12v15H18zm24 0h12l-4 15h-6z" />
        <path className="progress-svg__paper" d="M17 39h30v19H17z" />
        <circle className="progress-svg__wood" cx="23" cy="49" r="5" />
        <circle className="progress-svg__brick" cx="32" cy="46" r="5" />
        <circle className="progress-svg__grain" cx="41" cy="50" r="5" />
        <path className="progress-svg__line" d="M9 64h46" />
      </svg>
    );
  }

  if (artwork === 'PALACE') {
    return (
      <svg viewBox="0 0 64 72">
        <path className="progress-svg__land" d="M5 61h54v7H5z" />
        <path className="progress-svg__paper" d="M10 31h14v32H10zm30 0h14v32H40zM22 23h20v40H22z" />
        <path
          className="progress-svg__accent"
          d="m8 31 9-11 9 11zm30-8L32 8l-7 15zm0 8 9-11 9 11z"
        />
        <path className="progress-svg__gold" d="m24 11 4 3 4-7 4 7 4-3-2 9H26z" />
        <path className="progress-svg__dark" d="M28 47c0-7 8-7 8 0v16h-8z" />
        <circle className="progress-svg__glass" cx="17" cy="42" r="3" />
        <circle className="progress-svg__glass" cx="47" cy="42" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 72">
      <path className="progress-svg__land" d="M7 61h50v7H7z" />
      <path className="progress-svg__paper" d="M12 34h40v29H12z" />
      <path className="progress-svg__accent" d="m8 34 24-18 24 18z" />
      <path className="progress-svg__gold" d="M18 38h5v21h-5zm11 0h5v21h-5zm12 0h5v21h-5z" />
      <path className="progress-svg__dark" d="M10 58h44v6H10z" />
      <path className="progress-svg__paper" d="M25 9h14v13H25z" />
      <path className="progress-svg__line" d="M29 12h6m-6 4h6" />
    </svg>
  );
}

export function ProgressCardArtwork({ definition, compact = false }: ProgressCardArtworkProps) {
  const pointCard = definition.effect === 'VICTORY_POINT';
  const multiplier =
    definition.artwork === 'ROAD_BUILDING' || definition.artwork === 'YEAR_OF_PLENTY';

  return (
    <span
      className={`progress-card-illustration progress-card-illustration--${definition.artwork.toLowerCase().replaceAll('_', '-')} ${compact ? 'progress-card-illustration--compact' : ''}`}
      data-progress-artwork={definition.artwork}
      aria-hidden="true"
    >
      <span className="progress-card-illustration__glow" />
      <ArtworkSvg artwork={definition.artwork} />
      {pointCard ? <strong>+1</strong> : multiplier ? <strong>×2</strong> : null}
    </span>
  );
}
