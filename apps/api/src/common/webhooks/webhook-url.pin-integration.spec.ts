import { createServer, type Server } from "node:http";
import { pinnedDispatcher } from "./webhook-url";

/**
 * Proves pinnedDispatcher() actually overrides DNS resolution at the socket level, against a real
 * server and Node's real fetch/undici stack — not a mock. No test file here mocks node:dns, undici,
 * or global.fetch. The request targets a hostname that cannot resolve via real DNS
 * ("*.invalid" is reserved by RFC 2606 to never resolve); the only way this request can possibly
 * reach the local server is if the dispatcher's pinned lookup is actually being used instead of a
 * real DNS lookup.
 */
describe("pinnedDispatcher (real socket integration)", () => {
  let server: Server;
  let port: number;

  beforeAll(async () => {
    server = createServer((_req, res) => res.end("pinned-ok"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("connects to the pinned IP even though the hostname in the URL cannot resolve via real DNS", async () => {
    const dispatcher = pinnedDispatcher("127.0.0.1", 4);

    const res = await fetch(`http://this-host-does-not-exist.invalid:${port}/`, { dispatcher } as RequestInit);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pinned-ok");
  });

  it("without a pinned dispatcher, the same unresolvable hostname fails as expected", async () => {
    await expect(fetch(`http://this-host-does-not-exist.invalid:${port}/`)).rejects.toThrow();
  });
});
