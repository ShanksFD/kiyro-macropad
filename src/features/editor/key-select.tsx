'use client';

import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { KEY_CATALOG, findKey } from '@/lib/actions/keys';
import type { KeyDefinition } from '@/lib/actions/keys';

interface Props {
  value: string;
  onChange: (keyCode: string) => void;
  label?: string;
}

/** Grouped, searchable key picker over the canonical key catalogue. */
export function KeySelect({ value, onChange }: Props) {
  const selected = findKey(value) ?? null;

  return (
    <Autocomplete<KeyDefinition, false, true, false>
      options={[...KEY_CATALOG]}
      value={selected ?? KEY_CATALOG[0]!}
      groupBy={(option) => option.group}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      disableClearable
      onChange={(_event, option) => onChange(option.id)}
      renderInput={(params) => <TextField {...params} />}
      slotProps={{ listbox: { sx: { maxHeight: 280 } } }}
    />
  );
}
