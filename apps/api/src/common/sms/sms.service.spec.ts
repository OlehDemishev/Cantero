import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SmsService } from "./sms.service";

describe("SmsService", () => {
  it("does not throw when Twilio isn't configured — logs instead of sending", async () => {
    const module = await Test.createTestingModule({
      providers: [SmsService, { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } }],
    }).compile();

    const service = module.get(SmsService);
    await expect(service.send({ to: "+15551234567", body: "Test message" })).resolves.toBeUndefined();
  });
});
