// Oak presets only (trimmed from ez-tree; see ../LICENSE)
import oakSmall from './oak_small.json';
import oakMedium from './oak_medium.json';
import oakLarge from './oak_large.json';
import TreeOptions from '../options';

export const TreePreset = {
  'Oak Small': oakSmall,
  'Oak Medium': oakMedium,
  'Oak Large': oakLarge,
};

export function loadPreset(name) {
  const preset = TreePreset[name];
  return preset ? structuredClone(preset) : new TreeOptions();
}
