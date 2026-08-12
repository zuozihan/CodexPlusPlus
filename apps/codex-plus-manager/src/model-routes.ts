export type RelayModelRoute = {
  model: string;
  targetRelayId: string;
  targetModel: string;
};

export type RelayModelRouteProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: "responses" | "chatCompletions";
  relayMode: "official" | "mixedApi" | "pureApi" | "aggregate";
  officialMixApiKey: boolean;
  modelRoutes?: RelayModelRoute[];
};

export type RelayModelRouteSettings = {
  relayProfilesEnabled: boolean;
  enhancementsEnabled: boolean;
  activeRelayId: string;
  relayProfiles: RelayModelRouteProfile[];
};

export const DEFAULT_PROTOCOL_PROXY_HOST = "127.0.0.1";
export const DEFAULT_PROTOCOL_PROXY_PORT = 57321;
export const PROTOCOL_PROXY_BASE_URL = `http://${DEFAULT_PROTOCOL_PROXY_HOST}:${DEFAULT_PROTOCOL_PROXY_PORT}/v1`;

export function protocolProxyBaseUrl(
  host: string | undefined | null = DEFAULT_PROTOCOL_PROXY_HOST,
  port: number | string | undefined | null = DEFAULT_PROTOCOL_PROXY_PORT,
): string {
  const normalizedHost = String(host ?? "").trim() || DEFAULT_PROTOCOL_PROXY_HOST;
  const parsedPort = Number(port);
  const normalizedPort =
    Number.isFinite(parsedPort) && parsedPort > 0 ? Math.trunc(parsedPort) : DEFAULT_PROTOCOL_PROXY_PORT;
  return `http://${normalizedHost}:${normalizedPort}/v1`;
}

export function isProtocolProxyBaseUrl(baseUrl: string | undefined | null): boolean {
  const value = String(baseUrl ?? "").trim().toLowerCase();
  if (!value) return false;
  // 与后端 is_local_protocol_proxy_base_url 对齐：任意 advertise Host 的 http://host:port/v1
  const pathOk = value.endsWith("/v1") || value.endsWith("/v1/");
  return pathOk && value.startsWith("http://");
}

export type RelayModelRouteIssue = {
  kind: "incomplete" | "duplicate" | "self" | "missingTarget" | "aggregateTarget" | "targetProtocol" | "targetCredentials";
  model: string;
  sourceRelayId: string;
};

export function normalizeRelayModelRoutes(routes: RelayModelRoute[] | undefined): RelayModelRoute[] {
  if (!Array.isArray(routes)) return [];
  return routes.map((route) => ({
    model: typeof route?.model === "string" ? route.model : "",
    targetRelayId: typeof route?.targetRelayId === "string" ? route.targetRelayId : "",
    targetModel: typeof route?.targetModel === "string" ? route.targetModel : "",
  }));
}

export function findRelayModelRouteIssue(
  sources: RelayModelRouteProfile[],
  allProfiles: RelayModelRouteProfile[],
): RelayModelRouteIssue | null {
  for (const source of sources) {
    if (source.relayMode === "aggregate") continue;
    const seenModels = new Set<string>();
    for (const route of normalizeRelayModelRoutes(source.modelRoutes)) {
      const model = route.model.trim();
      const targetRelayId = route.targetRelayId.trim();
      if (!model || !targetRelayId) return { kind: "incomplete", model, sourceRelayId: source.id };
      if (seenModels.has(model)) return { kind: "duplicate", model, sourceRelayId: source.id };
      seenModels.add(model);
      if (targetRelayId === source.id) return { kind: "self", model, sourceRelayId: source.id };
      const target = allProfiles.find((candidate) => candidate.id === targetRelayId);
      if (!target) return { kind: "missingTarget", model, sourceRelayId: source.id };
      if (target.relayMode === "aggregate") return { kind: "aggregateTarget", model, sourceRelayId: source.id };
      if (target.protocol !== "responses") return { kind: "targetProtocol", model, sourceRelayId: source.id };
      const targetHasApiCredentials =
        !(target.relayMode === "official" && !target.officialMixApiKey)
        && Boolean(target.baseUrl.trim() && target.apiKey.trim());
      if (!targetHasApiCredentials) return { kind: "targetCredentials", model, sourceRelayId: source.id };
    }
  }
  return null;
}

export function settingsRequireLocalHelper(settings: RelayModelRouteSettings): boolean {
  if (settings.enhancementsEnabled) return true;
  const active = settings.relayProfiles.find((profile) => profile.id === settings.activeRelayId)
    ?? settings.relayProfiles[0];
  if (!active) return false;
  return active.relayMode === "aggregate"
    || active.protocol === "chatCompletions"
    || (active.relayMode === "official" && active.officialMixApiKey)
    || normalizeRelayModelRoutes(active.modelRoutes).some(
      (route) => Boolean(route.model.trim() && route.targetRelayId.trim()),
    );
}

export function modelRouteSaveRequiresRestart(
  current: RelayModelRouteSettings,
  proposed: RelayModelRouteSettings,
  activeLiveBaseUrl: string,
): boolean {
  if (!proposed.relayProfilesEnabled) return false;
  const active = proposed.relayProfiles.find((profile) => profile.id === proposed.activeRelayId)
    ?? proposed.relayProfiles[0];
  const activeHasRoutes = active
    ? normalizeRelayModelRoutes(active.modelRoutes).some(
      (route) => Boolean(route.model.trim() && route.targetRelayId.trim()),
    )
    : false;
  if (!activeHasRoutes) return false;
  const currentActive = current.relayProfiles.find((profile) => profile.id === current.activeRelayId)
    ?? current.relayProfiles[0];
  const currentActiveHasRoutes = currentActive
    ? normalizeRelayModelRoutes(currentActive.modelRoutes).some(
      (route) => Boolean(route.model.trim() && route.targetRelayId.trim()),
    )
    : false;
  // Persisted enhancement/protocol settings do not prove the already-running helper is healthy.
  // The first active route therefore always uses the restart transaction.
  if (!currentActiveHasRoutes) return true;
  return !isProtocolProxyBaseUrl(activeLiveBaseUrl);
}
