export type DeviceConnectionState = "unchecked" | "checking" | "connected" | "disconnected" | "error";

type Listener = (key: string, state: DeviceConnectionState) => void;

export class DeviceConnectionStore {
  private readonly states = new Map<string, DeviceConnectionState>();
  private readonly listeners = new Set<Listener>();

  get(key: string): DeviceConnectionState { return this.states.get(key) ?? "unchecked"; }
  set(key: string, state: DeviceConnectionState): void {
    this.states.set(key, state);
    for (const listener of this.listeners) listener(key, state);
  }
  subscribe(listener: Listener): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }
}

export const deviceConnections = new DeviceConnectionStore();
