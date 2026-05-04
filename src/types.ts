export interface Token {
  surface: string;
  reading?: string;
  dictionaryForm?: string;
  pos?: string;
  translation?: string;
  pitchAccent?: string;
  pitchPattern?: string; // e.g. "011" for LHH
  jlpt?: string; // e.g. "n5", "n1"
}

export interface HistoryItem {
  id: string;
  userId: string;
  originalText: string;
  timestamp: any;
  tokens: Token[];
}

export interface UserProfile {
  uid: string;
  username: string;
  createdAt: any;
}

export interface FavoriteWord {
  id: string;
  userId: string;
  surface: string;
  reading: string;
  translation: string;
  pos: string;
  pitchAccent?: string;
  pitchPattern?: string;
  jlpt?: string;
  timestamp: any;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}
