import { BUILDING_DEFINITIONS } from '../../engine/content/buildings';
import { RESOURCES } from '../../engine/content/resources';
import type { ConstructionAvailability, ConstructionType } from '../../engine/rules/build-rules';
import { Button } from '../components/Button';

interface ConstructionPanelProps {
  readonly availability: readonly ConstructionAvailability[];
  readonly activeType: ConstructionType | null;
  readonly onChoose: (type: ConstructionType) => void;
  readonly onCancel: () => void;
}

function actionLabel(type: ConstructionType): string {
  return type === 'MANSION' ? 'Upgrade mansion' : `Build ${type.toLowerCase()}`;
}

function costLabel(option: ConstructionAvailability): string {
  return RESOURCES.flatMap((resource) => {
    const amount = option.cost[resource.id] ?? 0;
    return amount > 0 ? [`${amount} ${resource.displayName}`] : [];
  }).join(' · ');
}

export function ConstructionPanel({
  availability,
  activeType,
  onChoose,
  onCancel,
}: ConstructionPanelProps) {
  const activeOption = availability.find((option) => option.type === activeType);

  return (
    <section className="construction-panel" aria-label="Construction controls">
      <div className="construction-options">
        {availability.map((option) => (
          <Button
            key={option.type}
            className="construction-option"
            variant={activeType === option.type ? 'primary' : 'ghost'}
            disabled={!option.canBuild}
            aria-pressed={activeType === option.type}
            title={option.reason ?? `${option.targetCount} legal placement targets`}
            onClick={() => onChoose(option.type)}
          >
            <span>{actionLabel(option.type)}</span>
            <small>{costLabel(option)}</small>
          </Button>
        ))}
      </div>

      {activeOption === undefined ? null : (
        <div className="construction-selection" aria-live="polite">
          <span>
            {BUILDING_DEFINITIONS[activeOption.type].displayName} · {activeOption.targetCount} legal
          </span>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
