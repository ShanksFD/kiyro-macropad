'use client';

import { useMemo, useState } from 'react';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { StarIcon, StarBorderIcon, ClearIcon } from '@/components/icons';
import {
  ACTION_CATEGORIES,
  categoryOfAction,
  defaultActionOfType,
  isPlannedAction,
} from '@/lib/actions/catalog';
import type { ActionCategoryId } from '@/lib/actions/catalog';
import { describeAction } from '@/lib/actions/format';
import { ACTION_PRESETS, searchPresets } from '@/lib/actions/presets';
import type { ActionPreset } from '@/lib/actions/presets';
import type { Action, ActionType } from '@/lib/actions/types';
import { useQuickActionsStore } from '@/stores/quick-actions-store';
import { ActionForm } from './action-forms';
import { ActionIcon } from './action-icon';

interface Props {
  value: Action;
  onChange: (action: Action) => void;
}

const TYPE_LABELS: Partial<Record<ActionType, string>> = {
  media: 'Transport',
  volume: 'Volume',
  scroll: 'Scroll',
  mouse: 'Buttons',
};

/**
 * The one action editor.
 *
 * Every control — key, encoder direction, encoder press — is configured through
 * this component so an action never has two different editing experiences.
 */
export function ActionPicker({ value, onChange }: Props) {
  const [category, setCategory] = useState<ActionCategoryId>(
    () => categoryOfAction(value) ?? 'keyboard',
  );
  const favourites = useQuickActionsStore((state) => state.favourites);
  const recent = useQuickActionsStore((state) => state.recent);
  const toggleFavourite = useQuickActionsStore((state) => state.toggleFavourite);
  const remember = useQuickActionsStore((state) => state.remember);

  const activeCategory =
    ACTION_CATEGORIES.find((item) => item.id === category) ?? ACTION_CATEGORIES[0]!;

  const currentType = categoryOfAction(value) === category ? value.type : activeCategory.types[0]!;

  const apply = (action: Action) => {
    onChange(action);
    remember(action);
  };

  const selectCategory = (next: ActionCategoryId) => {
    setCategory(next);
    const target = ACTION_CATEGORIES.find((item) => item.id === next);
    if (!target) return;
    const type = target.types[0]!;
    if (value.type !== type) onChange(defaultActionOfType(type));
  };

  const quick = useMemo(() => [...favourites, ...recent].slice(0, 8), [favourites, recent]);
  const isFavourite = favourites.some(
    (item) => describeAction(item).full === describeAction(value).full,
  );

  return (
    <Stack spacing={4}>
      <Autocomplete<ActionPreset, false, false, false>
        options={[...ACTION_PRESETS]}
        getOptionLabel={(option) => option.label}
        filterOptions={(_options, state) => searchPresets(state.inputValue)}
        onChange={(_event, option) => {
          if (option) {
            apply(option.action);
            setCategory(categoryOfAction(option.action) ?? category);
          }
        }}
        value={null}
        blurOnSelect
        renderOption={(props, option) => {
          const { key, ...rest } = props as React.HTMLAttributes<HTMLLIElement> & { key: string };
          return (
            <li key={key} {...rest}>
              <Stack direction="row" spacing={2} sx={{ alignItems: 'center', width: '100%' }}>
                <ActionIcon type={option.action.type} sx={{ opacity: 0.6 }} />
                <Typography variant="body2" sx={{ flex: 1 }}>
                  {option.label}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {describeAction(option.action).full.split(' · ')[1]}
                </Typography>
              </Stack>
            </li>
          );
        }}
        renderInput={(params) => <TextField {...params} placeholder="Search actions…" />}
      />

      {quick.length > 0 && (
        <Stack spacing={1.5}>
          <Typography variant="overline" color="text.secondary">
            Quick actions
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
            {quick.map((action, index) => (
              <Chip
                key={`${describeAction(action).full}-${index}`}
                label={describeAction(action).primary}
                icon={<ActionIcon type={action.type} sx={{ fontSize: 14 }} />}
                onClick={() => apply(action)}
                variant="outlined"
                clickable
              />
            ))}
          </Box>
        </Stack>
      )}

      <Box>
        <Tabs
          value={category}
          onChange={(_event, next: ActionCategoryId) => selectCategory(next)}
          variant="scrollable"
          scrollButtons={false}
          aria-label="Action categories"
        >
          {ACTION_CATEGORIES.map((item) => (
            <Tab
              key={item.id}
              value={item.id}
              label={
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
                  <span>{item.label}</span>
                  {item.availability === 'planned' && (
                    <Chip label="Soon" size="small" sx={{ height: 18, fontSize: '0.625rem' }} />
                  )}
                </Stack>
              }
            />
          ))}
        </Tabs>
        <Divider />
      </Box>

      <Stack spacing={3}>
        <Typography variant="body2" color="text.secondary">
          {activeCategory.description}
        </Typography>

        {activeCategory.types.length > 1 && (
          <ToggleButtonGroup
            exclusive
            size="small"
            value={currentType}
            onChange={(_event, next: ActionType | null) => {
              if (next) onChange(defaultActionOfType(next));
            }}
            aria-label="Action type"
          >
            {activeCategory.types.map((type) => (
              <ToggleButton key={type} value={type} sx={{ px: 3, textTransform: 'none' }}>
                {TYPE_LABELS[type] ?? type}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        <ActionForm action={value} onChange={onChange} />
      </Stack>

      <Divider />

      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary">
            Preview
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {describeAction(value).full}
          </Typography>
        </Stack>

        <Tooltip title={isFavourite ? 'Remove from quick actions' : 'Add to quick actions'}>
          <span>
            <IconButton
              aria-label={isFavourite ? 'Remove from quick actions' : 'Add to quick actions'}
              disabled={value.type === 'none'}
              onClick={() => toggleFavourite(value)}
            >
              {isFavourite ? (
                <StarIcon fontSize="small" color="primary" />
              ) : (
                <StarBorderIcon fontSize="small" />
              )}
            </IconButton>
          </span>
        </Tooltip>

        <Button
          variant="outlined"
          color="inherit"
          startIcon={<ClearIcon />}
          disabled={value.type === 'none'}
          onClick={() => onChange({ type: 'none' })}
        >
          Clear
        </Button>
      </Stack>

      {isPlannedAction(value) && (
        <Typography variant="caption" color="warning.main">
          This action is saved with the profile but cannot run yet.
        </Typography>
      )}
    </Stack>
  );
}
