export type RequestKind = 'chat' | 'summary'

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AssistantRequest {
  type: RequestKind
  sessionId: string
  message: string
  content: string
  title: string
  url: string
  history: ChatTurn[]
  stream: boolean
}

export interface KnowledgeChunk {
  id: string
  title: string
  heading: string
  categories: string[]
  category: string
  tags: string[]
  date: string
  updated: string
  source: string
  url: string
  content: string
}

export interface RankedChunk extends KnowledgeChunk {
  score: number
}

export interface AnswerSource {
  id: string
  index: number
  title: string
  heading: string
  url: string
  score: number
}

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamMetadata {
  requestId: string
  sources: AnswerSource[]
}
