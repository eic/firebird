import { PainterConfig } from './painter-config.interface';
import { BooleanField, SelectField, ColorField, NumberField } from './decorators';

export class TrackPainterConfig implements PainterConfig {
  @BooleanField({ label: 'Visible' })
  visible: boolean = true;

  @SelectField({
    label: 'Coloring',
    options: [
      { value: 'PID', label: 'By Particle ID' },
      { value: 'Momentum', label: 'By Momentum' },
      { value: 'Color', label: 'Single Color' }
    ]
  })
  coloringMode: 'PID' | 'Momentum' | 'Color' = 'PID';

  @ColorField({
    label: 'Color',
    showWhen: (config) => config.coloringMode === 'Color'
  })
  color: string = '#FF0000';

  @NumberField({
    label: 'Line Width',
    min: 1,
    max: 10,
    step: 0.5
  })
  lineWidth: number = 2;

  @BooleanField({ label: 'Show Steps' })
  showSteps: boolean = false;

  getConfigType(): string {
    return 'track';
  }
}
