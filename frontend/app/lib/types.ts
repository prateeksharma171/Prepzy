export type ConversationMode =
  | 'chat'
  | 'mock_interview'
  | 'resume_review'
  | 'project_questions'
  | 'code_explanation'
  | 'weakness_detection'
  | 'github_repo';

export interface ConversationSummary {
  id: string;
  title: string;
  pinned: boolean;
  mode: ConversationMode;
  repo_full_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Paginated<T> {
  items: T[];
  has_more: boolean;
}

export interface ConversationDetail extends ConversationSummary {
  messages: Paginated<ChatMessage>;
}

export interface PermanentUserDetails {
  name: string | null;
  age: string | null;
  country: string | null;
  profession: string | null;
  long_term_goals: string[];
  preferences: string[];
}

export interface MemoryProfile {
  permanent_user_details: PermanentUserDetails;
  normal_user_memory: string[];
  updated_at: string | null;
}

export interface GithubConnection {
  connected: boolean;
  github_username: string | null;
  connected_at: string | null;
}

export interface GithubRepo {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  description: string | null;
  default_branch: string;
  updated_at: string;
}

export type UserRole = 'ADMIN' | 'USER';

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface FeedbackEntry {
  id: string;
  message: string;
  created_at: string;
  user: {
    id: string;
    email: string;
    username: string;
  };
}
