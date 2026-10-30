// An error whose message is safe to show the client. Other 4xx errors stay generic.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.expose = true;
  }
}
