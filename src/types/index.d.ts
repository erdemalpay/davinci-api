declare namespace Express {
  export interface Request {
    user: any;
  }
}

export interface DailyPlayerCount {
  date: string;
  countsByLocation: { [key: string]: number };
}
