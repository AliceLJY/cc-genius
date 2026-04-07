export interface Conversation {
  id: string;
  title: string;
  model: ModelType;
  ccSessionId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  images?: ImageAttachment[];
  timestamp: number;
}

export interface ImageAttachment {
  base64: string;
  mediaType: string;
  name?: string;
}

export type ModelType = 'sonnet' | 'opus' | 'haiku';

export interface ChatRequest {
  message: string;
  model: ModelType;
  conversationId: string;
  ccSessionId?: string;
  images?: ImageAttachment[];
}

export interface StreamEvent {
  type: string;
  subtype?: string;
  event?: {
    type: string;
    index?: number;
    delta?: {
      type: string;
      text?: string;
      stop_reason?: string;
    };
    content_block?: {
      type: string;
      text: string;
    };
    message?: {
      id: string;
      model: string;
    };
  };
  session_id?: string;
  result?: string;
  is_error?: boolean;
}
