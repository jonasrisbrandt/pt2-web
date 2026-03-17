export type RenameTarget = 'song' | 'sample';

export interface InlineNameFieldRenderOptions {
  target: RenameTarget;
  editing: boolean;
  value: string;
  displayValue: string;
  maxLength: number;
}
