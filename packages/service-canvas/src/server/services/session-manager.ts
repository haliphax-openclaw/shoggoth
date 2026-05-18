export class SessionManager {
  private active: string = "main";
  private sessions: Set<string> = new Set(["main"]);

  getActive(): string {
    return this.active;
  }

  setActive(session: string): void {
    this.sessions.add(session);
    this.active = session;
  }

  getSessions(): string[] {
    return [...this.sessions];
  }

  addSession(session: string): void {
    this.sessions.add(session);
  }
}
