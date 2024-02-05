declare namespace Express {
  export interface Request {
    user: any;
  }
}

export interface DailyPlayerCount {
  date: string;
  totalPlayerCount: number;
}
