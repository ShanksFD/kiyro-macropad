'use client';

import { useState } from 'react';
import Button from '@mui/material/Button';
import ButtonGroup from '@mui/material/ButtonGroup';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Tooltip from '@mui/material/Tooltip';
import {
  ArrowDropDownIcon,
  CableIcon,
  RefreshIcon,
  ScienceIcon,
  LinkOffIcon,
} from '@/components/icons';
import { useDeviceStore } from '@/stores/device-store';
import { useUiStore } from '@/stores/ui-store';

interface Props {
  size?: 'small' | 'large';
  fullWidth?: boolean;
}

/**
 * The only place a connection is initiated.
 *
 * `requestPort()` must run inside a user gesture, so this always calls the
 * session synchronously from the click handler.
 */
export function ConnectButton({ size = 'small', fullWidth = false }: Props) {
  const status = useDeviceStore((state) => state.status);
  const supported = useDeviceStore((state) => state.webSerialSupported);
  const connect = useDeviceStore((state) => state.connect);
  const disconnect = useDeviceStore((state) => state.disconnect);
  const reconnect = useDeviceStore((state) => state.reconnect);
  const advanced = useUiStore((state) => state.preferences.advancedMode);
  const notify = useUiStore((state) => state.notify);

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const busy = status === 'connecting' || status === 'reconnecting';
  const connected = status === 'connected';

  const startSimulator = async () => {
    setAnchor(null);
    await connect({ simulated: true });
    notify('Simulator started. Device events are generated in the browser.', 'info');
  };

  if (supported === false && !connected) {
    return (
      <Tooltip title="Web Serial is unavailable in this browser. Use Chrome or Edge on desktop.">
        <span>
          <Button size={size} variant="outlined" disabled fullWidth={fullWidth}>
            Connect Device
          </Button>
        </span>
      </Tooltip>
    );
  }

  if (connected) {
    return (
      <ButtonGroup size={size} variant="outlined" fullWidth={fullWidth}>
        <Button startIcon={<LinkOffIcon />} onClick={() => void disconnect()}>
          Disconnect
        </Button>
        <Tooltip title="Reconnect">
          <Button
            aria-label="Reconnect device"
            onClick={() => void reconnect()}
            sx={{ px: 2, minWidth: 0 }}
          >
            <RefreshIcon fontSize="small" />
          </Button>
        </Tooltip>
      </ButtonGroup>
    );
  }

  return (
    <>
      <ButtonGroup size={size} variant="contained" fullWidth={fullWidth}>
        <Button
          startIcon={<CableIcon />}
          disabled={busy}
          onClick={() => void connect()}
          sx={{ flex: 1 }}
        >
          {busy ? 'Connecting…' : 'Connect Device'}
        </Button>
        {advanced && (
          <Button
            aria-label="More connection options"
            onClick={(event) => setAnchor(event.currentTarget)}
            sx={{ px: 1, minWidth: 0 }}
          >
            <ArrowDropDownIcon fontSize="small" />
          </Button>
        )}
      </ButtonGroup>

      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void startSimulator()}>
          <ListItemIcon>
            <ScienceIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Start simulator"
            secondary="Emulated device, no hardware required"
            slotProps={{ secondary: { sx: { fontSize: '0.6875rem' } } }}
          />
        </MenuItem>
      </Menu>
    </>
  );
}
