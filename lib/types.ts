export type ProviderId = 'openrouter' | 'gemini' | 'groq' | 'airforce';

export type ArtifactType = 'html' | 'react' | 'markdown' | 'code' | 'svg' | 'mermaid';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  language?: string;
  content: string;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id?: string;
  role: MessageRole;
  content: string;
  provider?: string | null;
  model?: string | null;
  created_at?: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  project_id: string | null;
  title: string;
  provider: string | null;
  model: string | null;
  starred: boolean;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  instructions: string;
  color: string;
  created_at: string;
  updated_at: string;
}

export interface ArtifactRow {
  id: string;
  user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  title: string;
  type: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface CoworkBoard {
  id: string;
  user_id: string;
  title: string;
  goal: string;
  coordinator_model: string | null;
  created_at: string;
  updated_at: string;
}

export type CoworkStatus = 'todo' | 'doing' | 'done';

export interface CoworkTask {
  id: string;
  board_id: string;
  user_id: string;
  title: string;
  role: string;
  provider: string;
  model: string;
  status: CoworkStatus;
  result: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface StoredKeyMap {
  openrouter?: string;
  gemini?: string;
  groq?: string;
  airforce?: string;
}
