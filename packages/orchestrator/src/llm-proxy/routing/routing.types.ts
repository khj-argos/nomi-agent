export type RoutingBackend = 'ollama' | 'anthropic';

export interface RoutingDecisionOllama {
  backend: 'ollama';
  baseUrl: string;
  defaultModel: string;
}

export interface RoutingDecisionAnthropic {
  backend: 'anthropic';
  baseUrl: string;
  apiKey: string;
}

export type RoutingDecision = RoutingDecisionOllama | RoutingDecisionAnthropic;
