export interface FacebookPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  picture?: {
    data?: {
      url?: string;
    };
  };
}

export interface FacebookPageResponse {
  data: FacebookPage[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
  };
}

export interface LongLivedTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: {
    message: string;
    code: number;
  };
}

export interface VideoInsight {
  id: string;
  title?: string;
  description?: string;
  created_time: string;
  length?: number;
  picture?: string;
  permalink_url?: string;
  views?: number;
  total_video_views?: number;
}
