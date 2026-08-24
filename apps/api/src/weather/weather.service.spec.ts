import { WeatherService } from "./weather.service";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body } as Response;
}

describe("WeatherService", () => {
  let service: WeatherService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new WeatherService();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  describe("geocode()", () => {
    it("extracts the city from a free-text street address before looking it up", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [{ latitude: 50.11, longitude: 8.68 }] }));

      const coords = await service.geocode("Industriestraße 9, 60313 Frankfurt");

      expect(coords).toEqual({ lat: 50.11, lon: 8.68 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent("Frankfurt"));
    });

    it("returns null (never throws) when the geocoding API is unreachable", async () => {
      fetchMock.mockRejectedValue(new Error("network down"));

      await expect(service.geocode("Nowhere St, 00000 Nowhere")).resolves.toBeNull();
    });

    it("returns null when nothing matches", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

      const coords = await service.geocode("Asdf 1, 99999 Qwerty");

      expect(coords).toBeNull();
    });
  });

  describe("forecast()", () => {
    it("maps WMO codes onto the coarser WeatherCondition enum and flags risky days", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          daily: {
            time: ["2026-08-24", "2026-08-25", "2026-08-26"],
            weathercode: [0, 61, 71],
            temperature_2m_max: [22, 18, -2],
            temperature_2m_min: [10, 14, -8],
          },
        }),
      );

      const days = await service.forecast(50.11, 8.68);

      expect(days).toEqual([
        { date: "2026-08-24", condition: "clear", tempMaxC: 22, tempMinC: 10, risky: false },
        { date: "2026-08-25", condition: "rain", tempMaxC: 18, tempMinC: 14, risky: true },
        { date: "2026-08-26", condition: "snow", tempMaxC: -2, tempMinC: -8, risky: true },
      ]);
    });

    it("overrides the WMO-derived condition with extreme_heat/extreme_cold past the temperature thresholds", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          daily: {
            time: ["2026-08-24", "2026-08-25"],
            weathercode: [0, 0],
            temperature_2m_max: [38, 5],
            temperature_2m_min: [20, -12],
          },
        }),
      );

      const days = await service.forecast(50.11, 8.68);

      expect(days[0].condition).toBe("extreme_heat");
      expect(days[1].condition).toBe("extreme_cold");
    });

    it("returns an empty array (never throws) when the forecast API fails", async () => {
      fetchMock.mockResolvedValue(jsonResponse({}, false));

      await expect(service.forecast(50.11, 8.68)).resolves.toEqual([]);
    });
  });

  describe("forecastForDate()", () => {
    it("returns null when the address can't be geocoded, without calling the forecast API", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

      const day = await service.forecastForDate("Nowhere", new Date("2026-08-24"));

      expect(day).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
