/**
 * Model tree: a selection that arrives from elsewhere is revealed once, and
 * the user stays in control of the tree afterwards (collapse, expand, "more");
 * a selection can be cleared from the tree.
 */
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityRef } from '@dexvis/firebird-core';
import { ModelTreeComponent } from './model-tree.component';
import { SelectionService } from '../../services/selection.service';
import { DataModelService } from '../../services/data-model.service';

/** The selection API the tree uses, backed by plain signals (the real service pulls in the 3D scene). */
class SelectionStub {
  private readonly current = signal<EntityRef | null>(null);
  readonly selection = this.current.asReadonly();
  readonly selectedPiece = signal<string | null>(null);
  select(ref: EntityRef | null): void {
    this.current.set(ref);
    if (ref) this.selectedPiece.set(ref.pieceName);
  }
  clear(): void {
    this.select(null);
  }
  selectPiece(pieceName: string | null): void {
    this.selectedPiece.set(pieceName);
  }
  isSelected(pieceName: string, entityIndex: number): boolean {
    const current = this.current();
    return current !== null && current.pieceName === pieceName && current.entityIndex === entityIndex;
  }
}

function piece(name: string, entityCount: number) {
  return {
    name,
    type: 'spec.Type',
    entityCount,
    entityLabel: (i: number) => `${name} ${i}`,
    entityRefs: () => [],
  };
}

describe('ModelTreeComponent', () => {
  let fixture: ComponentFixture<ModelTreeComponent>;
  let selection: SelectionStub;
  let scrolls: ReturnType<typeof vi.fn>;
  const originalScroll = Element.prototype.scrollIntoView;

  const element = () => fixture.nativeElement as HTMLElement;
  const pieceRow = (name: string) =>
    [...element().querySelectorAll<HTMLElement>('.piece-row')].find(row => row.textContent?.includes(name))!;
  const entityRows = () => element().querySelectorAll<HTMLElement>('.entity-row');
  const settle = async () => {
    await fixture.whenStable();
    // The reveal scrolls in a timeout, after the rows rendered
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
  };

  beforeEach(async () => {
    localStorage.clear();
    scrolls = vi.fn();
    Element.prototype.scrollIntoView = scrolls as unknown as typeof Element.prototype.scrollIntoView;
    selection = new SelectionStub();
    TestBed.configureTestingModule({
      imports: [ModelTreeComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SelectionService, useValue: selection },
        {
          provide: DataModelService,
          useValue: { currentEntry: signal({ pieces: [piece('Hits', 500), piece('Tracks', 450)] }) },
        },
      ],
    });
    fixture = TestBed.createComponent(ModelTreeComponent);
    await settle();
  });

  afterEach(() => {
    Element.prototype.scrollIntoView = originalScroll;
  });

  it('reveals a selection from elsewhere: expands the piece, raises the limit, scrolls once', async () => {
    selection.select({ pieceName: 'Hits', entityIndex: 350 });
    await settle();

    expect(fixture.componentInstance.isExpanded('Hits')).toBe(true);
    expect(element().querySelector('#model-tree-Hits-350')).not.toBeNull();
    expect(element().querySelector('.entity-row.selected')?.id).toBe('model-tree-Hits-350');
    expect(scrolls).toHaveBeenCalledTimes(1);
  });

  it('lets the user collapse the piece that holds the selection', async () => {
    selection.select({ pieceName: 'Hits', entityIndex: 3 });
    await settle();
    expect(entityRows().length).toBeGreaterThan(0);

    pieceRow('Hits').click();
    await settle();

    expect(fixture.componentInstance.isExpanded('Hits')).toBe(false);
    expect(entityRows().length).toBe(0);
    expect(scrolls).toHaveBeenCalledTimes(1);
  });

  it('does not jump back to the selection on expand or "more" elsewhere', async () => {
    selection.select({ pieceName: 'Hits', entityIndex: 3 });
    await settle();
    pieceRow('Hits').click();     // collapse the selected piece
    pieceRow('Tracks').click();   // expand another one
    await settle();
    element().querySelector<HTMLElement>('.more-button')!.click();
    await settle();

    expect(fixture.componentInstance.isExpanded('Hits')).toBe(false);
    expect(fixture.componentInstance.limitFor('Tracks')).toBe(400);
    expect(scrolls).toHaveBeenCalledTimes(1);
  });

  it('clicking the selected entity again deselects it', async () => {
    selection.select({ pieceName: 'Hits', entityIndex: 3 });
    await settle();

    element().querySelector<HTMLElement>('#model-tree-Hits-3')!.click();
    await settle();

    expect(selection.selection()).toBeNull();
    expect(element().querySelector('.entity-row.selected')).toBeNull();
  });

  it('the selection bar names the selection and clears it', async () => {
    expect(element().querySelector('.selection-bar')).toBeNull();
    selection.select({ pieceName: 'Tracks', entityIndex: 7 });
    await settle();

    expect(element().querySelector('.selection-bar')?.textContent).toContain('Tracks #7');
    element().querySelector<HTMLElement>('.clear-selection')!.click();
    await settle();

    expect(selection.selection()).toBeNull();
    expect(element().querySelector('.selection-bar')).toBeNull();
  });
});
